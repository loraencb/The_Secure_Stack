from fastapi import FastAPI
from app.labs import start_lab, stop_lab

app = FastAPI()

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
