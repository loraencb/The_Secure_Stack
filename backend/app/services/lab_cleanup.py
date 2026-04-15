import logging
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session as DatabaseSession

from app import models
from app.labs.labs_config import LABS
from app.services.lab_resources import (
    parse_session_id_from_resource,
    resource_is_managed,
)
from app.services.lab_launcher import get_docker_client

logger = logging.getLogger("securestack.lab_cleanup")


def session_has_runtime_metadata(session: models.Session) -> bool:
    return bool(
        session.environment_launched_at
        or session.attacker_container
        or session.target_container
        or session.network_name
        or session.browser_url
    )


def clear_session_runtime_metadata(session: models.Session) -> bool:
    had_runtime_metadata = session_has_runtime_metadata(session)
    session.environment_launched_at = None
    session.attacker_container = None
    session.target_container = None
    session.network_name = None
    session.browser_url = None
    return had_runtime_metadata


def resolve_session_resource_names(
    session: models.Session,
    *,
    include_derived: bool = False,
) -> dict[str, str | None]:
    lab = LABS.get(session.lab_id or "")

    attacker_name = session.attacker_container
    target_name = session.target_container
    network_name = session.network_name

    if include_derived:
        if not attacker_name:
            if lab:
                attacker_name = lab["attacker"]["container_name"].format(
                    session_id=session.id
                )
            else:
                attacker_name = f"attacker-{session.id}"

        if not target_name:
            if lab:
                target_name = lab["target"]["container_name"].format(
                    session_id=session.id
                )
            else:
                target_name = f"target-{session.id}"

        if not network_name:
            if lab:
                network_name = lab.get("network_name", "lab-net-{session_id}").format(
                    session_id=session.id
                )
            else:
                network_name = f"lab-net-{session.id}"

    return {
        "attacker_container": attacker_name,
        "target_container": target_name,
        "network_name": network_name,
    }


def _resource_result(
    *,
    kind: str,
    name: str,
    status: str,
    detail: str = "",
) -> dict[str, str]:
    return {
        "kind": kind,
        "name": name,
        "status": status,
        "detail": detail,
    }


def _remove_container(client, name: str, reason: str) -> dict[str, str]:
    try:
        container = client.containers.get(name)
    except Exception as exc:  # docker.errors.NotFound/APIError
        exc_name = exc.__class__.__name__
        if exc_name == "NotFound":
            return _resource_result(kind="container", name=name, status="missing")
        logger.warning(
            "lab_container_lookup_failed name=%s reason=%s error=%s",
            name,
            reason,
            exc,
        )
        return _resource_result(
            kind="container",
            name=name,
            status="error",
            detail=str(exc),
        )

    try:
        container.reload()
        if container.status == "running":
            container.stop(timeout=5)
        container.remove(force=True)
        logger.info(
            "lab_container_removed name=%s reason=%s",
            name,
            reason,
        )
        return _resource_result(kind="container", name=name, status="removed")
    except Exception as exc:  # docker.errors.APIError
        logger.warning(
            "lab_container_remove_failed name=%s reason=%s error=%s",
            name,
            reason,
            exc,
        )
        return _resource_result(
            kind="container",
            name=name,
            status="error",
            detail=str(exc),
        )


def _remove_network(client, name: str, reason: str) -> dict[str, str]:
    try:
        network = client.networks.get(name)
    except Exception as exc:  # docker.errors.NotFound/APIError
        exc_name = exc.__class__.__name__
        if exc_name == "NotFound":
            return _resource_result(kind="network", name=name, status="missing")
        logger.warning(
            "lab_network_lookup_failed name=%s reason=%s error=%s",
            name,
            reason,
            exc,
        )
        return _resource_result(
            kind="network",
            name=name,
            status="error",
            detail=str(exc),
        )

    try:
        network.remove()
        logger.info(
            "lab_network_removed name=%s reason=%s",
            name,
            reason,
        )
        return _resource_result(kind="network", name=name, status="removed")
    except Exception as exc:  # docker.errors.APIError
        logger.warning(
            "lab_network_remove_failed name=%s reason=%s error=%s",
            name,
            reason,
            exc,
        )
        return _resource_result(
            kind="network",
            name=name,
            status="error",
            detail=str(exc),
        )


