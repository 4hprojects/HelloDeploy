from flask import Flask, jsonify

app = Flask(__name__)


@app.get("/")
def index():
    return "flask-ok"


@app.get("/acceptance")
def acceptance():
    return jsonify(fixture="python-flask", ok=True)
