# Instructor Guide: Juice Shop Recon Lab

## Lab Intent
This lab teaches the learner to move from basic reachability to service enumeration and then to application validation.

## Intended Completion Evidence
### Step 1: Verify Connectivity
Expected command:
```bash
ping -c 3 target
```

Acceptable evidence:
- ICMP replies from `target`
- `0% packet loss`

### Step 2: Identify Open Services
Expected command:
```bash
nmap -sV target
```

Acceptable evidence:
- `3000/tcp open`
- service fingerprint output showing an HTTP response on port 3000

### Step 3: Inspect the Web Application
Expected command:
```bash
curl http://target:3000
```

Acceptable evidence:
- HTTP response body or headers
- `OWASP Juice Shop` appears in the response output

### Step 4: Open the Application
Expected action:
- Open the runtime browser URL returned by the launcher

Acceptable evidence:
- Learner manually confirms the Juice Shop UI loaded

## What Counts as Completion
- The learner demonstrates connectivity.
- The learner identifies the exposed web service on port 3000.
- The learner confirms the exposed service is Juice Shop.
- The learner captures evidence that can support a simple recon finding.

## Coaching Notes
- If the learner scans too early and the service is not ready yet, prompt them to rerun `nmap -sV target` after a short wait.
- If the learner jumps to the browser before confirming the service, guide them back to collecting recon evidence first.
- If the learner reaches the app but does not document it, prompt them to capture the `curl` response as evidence.
