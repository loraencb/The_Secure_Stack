from fastapi import FastAPI
from app.labs import start_lab, stop_lab
from .database import Base, engine, test_db_connection

app = FastAPI(title="The Secure Stack API")

@app.on_event("startup")
def on_startup():
    # create tables (simple dev approach; later you can migrate to Alembic)
    Base.metadata.create_all(bind=engine)

    # verify DB connection works
    test_db_connection()
    print("Database connected and ready.")

@app.get("/")
def root():
    return {"message": "Secure Stack Backend Running"}

@app.post("/labs/start")
def start():
    start_lab()
    return {"status": "lab started"}

@app.post("/labs/stop")
def stop():
    stop_lab()
    return {"status": "lab stopped"}
