import json
import re

import requests

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
MODEL_NAME = "llama3"
LOW_SIGNAL_PREFIXES = ("ping", "pwd", "ls")


def build_terminal_prompt(command: str, output: str) -> str:
    return f"""
You are an expert cybersecurity training assistant.

Analyze this pentesting lab command and its complete output.

Command:
{command}

Output:
{output}

Requirements:
1. Classify the phase as one of:
   - reconnaissance
   - enumeration
   - exploitation
   - post-exploitation
   - general-navigation
2. Assess the command as:
   - useful
   - neutral
   - risky
   - incorrect
3. Explain what the output means.
4. Explain the security relevance.
5. Suggest the next best step.
6. Only create a finding when the output contains strong, report-worthy evidence.

Important guardrails:
- Do not create findings for ping, pwd, ls, or other low-signal navigation commands.
- Prioritize meaningful recon from nmap and curl.
- Prefer false negatives over false positives.
- If the output is unclear, incomplete, or weak, return guidance without a finding.

Return ONLY valid JSON in this exact format:
{{
  "assessment": "useful | neutral | risky | incorrect",
  "phase": "reconnaissance | enumeration | exploitation | post-exploitation | general-navigation",
  "explanation": "brief explanation",
  "security_relevance": "why it matters",
  "next_step": "recommended next command or action",
  "warning": "",
  "finding_detected": false,
  "finding_confidence": "low | medium | high",
  "finding": null
}}
""".strip()


def _extract_json(text: str) -> str:
    text = text.strip()

    if text.startswith("```"):
        text = text.replace("```json", "").replace("```", "").strip()

    start = text.find("{")
    end = text.rfind("}")

    if start != -1 and end != -1 and end > start:
        return text[start : end + 1]

    if start != -1 and end == -1:
        repaired = text[start:]
        repaired += "}" * (repaired.count("{") - repaired.count("}"))
        return repaired

    return text


def _default_response(warning: str = "") -> dict:
    return {
        "assessment": "neutral",
        "phase": "general-navigation",
        "explanation": "The command completed, but the analysis was unclear.",
        "security_relevance": "No strong security conclusion could be drawn from this output alone.",
        "next_step": "Continue with the guided recon steps and review the output manually.",
        "warning": warning[:500] if warning else "",
        "finding_detected": False,
        "finding_confidence": "low",
        "finding": None,
    }


def _is_low_signal_command(command: str) -> bool:
    command_lower = (command or "").strip().lower()
    return command_lower.startswith(LOW_SIGNAL_PREFIXES)


def _is_unclear_output(output: str) -> bool:
    cleaned = (output or "").strip()
    if not cleaned:
        return True

    if len(cleaned) < 40 and "open" not in cleaned.lower() and "http/" not in cleaned.lower():
        return True

    return False


