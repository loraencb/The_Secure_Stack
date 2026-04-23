import os
import shlex
import tempfile
from pathlib import Path

INSECURE_AUTH_SECRETS = {
    "",
    "securestack-dev-secret",
    "change-this-for-production",
    "change-this-to-a-long-random-secret",
}


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


def _parse_email_set(value: str | None) -> set[str]:
    if not value:
        return set()

    emails = {
        item.strip().lower()
        for item in value.split(",")
        if item and item.strip()
    }
    return emails


def _parse_command(value: str | None, default: list[str]) -> list[str]:
    if not value:
        return default

    parsed = shlex.split(value)
    return parsed or default


def _parse_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default

    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def _parse_choice(value: str | None, default: str, choices: set[str]) -> str:
    normalized = (value or default).strip().lower()
    if normalized in choices:
        return normalized
    return default


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
        self.run_migrations_on_startup = _parse_bool(
            os.getenv("SECURESTACK_RUN_MIGRATIONS_ON_STARTUP"),
            True,
        )
        self.cleanup_stale_labs_on_startup = _parse_bool(
            os.getenv("SECURESTACK_CLEANUP_STALE_LABS_ON_STARTUP"),
            True,
        )
        self.auto_create_schema = _parse_bool(
            os.getenv("SECURESTACK_AUTO_CREATE_SCHEMA"),
            False,
        )

        self.auth_token_secret = (
            os.getenv("SECURESTACK_AUTH_TOKEN_SECRET", "securestack-dev-secret").strip()
            or "securestack-dev-secret"
        )
        self.auth_token_ttl_hours = _parse_int(
            os.getenv("SECURESTACK_AUTH_TOKEN_TTL_HOURS"),
            24,
        )
        self.instructor_emails = _parse_email_set(
            os.getenv("SECURESTACK_INSTRUCTOR_EMAILS")
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
        self.openai_tutor_enabled = _parse_bool(
            os.getenv("OPENAI_TUTOR_ENABLED"),
            True,
        )
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "").strip() or None
        self.openai_model = (
            os.getenv("OPENAI_MODEL", "gpt-5.4-mini").strip()
            or "gpt-5.4-mini"
        )
        self.openai_org_id = os.getenv("OPENAI_ORG_ID", "").strip() or None
        self.openai_project_id = os.getenv("OPENAI_PROJECT_ID", "").strip() or None
        self.openai_timeout_seconds = _parse_float(
            os.getenv("OPENAI_TIMEOUT_SECONDS"),
            14.0,
            minimum=1.0,
        )
        self.openai_max_output_tokens = _parse_int(
            os.getenv("OPENAI_MAX_OUTPUT_TOKENS"),
            700,
            minimum=128,
        )
        self.openai_reasoning_effort = _parse_choice(
            os.getenv("OPENAI_REASONING_EFFORT"),
            "low",
            {"none", "minimal", "low", "medium", "high", "xhigh"},
        )
        self.openai_text_verbosity = _parse_choice(
            os.getenv("OPENAI_TEXT_VERBOSITY"),
            "low",
            {"low", "medium", "high"},
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
        self.pull_runtime_images = _parse_bool(
            os.getenv("SECURESTACK_PULL_RUNTIME_IMAGES"),
            True,
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

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    def validate(self):
        if "*" in self.cors_origins:
            raise RuntimeError(
                "SECURESTACK_CORS_ORIGINS cannot contain '*' because Secure Stack uses credentialed requests."
            )

        if self.minimum_password_length < 8:
            raise RuntimeError(
                "SECURESTACK_MIN_PASSWORD_LENGTH must be at least 8."
            )

        if self.is_production:
            if (
                self.auth_token_secret in INSECURE_AUTH_SECRETS
                or len(self.auth_token_secret) < 32
            ):
                raise RuntimeError(
                    "SECURESTACK_AUTH_TOKEN_SECRET must be set to a strong non-default value in production."
                )

    def is_instructor_email(self, email: str | None) -> bool:
        normalized = (email or "").strip().lower()
        return bool(normalized and normalized in self.instructor_emails)

    def startup_warnings(self) -> list[str]:
        warnings: list[str] = []

        if self.is_production and self.database_url.startswith("sqlite"):
            warnings.append(
                "SQLite is configured in production mode. PostgreSQL is recommended for durable deployment."
            )

        if self.is_production and any(
            "localhost" in origin or "127.0.0.1" in origin
            for origin in self.cors_origins
        ):
            warnings.append(
                "CORS origins still reference localhost. Confirm this matches the deployed frontend host."
            )

        if self.api_workers == 1:
            warnings.append(
                "API workers are set to 1. This is acceptable for small deployments but limits backend concurrency."
            )

        if self.is_production and self.auto_create_schema:
            warnings.append(
                "SECURESTACK_AUTO_CREATE_SCHEMA is enabled in production. Prefer Alembic migrations instead."
            )

        if self.is_production and not self.run_migrations_on_startup:
            warnings.append(
                "Automatic Alembic migrations are disabled. Ensure `alembic upgrade head` runs before the backend starts."
            )

        if self.is_production and not self.cleanup_stale_labs_on_startup:
            warnings.append(
                "Stale lab cleanup on startup is disabled. Ensure ended or broken lab environments are cleaned up by another operational path."
            )

        if self.is_production and not self.pull_runtime_images:
            warnings.append(
                "Automatic lab image pulling is disabled. Ensure all runtime images are preloaded on the Docker host."
            )

        return warnings


settings = Settings()