def teardown_session_environment(
    session: models.Session,
    *,
    reason: str,
    client=None,
    include_derived: bool = False,
    clear_runtime: bool = True,
) -> dict[str, Any]:
    had_runtime_metadata = session_has_runtime_metadata(session)
    names = resolve_session_resource_names(session, include_derived=include_derived)
    metadata_cleared = clear_session_runtime_metadata(session) if clear_runtime else False

    try:
        owns_client = client is None
        client = client or get_docker_client()
    except RuntimeError as exc:
        logger.warning(
            "lab_teardown_deferred session_id=%s reason=%s detail=%s",
            session.id,
            reason,
            exc,
        )
        return {
            "session_id": session.id,
            "status": "deferred",
            "reason": reason,
            "cleared_runtime_metadata": metadata_cleared,
            "resources": [],
            "removed_count": 0,
            "missing_count": 0,
            "error_count": 0,
            "detail": str(exc),
        }

    resources = []
    seen_names: set[tuple[str, str]] = set()

    try:
        for key in ("attacker_container", "target_container"):
            name = names.get(key)
            if not name or ("container", name) in seen_names:
                continue
            seen_names.add(("container", name))
            resources.append(_remove_container(client, name, reason))

        network_name = names.get("network_name")
        if network_name and ("network", network_name) not in seen_names:
            seen_names.add(("network", network_name))
            resources.append(_remove_network(client, network_name, reason))
    finally:
        if owns_client:
            client.close()

    error_count = sum(1 for item in resources if item["status"] == "error")
    removed_count = sum(1 for item in resources if item["status"] == "removed")
    missing_count = sum(1 for item in resources if item["status"] == "missing")

    if error_count:
        status = "partial"
    elif removed_count or missing_count or metadata_cleared:
        status = "cleared"
    else:
        status = "noop"

    log_level = logger.warning if error_count else logger.info
    log_level(
        "lab_teardown_complete session_id=%s reason=%s status=%s removed=%s missing=%s errors=%s",
        session.id,
        reason,
        status,
        removed_count,
        missing_count,
        error_count,
    )

    return {
        "session_id": session.id,
        "status": status,
        "reason": reason,
        "cleared_runtime_metadata": metadata_cleared or (clear_runtime and had_runtime_metadata),
        "resources": resources,
        "removed_count": removed_count,
        "missing_count": missing_count,
        "error_count": error_count,
    }


def _inspect_container(client, name: str) -> dict[str, str]:
    try:
        container = client.containers.get(name)
        container.reload()
        if container.status == "running":
            return _resource_result(kind="container", name=name, status="running")
        return _resource_result(
            kind="container",
            name=name,
            status="stopped",
            detail=container.status,
        )
    except Exception as exc:
        exc_name = exc.__class__.__name__
        if exc_name == "NotFound":
            return _resource_result(kind="container", name=name, status="missing")
        return _resource_result(
            kind="container",
            name=name,
            status="error",
            detail=str(exc),
        )


def _inspect_network(client, name: str) -> dict[str, str]:
    try:
        client.networks.get(name)
        return _resource_result(kind="network", name=name, status="present")
    except Exception as exc:
        exc_name = exc.__class__.__name__
        if exc_name == "NotFound":
            return _resource_result(kind="network", name=name, status="missing")
        return _resource_result(
            kind="network",
            name=name,
            status="error",
            detail=str(exc),
        )


def reconcile_session_environment(
    session: models.Session,
    *,
    client=None,
    reason: str = "session_reconcile",
) -> dict[str, Any] | None:
    if not session_has_runtime_metadata(session):
        return None

    try:
        owns_client = client is None
        client = client or get_docker_client(log_failure=False)
    except RuntimeError as exc:
        logger.warning(
            "lab_runtime_reconcile_skipped session_id=%s reason=%s detail=%s",
            session.id,
            reason,
            exc,
        )
        return None

    names = resolve_session_resource_names(session, include_derived=True)
    resources = []

    try:
        for key in ("attacker_container", "target_container"):
            name = names.get(key)
            if name:
                resources.append(_inspect_container(client, name))

        network_name = names.get("network_name")
        if network_name:
            resources.append(_inspect_network(client, network_name))

        if not resources:
            clear_session_runtime_metadata(session)
            return {
                "session_id": session.id,
                "status": "cleared",
                "reason": reason,
                "resources": [],
                "reconciled": True,
            }

        unhealthy = [
            item
            for item in resources
            if item["status"] not in {"running", "present"}
        ]
        if not unhealthy:
            return None

        logger.warning(
            "lab_runtime_reconcile_cleanup session_id=%s reason=%s resources=%s",
            session.id,
            reason,
            unhealthy,
        )
        result = teardown_session_environment(
            session,
            reason=reason,
            client=client,
            include_derived=True,
            clear_runtime=True,
        )
        result["reconciled"] = True
        return result
    finally:
        if owns_client:
            client.close()


