import json
import logging
import requests

from app.config import settings

logger = logging.getLogger("securestack.ai")


def build_prompt(findings):
    formatted = "\n".join(
        [f"- {f.title} ({f.severity}): {f.description}" for f in findings]
    )

    return f"""
You are a cybersecurity expert.

Analyze the following vulnerabilities:

{formatted}

Return ONLY valid JSON in this exact format:

{{
  "risk_level": "Low | Medium | High",
  "key_issues": ["issue 1", "issue 2"],
  "recommendations": ["fix 1", "fix 2"],
  "summary": "brief professional explanation"
}}

Do not include markdown.
Do not include triple backticks.
Do not include any text before or after the JSON.
"""


def extract_json_object(text: str) -> str:
    text = text.strip()

    # remove markdown fences if model adds them
    if text.startswith("```"):
        text = text.replace("```json", "").replace("```", "").strip()

    # keep only content from first { to last }
    start = text.find("{")
    end = text.rfind("}")

    if start != -1 and end != -1 and end > start:
        return text[start:end + 1]

    # if opening brace exists but closing brace is missing, try repairing it
    if start != -1 and end == -1:
        repaired = text[start:]
        open_braces = repaired.count("{")
        close_braces = repaired.count("}")
        repaired += "}" * (open_braces - close_braces)
        return repaired

    return text


def generate_summary(findings):
    if not findings:
        return {
            "risk_level": "Low",
            "key_issues": [],
            "recommendations": [
                "Continue the lab and capture at least one meaningful finding before generating a final report."
            ],
            "summary": "No findings have been recorded for this session yet.",
        }

    prompt = build_prompt(findings)

    try:
        response = requests.post(
            settings.ollama_url,
            json={
                "model": settings.ollama_model,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0},
            },
            timeout=settings.ollama_timeout_seconds,
        )

        response.raise_for_status()
        data = response.json()
        raw = data.get("response", "{}")

        cleaned = extract_json_object(raw)
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            logger.warning("ai_summary_malformed_output findings=%s", len(findings))
            return {
                "risk_level": "Medium",
                "key_issues": [finding.title for finding in findings[:3]],
                "recommendations": [
                    "Review the captured findings and validate their business impact.",
                    "Confirm remediation steps for the exposed services and application paths identified during the lab.",
                ],
                "summary": "The report generator returned malformed AI output, so a fallback summary was produced from the saved findings.",
            }
    except requests.RequestException as exc:
        logger.warning(
            "ai_summary_unavailable findings=%s ollama_url=%s model=%s error=%s",
            len(findings),
            settings.ollama_url,
            settings.ollama_model,
            exc,
        )
        highest = "Low"
        if any((finding.severity or "").lower() == "high" for finding in findings):
            highest = "High"
        elif any((finding.severity or "").lower() == "medium" for finding in findings):
            highest = "Medium"

        return {
            "risk_level": highest,
            "key_issues": [finding.title for finding in findings[:3]],
            "recommendations": [
                "Validate the saved findings and confirm remediation priorities.",
                "Use the captured evidence to explain why the exposed services matter to the target's attack surface.",
            ],
            "summary": f"A fallback report was generated from {len(findings)} saved finding(s) because the AI service was unavailable.",
        }
