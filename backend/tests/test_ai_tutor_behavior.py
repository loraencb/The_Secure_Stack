import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.services.ai_terminal_feedback import (  # noqa: E402
    analyze_terminal_interaction,
    analyze_tutor_request,
)


def build_context(**overrides):
    context = {
        "lab_id": "juice-shop-recon",
        "lab_name": "Juice Shop Recon Lab",
        "lab_objectives": [
            "Verify network connectivity between the attacker and the target host.",
            "Identify exposed ports and services with a version detection scan.",
        ],
        "topology_summary": "An attacker container investigates one Juice Shop target.",
        "step_number": 1,
        "step_task_id": "verify-connectivity",
        "step_title": "Verify connectivity",
        "step_type": "command",
        "step_command_hint": "ping -c 3 target",
        "step_instruction": "Confirm the attacker can reach the target container.",
        "step_explanation": (
            "This step proves the attacker can resolve and reach the target before deeper enumeration."
        ),
        "step_objective": (
            "Confirm that the attacker container can resolve and reach the target host."
        ),
        "step_expected_outcome": (
            "You should see successful ICMP replies and zero packet loss, confirming the target is reachable from the attacker shell."
        ),
        "step_expected_evidence": ["icmp_seq", "0% packet loss"],
        "step_success_criteria": [
            "The target responds to ICMP requests from the attacker container."
        ],
        "step_hint": "Use the `target` hostname from the attacker shell instead of an IP address.",
        "step_hints": [
            "Use the `target` hostname from the attacker shell instead of an IP address.",
            "If name resolution fails, confirm the lab environment launched and the containers joined the isolated network.",
        ],
        "step_remediation": (
            "If ping fails, verify that the lab launched successfully and the target alias is resolvable on the isolated network."
        ),
        "step_status": "pending",
        "next_step_number": 2,
        "next_step_title": "Identify open services",
        "next_step_instruction": "Scan the target to discover open ports and services.",
        "next_step_action": "nmap -sV target",
        "next_step_hint": "Use version detection so the output is useful for reporting.",
        "browser_url": "http://localhost:3000",
        "step_help_requests": 0,
        "step_off_track_count": 0,
        "step_consecutive_struggle_count": 0,
        "recent_commands": [],
    }
    context.update(overrides)
    return context


class SecureStackTutorBehaviorTests(unittest.TestCase):
    def test_explicit_hint_request_uses_ask_tutor_origin(self):
        feedback = analyze_tutor_request("hint", build_context())

        self.assertEqual(feedback["response_origin"], "ask_tutor")
        self.assertEqual(feedback["ask_intent"], "hint")
        self.assertEqual(feedback["ask_label"], "Give me a hint")
        self.assertEqual(feedback["hint_level"], 1)
        self.assertNotIn("ping -c 3 target", feedback["next_step"])

    def test_stuck_request_starts_with_stronger_guidance(self):
        feedback = analyze_tutor_request("stuck", build_context())

        self.assertEqual(feedback["response_origin"], "ask_tutor")
        self.assertEqual(feedback["ask_intent"], "stuck")
        self.assertEqual(feedback["hint_level"], 2)
        self.assertEqual(feedback["tutor_mode"], "strong_hint")
        self.assertIn("objective", feedback["security_relevance"].lower())

    def test_explain_request_uses_step_explanation_without_dumping_command(self):
        feedback = analyze_tutor_request("explain", build_context())

        self.assertEqual(feedback["response_origin"], "ask_tutor")
        self.assertEqual(feedback["ask_intent"], "explain")
        self.assertIn("step", feedback["explanation"].lower())
        self.assertIn("objective", feedback["security_relevance"].lower())
        self.assertNotIn("ping -c 3 target", feedback["next_step"])

    def test_help_request_starts_with_subtle_hint(self):
        feedback = analyze_terminal_interaction(
            "help",
            "Shell builtins overview",
            build_context(),
        )

        self.assertTrue(feedback["help_request_detected"])
        self.assertEqual(feedback["hint_level"], 1)
        self.assertEqual(feedback["tutor_mode"], "subtle_hint")
        self.assertNotIn("ping -c 3 target", feedback["next_step"])

    def test_repeated_help_escalates_to_near_complete_guidance(self):
        feedback = analyze_terminal_interaction(
            "help",
            "Shell builtins overview",
            build_context(step_help_requests=2, step_consecutive_struggle_count=2),
        )

        self.assertTrue(feedback["help_request_detected"])
        self.assertEqual(feedback["hint_level"], 3)
        self.assertEqual(feedback["tutor_mode"], "near_complete_guidance")
        self.assertIn("ping -c 3 target", feedback["next_step"])

    def test_off_track_command_redirects_to_current_step(self):
        feedback = analyze_terminal_interaction(
            "cat /etc/passwd",
            "root:x:0:0:root:/root:/bin/bash",
            build_context(step_number=2, step_task_id="identify-open-services", step_title="Identify open services", step_command_hint="nmap -sV target", step_instruction="Scan the target to discover open ports and services.", step_objective="Enumerate exposed services and capture evidence of the reachable service.", step_expected_outcome="The scan should identify TCP 3000 as open and provide enough service detail to justify deeper web validation.", step_expected_evidence=["3000/tcp open", "service fingerprint"], step_hint="Use version detection so the output is useful when you write up evidence later.", step_hints=["Use version detection so the output is useful when you write up evidence later."], step_remediation="If the scan does not show port 3000, confirm the target container is running and wait for the service to finish booting before rescanning."),
        )

        self.assertTrue(feedback["off_track_detected"])
        self.assertEqual(feedback["assessment"], "incorrect")
        self.assertEqual(feedback["tutor_mode"], "redirect")
        self.assertIn("version detection", feedback["next_step"])
        self.assertEqual(feedback["hint_level"], 1)

    def test_success_response_reinforces_learning_objective(self):
        feedback = analyze_terminal_interaction(
            "ping -c 1 target",
            "PING target (172.20.0.2): 56 data bytes\n64 bytes from target: icmp_seq=0 ttl=64 time=0.121 ms\n--- target ping statistics ---\n1 packets transmitted, 1 packets received, 0% packet loss",
            build_context(),
        )

        self.assertTrue(feedback["step_completed_detected"])
        self.assertEqual(feedback["tutor_mode"], "success_explanation")
        self.assertIn("lab objective", feedback["learning_reinforcement"])
        self.assertIn("Move to step 2", feedback["next_step"])


if __name__ == "__main__":
    unittest.main()
