import logging

from app.config import settings


def configure_logging():
    if logging.getLogger().handlers:
        logging.getLogger().setLevel(settings.log_level)
        return

    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
