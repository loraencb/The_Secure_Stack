from fastapi import FastAPI
from app.database import Base, engine
from app.routers import labs, sessions, findings, reports

app = FastAPI()

# Create DB tables
Base.metadata.create_all(bind=engine)

# Routers
app.include_router(labs.router)
app.include_router(sessions.router)
app.include_router(findings.router)
app.include_router(reports.router)

@app.get("/")
def root():
    return {"message": "Secure Stack API running"}


@app.get("/health")
def health():
    return {"status": "ok"}