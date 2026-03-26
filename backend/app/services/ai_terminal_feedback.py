import json
import requests

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
MODEL_NAME = "llama3"


def build_terminal_prompt(command: str, output: str) -> str:
    return f"""
You are an expert cybersecurity training assistant.

Classify the command based on usefulness in a penetration testing workflow.

Categories:
- useful: contributes to recon, enumeration, exploitation, or analysis
- neutral: basic navigation or low-value action
- risky: potentially dangerous (deletion, privilege abuse, etc.)
- incorrect: invalid or meaningless command

Command:
{command}

Output:
{output}

Return ONLY valid JSON:

{{
  "assessment": "...",
  "explanation": "...",
  "security_relevance": "...",
  "next_step": "...",
  "warning": ""
}}
""".strip()


def _extract_json(text: str) -> str:
    text = text.strip()

    if text.startswith("```"):
        text = text.replace("```json", "").replace("```", "").strip()

    start = text.find("{")
    end = text.rfind("}")

    if start != -1 and end != -1 and end > start:
        return text[start:end + 1]

    if start != -1 and end == -1:
        repaired = text[start:]
        repaired += "}" * (repaired.count("{") - repaired.count("}"))
        return repaired

    return text


def analyze_terminal_interaction(command: str, output: str) -> dict:
    prompt = build_terminal_prompt(command, output)

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

    raw = response.json().get("response", "{}")
    cleaned = _extract_json(raw)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return {
            "assessment": "neutral",
            "explanation": "AI response could not be parsed.",
            "security_relevance": "No structured feedback available.",
            "next_step": "",
            "warning": raw[:500],
        }