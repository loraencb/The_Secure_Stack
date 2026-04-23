import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.services.task_evaluator import command_matches_hint  # noqa: E402


class TaskEvaluatorTests(unittest.TestCase):
    def test_ping_count_hint_allows_flexible_probe_count(self):
        self.assertTrue(command_matches_hint("ping -c 1 target", "ping -c 3 target"))

    def test_nmap_hint_requires_meaningful_flag_and_target(self):
        self.assertTrue(command_matches_hint("nmap -Pn -sV target", "nmap -sV target"))
        self.assertFalse(command_matches_hint("nmap target", "nmap -sV target"))

    def test_curl_hints_can_distinguish_header_and_body_steps(self):
        self.assertTrue(
            command_matches_hint("curl -I http://target", "curl -I http://target")
        )
        self.assertFalse(
            command_matches_hint("curl http://target", "curl -I http://target")
        )
        self.assertTrue(
            command_matches_hint("curl -s http://target", "curl http://target")
        )


if __name__ == "__main__":
    unittest.main()
