import docker
from docker.errors import APIError, NotFound

from app.labs.labs_config import LABS

client = docker.from_env()


def get_or_create_network(name: str):
    try:
        return client.networks.get(name)
    except NotFound:
        return client.networks.create(name, driver="bridge")


def safe_remove_container(name: str) -> None:
    try:
        container = client.containers.get(name)
        container.reload()
        if container.status == "running":
            container.stop()
        container.remove(force=True)
    except NotFound:
        pass


def safe_remove_network(name: str) -> None:
    try:
        network = client.networks.get(name)
        network.remove()
    except NotFound:
        pass
    except APIError:
        pass


def _build_browser_url(container, container_port: str) -> str | None:
    ports = container.attrs.get("NetworkSettings", {}).get("Ports", {})
    port_info = ports.get(container_port, [])

    if port_info:
        host_port = port_info[0].get("HostPort")
        if host_port:
            return f"http://localhost:{host_port}"

    return None


def launch_lab(session_id: int, lab_id: str) -> dict:
    lab = LABS.get(lab_id)
    if not lab:
        raise ValueError("Lab not found")

    attacker_name = lab["attacker"]["container_name"].format(session_id=session_id)
    target_name = lab["target"]["container_name"].format(session_id=session_id)
    network_name = f"lab-net-{session_id}"

    safe_remove_container(attacker_name)
    safe_remove_container(target_name)
    safe_remove_network(network_name)

    network = get_or_create_network(network_name)

    target = None
    attacker = None

    try:
        target = client.containers.create(
            image=lab["target"]["image"],
            name=target_name,
            detach=True,
            ports=lab["target"].get("ports"),
        )
        network.connect(target, aliases=[lab["target"]["alias"]])
        target.start()
        target.reload()

        attacker = client.containers.run(
            image=lab["attacker"]["image"],
            name=attacker_name,
            detach=True,
            tty=True,
            stdin_open=True,
            network=network.name,
        )
        attacker.reload()

        target_port = lab["target"].get("browser_port", "3000/tcp")
        browser_url = _build_browser_url(target, target_port)

        return {
            "lab_id": lab_id,
            "lab_name": lab["name"],
            "attacker_container": attacker.name,
            "target_container": target.name,
            "network_name": network.name,
            "target_alias": lab["target"]["alias"],
            "browser_url": browser_url,
            "steps": lab.get("steps", []),
        }

    except Exception:
        if attacker:
            safe_remove_container(attacker_name)
        if target:
            safe_remove_container(target_name)
        safe_remove_network(network_name)
        raise


def stop_lab(session_id: int) -> dict:
    network_name = f"lab-net-{session_id}"

    removed_containers = []
    for lab in LABS.values():
        attacker_name = lab["attacker"]["container_name"].format(session_id=session_id)
        target_name = lab["target"]["container_name"].format(session_id=session_id)

        for container_name in (attacker_name, target_name):
            try:
                container = client.containers.get(container_name)
                container.reload()
                if container.status == "running":
                    container.stop()
                container.remove(force=True)
                removed_containers.append(container_name)
            except NotFound:
                pass

    safe_remove_network(network_name)

    return {
        "session_id": session_id,
        "stopped": True,
        "removed_containers": removed_containers,
        "removed_network": network_name,
    }