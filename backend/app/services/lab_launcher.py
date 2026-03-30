import docker
from copy import deepcopy
from app.labs.labs_config import LABS

client = docker.from_env()


def get_or_create_network(name: str):
    try:
        return client.networks.get(name)
    except docker.errors.NotFound:
        return client.networks.create(name, driver="bridge")


def safe_remove_container(name: str):
    try:
        container = client.containers.get(name)
        if container.status == "running":
            container.stop()
        container.remove(force=True)
    except docker.errors.NotFound:
        pass


def safe_remove_network(name: str):
    try:
        network = client.networks.get(name)
        network.remove()
    except docker.errors.NotFound:
        pass
    except docker.errors.APIError:
        pass


def launch_lab(session_id: int, lab_id: str):
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
            lab["target"]["image"],
            name=target_name,
            detach=True,
            ports=lab["target"].get("ports"),
        )
        network.connect(target, aliases=[lab["target"]["alias"]])
        target.start()
        target.reload()

        attacker = client.containers.run(
            lab["attacker"]["image"],
            name=attacker_name,
            detach=True,
            tty=True,
            stdin_open=True,
            network=network.name,
        )

        target.reload()
        port_info = target.attrs["NetworkSettings"]["Ports"].get("3000/tcp", [])

        browser_url = None
        host_port = None
        if port_info:
            host_port = port_info[0]["HostPort"]
            browser_url = f"http://localhost:{host_port}"

        steps = deepcopy(lab["steps"])
        if host_port:
            for step in steps:
                hint = step.get("command_hint", "")
                if "{target_port}" in hint:
                    step["command_hint"] = hint.replace("{target_port}", str(host_port))

        return {
            "lab_id": lab_id,
            "lab_name": lab["name"],
            "attacker_container": attacker.name,
            "target_container": target.name,
            "network_name": network.name,
            "target_alias": lab["target"]["alias"],
            "browser_url": browser_url,
            "steps": steps,
        }

    except Exception:
        if attacker:
            safe_remove_container(attacker_name)
        if target:
            safe_remove_container(target_name)
        safe_remove_network(network_name)
        raise