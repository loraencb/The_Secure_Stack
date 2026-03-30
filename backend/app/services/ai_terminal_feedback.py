import json
import requests

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
MODEL_NAME = "llama3"


def build_terminal_prompt(command: str, output: str) -> str:
    return f"""
You are an expert cybersecurity training assistant.

A student is working inside a Linux-based penetration testing lab.

Analyze this command and its output.

Command:
{command}

Output:
{output}

Tasks:
1. Classify the command into one pentesting workflow phase:
   - reconnaissance
   - enumeration
   - exploitation
   - post-exploitation
   - general-navigation

2. Evaluate whether the command was:
   - useful
   - neutral
   - risky
   - incorrect

3. Explain what the command/output means.

4. Explain why it matters from a cybersecurity perspective.

5. Suggest the next best step.

6. Detect whether the output suggests a security-relevant finding worth logging.

A finding should be detected ONLY when the output provides meaningful evidence of a security issue, attack surface, or notable target condition that would be worth including in a pentest report.

Good examples of valid findings:
- reachable web application or service
- exposed port or listening service
- suspicious privilege escalation path
- credentials, tokens, keys, or secrets
- sensitive files or data exposure
- insecure misconfiguration
- vulnerable or outdated service/version with clear security relevance
- interesting target information that directly supports further exploitation or enumeration

Do NOT create findings for:
- normal Linux OS information
- standard shell output
- expected root processes inside containers
- normal package/version output without security impact
- generic environment details
- basic navigation output such as pwd, ls, whoami, cat /etc/os-release
- ordinary process listings unless they clearly reveal a security issue
- harmless container behavior

Important:
- Seeing "root" inside a container is NOT by itself a finding.
- Seeing multiple bash processes in a container is NOT by itself a finding.
- OS identification alone is usually useful context, but NOT a finding unless it clearly indicates a security-relevant issue.
- Prefer false negatives over false positives.
- Only mark "finding_detected": true when there is strong evidence.

Return ONLY valid JSON in this exact format:

{{
  "assessment": "useful | neutral | risky | incorrect",
  "phase": "reconnaissance | enumeration | exploitation | post-exploitation | general-navigation",
  "explanation": "brief explanation",
  "security_relevance": "why it matters",
  "next_step": "recommended next command or action",
  "warning": "",
  "finding_detected": true,
  "finding_confidence": "low | medium | high",
  "finding": {{
    "title": "short finding title",
    "severity": "Low | Medium | High",
    "description": "finding description",
    "evidence": "exact evidence from output"
  }}
}}

If no meaningful finding is present, return:
- "finding_detected": false
- "finding_confidence": "low"
- "finding": null

Set confidence rules:
- high = direct, strong evidence of a real security issue
- medium = likely meaningful security lead, but not confirmed
- low = weak, ambiguous, or contextual information only

Rules:
- Do not include markdown
- Do not include code fences
- Do not include any text before or after the JSON
- Return one JSON object only
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


def _default_response(warning: str = "") -> dict:
    return {
        "assessment": "neutral",
        "phase": "general-navigation",
        "explanation": "AI response could not be parsed.",
        "security_relevance": "No structured feedback available.",
        "next_step": "",
        "warning": warning[:500] if warning else "",
        "finding_detected": False,
        "finding_confidence": "low",
        "finding": None,
    }


def _normalize_response(data: dict) -> dict:
    normalized = _default_response()

    normalized["assessment"] = data.get("assessment", normalized["assessment"])
    normalized["phase"] = data.get("phase", normalized["phase"])
    normalized["explanation"] = data.get("explanation", normalized["explanation"])
    normalized["security_relevance"] = data.get(
        "security_relevance", normalized["security_relevance"]
    )
    normalized["next_step"] = data.get("next_step", normalized["next_step"])
    normalized["warning"] = data.get("warning", normalized["warning"])
    normalized["finding_detected"] = bool(
        data.get("finding_detected", normalized["finding_detected"])
    )
    normalized["finding_confidence"] = data.get(
        "finding_confidence", normalized["finding_confidence"]
    )

    finding = data.get("finding")
    if isinstance(finding, dict):
        normalized["finding"] = {
            "title": finding.get("title", ""),
            "severity": finding.get("severity", "Low"),
            "description": finding.get("description", ""),
            "evidence": finding.get("evidence", ""),
        }
    else:
        normalized["finding"] = None

    if not normalized["finding"]:
        normalized["finding_detected"] = False
        normalized["finding_confidence"] = "low"

    return normalized


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
        parsed = json.loads(cleaned)
        return _normalize_response(parsed)
    except json.JSONDecodeError:
        return _default_response(raw)