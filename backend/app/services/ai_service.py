import json
import requests

OLLAMA_URL = "http://localhost:11434/api/generate"


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
    prompt = build_prompt(findings)

    response = requests.post(
        OLLAMA_URL,
        json={
            "model": "llama3",
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0
            }
        },
        timeout=60,
    )

    response.raise_for_status()
    data = response.json()
    raw = data.get("response", "{}")

    cleaned = extract_json_object(raw)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return {
            "error": "AI parsing failed",
            "raw_output": raw,
            "cleaned_output": cleaned,
        }