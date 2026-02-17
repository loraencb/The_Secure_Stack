import subprocess

COMPOSE_PATH = "labs/juice-shop/docker-compose.yml"

def start_lab():
    subprocess.run(
        ["docker", "compose", "-f", COMPOSE_PATH, "up", "-d"],
        check=True
    )

def stop_lab():
    subprocess.run(
        ["docker", "compose", "-f", COMPOSE_PATH, "down"],
        check=True
    )
