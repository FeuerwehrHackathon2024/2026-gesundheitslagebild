from __future__ import annotations

import pathlib
import sys

VENDOR_DIR = pathlib.Path(__file__).resolve().parent / ".vendor"
if VENDOR_DIR.exists():
    sys.path.insert(0, str(VENDOR_DIR))

from flask import Flask, jsonify, render_template, request

from flask_app import SimController


app = Flask(__name__)
controller = SimController()


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/state")
def get_state():
    return jsonify(controller.snapshot())


@app.post("/api/control/toggle-pause")
def toggle_pause():
    return jsonify(controller.toggle_pause())


@app.post("/api/control/speed")
def set_speed():
    payload = request.get_json(silent=True) or {}
    return jsonify(controller.set_speed(payload.get("speed", 1)))


@app.post("/api/control/step")
def step():
    payload = request.get_json(silent=True) or {}
    return jsonify(controller.run_tick(payload.get("minutes", 1)))


@app.post("/api/control/reset")
def reset():
    return jsonify(controller.reset())


@app.post("/api/scenarios/<scenario_id>/launch")
def launch_scenario(scenario_id: str):
    try:
        return jsonify(controller.launch_scenario(scenario_id))
    except KeyError:
        return jsonify({"error": f"Unknown scenario: {scenario_id}"}), 404


@app.post("/api/hospitals/<hospital_id>/escalate")
def escalate_hospital(hospital_id: str):
    return jsonify(controller.escalate_hospital(hospital_id))


@app.post("/api/hospitals/<hospital_id>/toggle-exclusion")
def toggle_hospital_exclusion(hospital_id: str):
    return jsonify(controller.toggle_hospital_exclusion(hospital_id))


@app.post("/api/recommendations/<recommendation_id>/execute")
def execute_recommendation(recommendation_id: str):
    try:
        return jsonify(controller.execute_recommendation(recommendation_id))
    except KeyError:
        return jsonify({"error": f"Unknown recommendation: {recommendation_id}"}), 404


@app.post("/api/filters")
def set_filters():
    payload = request.get_json(silent=True) or {}
    return jsonify(controller.set_filters(payload))


@app.post("/api/filters/reset")
def reset_filters():
    return jsonify(controller.reset_filters())


@app.post("/api/filters/toggle-sk")
def toggle_sk():
    payload = request.get_json(silent=True) or {}
    return jsonify(controller.toggle_sk(payload.get("key", "")))


@app.post("/api/manv")
def create_manv():
    payload = request.get_json(silent=True) or {}
    return jsonify(controller.create_manv(payload))


@app.post("/api/vorplanung")
def create_vorplanung():
    payload = request.get_json(silent=True) or {}
    return jsonify(controller.create_vorplanung(payload))


@app.post("/api/settings/manv")
def set_manv_settings():
    payload = request.get_json(silent=True) or {}
    return jsonify(controller.set_manv_settings(payload))


if __name__ == "__main__":
    app.run(debug=True)
