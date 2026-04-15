import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from alembic import command
from fastapi import HTTPException


ROOT = Path(__file__).resolve().parents[2]
DB_PATH = Path(tempfile.gettempdir()) / "SecureStack" / "securestack_test_suite.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
if DB_PATH.exists():
    DB_PATH.unlink()
journal_path = DB_PATH.with_name(f"{DB_PATH.name}-journal")
if journal_path.exists():
    journal_path.unlink()
os.environ["SECURESTACK_DATABASE_PATH"] = str(DB_PATH)
sys.path.insert(0, str(ROOT / "backend"))

from app import models, schemas  # noqa: E402
from app.database import (  # noqa: E402
    SessionLocal,
    engine,
    get_alembic_config,
)
from app.routers.auth import login_user, logout_user, register_user  # noqa: E402
from app.routers.findings import create_finding, get_findings  # noqa: E402
from app.routers.labs import launch_lab_route  # noqa: E402
from app.routers.reports import generate_report  # noqa: E402
from app.routers.sessions import get_session, get_session_history, start_session  # noqa: E402
from app.security import get_user_for_token  # noqa: E402
from app.services.lab_cleanup import (  # noqa: E402
    cleanup_stale_lab_resources,
    teardown_session_environment,
)
from app.services.lab_resources import build_managed_labels  # noqa: E402


command.upgrade(get_alembic_config(), "head")


class NotFound(Exception):
    pass


class FakeContainer:
    def __init__(self, name, labels, registry, status="running"):
        self.name = name
        self.labels = labels
        self.status = status
        self._registry = registry

    def reload(self):
        return None

    def stop(self, timeout=5):
        self.status = "exited"

    def remove(self, force=True):
        self._registry.pop(self.name, None)


class FakeNetwork:
    def __init__(self, name, labels, registry):
        self.name = name
        self.attrs = {"Labels": labels}
        self._registry = registry

    def remove(self):
        self._registry.pop(self.name, None)


class FakeContainerManager:
    def __init__(self, registry):
        self._registry = registry

    def list(self, all=False):
        return list(self._registry.values())

    def get(self, name):
        if name not in self._registry:
            raise NotFound(name)
        return self._registry[name]


class FakeNetworkManager:
    def __init__(self, registry):
        self._registry = registry

    def list(self):
        return list(self._registry.values())

    def get(self, name):
        if name not in self._registry:
            raise NotFound(name)
        return self._registry[name]


class FakeDockerClient:
    def __init__(self, containers=None, networks=None):
        self._containers = containers or {}
        self._networks = networks or {}
        self.containers = FakeContainerManager(self._containers)
        self.networks = FakeNetworkManager(self._networks)

    def close(self):
        return None


