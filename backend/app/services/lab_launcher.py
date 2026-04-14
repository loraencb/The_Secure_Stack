from copy import deepcopy
import time

import docker
import requests

from app.config import settings
from app.labs.labs_config import LABS

import logging

logger = logging.getLogger("securestack.lab_launcher")


def get_docker_client():
    try:
        if settings.docker_host:
            client = docker.DockerClient(base_url=settings.docker_host)
        else:
            client = docker.from_env()
        client.ping()
        return client
    except docker.errors.DockerException as exc:
        logger.exception("docker_unavailable host=%s", settings.docker_host or "from_env")
        raise RuntimeError(
            "Docker is unavailable. Ensure the Docker daemon is running and the backend can access the Docker socket."
        ) from exc


def get_or_create_network(name: str):
    client = get_docker_client()
    try:
        return client.networks.get(name)
    except docker.errors.NotFound:
        return client.networks.create(name, driver="bridge")


def safe_remove_container(name: str):
    client = get_docker_client()
    try:
        container = client.containers.get(name)
        container.reload()
        if container.status == "running":
            container.stop()
        container.remove(force=True)
    except docker.errors.NotFound:
        pass


def safe_remove_network(name: str):
    client = get_docker_client()
    try:
        network = client.networks.get(name)
        network.remove()
    except docker.errors.NotFound:
        pass
    except docker.errors.APIError:
        pass


def wait_for_http_service(browser_url: str, timeout: float = 60.0):
    deadline = time.monotonic() + timeout
    last_error = None

    while time.monotonic() < deadline:
        try:
            response = requests.get(browser_url, timeout=3)
            if response.ok:
                return
            last_error = f"HTTP {response.status_code}"
        except requests.RequestException as exc:
            last_error = str(exc)

        time.sleep(1)

    raise RuntimeError(
        f"Target service did not become ready at {browser_url} within {timeout:.0f}s. Last error: {last_error}"
    )


def build_container_limits() -> dict:
    limits = {}
    if settings.container_memory_limit:
        limits["mem_limit"] = settings.container_memory_limit
    if settings.container_nano_cpus:
        limits["nano_cpus"] = settings.container_nano_cpus
    return limits


def build_target_urls(host_port: str) -> tuple[str, str]:
    browser_url = f"http://{settings.target_public_host}:{host_port}"
    probe_url = f"http://{settings.target_probe_host}:{host_port}"
    return browser_url, probe_url


def launch_lab(session_id: int, lab_id: str):
    client = get_docker_client()
    lab = LABS.get(lab_id)
    if not lab:
        raise ValueError("Lab not found")

    attacker_name = lab["attacker"]["container_name"].format(session_id=session_id)
    target_name = lab["target"]["container_name"].format(session_id=session_id)
    network_name = lab.get("network_name", "lab-net-{session_id}").format(
        session_id=session_id
    )

    safe_remove_container(attacker_name)
    safe_remove_container(target_name)
    safe_remove_network(network_name)

    network = get_or_create_network(network_name)
    container_limits = build_container_limits()

    target = None
    attacker = None

    try:
        target = client.containers.create(
            lab["target"]["image"],
            name=target_name,
            detach=True,
            ports=lab["target"].get("ports"),
            **container_limits,
        )
        network.connect(target, aliases=[lab["target"]["alias"]])
        target.start()
        target.reload()

        attacker = client.containers.create(
            lab["attacker"]["image"],
            name=attacker_name,
            detach=True,
            tty=True,
            stdin_open=True,
            **container_limits,
        )
        network.connect(attacker)
        attacker.start()
        attacker.reload()

        target.reload()
        app_port = lab["target"].get("app_port", 3000)
        port_info = target.attrs["NetworkSettings"]["Ports"].get(f"{app_port}/tcp", [])
        browser_url = None
        host_port = None
        if port_info:
            host_port = port_info[0]["HostPort"]
            browser_url, probe_url = build_target_urls(host_port)
            logger.info(
                "lab_target_port_bound session_id=%s lab_id=%s host_port=%s browser_url=%s probe_url=%s",
                session_id,
                lab_id,
                host_port,
                browser_url,
                probe_url,
            )
            wait_for_http_service(
                probe_url,
                timeout=settings.target_ready_timeout_seconds,
            )

        steps = deepcopy(lab["steps"])
        if host_port:
            for step in steps:
                hint = step.get("command_hint", "")
                if "{target_port}" in hint:
                    step["command_hint"] = hint.replace("{target_port}", str(host_port))
        return {
            "lab_id": lab_id,
            "lab_name": lab["name"],
            "description": lab.get("description"),
            "difficulty": lab.get("difficulty"),
            "category": lab.get("category"),
            "estimated_duration_minutes": lab.get("estimated_duration_minutes"),
            "learning_objectives": lab.get("learning_objectives", []),
            "prerequisites": lab.get("prerequisites", []),
            "required_tools": lab.get("required_tools", []),
            "success_criteria": lab.get("success_criteria", []),
            "attacker_container": attacker.name,
            "target_container": target.name,
            "network_name": network.name,
            "target_alias": lab["target"]["alias"],
            "browser_url": browser_url,
            "student_manual_path": lab.get("student_manual_path"),
            "instructor_guide_path": lab.get("instructor_guide_path"),
            "steps": steps,
        }

    except Exception as exc:
        if attacker:
            safe_remove_container(attacker_name)
        if target:
            safe_remove_container(target_name)
        safe_remove_network(network_name)
        raise RuntimeError(
            f"Failed to launch lab '{lab_id}' for session {session_id}: {exc}"
        ) from exc
