# HTTP Service Mapping Lab Instructor Guide

## Lab Intent
This lab teaches disciplined service validation rather than fast tool execution. Students should learn to move from:

1. network reachability
2. service enumeration
3. protocol inspection
4. content inspection
5. browser confirmation

The target is intentionally uncomplicated so the teaching focus stays on method and evidence quality.

## Pre-Lab Framing
- Emphasize that the goal is not just to identify Nginx quickly, but to build confidence one evidence layer at a time.
- Encourage learners to explain what each stage proves before they move on to the next one.

## Expected Student Path

### Step 1. Verify connectivity

- Expected command family: `ping`
- Expected evidence: successful replies and `0% packet loss`
- Common mistake: students guessing an IP or assuming the host alias will not resolve
- Observation focus: learners should notice that hostname resolution and packet-loss results establish a trustworthy baseline path

### Step 2. Identify the exposed web service

- Expected command family: `nmap -sV`
- Expected evidence: `80/tcp open` and `nginx`
- Common mistake: students omitting version detection and capturing weaker evidence
- Observation focus: learners should connect the open port and banner to a specific web service worth deeper inspection

### Step 3. Inspect HTTP headers

- Expected command family: `curl -I`
- Expected evidence: `HTTP/1.1 200 OK` and `Server: nginx`
- Common mistake: students fetching the full body immediately and skipping the response-metadata habit
- Observation focus: learners should explain why the header evidence is useful before loading the body

### Step 4. Fingerprint the landing page

- Expected command family: `curl`
- Expected evidence: `Welcome to nginx!` and HTML content
- Common mistake: students reusing the header-only curl form and wondering why the body evidence is missing
- Observation focus: learners should describe how the page body strengthens what the headers already suggested

### Step 5. Browser confirmation

- Expected action: open the forwarded browser URL and confirm the welcome page
- Common mistake: students guessing the host port instead of using the launcher-provided URL
- Observation focus: learners should connect the visible browser result to the earlier terminal evidence

## Tutor Alignment
This lab is useful for validating that the tutor can:

- reinforce why reachability comes before application analysis
- redirect students when they skip straight from scanning to browsing
- distinguish two curl-based steps with different evidence goals
- keep browser-only guidance honest after terminal work is complete

## Assessment Suggestions
Look for reports or findings that mention:

- the listening port
- the Nginx banner
- the successful HTTP response
- the observed landing page

Students who only say "port 80 was open" have not completed the full learning loop of the lab.

## End-of-Lab Debrief Prompts
- What did the header inspection reveal that the scan alone did not?
- What did the page body add to the service-identification story?
- Why was browser confirmation still valuable after the terminal work looked complete?
