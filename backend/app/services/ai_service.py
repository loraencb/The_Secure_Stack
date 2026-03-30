import json
import requests

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "llama3"


def build_prompt(findings) -> str:
    if not findings:
        formatted = "No findings were recorded for this session."
    else:
        formatted = "\n".join(
            f"- {finding.title} ({finding.severity}): {finding.description}"
            for finding in findings
        )

    return f"""
You are a cybersecurity expert preparing a concise pentest report summary.

Analyze the following findings:

{formatted}

Return ONLY valid JSON in this exact format:

{{
  "risk_level": "Low | Medium | High",
  "key_issues": ["issue 1", "issue 2"],
  "recommendations": ["fix 1", "fix 2"],
  "summary": "brief professional explanation"
}}

Rules:
- Do not include markdown
- Do not include triple backticks
- Do not include any text before or after the JSON
- Return exactly one JSON object
""".strip()


def extract_json_object(text: str) -> str:
    text = text.strip()

    if text.startswith("```"):
        text = text.replace("```json", "").replace("```", "").strip()

    start = text.find("{")
    end = text.rfind("}")

    if start != -1 and end != -1 and end > start:
        return text[start:end + 1]

    if start != -1 and end == -1:
        repaired = text[start:]
        open_braces = repaired.count("{")
        close_braces = repaired.count("}")
        repaired += "}" * (open_braces - close_braces)
        return repaired

    return text


def _default_summary(warning: str = "") -> dict:
    return {
        "risk_level": "Low",
        "key_issues": [],
        "recommendations": [],
        "summary": "No structured AI summary was available.",
        "warning": warning[:500] if warning else "",
    }


def _normalize_summary(data: dict) -> dict:
    normalized = _default_summary()

    risk_level = data.get("risk_level", normalized["risk_level"])
    if risk_level not in {"Low", "Medium", "High"}:
        risk_level = "Low"

    key_issues = data.get("key_issues", [])
    if not isinstance(key_issues, list):
        key_issues = []

    recommendations = data.get("recommendations", [])
    if not isinstance(recommendations, list):
        recommendations = []

    summary = data.get("summary", normalized["summary"])
    if not isinstance(summary, str):
        summary = normalized["summary"]

    normalized["risk_level"] = risk_level
    normalized["key_issues"] = [str(item) for item in key_issues]
    normalized["recommendations"] = [str(item) for item in recommendations]
    normalized["summary"] = summary

    return normalized


def generate_summary(findings) -> dict:
    prompt = build_prompt(findings)

    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0},
            },
            timeout=60,
        )
        response.raise_for_status()

        data = response.json()
        raw = data.get("response", "{}")
        cleaned = extract_json_object(raw)

        parsed = json.loads(cleaned)
        return _normalize_summary(parsed)

    except Exception as exc:
        return _default_summary(str(exc))