def _recon_finding(command: str, output: str):
    command_lower = (command or "").strip().lower()
    output_text = (output or "").strip()
    output_lower = output_text.lower()

    if command_lower.startswith("nmap"):
        open_services = re.findall(
            r"(?m)^(\d+)/(tcp|udp)\s+open\s+([^\s]+)(?:\s+(.*))?$",
            output_text,
        )
        if open_services:
            service_summary = ", ".join(
                f"{port}/{proto} {service}".strip()
                for port, proto, service, _version in open_services
            )
            return {
                "assessment": "useful",
                "phase": "enumeration",
                "explanation": "The nmap scan identified exposed network services on the target.",
                "security_relevance": "Open ports and exposed services define the reachable attack surface for the application.",
                "next_step": "Inspect the exposed web service with curl http://target:3000.",
                "warning": "",
                "finding_detected": True,
                "finding_confidence": "high",
                "finding": {
                    "title": "Exposed Network Services Detected",
                    "severity": "Medium",
                    "description": f"The target exposes the following reachable services: {service_summary}.",
                    "evidence": output_text[:1200],
                },
            }

        return {
            "assessment": "useful",
            "phase": "enumeration",
            "explanation": "The nmap scan completed, but it did not reveal a confirmed exposed service in the captured output.",
            "security_relevance": "Service enumeration is still valuable recon even when it does not immediately produce a finding.",
            "next_step": "Continue to application-layer validation with curl http://target:3000.",
            "warning": "",
            "finding_detected": False,
            "finding_confidence": "low",
            "finding": None,
        }

    if command_lower.startswith("curl"):
        if "owasp juice shop" in output_lower or ("http/1.1 200 ok" in output_lower and "<html" in output_lower):
            return {
                "assessment": "useful",
                "phase": "enumeration",
                "explanation": "The curl response confirms that the target is serving the Juice Shop web application.",
                "security_relevance": "A reachable web application is a meaningful exposed attack surface and should be included in the recon narrative.",
                "next_step": "Open the browser URL and continue investigating the exposed web application.",
                "warning": "",
                "finding_detected": True,
                "finding_confidence": "high",
                "finding": {
                    "title": "Exposed Juice Shop Web Application",
                    "severity": "Medium",
                    "description": "The target returned Juice Shop application content, confirming that the web application is reachable.",
                    "evidence": output_text[:1200],
                },
            }

        return {
            "assessment": "useful",
            "phase": "enumeration",
            "explanation": "The HTTP request completed, but the captured response did not provide strong enough evidence for a reportable finding.",
            "security_relevance": "HTTP validation still helps confirm whether the service is reachable and what should be inspected next.",
            "next_step": "Review the response and open the browser URL for manual inspection.",
            "warning": "",
            "finding_detected": False,
            "finding_confidence": "low",
            "finding": None,
        }

    return None


def _low_signal_response(command: str, warning: str = "") -> dict:
    response = _default_response(warning)
    response.update(
        {
            "assessment": "neutral",
            "phase": "reconnaissance",
            "explanation": f"`{command}` is low-signal setup or navigation output and should not create a report finding on its own.",
            "security_relevance": "It can help orient the user, but it does not provide strong evidence of a security issue by itself.",
            "next_step": "Continue with higher-signal recon such as nmap -sV target or curl http://target:3000.",
        }
    )
    return response


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
    normalized["finding_detected"] = bool(data.get("finding_detected", False))
    normalized["finding_confidence"] = data.get("finding_confidence", "low")

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

    return normalized


def _filter_response(command: str, output: str, response: dict) -> dict:
    if _is_low_signal_command(command):
        return _low_signal_response(command, response.get("warning", ""))

    recon_override = _recon_finding(command, output)
    if recon_override:
        return recon_override

    if _is_unclear_output(output):
        fallback = _default_response(response.get("warning", ""))
        fallback.update(
            {
                "assessment": response.get("assessment", fallback["assessment"]),
                "phase": response.get("phase", fallback["phase"]),
                "explanation": "The output was too limited or unclear to support a reliable finding.",
                "security_relevance": "No strong security conclusion should be drawn from incomplete output.",
                "next_step": response.get("next_step") or fallback["next_step"],
            }
        )
        return fallback

    response["finding_detected"] = False
    response["finding_confidence"] = "low"
    response["finding"] = None
    return response


def analyze_terminal_interaction(command: str, output: str) -> dict:
    if _is_low_signal_command(command):
        return _low_signal_response(command)

    if _is_unclear_output(output):
        recon_override = _recon_finding(command, output)
        if recon_override:
            return recon_override
        return _default_response()

    prompt = build_terminal_prompt(command, output)

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
        raw = response.json().get("response", "{}")
        cleaned = _extract_json(raw)

        try:
            parsed = json.loads(cleaned)
            normalized = _normalize_response(parsed)
            return _filter_response(command, output, normalized)
        except json.JSONDecodeError:
            recon_override = _recon_finding(command, output)
            return recon_override or _default_response(raw)

    except requests.RequestException as exc:
        recon_override = _recon_finding(command, output)
        return recon_override or _default_response(str(exc))