class SecureStackAuthWorkflowTests(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):
        engine.dispose()

    def setUp(self):
        self.db = SessionLocal()
        self.db.query(models.AuthToken).delete()
        self.db.query(models.Finding).delete()
        self.db.query(models.TaskCompletion).delete()
        self.db.query(models.Session).delete()
        self.db.query(models.User).delete()
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def register_user(self, email: str, display_name: str):
        response = register_user(
            schemas.UserCreate(
                email=email,
                password="password123",
                display_name=display_name,
            ),
            self.db,
        )
        user = self.db.query(models.User).filter(models.User.email == email).first()
        self.assertIsNotNone(user)
        return user, response

    def test_authentication_and_owned_workflow(self):
        user, register_response = self.register_user(
            "learner@example.com",
            "Learner One",
        )
        login_response = login_user(
            schemas.UserLogin(email="learner@example.com", password="password123"),
            self.db,
        )

        self.assertEqual(register_response.user.email, "learner@example.com")
        self.assertEqual(login_response.user.id, user.id)
        self.assertTrue(login_response.access_token)
        self.assertIsNotNone(get_user_for_token(self.db, login_response.access_token))

        session = start_session(
            schemas.SessionCreate(lab_name="juice-shop", lab_id="juice-shop-recon"),
            self.db,
            user,
        )
        self.assertEqual(session.user_id, user.id)

        fake_launch = {
            "attacker_container": f"attacker-{session.id}",
            "target_container": f"target-{session.id}",
            "network_name": f"lab-net-{session.id}",
            "browser_url": "http://localhost:31337",
            "steps": [],
        }

        with patch("app.routers.labs.launch_lab", return_value=fake_launch):
            launched = launch_lab_route(
                session.id,
                "juice-shop-recon",
                self.db,
                user,
            )

        self.assertEqual(launched["attacker_container"], fake_launch["attacker_container"])
        with patch(
            "app.routers.sessions.reconcile_session_environment",
            return_value=None,
        ):
            refreshed_session = get_session(session.id, self.db, user)
        self.assertEqual(refreshed_session.attacker_container, fake_launch["attacker_container"])
        self.assertIsNotNone(refreshed_session.environment_launched_at)

        finding = create_finding(
            schemas.FindingCreate(
                session_id=session.id,
                title="Open target port",
                severity="Medium",
                description="Verified a reachable target service from the attacker container.",
                source="manual",
                task_id="task-1",
                task_label="Step 1: Verify connectivity",
                task_objective="Confirm the target is reachable before collecting report evidence.",
                evidence_command="curl http://target",
                evidence_snapshot="HTTP/1.1 200 OK",
            ),
            self.db,
            user,
        )
        self.assertEqual(finding.user_id, user.id)
        self.assertEqual(finding.task_label, "Step 1: Verify connectivity")

        with patch(
            "app.routers.reports.generate_summary",
            return_value={
                "risk_level": "Medium",
                "key_issues": ["Open target port"],
                "recommendations": ["Review exposed target services."],
                "summary": "Report generated from the owned session findings.",
            },
        ):
            report = generate_report(session.id, self.db, user)

        self.assertEqual(report["analysis"]["risk_level"], "Medium")
        self.assertIsNotNone(report["session"].report_generated_at)

        findings = get_findings(session.id, self.db, user)
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].evidence_command, "curl http://target")

        history = get_session_history(self.db, user)
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0].findings_count, 1)
        self.assertEqual(history[0].history_status, "Report generated")

        logout_user(user, self.db, SimpleNamespace(credentials=login_response.access_token))
        self.assertIsNone(get_user_for_token(self.db, login_response.access_token))

    def test_history_and_session_access_are_user_isolated(self):
        user_one, _ = self.register_user("owner@example.com", "Owner")
        user_two, _ = self.register_user("other@example.com", "Other")

        owned_session = start_session(
            schemas.SessionCreate(lab_name="owner-lab", lab_id="owner-lab"),
            self.db,
            user_one,
        )

        history_for_owner = get_session_history(self.db, user_one)
        history_for_other = get_session_history(self.db, user_two)

        self.assertEqual(len(history_for_owner), 1)
        self.assertEqual(history_for_other, [])

        with self.assertRaises(HTTPException) as error_context:
            get_session(owned_session.id, self.db, user_two)
        self.assertEqual(error_context.exception.status_code, 404)

    def test_completed_session_cannot_launch_environment(self):
        user, _ = self.register_user("completed@example.com", "Completed")
        session = start_session(
            schemas.SessionCreate(
                lab_name="juice-shop",
                lab_id="juice-shop-recon",
            ),
            self.db,
            user,
        )
        session.status = "completed"
        session.end_time = datetime.now(timezone.utc)
        self.db.commit()

        with self.assertRaises(HTTPException) as error_context:
            launch_lab_route(session.id, "juice-shop-recon", self.db, user)

        self.assertEqual(error_context.exception.status_code, 400)

    def test_teardown_clears_runtime_metadata_when_docker_is_unavailable(self):
        user, _ = self.register_user("cleanup@example.com", "Cleanup")
        session = start_session(
            schemas.SessionCreate(
                lab_name="cleanup-lab",
                lab_id="juice-shop-recon",
            ),
            self.db,
            user,
        )
        session.environment_launched_at = datetime.now(timezone.utc)
        session.attacker_container = f"attacker-{session.id}"
        session.target_container = f"target-{session.id}"
        session.network_name = f"lab-net-{session.id}"
        session.browser_url = "http://localhost:31337"
        self.db.commit()

        with patch(
            "app.services.lab_cleanup.get_docker_client",
            side_effect=RuntimeError("Docker unavailable"),
        ):
            cleanup = teardown_session_environment(
                session,
                reason="unit_test_teardown",
                include_derived=True,
                clear_runtime=True,
            )

        self.assertEqual(cleanup["status"], "deferred")
        self.assertTrue(cleanup["cleared_runtime_metadata"])
        self.assertIsNone(session.environment_launched_at)
        self.assertIsNone(session.attacker_container)
        self.assertIsNone(session.target_container)
        self.assertIsNone(session.network_name)
        self.assertIsNone(session.browser_url)

    def test_startup_cleanup_removes_untracked_session_resources(self):
        user, _ = self.register_user("startup@example.com", "Startup")
        session = start_session(
            schemas.SessionCreate(
                lab_name="startup-lab",
                lab_id="juice-shop-recon",
            ),
            self.db,
            user,
        )

        container_labels = build_managed_labels(
            session.id,
            session.lab_id,
            "attacker_container",
        )
        network_labels = build_managed_labels(
            session.id,
            session.lab_id,
            "network",
        )
        containers = {}
        networks = {}
        container = FakeContainer(
            f"attacker-{session.id}",
            container_labels,
            containers,
        )
        network = FakeNetwork(
            f"lab-net-{session.id}",
            network_labels,
            networks,
        )
        containers[container.name] = container
        networks[network.name] = network
        fake_client = FakeDockerClient(containers=containers, networks=networks)

        with patch(
            "app.services.lab_cleanup.get_docker_client",
            return_value=fake_client,
        ):
            result = cleanup_stale_lab_resources(self.db)

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["removed_count"], 2)
        self.assertFalse(containers)
        self.assertFalse(networks)


if __name__ == "__main__":
    unittest.main()
