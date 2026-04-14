# Juice Shop Recon Lab

## Overview
This lab introduces basic reconnaissance against an exposed OWASP Juice Shop instance from an isolated attacker container.

## Learning Objectives
- Verify host reachability from the attacker container.
- Identify exposed ports and services with `nmap`.
- Confirm that the reachable service is the Juice Shop web application.
- Capture evidence that supports a basic recon finding.

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

Evidence to capture:
- The target responds to ICMP requests.
- Packet loss remains at `0%`.

### Step 2: Identify Open Services
Objective: Discover exposed services on the target.

Suggested command:
```bash
nmap -sV target
```

Evidence to capture:
- Port `3000/tcp` is open.
- The scan returns useful service fingerprinting output.

### Step 3: Inspect the Web Application
Objective: Validate that the exposed service is a web application.

Suggested command:
```bash
curl http://target:3000
```

Evidence to capture:
- HTTP response content is returned.
- The output identifies `OWASP Juice Shop`.

### Step 4: Open the Application
Objective: Confirm the application is reachable in a browser.

Action:
- Use the browser URL shown by Secure Stack after lab launch.

Evidence to capture:
- The Juice Shop UI loads successfully in the browser.

## Reflection Questions
1. Why is it useful to confirm connectivity before scanning ports?
2. What evidence from `nmap` makes port `3000` report-worthy?
3. What response details from `curl` help identify the web application?
4. How would this recon evidence support a simple findings report?
