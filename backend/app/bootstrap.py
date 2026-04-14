import logging

from app.database import initialize_database

logger = logging.getLogger("securestack.bootstrap")


def bootstrap_application():
    initialize_database()
    logger.info("application_bootstrap_complete")


if __name__ == "__main__":
    bootstrap_application()
