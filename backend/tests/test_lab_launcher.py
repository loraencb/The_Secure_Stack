import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import docker


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.services.lab_launcher import ensure_lab_image_available  # noqa: E402


class SecureStackLabLauncherTests(unittest.TestCase):
    def test_uses_existing_image_without_pull(self):
        existing_image = object()
        client = SimpleNamespace(
            images=SimpleNamespace(
                get=Mock(return_value=existing_image),
                pull=Mock(),
            )
        )

        image = ensure_lab_image_available(client, "nginx:alpine")

        self.assertIs(image, existing_image)
        client.images.get.assert_called_once_with("nginx:alpine")
        client.images.pull.assert_not_called()

    def test_pulls_missing_image_when_enabled(self):
        pulled_image = object()
        client = SimpleNamespace(
            images=SimpleNamespace(
                get=Mock(side_effect=docker.errors.ImageNotFound("missing")),
                pull=Mock(return_value=pulled_image),
            )
        )

        with patch("app.services.lab_launcher.settings.pull_runtime_images", True):
            image = ensure_lab_image_available(client, "nginx:alpine")

        self.assertIs(image, pulled_image)
        client.images.pull.assert_called_once_with("nginx:alpine")

    def test_missing_image_fails_cleanly_when_pulls_disabled(self):
        client = SimpleNamespace(
            images=SimpleNamespace(
                get=Mock(side_effect=docker.errors.ImageNotFound("missing")),
                pull=Mock(),
            )
        )

        with patch("app.services.lab_launcher.settings.pull_runtime_images", False):
            with self.assertRaises(RuntimeError) as error_context:
                ensure_lab_image_available(client, "nginx:alpine")

        self.assertIn("automatic pulling is disabled", str(error_context.exception))
        client.images.pull.assert_not_called()

    def test_pull_failure_surfaces_clear_runtime_error(self):
        client = SimpleNamespace(
            images=SimpleNamespace(
                get=Mock(side_effect=docker.errors.ImageNotFound("missing")),
                pull=Mock(side_effect=docker.errors.APIError("registry unavailable")),
            )
        )

        with patch("app.services.lab_launcher.settings.pull_runtime_images", True):
            with self.assertRaises(RuntimeError) as error_context:
                ensure_lab_image_available(client, "nginx:alpine")

        self.assertIn("could not be pulled", str(error_context.exception))


if __name__ == "__main__":
    unittest.main()
