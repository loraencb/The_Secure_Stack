# Instructor Guide: Juice Shop Recon Lab

## Lab Intent
This lab teaches the learner to move from basic reachability to service enumeration, then to HTTP validation, and finally to browser confirmation. The teaching emphasis is not just on running commands, but on noticing what each stage proves about the target.

## Pre-Lab Framing
- Remind learners that OWASP Juice Shop is intentionally vulnerable and that this lab is about disciplined reconnaissance, not exploitation.
- Emphasize the sequence: prove the path works, map the exposed service, validate the HTTP response, then confirm the browser-facing application.

## Intended Completion Evidence
### Step 1: Verify Connectivity
Expected command:
```bash
ping -c 3 target
```

Acceptable evidence:
- ICMP replies from `target`
- `0% packet loss`

Observation focus:
- Learner notices that hostname resolution and ICMP replies establish a clean baseline path.

### Step 2: Identify the Exposed Web Service
Expected command:
```bash
nmap -sV target
```

Acceptable evidence:
- `3000/tcp open`
- service fingerprint output showing an HTTP response on port 3000

Observation focus:
- Learner connects the open port to a probable web service worth deeper inspection.

### Step 3: Inspect the HTTP Response
Expected command:
```bash
curl -i http://target:3000
```

Acceptable evidence:
- HTTP response body or headers
- `OWASP Juice Shop` appears in the response output

Observation focus:
- Learner explains why the HTTP response is stronger evidence than the port scan alone.

### Step 4: Open the Application
Expected action:
- Open the runtime browser URL returned by the launcher

Acceptable evidence:
- Learner manually confirms the Juice Shop UI loaded

Observation focus:
- Learner links the visible browser behavior back to the earlier terminal evidence.

## What Counts as Completion
- The learner demonstrates connectivity.
- The learner identifies the exposed web service on port 3000.
- The learner confirms the exposed service is Juice Shop.
- The learner captures evidence that can support a simple recon finding and can explain why each step mattered.

## Coaching Notes
- If the learner scans too early and the service is not ready yet, prompt them to rerun `nmap -sV target` after a short wait.
- If the learner jumps to the browser before confirming the service, guide them back to collecting recon evidence first.
- If the learner reaches the app but does not document it, prompt them to capture the `curl -i` response as evidence.
- If the learner completes a step but cannot explain what it proved, ask them what signal in the output changed their understanding of the target.

## End-of-Lab Debrief Prompts
- What did the scan reveal that basic connectivity did not?
- What did the HTTP response prove about the application?
- Why was browser confirmation still valuable after the terminal work?
