import os
import shlex
import tempfile
from pathlib import Path


def _parse_int(value: str | None, default: int, *, minimum: int | None = 1) -> int:
    try:
        parsed = int(value) if value is not None else default
    except (TypeError, ValueError):
        return default

    if minimum is not None and parsed < minimum:
        return default
    return parsed


def _parse_float(value: str | None, default: float, *, minimum: float | None = 0.0) -> float:
    try:
        parsed = float(value) if value is not None else default
    except (TypeError, ValueError):
        return default

    if minimum is not None and parsed < minimum:
        return default
    return parsed


def _parse_cors_origins(value: str | None) -> list[str]:
    if not value:
        return [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:8080",
            "http://127.0.0.1:8080",
        ]

    origins = [origin.strip() for origin in value.split(",")]
    return [origin for origin in origins if origin]


def _parse_command(value: str | None, default: list[str]) -> list[str]:
    if not value:
        return default

    parsed = shlex.split(value)
    return parsed or default


def _build_default_database_url() -> str:
    configured_url = os.getenv("SECURESTACK_DATABASE_URL")
    if configured_url:
        return configured_url

    configured_path = os.getenv("SECURESTACK_DATABASE_PATH")
    if configured_path:
        db_path = Path(configured_path).expanduser()
    else:
        db_path = Path(tempfile.gettempdir()) / "SecureStack" / "securestack.db"

    db_path.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{db_path.as_posix()}"


def _detect_running_in_container() -> bool:
    return Path("/.dockerenv").exists()


class Settings:
    def __init__(self):
        self.app_env = os.getenv("SECURESTACK_APP_ENV", "development").strip().lower()
        self.log_level = os.getenv("SECURESTACK_LOG_LEVEL", "INFO").upper()

        self.api_host = os.getenv("SECURESTACK_API_HOST", "0.0.0.0").strip() or "0.0.0.0"
        self.api_port = _parse_int(os.getenv("SECURESTACK_API_PORT"), 8000)
        self.api_workers = _parse_int(os.getenv("SECURESTACK_API_WORKERS"), 1)

        self.cors_origins = _parse_cors_origins(os.getenv("SECURESTACK_CORS_ORIGINS"))
        self.database_url = _build_default_database_url()
        self.database_connect_retries = _parse_int(
            os.getenv("SECURESTACK_DATABASE_CONNECT_RETRIES"),
            5,
        )
        self.database_connect_retry_delay = _parse_float(
            os.getenv("SECURESTACK_DATABASE_CONNECT_RETRY_DELAY"),
            1.5,
        )

        self.auth_token_secret = (
            os.getenv("SECURESTACK_AUTH_TOKEN_SECRET", "securestack-dev-secret").strip()
            or "securestack-dev-secret"
        )
        self.auth_token_ttl_hours = _parse_int(
            os.getenv("SECURESTACK_AUTH_TOKEN_TTL_HOURS"),
            24,
        )
        self.password_iterations = _parse_int(
            os.getenv("SECURESTACK_PASSWORD_ITERATIONS"),
            120000,
        )
        self.minimum_password_length = _parse_int(
            os.getenv("SECURESTACK_MIN_PASSWORD_LENGTH"),
            8,
        )

        self.ollama_url = (
            os.getenv(
                "SECURESTACK_OLLAMA_URL",
                "http://localhost:11434/api/generate",
            ).strip()
            or "http://localhost:11434/api/generate"
        )
        self.ollama_model = (
            os.getenv("SECURESTACK_OLLAMA_MODEL", "llama3").strip() or "llama3"
        )
        self.ollama_timeout_seconds = _parse_float(
            os.getenv("SECURESTACK_OLLAMA_TIMEOUT_SECONDS"),
            60.0,
        )

        self.docker_host = os.getenv("SECURESTACK_DOCKER_HOST", "").strip() or None
        self.docker_cli_bin = os.getenv("SECURESTACK_DOCKER_CLI", "docker").strip() or "docker"
        self.docker_compose_command = _parse_command(
            os.getenv("SECURESTACK_DOCKER_COMPOSE_COMMAND"),
            [self.docker_cli_bin, "compose"],
        )
        self.container_shell = (
            os.getenv("SECURESTACK_CONTAINER_SHELL", "bash").strip() or "bash"
        )
        self.target_ready_timeout_seconds = _parse_float(
            os.getenv("SECURESTACK_TARGET_READY_TIMEOUT_SECONDS"),
            60.0,
        )
        self.target_public_host = (
            os.getenv("SECURESTACK_TARGET_PUBLIC_HOST", "localhost").strip()
            or "localhost"
        )
        default_probe_host = (
            "host.docker.internal"
            if _detect_running_in_container()
            else self.target_public_host
        )
        self.target_probe_host = (
            os.getenv("SECURESTACK_TARGET_PROBE_HOST", default_probe_host).strip()
            or default_probe_host
        )
        self.container_memory_limit = (
            os.getenv("SECURESTACK_CONTAINER_MEMORY_LIMIT", "").strip() or None
        )
        self.container_nano_cpus = _parse_int(
            os.getenv("SECURESTACK_CONTAINER_NANO_CPUS"),
            0,
            minimum=0,
        )


settings = Settings()
