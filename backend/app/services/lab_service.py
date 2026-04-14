import logging
import subprocess
from pathlib import Path

from app.config import settings

BASE_DIR = Path(__file__).resolve().parent.parent.parent
COMPOSE_PATH = BASE_DIR / "labs" / "juice-shop" / "docker-compose.yml"
logger = logging.getLogger("securestack.lab_service")


def _run_compose_command(*args):
    command = [*settings.docker_compose_command, "-f", str(COMPOSE_PATH), *args]
    try:
        completed = subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
        )
        return {
            "status": completed.stdout.strip() or "ok",
        }
    except FileNotFoundError as exc:
        logger.exception("docker_compose_missing command=%s", command[0])
        return {
            "error": (
                "Docker Compose is unavailable. Install Docker Compose or set "
                "SECURESTACK_DOCKER_COMPOSE_COMMAND."
            )
        }
    except subprocess.CalledProcessError as exc:
        logger.error(
            "docker_compose_failed command=%s stderr=%s",
            " ".join(command),
            (exc.stderr or exc.stdout or str(exc)).strip(),
        )
        return {
            "error": (exc.stderr or exc.stdout or str(exc)).strip(),
        }


def start_lab():
    return _run_compose_command("up", "-d")


def stop_lab():
    return _run_compose_command("down")
