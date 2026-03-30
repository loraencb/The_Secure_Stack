# The Secure Stack

![Python](https://img.shields.io/badge/backend-FastAPI-green)
![React](https://img.shields.io/badge/frontend-React-blue)
![Docker](https://img.shields.io/badge/environment-Docker-blue)
![AI](https://img.shields.io/badge/AI-Ollama%20LLM-purple)
![Status](https://img.shields.io/badge/status-Demo%20Ready-success)

> An **AI-assisted cybersecurity training platform** that provides real-time guidance, automated findings detection, and structured penetration testing labs.

---

## Overview

**The Secure Stack** is an interactive cybersecurity training environment that combines:

- Hands-on penetration testing labs
- Real Linux terminal access (Docker-based)
- AI-powered analysis and guidance
- Automated reporting and findings tracking
- Guided lab progression (step-by-step learning)

The platform simulates real-world pentesting workflows while helping users learn as they go.

---

## Key Features

### Lab Environment
- Launch isolated lab environments per session
- Includes:
  - Attacker machine (Linux container)
  - Target machine (vulnerable application)
  - Private network between containers
- Example lab: **OWASP Juice Shop Recon Lab**

---

### Live Terminal
- Fully interactive Linux shell inside attacker container
- Executes real commands (`nmap`, `curl`, etc.)
- WebSocket-powered real-time streaming

---

### AI Assistant (Ollama)
- Analyzes every command + output
- Classifies actions into:
  - reconnaissance
  - enumeration
  - exploitation
  - post-exploitation
- Provides:
  - explanations
  - security relevance
  - next steps

---

### Automatic Findings Detection
- AI detects security-relevant results from terminal output
- Automatically suggests findings:
  - open ports
  - exposed services
  - vulnerable endpoints
- One-click accept → saved to report

---

### Guided Lab Progression
- Step-by-step lab instructions
- Tracks user progress automatically
- Unlocks next step when correct command is executed
- Visual status:
  - Completed
  - Current
  - Pending

---

### Reporting System
- Automatically builds a report during the session
- Includes:
  - findings
  - severity levels
  - AI-generated summary
  - recommendations

---

## Architecture
```text
Frontend (React)
↓
WebSocket + REST API
↓
Backend (FastAPI)
├── Terminal Manager (Docker exec)
├── Lab Service (Docker containers + networks)
├── AI Service (Ollama)
├── Findings + Reports API
↓
Docker Engine
├── Attacker Container
├── Target Container
└── Lab Network
```
---

## Tech Stack

### Backend
- FastAPI
- Python
- Docker SDK
- WebSockets (real-time terminal)
- Ollama (LLM inference)

### Frontend
- React
- xterm.js (terminal UI)
- Fetch API

### Infrastructure
- Docker (containerized labs)
- Localhost networking

---

## Installation & Setup

### 1. Clone the repository

git clone https://github.com/loraencb/The_Secure_Stack.git
cd The_Secure_Stack

---

### 2. Start Docker

Ensure Docker Desktop is running:

docker ps

---

### 3. Run Ollama (AI)

ollama run llama3

---

### 4. Backend Setup

cd backend

pip install -r requirements.txt

uvicorn app.main:app --reload

Backend runs at:
http://127.0.0.1:8000

---

### 5. Frontend Setup

cd frontend

npm install
npm run dev

Frontend runs at:
http://localhost:5173

---

## How to Use

### 1. Start a Session
Click **Start Session**

---

### 2. Launch Lab
Click **Launch Juice Shop Lab**

---

### 3. Follow Guided Steps

ping -c 3 target
nmap -sV target
curl http://target:3000

---

### 4. Observe AI Feedback
- Real-time explanations
- Suggested next actions

---

### 5. Capture Findings
- Auto-detected OR manual
- Stored instantly

---

### 6. Generate Report
Click **Generate Report**

---

## Example Lab: Juice Shop Recon

- Target: OWASP Juice Shop
- Vulnerabilities:
  - exposed web app
  - discoverable via scanning
- Learning objectives:
  - network recon
  - service enumeration
  - web discovery

---

## Known Limitations

- Terminal runs without full TTY (minor bash warnings)
- Labs are local (not cloud-deployed)
- Limited lab variety (expandable)
- No authentication system (demo-focused)

---

## Future Improvements

- More labs (Metasploitable, DVWA, etc.)
- Smarter AI (context-aware sessions)
- Remote lab hosting
- Multi-user support
- Advanced reporting dashboards
- Terminal output highlighting

---

## Contributors

- Braulio Lora Encarnacion
- Team Secure Stack

---

## License

This project is for **educational and research purposes only**.

---

## Final Note

The Secure Stack is more than a tool — it is a **learning platform** that bridges:

> Hands-on cybersecurity practice + AI-driven guidance
