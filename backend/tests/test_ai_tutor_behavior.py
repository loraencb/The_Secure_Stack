import sys
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.config import settings  # noqa: E402
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
        "step_instruction": "Use a short ICMP probe to verify that the attacker can reach the target host.",
        "step_explanation": (
            "This step proves the attacker can resolve and reach the target before deeper enumeration."
        ),
        "step_learning_takeaway": (
            "This confirmed the target was reachable before the learner moved on to service discovery."
        ),
        "step_objective": (
            "Confirm that the attacker container can resolve and reach the target host."
        ),
        "step_expected_outcome": (
            "You should see successful ICMP replies and zero packet loss, confirming the target is reachable from the attacker shell."
        ),
        "step_expected_evidence": ["icmp_seq", "0% packet loss"],
        "step_what_to_observe": [
            "The target hostname resolves",
            "Successful replies come back",
        ],
        "step_why_observation_matters": (
            "Those signals prove the attacker has a clean path before deeper enumeration."
        ),
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
        "next_step_title": "Identify the exposed web service",
        "next_step_instruction": "Run a version-detection scan against the target to discover the exposed service.",
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
    def setUp(self):
        self.openai_enabled_patch = patch.object(
            settings,
            "openai_tutor_enabled",
            False,
        )
        self.openai_enabled_patch.start()

    def tearDown(self):
        self.openai_enabled_patch.stop()

    def test_explicit_hint_request_uses_ask_tutor_origin(self):
        feedback = analyze_tutor_request("hint", build_context())

        self.assertEqual(feedback["response_origin"], "ask_tutor")
        self.assertEqual(feedback["ask_intent"], "hint")
        self.assertEqual(feedback["ask_label"], "Give me a hint")
        self.assertEqual(feedback["hint_level"], 1)
        self.assertEqual(feedback["response_mode"], "fast")
        self.assertNotIn("ping -c 3 target", feedback["next_step"])

    def test_stuck_request_starts_with_stronger_guidance(self):
        feedback = analyze_tutor_request("stuck", build_context())

        self.assertEqual(feedback["response_origin"], "ask_tutor")
        self.assertEqual(feedback["ask_intent"], "stuck")
        self.assertEqual(feedback["hint_level"], 2)
        self.assertEqual(feedback["tutor_mode"], "strong_hint")
        self.assertEqual(feedback["response_mode"], "deep")
        self.assertIn("this step proves", feedback["security_relevance"].lower())
        self.assertIn("watch for", feedback["learning_reinforcement"].lower())

    def test_explain_request_uses_step_explanation_without_dumping_command(self):
        feedback = analyze_tutor_request("explain", build_context())

        self.assertEqual(feedback["response_origin"], "ask_tutor")
        self.assertEqual(feedback["ask_intent"], "explain")
        self.assertEqual(feedback["response_mode"], "deep")
        self.assertIn("verify connectivity", feedback["explanation"].lower())
        self.assertIn("this step proves", feedback["security_relevance"].lower())
        self.assertNotIn("ping -c 3 target", feedback["next_step"])

    def test_hint_request_stays_local_even_when_openai_is_configured(self):
        with (
            patch.object(settings, "openai_tutor_enabled", True),
            patch.object(settings, "openai_api_key", "test-key"),
            patch(
                "app.services.ai_terminal_feedback.openai_tutor.ask_openai_tutor"
            ) as ask_openai,
        ):
            feedback = analyze_tutor_request("hint", build_context())

        ask_openai.assert_not_called()
        self.assertEqual(feedback["response_mode"], "fast")
        self.assertNotIn("deep_reasoning_provider", feedback)

    def test_explain_request_uses_openai_for_deep_reasoning_when_configured(self):
        fake_openai_response = {
            "explanation": "OpenAI deep explanation about proving reachability first.",
            "security_relevance": "OpenAI relevance keeps the scan evidence trustworthy.",
            "learning_reinforcement": "OpenAI reinforcement ties the observation to the lab goal.",
            "next_step": "This model suggestion should still be governed by the local hint ladder.",
        }

        with (
            patch.object(settings, "openai_tutor_enabled", True),
            patch.object(settings, "openai_api_key", "test-key"),
            patch.object(settings, "openai_model", "gpt-test"),
            patch(
                "app.services.ai_terminal_feedback.openai_tutor.ask_openai_tutor",
                return_value=fake_openai_response,
            ) as ask_openai,
        ):
            feedback = analyze_tutor_request("explain", build_context())

        ask_openai.assert_called_once()
        self.assertEqual(feedback["response_mode"], "deep")
        self.assertEqual(feedback["deep_reasoning_provider"], "openai")
        self.assertEqual(feedback["openai_model"], "gpt-test")
        self.assertIn("openai deep explanation", feedback["explanation"].lower())
        self.assertIn("openai relevance", feedback["security_relevance"].lower())
        self.assertNotIn("model suggestion", feedback["next_step"].lower())

    def test_openai_deep_failure_falls_back_to_local_tutor_response(self):
        with (
            patch.object(settings, "openai_tutor_enabled", True),
            patch.object(settings, "openai_api_key", "test-key"),
            patch(
                "app.services.ai_terminal_feedback.openai_tutor.ask_openai_tutor",
                return_value=None,
            ) as ask_openai,
        ):
            feedback = analyze_tutor_request("stuck", build_context())

        ask_openai.assert_called_once()
        self.assertEqual(feedback["response_mode"], "deep")
        self.assertEqual(feedback["deep_reasoning_provider"], "local_fallback")
        self.assertTrue(feedback["deep_reasoning_fallback"])
        self.assertIn("hint ladder", feedback["explanation"].lower())

    def test_openai_missing_key_path_still_uses_logged_fallback_service(self):
        with (
            patch.object(settings, "openai_tutor_enabled", True),
            patch.object(settings, "openai_api_key", None),
            patch(
                "app.services.ai_terminal_feedback.openai_tutor.ask_openai_tutor",
                return_value=None,
            ) as ask_openai,
        ):
            feedback = analyze_tutor_request("explain", build_context())

        ask_openai.assert_called_once()
        self.assertEqual(feedback["deep_reasoning_provider"], "local_fallback")
        self.assertTrue(feedback["deep_reasoning_fallback"])

    def test_idle_nudge_stays_local_even_when_openai_is_configured(self):
        with (
            patch.object(settings, "openai_tutor_enabled", True),
            patch.object(settings, "openai_api_key", "test-key"),
            patch(
                "app.services.ai_terminal_feedback.openai_tutor.ask_openai_tutor"
            ) as ask_openai,
        ):
            feedback = analyze_tutor_request("idle_nudge", build_context())

        ask_openai.assert_not_called()
        self.assertEqual(feedback["response_mode"], "fast")
        self.assertEqual(feedback["response_origin"], "proactive_tutor")

    def test_freeform_why_question_becomes_tutor_chat(self):
        feedback = analyze_tutor_request(
            "",
            build_context(),
            learner_message="Why do we verify connectivity before scanning services?",
            conversation_history=[
                {
                    "role": "student",
                    "content": "I just got into the workspace.",
                }
            ],
        )

        self.assertEqual(feedback["response_origin"], "tutor_chat")
        self.assertEqual(feedback["ask_intent"], "explain")
        self.assertIn("prove", feedback["explanation"].lower())
        self.assertIn("this step proves", feedback["security_relevance"].lower())
        self.assertIn("watch for", feedback["learning_reinforcement"].lower())
        self.assertNotIn("ping -c 3 target", feedback["next_step"])

    def test_what_next_request_uses_observation_coaching(self):
        feedback = analyze_tutor_request("what_next", build_context())

        self.assertEqual(feedback["response_origin"], "ask_tutor")
        self.assertEqual(feedback["ask_intent"], "what_next")
        self.assertIn("watch for", feedback["learning_reinforcement"].lower())

    def test_freeform_what_next_question_returns_actionable_hint(self):
        feedback = analyze_tutor_request(
            "",
            build_context(),
            learner_message="What should I do next on this step?",
        )

        self.assertEqual(feedback["response_origin"], "tutor_chat")
        self.assertEqual(feedback["ask_intent"], "what_next")
        self.assertIn("target", feedback["next_step"].lower())

    def test_freeform_stuck_message_escalates_like_existing_hint_ladder(self):
        feedback = analyze_tutor_request(
            "",
            build_context(
                step_help_requests=1,
                step_consecutive_struggle_count=1,
            ),
            learner_message="I'm stuck and not sure what to try now.",
        )

        self.assertEqual(feedback["response_origin"], "tutor_chat")
        self.assertEqual(feedback["ask_intent"], "stuck")
        self.assertGreaterEqual(feedback["hint_level"], 2)
        self.assertIn("focus on one piece of evidence", feedback["explanation"].lower())

    def test_idle_nudge_stays_proactive_and_step_aware(self):
        feedback = analyze_tutor_request(
            "idle_nudge",
            build_context(
                step_help_requests=1,
                step_consecutive_struggle_count=1,
            ),
        )

        self.assertEqual(feedback["response_origin"], "proactive_tutor")
        self.assertEqual(feedback["ask_intent"], "idle_nudge")
        self.assertEqual(feedback["intervention_reason"], "idle_nudge")
        self.assertTrue(feedback["should_append_to_chat"])
        self.assertEqual(feedback["response_mode"], "fast")
        self.assertIn("quiet", feedback["explanation"].lower())
        self.assertIn("this step proves", feedback["security_relevance"].lower())

    def test_idle_nudge_keeps_browser_steps_honest(self):
        feedback = analyze_tutor_request(
            "idle_nudge",
            build_context(
                step_number=3,
                step_task_id="open-browser",
                step_title="Open the application",
                step_type="browser",
                step_instruction="Open the forwarded Juice Shop URL in the browser.",
                step_objective="Confirm the exposed web application loads in the browser.",
                step_explanation="This step moves from shell validation into direct browser inspection.",
                step_expected_outcome="The Juice Shop login page should load successfully in the browser.",
                step_hint="Open the forwarded browser URL rather than using more shell commands.",
            ),
        )

        self.assertEqual(feedback["response_origin"], "proactive_tutor")
        self.assertEqual(feedback["intervention_reason"], "idle_nudge")
        self.assertIn("browser", feedback["explanation"].lower())
        self.assertIn("http://localhost:3000", feedback["next_step"])

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
            build_context(step_number=2, step_task_id="identify-open-services", step_title="Identify the exposed web service", step_command_hint="nmap -sV target", step_instruction="Run a version-detection scan against the target to discover the exposed service.", step_objective="Enumerate the target so you can identify the exposed port and recognize that a web application is likely behind it.", step_expected_outcome="The scan should identify TCP 3000 as open and return service details consistent with a web application that should be validated directly.", step_expected_evidence=["3000/tcp open", "service fingerprint"], step_hint="Use version detection so the output is useful when you write up evidence later.", step_hints=["Use version detection so the output is useful when you write up evidence later."], step_remediation="If the scan does not show port 3000, confirm the target container is running and wait for the service to finish booting before rescanning."),
        )

        self.assertTrue(feedback["off_track_detected"])
        self.assertEqual(feedback["assessment"], "incorrect")
        self.assertEqual(feedback["tutor_mode"], "redirect")
        self.assertEqual(feedback["response_mode"], "fast")
        self.assertIn("version detection", feedback["next_step"])
        self.assertEqual(feedback["hint_level"], 1)
        self.assertEqual(feedback["response_origin"], "proactive_tutor")
        self.assertTrue(feedback["should_append_to_chat"])
        self.assertEqual(feedback["intervention_reason"], "off_track_redirect")

    def test_success_response_reinforces_learning_objective(self):
        feedback = analyze_terminal_interaction(
            "ping -c 1 target",
            "PING target (172.20.0.2): 56 data bytes\n64 bytes from target: icmp_seq=0 ttl=64 time=0.121 ms\n--- target ping statistics ---\n1 packets transmitted, 1 packets received, 0% packet loss",
            build_context(),
        )

        self.assertTrue(feedback["step_completed_detected"])
        self.assertEqual(feedback["tutor_mode"], "success_explanation")
        self.assertEqual(feedback["response_mode"], "fast")
        self.assertIn("service discovery", feedback["learning_reinforcement"])
        self.assertIn("Move to step 2", feedback["next_step"])
        self.assertEqual(feedback["response_origin"], "proactive_tutor")
        self.assertTrue(feedback["should_append_to_chat"])
        self.assertEqual(
            feedback["intervention_reason"], "success_reinforcement"
        )
        self.assertIn("Good,", feedback["explanation"])

    def test_partial_progress_triggers_progress_briefing(self):
        feedback = analyze_terminal_interaction(
            "nmap -sV target",
            "Nmap scan report for target\nHost is up.\nNot shown: 999 closed ports\n",
            build_context(
                step_number=2,
                step_task_id="identify-open-services",
                step_title="Identify the exposed web service",
                step_command_hint="nmap -sV target",
                step_instruction="Run a version-detection scan against the target to discover the exposed service.",
                step_objective="Enumerate the target so you can identify the exposed port and recognize that a web application is likely behind it.",
                step_expected_outcome="The scan should identify TCP 3000 as open and return service details consistent with a web application that should be validated directly.",
                step_expected_evidence=["3000/tcp open", "service fingerprint"],
                step_hint="Use version detection so the output is useful when you write up evidence later.",
                step_hints=["Use version detection so the output is useful when you write up evidence later."],
            ),
        )

        self.assertEqual(feedback["response_origin"], "proactive_tutor")
        self.assertEqual(feedback["intervention_reason"], "progress_briefing")
        self.assertTrue(feedback["should_append_to_chat"])
        self.assertIn("Good direction", feedback["explanation"])

    def test_repeated_weak_attempt_triggers_proactive_stuck_intervention(self):
        feedback = analyze_terminal_interaction(
            "nmap -sV target",
            "Nmap scan report for target\nHost is up.\nNot shown: 999 closed ports\n",
            build_context(
                step_number=2,
                step_task_id="identify-open-services",
                step_title="Identify the exposed web service",
                step_command_hint="nmap -sV target",
                step_instruction="Run a version-detection scan against the target to discover the exposed service.",
                step_objective="Enumerate the target so you can identify the exposed port and recognize that a web application is likely behind it.",
                step_expected_outcome="The scan should identify TCP 3000 as open and return service details consistent with a web application that should be validated directly.",
                step_expected_evidence=["3000/tcp open", "service fingerprint"],
                step_hint="Use version detection so the output is useful when you write up evidence later.",
                step_hints=["Use version detection so the output is useful when you write up evidence later."],
                recent_commands=[
                    {"command": "nmap -sV target", "output": "Host is up."},
                    {"command": "nmap -sV target", "output": "Host is up."},
                ],
                step_consecutive_struggle_count=1,
            ),
        )

        self.assertTrue(feedback["stuck_detected"])
        self.assertEqual(feedback["tutor_mode"], "strong_hint")
        self.assertEqual(feedback["response_origin"], "proactive_tutor")
        self.assertTrue(feedback["should_append_to_chat"])
        self.assertEqual(feedback["intervention_reason"], "stuck_intervention")

    def test_low_signal_command_review_stays_out_of_tutor_thread(self):
        feedback = analyze_terminal_interaction(
            "ls",
            "app\nnotes.txt\n",
            build_context(),
        )

        self.assertEqual(feedback["response_origin"], "command_review")
        self.assertFalse(feedback["proactive_intervention"])
        self.assertFalse(feedback["should_append_to_chat"])


if __name__ == "__main__":
    unittest.main()
