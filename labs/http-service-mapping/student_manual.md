# HTTP Service Mapping Lab

## Overview
This lab teaches disciplined mapping of an exposed Nginx web service from an isolated attacker shell.

## Learning Objectives
- Confirm that the attacker can reach the target before deeper analysis begins.
- Identify the exposed web service and the port that deserves attention.
- Use headers and page content as different layers of HTTP evidence.
- Connect terminal-side recon to the visible browser-facing result.

## Why This Lab Matters
This lab is intentionally simple so the teaching focus stays on analyst habits instead of tool overload. Instead of jumping straight into a browser, you move from reachability to service discovery, then to HTTP metadata, then to content, and finally to browser confirmation. Each stage should reduce uncertainty about what the target is and what evidence you can trust.

## Environment Overview
- You work from an attacker shell with `ping`, `nmap`, and `curl`.
- The target is an Nginx web service on TCP `80` inside the isolated lab network.
- Secure Stack also provides a forwarded browser URL so you can compare terminal observations with the visible landing page.

## Topology
- `attacker`: the shell you control
- `target`: an Nginx web service exposed on TCP 80

## Workflow
### Step 1: Verify connectivity
Objective: Confirm that the attacker can resolve and reach the target host.

Suggested command:
```bash
ping -c 3 target
```

What to observe:
- The `target` hostname resolves cleanly.
- ICMP replies return successfully.
- The summary shows `0% packet loss`.

Why it matters:
- These signals prove the basic lab path is working, so later failures can be interpreted as service behavior instead of broken connectivity.

### Step 2: Identify the exposed web service
Objective: Enumerate the target so you can identify the listening service and its banner.

Suggested command:
```bash
nmap -sV target
```

What to observe:
- TCP `80/tcp` is open.
- The service is identified as HTTP or Nginx.
- The output gives enough detail to justify moving into HTTP inspection.

Why it matters:
- This turns a reachable host into a mapped service and tells you where the lab should focus next.

### Step 3: Inspect HTTP headers
Objective: Confirm the service identity by inspecting response metadata.

Suggested command:
```bash
curl -I http://target
```

What to observe:
- The HTTP status line.
- The `Server: nginx` header.
- Any other response metadata that shows the service is behaving like a normal web server.

Why it matters:
- Headers give lightweight identity evidence before you pull the full page body.

### Step 4: Fingerprint the landing page
Objective: Capture page-body evidence that the exposed service is the default Nginx site.

Suggested command:
```bash
curl http://target
```

What to observe:
- The default Nginx welcome text.
- HTML content confirming a real landing page is being returned.
- How the body evidence supports what the headers already suggested.

Why it matters:
- The body gives content-level proof of what a real client receives, which is stronger than a banner alone.

### Step 5: Open the service in a browser
Objective: Confirm the same service loads through the forwarded browser URL.

Action:
- Use the browser URL shown by Secure Stack after lab launch.

What to observe:
- The page loads successfully in the browser.
- The visible content matches the Nginx welcome page seen from `curl`.
- The forwarded browser URL reaches the same service you mapped from the terminal.

Why it matters:
- This connects your recon evidence to the visible user-facing result and completes the service-validation narrative.

## Lab Takeaways
- Reachability checks establish a trustworthy baseline before service analysis.
- Enumeration and banners reveal where the real application surface lives.
- Headers and page content provide different, complementary layers of evidence.
- Browser confirmation closes the loop between terminal recon and visible behavior.

## Reflection Questions
1. Which observation most strongly confirmed that the target was Nginx before you opened the browser?
2. Why was the header-only check useful before fetching the full page body?
3. What did the page body prove that the banner or headers alone could not?
4. What did the browser step add to your understanding of the service?
