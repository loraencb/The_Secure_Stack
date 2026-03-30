# Secure Stack

A web-based cybersecurity training platform designed for classroom use, combining hands-on penetration testing labs with structured instruction and real-time AI-assisted guidance.

---

## Overview

Secure Stack is an instructional cyber training environment that integrates:

- Containerized vulnerable lab environments
- Structured lab manuals and guided exercises
- Real-time terminal-aware AI coaching
- Session tracking and assessment tools

The system is designed to support cybersecurity education by allowing students to learn through direct interaction with realistic environments while receiving continuous feedback on their actions.

---

## Core Concept

Each lab in Secure Stack is a complete instructional module composed of:

1. Lab Environment  
   A containerized vulnerable system deployed per session.

2. Lab Manual  
   A structured guide including objectives, tasks, and reflection questions.

3. Real-Time Coaching Engine  
   An AI-driven system that observes terminal activity and provides contextual feedback.

4. Assessment Layer  
   Tracks progress, task completion, and student submissions.

This combination transforms the platform from a simple lab launcher into a classroom-ready training system.

---

## Key Features

### Interactive Lab Environments
- Launch and manage isolated lab environments using Docker
- Per-session container orchestration
- Reset and stop functionality
- Initial labs include:
  - OWASP Juice Shop
  - DVWA

---

### Structured Lab Manuals
Each lab includes:
- Learning objectives
- Prerequisites
- Step-by-step tasks
- Reflection questions
- Submission requirements
- Ethical use guidelines

Manuals are stored in Markdown and version-controlled.

---

### Real-Time AI Coaching

The platform includes a terminal-aware AI system that:

- Monitors commands and output in real time
- Identifies the current phase of the exercise
- Detects incorrect or inefficient actions
- Provides:
  - Explanations of tool output
  - Guidance on next steps
  - Warnings when off-track
  - Reinforcement of correct methodology

The AI operates as an active observer, not a passive chatbot.

---

### Session Tracking

- Tracks commands executed during a session
- Stores tool outputs and notes
- Maintains session state and progress
- Enables replay and review of activity

---

### Assessment and Submissions

- Task-based lab structure
- Student submissions per task
- Evidence collection
- Progress tracking
- Instructor review capability

---

## System Architecture

### Frontend
- React or Next.js
- Displays lab manuals, terminal interface, and AI feedback
- Real-time updates via WebSockets

### Backend
- FastAPI
- Handles:
  - Authentication
  - Session lifecycle
  - Lab orchestration
  - Command logging
  - AI integration

### Database
- PostgreSQL
- Stores:
  - Users
  - Labs
  - Sessions
  - Commands
  - Submissions
  - AI observations

### Lab Infrastructure
- Docker / Docker Compose
- Isolated environments per session
- Dynamic container lifecycle management

### AI Layer
- LLM-based coaching engine
- Context-aware feedback using:
  - Recent commands
  - Tool outputs
  - Lab objectives
  - Session state

---

## Project Structure
```text
secure-stack/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── models/
│   │   ├── services/
│   │   └── main.py
│   ├── tests/
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   └── package.json
│
├── labs/
│   ├── juice-shop/
│   │   ├── docker-compose.yml
│   │   ├── metadata.json
│   │   ├── student_manual.md
│   │   └── instructor_guide.md
│   └── dvwa/
│
├── docs/
└── README.md
```
---

## Lab Module Design

Each lab is self-contained and includes:

- Docker environment configuration
- Metadata definition
- Student manual (Markdown)
- Instructor guide
- Task and checkpoint definitions

Example:

labs/juice-shop/
├── docker-compose.yml
├── metadata.json
├── student_manual.md
├── instructor_guide.md
└── rubric.json

---

## Session Workflow

1. User logs in
2. User selects a lab
3. Backend creates a session
4. Lab environment is launched via Docker
5. User interacts with the target
6. Terminal activity is captured
7. AI coaching engine provides real-time feedback
8. User completes tasks and submits responses
9. Session is closed and summarized

---

## AI Coaching Workflow

1. Terminal events are captured (commands, output)
2. Events are processed and classified
3. Session state is updated
4. Relevant context is built
5. AI generates feedback when appropriate
6. Feedback is displayed in real time

---

## Security Considerations

- All labs run in isolated Docker networks
- No direct user access to host system
- Backend mediates all container operations
- Session-based resource control
- Controlled lab images only

---

## MVP Scope

The initial version includes:

- User authentication
- Lab selection interface
- One fully functional lab (Juice Shop)
- Lab manual integration
- Session-based container launch
- Command and activity logging
- Real-time AI coaching (basic)
- Session summary generation

---

## Future Enhancements

- Additional lab modules
- Advanced checkpoint detection
- Instructor dashboard
- Automated grading
- Vector database for retrieval-based coaching
- Multi-user classroom management
- VM-based environments
- Terminal emulation (xterm.js)

---

## Educational Use Case

Secure Stack is designed to support:

- Undergraduate cybersecurity courses
- Hands-on lab sessions
- Guided penetration testing exercises
- Independent student practice
- Instructor-led demonstrations

The platform enables scalable instruction by augmenting human teaching with real-time AI feedback.

---

## License

This project is intended for educational and research purposes.

All lab environments must be used in controlled settings and in accordance with ethical cybersecurity practices.

---

## Status

In active development.

Initial focus:
- Core lab orchestration
- Lab manual integration
- Real-time AI coaching engine
