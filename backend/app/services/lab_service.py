import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
COMPOSE_PATH = BASE_DIR / "labs" / "juice-shop" / "docker-compose.yml"


def start_lab():
    try:
        subprocess.run(
            ["docker-compose", "-f", str(COMPOSE_PATH), "up", "-d"],
            check=True,
        )
        return {"status": "Lab started"}
    except subprocess.CalledProcessError as e:
        return {"error": str(e)}


def stop_lab():
    try:
        subprocess.run(
            ["docker-compose", "-f", str(COMPOSE_PATH), "down"],
            check=True,
        )
        return {"status": "Lab stopped"}
    except subprocess.CalledProcessError as e:
        return {"error": str(e)}