def cleanup_stale_lab_resources(db: DatabaseSession) -> dict[str, Any]:
    try:
        client = get_docker_client(log_failure=False)
    except RuntimeError as exc:
        logger.warning("lab_cleanup_startup_skipped detail=%s", exc)
        return {
            "status": "skipped",
            "detail": str(exc),
            "resources": [],
            "sessions_reconciled": 0,
        }

    sessions = db.query(models.Session).all()
    sessions_by_id = {session.id: session for session in sessions}
    resources: list[dict[str, str]] = []
    sessions_reconciled = 0
    session_metadata_changed = False

    try:
        tracked_sessions = (
            db.query(models.Session)
            .filter(
                or_(
                    models.Session.environment_launched_at.is_not(None),
                    models.Session.attacker_container.is_not(None),
                    models.Session.target_container.is_not(None),
                    models.Session.network_name.is_not(None),
                )
            )
            .all()
        )

        for session in tracked_sessions:
            if session.status == "completed" or session.end_time:
                result = teardown_session_environment(
                    session,
                    reason="startup_completed_session_cleanup",
                    client=client,
                    include_derived=True,
                    clear_runtime=True,
                )
                resources.extend(result["resources"])
                sessions_reconciled += 1 if result["status"] != "noop" else 0
                session_metadata_changed = session_metadata_changed or result[
                    "cleared_runtime_metadata"
                ]
                continue

            reconciliation = reconcile_session_environment(
                session,
                client=client,
                reason="startup_runtime_reconcile",
            )
            if reconciliation:
                resources.extend(reconciliation["resources"])
                sessions_reconciled += 1
                session_metadata_changed = True

        for container in client.containers.list(all=True):
            labels = getattr(container, "labels", {}) or {}
            name = container.name
            if not resource_is_managed(name, labels):
                continue

            session_id = parse_session_id_from_resource(name, labels)
            if session_id is None:
                continue

            session = sessions_by_id.get(session_id)
            if session is None:
                resources.append(
                    _remove_container(client, name, "startup_orphan_cleanup")
                )
                continue

            if not session_has_runtime_metadata(session):
                resources.append(
                    _remove_container(
                        client,
                        name,
                        "startup_untracked_session_cleanup",
                    )
                )

        for network in client.networks.list():
            labels = (network.attrs or {}).get("Labels") or {}
            name = network.name
            if not resource_is_managed(name, labels):
                continue

            session_id = parse_session_id_from_resource(name, labels)
            if session_id is None:
                continue

            session = sessions_by_id.get(session_id)
            if session is None:
                resources.append(
                    _remove_network(client, name, "startup_orphan_cleanup")
                )
                continue

            if not session_has_runtime_metadata(session):
                resources.append(
                    _remove_network(
                        client,
                        name,
                        "startup_untracked_session_cleanup",
                    )
                )

        if session_metadata_changed:
            db.commit()

        error_count = sum(1 for item in resources if item["status"] == "error")
        removed_count = sum(1 for item in resources if item["status"] == "removed")
        missing_count = sum(1 for item in resources if item["status"] == "missing")
        status = "partial" if error_count else "ok"

        logger.info(
            "lab_cleanup_startup_complete status=%s sessions_reconciled=%s removed=%s missing=%s errors=%s",
            status,
            sessions_reconciled,
            removed_count,
            missing_count,
            error_count,
        )

        return {
            "status": status,
            "resources": resources,
            "sessions_reconciled": sessions_reconciled,
            "removed_count": removed_count,
            "missing_count": missing_count,
            "error_count": error_count,
        }
    finally:
        client.close()
