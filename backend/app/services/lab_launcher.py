import docker

client = docker.from_env()

def get_or_create_network(name="securestack-net"):
    try:
        return client.networks.get(name)
    except docker.errors.NotFound:
        return client.networks.create(name)


def safe_remove_container(name):
    try:
        c = client.containers.get(name)
        c.stop()
        c.remove()
    except docker.errors.NotFound:
        pass


def launch_lab(session_id: int, lab_id: str):
    from app.labs.labs_config import LABS

    lab = LABS.get(lab_id)
    if not lab:
        raise ValueError("Lab not found")

    attacker_name = f"attacker-{session_id}"
    target_name = f"target-{session_id}"

    network = get_or_create_network()

    safe_remove_container(attacker_name)
    safe_remove_container(target_name)

    target = client.containers.create(
        lab["target"]["image"],
        name=target_name,
        detach=True,
        ports=lab["target"].get("ports"),
    )

    network.connect(target, aliases=["target"])

    target.start()

    attacker = client.containers.run(
        "ubuntu:22.04",
        name=attacker_name,
        detach=True,
        tty=True,
        stdin_open=True,
        network=network.name,
        command="bash -c 'apt update && apt install -y nmap iputils-ping curl && bash'",
    )

    return {
        "attacker_container": attacker.name,
        "target_container": target.name,
        "steps": lab["steps"],
    }