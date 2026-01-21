# The_Secure_Stack
```mermaid
flowchart TB

  %% Users and Frontend
  U[User]
  FE[Frontend Web App]

  %% Backend
  BE[Backend API]

  %% Data
  DB[(Database)]
  FS[(File Storage)]

  %% Orchestration
  ORCH[Lab Orchestrator]
  DE[(Docker Engine)]
  NET[Sandbox Network]

  %% AI
  AI[AI Coach]
  AIP[AI Provider]

  %% Reports
  REP[Report Generator]

  %% Labs
  subgraph LABS[Practice Labs]
    L1[DVWA]
    L2[JuiceShop]
    L3[WebGoat]
  end

  %% Connections
  U --> FE
  FE --> BE

  BE --> DB
  BE --> FS

  BE --> ORCH
  ORCH --> DE
  ORCH --> NET
  DE --> LABS

  BE --> AI
  AI --> AIP

  BE --> REP
  REP --> FS
```
### Explanation
The user interacts with a React frontend, which talks to a FastAPI backend.
The backend manages authentication, sessions, and logs, controls Docker-based labs through an orchestrator, stores data in the database, and sends tool output to the AI coach.
The AI returns explanations and guidance, and everything is compiled into a final report.

