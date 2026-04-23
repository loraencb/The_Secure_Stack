# Juice Shop Recon Lab

## Overview
This lab introduces disciplined reconnaissance against an exposed OWASP Juice Shop instance from an isolated attacker container.

## Learning Objectives
- Verify that the attacker can resolve and reach the target before deeper recon begins.
- Identify the exposed application port and gather evidence that it behaves like a web service.
- Confirm through direct HTTP inspection that the reachable service is OWASP Juice Shop.
- Connect terminal-side recon evidence to the visible browser experience of the application.

## Why This Lab Matters
OWASP Juice Shop is an intentionally vulnerable training application that behaves like a modern web app. In a real assessment, disciplined recon matters because you do not want to confuse network issues with service behavior or jump into the browser before you understand what is exposed. This lab teaches a clean sequence: verify the path, identify the service, inspect the response, then confirm the application visually.

## Environment Overview
- You work from an attacker shell with `ping`, `nmap`, and `curl`.
- The target hosts Juice Shop on TCP `3000` inside the isolated lab network.
- Secure Stack also provides a forwarded browser URL so you can compare terminal observations with what the application looks like in a browser.

## Prerequisites
- Basic Linux command-line familiarity
- Basic understanding of ports, services, and HTTP
- Use of this lab only in the provided authorized training environment

## Required Tools
- `ping`
- `nmap`
- `curl`

## Workflow
### Step 1: Verify Connectivity
Objective: Confirm the attacker can reach the target host.

Suggested command:
```bash
ping -c 3 target
```

What to observe:
- The `target` hostname resolves from the attacker shell.
- ICMP replies return successfully.
- Packet loss remains at `0%`.

Why it matters:
- These signals prove the attacker has a working network path, so later scan or HTTP issues can be interpreted as service behavior instead of broken connectivity.

### Step 2: Identify the Exposed Web Service
Objective: Discover exposed services on the target.

Suggested command:
```bash
nmap -sV target
```

What to observe:
- Port `3000/tcp` is open.
- The output suggests an HTTP or web application service.
- The fingerprinting data is strong enough to justify moving into HTTP inspection.

Why it matters:
- This step maps the attack surface and tells you which exposed service deserves deeper application-level investigation.

### Step 3: Inspect the HTTP Response
Objective: Validate that the exposed service is Juice Shop by inspecting a real HTTP response.

Suggested command:
```bash
curl -i http://target:3000
```

What to observe:
- The response succeeds.
- The output includes `OWASP Juice Shop`.
- The service returns real application-layer content, not just an open port.

Why it matters:
- This is stronger evidence than the scan alone because it proves what the service actually returns to a client.

### Step 4: Open the Application
Objective: Confirm the application is reachable in a browser.

Action:
- Use the browser URL shown by Secure Stack after lab launch.

What to observe:
- The Juice Shop interface loads successfully.
- The visible page matches what the earlier HTTP response suggested.
- The forwarded browser URL reaches the same service you investigated from the terminal.

Why it matters:
- This connects your terminal-side recon to the real browser-facing behavior of the application.

## Lab Takeaways
- Connectivity checks give later recon a trustworthy baseline.
- Service discovery reveals where the real application surface lives.
- HTTP inspection gives stronger evidence than a port number alone.
- Browser confirmation closes the loop between terminal evidence and visible application behavior.

## Reflection Questions
1. Which observation gave you the strongest confidence that the service on port `3000` was a real web application?
2. Why was it useful to verify connectivity before running the scan?
3. What did the direct HTTP response prove that the `nmap` result alone could not?
4. Why was browser interaction still useful after you already had command-line evidence?
