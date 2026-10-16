from fastapi import FastAPI

api = FastAPI()


@api.get("/")
def index():
    return {"status": "fastapi-ok"}


@api.get("/acceptance")
def acceptance():
    return {"fixture": "python-fastapi", "ok": True}
