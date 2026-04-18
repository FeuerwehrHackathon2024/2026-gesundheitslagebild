from __future__ import annotations

import copy
import json
import math
import pathlib
import threading
from typing import Any


BASE_DIR = pathlib.Path(__file__).resolve().parent.parent
HOSPITALS_PATH = BASE_DIR / "lib" / "data" / "hospitals.json"

DISCIPLINE_LABELS = {
    "notaufnahme": "Notaufnahme",
    "chirurgie": "Chirurgie",
    "innere": "Innere Medizin",
    "its": "Intensivmedizin",
    "neurochir": "Neurochirurgie",
    "verbrennung": "Verbrennung",
    "paediatrie": "Paediatrie",
    "op": "OP-Saal",
}

VERSORGUNGSSTUFE_ORDER = ["grund", "regel", "schwerpunkt", "maximal"]
DISTANCE_CUTOFF_KM = {"T1": 150, "T2": 80, "T3": 40, "T4": 20}
BASE_QUOTA = {"T1": 3, "T2": 5, "T3": 8, "T4": 10}
CASCADE_STAGES = ["none", "A-distance", "B-quota", "C-load", "D-surge"]
ESCALATION_ORDER = ["normal", "erhoeht", "manv-1", "manv-2", "katastrophe"]
DEFAULT_FILTERS = {
    "freeMin": 0,
    "occupiedMax": 0,
    "emergencyMin": 0,
    "sk": {"T1": True, "T2": True, "T3": True},
}
DEFAULT_MANV_SETTINGS = {
    "transportThresholds": {"SK1": 10, "SK2": 15, "SK3": 30},
    "capacityMode": "available",
}
INITIAL_SEED = 20260417

PZC_CATALOG = [
    {
        "code": "PZC-POLY-T1",
        "label": "Polytrauma, kreislaufinstabil",
        "triage": "T1",
        "primaryDiscipline": "chirurgie",
        "requiredDisciplines": ["chirurgie", "its", "op"],
        "requiresOP": True,
        "requiresITS": True,
        "requiresBurnCenter": False,
        "minVersorgungsstufe": "schwerpunkt",
        "avgTreatmentMin": 720,
        "stabilizationMin": 20,
    },
    {
        "code": "PZC-SHT-T1",
        "label": "Schweres SHT, bewusstlos",
        "triage": "T1",
        "primaryDiscipline": "neurochir",
        "requiredDisciplines": ["neurochir", "its", "op"],
        "requiresOP": True,
        "requiresITS": True,
        "requiresBurnCenter": False,
        "minVersorgungsstufe": "schwerpunkt",
        "avgTreatmentMin": 900,
        "stabilizationMin": 15,
    },
    {
        "code": "PZC-THORAX-T1",
        "label": "Thoraxtrauma mit Atemnot",
        "triage": "T1",
        "primaryDiscipline": "chirurgie",
        "requiredDisciplines": ["chirurgie", "its", "op"],
        "requiresOP": True,
        "requiresITS": True,
        "requiresBurnCenter": False,
        "minVersorgungsstufe": "schwerpunkt",
        "avgTreatmentMin": 600,
        "stabilizationMin": 15,
    },
    {
        "code": "PZC-BURN-T1",
        "label": "Verbrennung >20 % KOF",
        "triage": "T1",
        "primaryDiscipline": "verbrennung",
        "requiredDisciplines": ["verbrennung", "its", "op"],
        "requiresOP": True,
        "requiresITS": True,
        "requiresBurnCenter": True,
        "minVersorgungsstufe": "maximal",
        "avgTreatmentMin": 1440,
        "stabilizationMin": 20,
    },
    {
        "code": "PZC-PENET-T1",
        "label": "Penetrierendes Trauma, instabil",
        "triage": "T1",
        "primaryDiscipline": "chirurgie",
        "requiredDisciplines": ["chirurgie", "its", "op"],
        "requiresOP": True,
        "requiresITS": True,
        "requiresBurnCenter": False,
        "minVersorgungsstufe": "schwerpunkt",
        "avgTreatmentMin": 540,
        "stabilizationMin": 10,
    },
    {
        "code": "PZC-ABDO-T2",
        "label": "Abdominaltrauma, stabil",
        "triage": "T2",
        "primaryDiscipline": "chirurgie",
        "requiredDisciplines": ["chirurgie", "op"],
        "requiresOP": True,
        "requiresITS": False,
        "requiresBurnCenter": False,
        "minVersorgungsstufe": "regel",
        "avgTreatmentMin": 360,
        "stabilizationMin": 20,
    },
    {
        "code": "PZC-EXT-T2",
        "label": "Offene Extremitaetenfraktur",
        "triage": "T2",
        "primaryDiscipline": "chirurgie",
        "requiredDisciplines": ["chirurgie", "op"],
        "requiresOP": True,
        "requiresITS": False,
        "requiresBurnCenter": False,
        "minVersorgungsstufe": "regel",
        "avgTreatmentMin": 240,
        "stabilizationMin": 25,
    },
    {
        "code": "PZC-BURN-T2",
        "label": "Verbrennung 10-20 % KOF",
        "triage": "T2",
        "primaryDiscipline": "verbrennung",
        "requiredDisciplines": ["verbrennung", "op"],
        "requiresOP": True,
        "requiresITS": False,
        "requiresBurnCenter": True,
        "minVersorgungsstufe": "schwerpunkt",
        "avgTreatmentMin": 720,
        "stabilizationMin": 25,
    },
    {
        "code": "PZC-INHAL-T2",
        "label": "Rauchgasintoxikation, symptomatisch",
        "triage": "T2",
        "primaryDiscipline": "innere",
        "requiredDisciplines": ["innere", "its"],
        "requiresOP": False,
        "requiresITS": True,
        "requiresBurnCenter": False,
        "minVersorgungsstufe": "regel",
        "avgTreatmentMin": 480,
        "stabilizationMin": 20,
    },
    {
        "code": "PZC-MINOR-T3",
        "label": "Prellung, Schuerfwunde, kleine Platzwunde",
        "triage": "T3",
        "primaryDiscipline": "notaufnahme",
        "requiredDisciplines": ["notaufnahme"],
        "requiresOP": False,
        "requiresITS": False,
        "requiresBurnCenter": False,
        "minVersorgungsstufe": "grund",
        "avgTreatmentMin": 90,
        "stabilizationMin": 30,
    },
    {
        "code": "PZC-PSYCH-T3",
        "label": "Akute psychische Reaktion",
        "triage": "T3",
        "primaryDiscipline": "notaufnahme",
        "requiredDisciplines": ["notaufnahme"],
        "requiresOP": False,
        "requiresITS": False,
        "requiresBurnCenter": False,
        "minVersorgungsstufe": "grund",
        "avgTreatmentMin": 120,
        "stabilizationMin": 20,
    },
    {
        "code": "PZC-EXPECT-T4",
        "label": "Infauste Verletzung, palliativ",
        "triage": "T4",
        "primaryDiscipline": "notaufnahme",
        "requiredDisciplines": ["notaufnahme"],
        "requiresOP": False,
        "requiresITS": False,
        "requiresBurnCenter": False,
        "minVersorgungsstufe": "grund",
        "avgTreatmentMin": 60,
        "stabilizationMin": 10,
    },
]
PZC_BY_CODE = {entry["code"]: entry for entry in PZC_CATALOG}

SCENARIOS = [
    {
        "id": "bab-a7-hamburg",
        "label": "BAB-Busunglueck A7 bei Hamburg",
        "type": "verkehrsunfall",
        "location": [9.9375, 53.3556],
        "durationMin": 90,
        "arrivalCurve": "gauss",
        "estimatedCasualties": 80,
        "pzcDistribution": {
            "PZC-POLY-T1": 10,
            "PZC-SHT-T1": 10,
            "PZC-ABDO-T2": 20,
            "PZC-EXT-T2": 25,
            "PZC-MINOR-T3": 30,
            "PZC-EXPECT-T4": 5,
        },
        "childRatio": 0.08,
        "radiusM": 1500,
    },
    {
        "id": "industrie-ludwigshafen",
        "label": "Industriebrand Ludwigshafen",
        "type": "industriebrand",
        "location": [8.4249, 49.5113],
        "durationMin": 180,
        "arrivalCurve": "plateau",
        "estimatedCasualties": 45,
        "pzcDistribution": {
            "PZC-BURN-T1": 20,
            "PZC-BURN-T2": 30,
            "PZC-INHAL-T2": 40,
            "PZC-MINOR-T3": 10,
        },
        "childRatio": 0.02,
        "radiusM": 2500,
    },
    {
        "id": "amok-muenchen",
        "label": "Amoklauf Muenchen Innenstadt",
        "type": "amoklauf",
        "location": [11.5755, 48.1374],
        "durationMin": 15,
        "arrivalCurve": "immediate",
        "estimatedCasualties": 35,
        "pzcDistribution": {
            "PZC-PENET-T1": 25,
            "PZC-POLY-T1": 15,
            "PZC-ABDO-T2": 20,
            "PZC-EXT-T2": 20,
            "PZC-PSYCH-T3": 15,
            "PZC-EXPECT-T4": 5,
        },
        "childRatio": 0.06,
        "radiusM": 800,
    },
    {
        "id": "fluechtlinge-goerlitz",
        "label": "Fluechtlingsstrom Goerlitz",
        "type": "fluechtlingsstrom",
        "location": [14.9873, 51.1526],
        "durationMin": 720,
        "arrivalCurve": "cascade",
        "estimatedCasualties": 500,
        "pzcDistribution": {
            "PZC-POLY-T1": 5,
            "PZC-PENET-T1": 5,
            "PZC-EXT-T2": 10,
            "PZC-ABDO-T2": 15,
            "PZC-MINOR-T3": 55,
            "PZC-PSYCH-T3": 10,
        },
        "childRatio": 0.25,
        "radiusM": 4000,
    },
    {
        "id": "hochwasser-passau",
        "label": "Hochwasser-Evakuierung Passau",
        "type": "naturkatastrophe",
        "location": [13.4637, 48.5665],
        "durationMin": 240,
        "arrivalCurve": "plateau",
        "estimatedCasualties": 120,
        "pzcDistribution": {
            "PZC-POLY-T1": 5,
            "PZC-INHAL-T2": 20,
            "PZC-EXT-T2": 15,
            "PZC-MINOR-T3": 50,
            "PZC-PSYCH-T3": 10,
        },
        "childRatio": 0.15,
        "radiusM": 3500,
    },
]
SCENARIOS_BY_ID = {scenario["id"]: scenario for scenario in SCENARIOS}

with HOSPITALS_PATH.open("r", encoding="utf-8") as handle:
    HOSPITALS_PAYLOAD = json.load(handle)


def haversine_km(a: list[float], b: list[float]) -> float:
    radius = 6371
    lng1, lat1 = a
    lng2, lat2 = b
    to_rad = math.radians
    d_lat = to_rad(lat2 - lat1)
    d_lng = to_rad(lng2 - lng1)
    la1 = to_rad(lat1)
    la2 = to_rad(lat2)
    h = math.sin(d_lat / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(d_lng / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(h))


def seeded_rng(seed: int):
    state = seed & 0xFFFFFFFF

    def imul32(a: int, b: int) -> int:
        return ((a & 0xFFFFFFFF) * (b & 0xFFFFFFFF)) & 0xFFFFFFFF

    def rng() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        value = state
        value = imul32(value ^ (value >> 15), value | 1)
        second = imul32(value ^ (value >> 7), value | 61)
        value ^= (value + second) & 0xFFFFFFFF
        value &= 0xFFFFFFFF
        return ((value ^ (value >> 14)) & 0xFFFFFFFF) / 4294967296

    return rng


def clone_hospitals() -> dict[str, dict[str, Any]]:
    return {entry["id"]: copy.deepcopy(entry) for entry in HOSPITALS_PAYLOAD["simulated"]}


def safe_city_name(name: str | None) -> str:
    return (name or "").split(" ")[0]


def sum_disciplines(hospital: dict[str, Any]) -> tuple[int, int, int]:
    total = 0
    occupied = 0
    for cap in hospital["disciplines"].values():
        if not cap:
            continue
        total += cap["bedsTotal"]
        occupied += cap["bedsOccupied"]
    free = max(0, total - occupied)
    return total, occupied, free


def total_occupancy(hospital: dict[str, Any]) -> float:
    total, occupied, _ = sum_disciplines(hospital)
    return occupied / total if total else 0.0


def discipline_occupancy(hospital: dict[str, Any], discipline: str) -> float:
    cap = hospital["disciplines"].get(discipline)
    if not cap or cap["bedsTotal"] == 0:
        return 0.0
    return cap["bedsOccupied"] / cap["bedsTotal"]


def free_beds(hospital: dict[str, Any], discipline: str) -> int:
    cap = hospital["disciplines"].get(discipline)
    if not cap:
        return 0
    return max(0, cap["bedsTotal"] - cap["bedsOccupied"])


def free_beds_total(hospital: dict[str, Any]) -> int:
    return sum(max(0, cap["bedsTotal"] - cap["bedsOccupied"]) for cap in hospital["disciplines"].values() if cap)


def surge_capacity(hospital: dict[str, Any]) -> int:
    total = 0
    for cap in hospital["disciplines"].values():
        if cap and not cap["surgeActive"]:
            total += cap["surgeCapacity"]
    return total


def stufe_index(level: str) -> int:
    return VERSORGUNGSSTUFE_ORDER.index(level)


def resolve_required_disciplines(pzc: dict[str, Any], is_child: bool) -> list[str]:
    required = list(pzc["requiredDisciplines"])
    if is_child and "paediatrie" not in required:
        required.insert(0, "paediatrie")
    return required


def hospital_has_free_bed(hospital: dict[str, Any], disciplines: list[str]) -> bool:
    return any(free_beds(hospital, discipline) > 0 for discipline in disciplines)


def effective_load(hospital: dict[str, Any], in_transit: int) -> float:
    total, occupied, _ = sum_disciplines(hospital)
    if total == 0:
        return 0.0
    return min(1.0, (occupied + in_transit) / total)


def free_bed_fraction_min(hospital: dict[str, Any], disciplines: list[str]) -> float:
    minimum = 1.0
    for discipline in disciplines:
        cap = hospital["disciplines"].get(discipline)
        if not cap or cap["bedsTotal"] == 0:
            continue
        fraction = max(0, cap["bedsTotal"] - cap["bedsOccupied"]) / cap["bedsTotal"]
        minimum = min(minimum, fraction)
    return minimum


def jitter_from_id(value: str) -> float:
    hash_value = 2166136261
    for char in value:
        hash_value ^= ord(char)
        hash_value = (hash_value * 16777619) & 0xFFFFFFFF
    norm = ((hash_value / 0xFFFFFFFF) * 2) - 1
    return norm * 0.015


def eta_minutes(distance_km: float, pzc: dict[str, Any]) -> int:
    return round(distance_km + pzc["stabilizationMin"])


def find_candidates(
    from_point: list[float],
    pzc: dict[str, Any],
    hospitals: list[dict[str, Any]],
    is_child: bool = False,
    distance_cutoff_km: int | None = None,
    allow_full: bool = False,
) -> list[dict[str, Any]]:
    required = resolve_required_disciplines(pzc, is_child)
    min_stufe = pzc["minVersorgungsstufe"]
    if is_child:
        idx = min(len(VERSORGUNGSSTUFE_ORDER) - 1, stufe_index(min_stufe) + 1)
        min_stufe = VERSORGUNGSSTUFE_ORDER[idx]
    cutoff = distance_cutoff_km or DISTANCE_CUTOFF_KM[pzc["triage"]]

    candidates: list[dict[str, Any]] = []
    for hospital in hospitals:
        if hospital["excludedFromAllocation"] or hospital["escalationLevel"] == "katastrophe":
            continue
        if not all(discipline in hospital["disciplines"] for discipline in required):
            continue
        if stufe_index(hospital["versorgungsstufe"]) < stufe_index(min_stufe):
            continue
        if not allow_full and not hospital_has_free_bed(hospital, required):
            continue
        if pzc["requiresBurnCenter"] and "verbrennung" not in hospital["disciplines"]:
            continue
        distance = haversine_km(from_point, hospital["coords"])
        if distance <= cutoff:
            candidates.append({"h": hospital, "km": distance})
    return candidates


def cumulative_arrival(incident: dict[str, Any], relative_min: int) -> float:
    if relative_min <= 0:
        return 0.0
    curve = incident["arrivalCurve"]
    if curve == "immediate":
        return min(1.0, relative_min / 10)
    if curve == "gauss":
        duration = 90
        x = min(relative_min, duration)
        t = (x - duration / 2) / (duration / 6)
        return 1 / (1 + math.exp(-t * 1.6))
    if curve == "plateau":
        return min(1.0, relative_min / 240)
    duration = 720
    t = min(1.0, relative_min / duration)
    return 4 * t * t * t if t < 0.5 else 1 - ((-2 * t + 2) ** 3) / 2


def draw_from_distribution(distribution: dict[str, int], count: int, rng) -> list[str]:
    entries = [(code, weight) for code, weight in distribution.items() if weight > 0]
    total = sum(weight for _, weight in entries)
    if total == 0:
        return []
    out: list[str] = []
    for _ in range(count):
        marker = rng() * total
        for code, weight in entries:
            marker -= weight
            if marker <= 0:
                out.append(code)
                break
    return out


def get_child_ratio(incident: dict[str, Any]) -> float:
    if "goerlitz" in incident["id"]:
        return 0.25
    if "passau" in incident["id"]:
        return 0.15
    return 0.05


def cutoff_for_stage(triage: str, stage: str) -> int:
    if stage == "D-surge":
        return 900
    base = DISTANCE_CUTOFF_KM[triage]
    if stage in {"A-distance", "B-quota", "C-load"}:
        return min(base * 2, 300)
    return base


def load_ceil_for_stage(stage: str) -> float:
    if stage == "D-surge":
        return float("inf")
    return 1.0 if stage == "C-load" else 0.99


def quota_for_stage(stage: str) -> int:
    if stage == "D-surge":
        return 999
    return 2 if stage in {"B-quota", "C-load"} else 1


def candidate_priority(remaining_quota: int, km: float, max_km: float, eff_load: float, free_fraction: float) -> float:
    return remaining_quota * 1000 + (1 - km / max(1, max_km)) * 100 + free_fraction * 50 - eff_load * eff_load * 80


def try_place(
    patient: dict[str, Any],
    hospitals: list[dict[str, Any]],
    state: dict[str, Any],
    in_transit: dict[str, int],
    remaining: dict[str, int],
    triage: str,
    stage: str,
) -> dict[str, Any] | None:
    pzc = PZC_BY_CODE.get(patient["pzc"])
    incident = next((entry for entry in state["incidents"] if entry["id"] == patient["incidentId"]), None)
    if not pzc or not incident:
        return None

    cutoff = cutoff_for_stage(triage, stage)
    load_ceil = load_ceil_for_stage(stage)
    quota_multiplier = quota_for_stage(stage)
    allow_full = stage == "D-surge"

    if quota_multiplier > 1:
        for hospital in hospitals:
            if hospital["excludedFromAllocation"]:
                continue
            cap = BASE_QUOTA[triage] * quota_multiplier
            if stage == "D-surge":
                remaining[hospital["id"]] = cap
            else:
                bed_limit = free_beds(hospital, pzc["primaryDiscipline"])
                remaining[hospital["id"]] = min(max(remaining.get(hospital["id"], 0), cap), bed_limit)

    candidates = find_candidates(
        incident["location"],
        pzc,
        hospitals,
        is_child=patient["isChild"],
        distance_cutoff_km=cutoff,
        allow_full=allow_full,
    )
    if not candidates:
        return None

    required = resolve_required_disciplines(pzc, patient["isChild"])
    max_km = max(candidate["km"] for candidate in candidates)
    jitter = jitter_from_id(patient["id"])
    best_priority = float("-inf")
    best: dict[str, Any] | None = None
    for candidate in candidates:
        hospital = candidate["h"]
        quota = remaining.get(hospital["id"], 0)
        if quota <= 0:
            continue
        eff_load = effective_load(hospital, in_transit.get(hospital["id"], 0))
        if eff_load >= load_ceil:
            continue
        free_fraction = free_bed_fraction_min(hospital, required)
        priority = candidate_priority(quota, candidate["km"], max_km, eff_load, free_fraction) * (1 + jitter)
        if priority > best_priority:
            best_priority = priority
            best = {
                "patientId": patient["id"],
                "hospitalId": hospital["id"],
                "distanceKm": candidate["km"],
                "etaMin": eta_minutes(candidate["km"], pzc),
            }
    return best


def allocate_batch(state: dict[str, Any], pending: list[dict[str, Any]]) -> dict[str, Any]:
    hospitals = list(state["hospitals"].values())
    in_transit: dict[str, int] = {}
    for patient in state["patients"]:
        if patient.get("assignedHospitalId") and patient["status"] in {"transport", "inTreatment"}:
            in_transit[patient["assignedHospitalId"]] = in_transit.get(patient["assignedHospitalId"], 0) + 1

    buckets = {"T1": [], "T2": [], "T3": [], "T4": []}
    for patient in pending:
        pzc = PZC_BY_CODE.get(patient["pzc"])
        if pzc:
            buckets[pzc["triage"]].append(patient)

    for triage, items in buckets.items():
        items.sort(key=lambda patient: (patient["spawnedAt"], jitter_from_id(patient["id"])))

    remaining = {hospital["id"]: 0 for hospital in hospitals if not hospital["excludedFromAllocation"]}
    results: list[dict[str, Any]] = []
    unassigned_ids: list[str] = []
    touched: set[str] = set()
    summary = {
        "byTriage": {triage: {"assigned": 0, "unassigned": 0} for triage in buckets},
        "cascadeUsed": "none",
        "hospitalsTouched": 0,
    }

    for triage in ["T1", "T2", "T3", "T4"]:
        patients = buckets[triage]
        if not patients:
            continue
        primary = PZC_BY_CODE[patients[0]["pzc"]]["primaryDiscipline"]
        for hospital in hospitals:
            if hospital["excludedFromAllocation"]:
                continue
            bed_limit = free_beds(hospital, primary)
            addon = max(0, min(BASE_QUOTA[triage], bed_limit))
            remaining[hospital["id"]] = remaining.get(hospital["id"], 0) + addon

        for patient in patients:
            placed = False
            for stage in CASCADE_STAGES:
                result = try_place(patient, hospitals, state, in_transit, remaining, triage, stage)
                if result:
                    results.append(result)
                    hospital_id = result["hospitalId"]
                    in_transit[hospital_id] = in_transit.get(hospital_id, 0) + 1
                    remaining[hospital_id] = max(0, remaining.get(hospital_id, 0) - 1)
                    touched.add(hospital_id)
                    summary["byTriage"][triage]["assigned"] += 1
                    if CASCADE_STAGES.index(stage) > CASCADE_STAGES.index(summary["cascadeUsed"]):
                        summary["cascadeUsed"] = stage
                    placed = True
                    break
            if not placed:
                unassigned_ids.append(patient["id"])
                summary["byTriage"][triage]["unassigned"] += 1

    summary["hospitalsTouched"] = len(touched)
    return {"results": results, "unassignedIds": unassigned_ids, "summary": summary}


def alert_key(alert: dict[str, Any]) -> str:
    return f"{alert['scope']}|{alert['scopeRef']}|{alert['ruleName']}"


def detect_all(state: dict[str, Any]) -> list[dict[str, Any]]:
    alerts: list[dict[str, Any]] = []

    for hospital in state["hospitals"].values():
        occupancy = total_occupancy(hospital)
        if occupancy >= 0.95:
            alerts.append({
                "ruleName": "HospitalSaturation",
                "severity": "critical",
                "scope": "hospital",
                "scopeRef": hospital["id"],
                "title": f"{hospital['name']} am Limit",
                "detail": f"Gesamtauslastung {round(occupancy * 100)} %.",
                "linkedRecommendations": [],
            })
        elif occupancy >= 0.85:
            alerts.append({
                "ruleName": "HospitalSaturation",
                "severity": "warn",
                "scope": "hospital",
                "scopeRef": hospital["id"],
                "title": f"{hospital['name']} stark ausgelastet",
                "detail": f"Gesamtauslastung {round(occupancy * 100)} %.",
                "linkedRecommendations": [],
            })

    past = next((snap for snap in state["occupancyHistory"] if snap["simTime"] == state["simTime"] - 30), None)
    if past:
        for hospital in state["hospitals"].values():
            now = total_occupancy(hospital)
            then = past["occupancy"].get(hospital["id"])
            if then is None:
                continue
            delta = now - then
            if delta >= 0.15:
                remaining = max(0.0, 1 - now)
                rate = delta / 30
                eta = round(remaining / rate) if rate > 0 else 999
                alerts.append({
                    "ruleName": "CapacityTrend",
                    "severity": "warn",
                    "scope": "hospital",
                    "scopeRef": hospital["id"],
                    "title": f"{hospital['name']} faellt schnell voll",
                    "detail": f"Auslastung +{round(delta * 100)}pp in 30 min, voll in ca. {eta} min.",
                    "linkedRecommendations": [],
                })

    unassigned = sum(1 for patient in state["patients"] if patient["status"] == "onScene" and state["simTime"] - patient["spawnedAt"] > 20)
    if unassigned:
        alerts.append({
            "ruleName": "UnassignedPatients",
            "severity": "critical",
            "scope": "system",
            "scopeRef": "system",
            "title": f"{unassigned} Patient(en) unvermittelt > 20 min",
            "detail": "Kein Haus passt die Hard-Constraints oder alle Ziele sind voll.",
            "linkedRecommendations": [],
        })

    hospitals = list(state["hospitals"].values())
    for incident in state["incidents"]:
        nearby = [hospital for hospital in hospitals if haversine_km(incident["location"], hospital["coords"]) <= 50]
        if nearby:
            disciplines = {
                PZC_BY_CODE[code]["primaryDiscipline"]
                for code in incident["pzcDistribution"].keys()
                if code in PZC_BY_CODE
            }
            total = 0
            occupied = 0
            for hospital in nearby:
                for discipline in disciplines:
                    cap = hospital["disciplines"].get(discipline)
                    if cap:
                        total += cap["bedsTotal"]
                        occupied += cap["bedsOccupied"]
            if total:
                ratio = occupied / total
                if ratio >= 0.9:
                    severity = "critical"
                    title = f"Region um {safe_city_name(incident['label'])} kritisch"
                elif ratio >= 0.8:
                    severity = "warn"
                    title = f"Region um {safe_city_name(incident['label'])} angespannt"
                else:
                    severity = None
                    title = ""
                if severity:
                    alerts.append({
                        "ruleName": "RegionalLoad",
                        "severity": severity,
                        "scope": "region",
                        "scopeRef": incident["id"],
                        "title": title,
                        "detail": f"{len(nearby)} Haeuser in 50 km, Auslastung in Primaerfaechern {round(ratio * 100)} %.",
                        "linkedRecommendations": [],
                    })

        demand: dict[str, int] = {}
        for code, count in incident["pzcDistribution"].items():
            pzc = PZC_BY_CODE.get(code)
            if pzc:
                primary = pzc["primaryDiscipline"]
                demand[primary] = demand.get(primary, 0) + count
        supply: dict[str, int] = {}
        for hospital in hospitals:
            if haversine_km(incident["location"], hospital["coords"]) > 150:
                continue
            for discipline in hospital["disciplines"]:
                supply[discipline] = supply.get(discipline, 0) + free_beds(hospital, discipline)
        for discipline, need in demand.items():
            available = supply.get(discipline, 0)
            if need > available and need > 0:
                alerts.append({
                    "ruleName": f"DisciplineMismatch-{discipline}",
                    "severity": "critical",
                    "scope": "region",
                    "scopeRef": incident["id"],
                    "title": f"Kapazitaetsluecke: {discipline}",
                    "detail": f"Erwartet: {need} Patienten · verfuegbar in 150 km: {available} Betten.",
                    "linkedRecommendations": [],
                })

    for hospital in state["hospitals"].values():
        if total_occupancy(hospital) < 0.8:
            continue
        if surge_capacity(hospital) > 0:
            alerts.append({
                "ruleName": "EscalationOpportunity",
                "severity": "info",
                "scope": "hospital",
                "scopeRef": hospital["id"],
                "title": f"{hospital['name']}: Surge verfuegbar",
                "detail": "Surge-Kapazitaet kann aktiviert werden.",
                "linkedRecommendations": [],
            })

    return alerts


def recommendation_key(rec: dict[str, Any]) -> str:
    return f"{rec['action']}|{','.join(sorted(rec['targetHospitalIds']))}"


def generate_recommendations(state: dict[str, Any], alerts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    active_alerts = [alert for alert in alerts if alert.get("resolvedAt") is None]
    hospitals = list(state["hospitals"].values())
    by_id = state["hospitals"]

    for alert in active_alerts:
        if alert["ruleName"] == "HospitalSaturation":
            hospital = by_id.get(alert["scopeRef"])
            gain = surge_capacity(hospital) if hospital else 0
            if hospital and gain > 0:
                out.append({
                    "triggeredBy": [alert["id"]],
                    "action": "activate-surge",
                    "targetHospitalIds": [hospital["id"]],
                    "title": f"Surge aktivieren: {hospital['name']}",
                    "rationale": f"Das Haus ist ueberlastet. Aktivierung der Surge-Kapazitaet erhoeht die Bettenzahl um ca. {gain}.",
                    "expectedImpact": {"bedsGained": gain, "timeBoughtMin": 30},
                    "effortLevel": "low",
                    "executable": True,
                })

    for alert in active_alerts:
        if alert["ruleName"] == "RegionalLoad" and alert["severity"] == "warn":
            incident = next((entry for entry in state["incidents"] if entry["id"] == alert["scopeRef"]), None)
            if not incident:
                continue
            outside_ring = [hospital for hospital in hospitals if haversine_km(incident["location"], hospital["coords"]) > 50]
            near = sorted(outside_ring, key=lambda hospital: haversine_km(incident["location"], hospital["coords"]))[:3]
            if near:
                out.append({
                    "triggeredBy": [alert["id"]],
                    "action": "alert-adjacent",
                    "targetHospitalIds": [hospital["id"] for hospital in near],
                    "title": "3 angrenzende Haeuser alarmieren",
                    "rationale": f"Region um den Einsatzort ist angespannt. Vorwarnung fuer {', '.join(safe_city_name(h['name']) for h in near)}.",
                    "expectedImpact": {"timeBoughtMin": 60},
                    "effortLevel": "medium",
                    "executable": True,
                })
        if alert["ruleName"] == "RegionalLoad" and alert["severity"] == "critical":
            out.append({
                "triggeredBy": [alert["id"]],
                "action": "request-cross-region",
                "targetHospitalIds": [],
                "title": "Ueberregionale Unterstuetzung anfordern",
                "rationale": "Die Region ist kritisch ausgelastet. Nachbar-Bundeslaender und ueberregionale Kapazitaeten anfragen.",
                "expectedImpact": {},
                "effortLevel": "high",
                "executable": False,
            })

    for alert in active_alerts:
        if alert["ruleName"] == "HospitalSaturation" and alert["severity"] == "critical":
            overloaded = by_id.get(alert["scopeRef"])
            if not overloaded:
                continue
            in_transport = [patient for patient in state["patients"] if patient.get("assignedHospitalId") == overloaded["id"] and patient["status"] == "transport"]
            alternatives = sorted(
                [hospital for hospital in hospitals if hospital["id"] != overloaded["id"] and free_beds_total(hospital) >= len(in_transport)],
                key=lambda hospital: haversine_km(overloaded["coords"], hospital["coords"]),
            )
            if in_transport and alternatives:
                target = alternatives[0]
                out.append({
                    "triggeredBy": [alert["id"]],
                    "action": "reroute",
                    "targetHospitalIds": [target["id"], overloaded["id"]],
                    "title": f"Umleiten: {safe_city_name(overloaded['name'])} -> {safe_city_name(target['name'])}",
                    "rationale": f"{len(in_transport)} Patient(en) sind in Anfahrt auf das kritische Haus. {target['name']} hat {free_beds_total(target)} freie Betten.",
                    "expectedImpact": {"patientsRerouted": len(in_transport), "timeBoughtMin": 45},
                    "effortLevel": "medium",
                    "executable": True,
                })

            notaufnahme_occ = discipline_occupancy(overloaded, "notaufnahme")
            t3_incoming = sum(
                1
                for patient in state["patients"]
                if patient.get("assignedHospitalId") == overloaded["id"]
                and patient["status"] in {"transport", "inTreatment"}
                and PZC_BY_CODE.get(patient["pzc"], {}).get("triage") == "T3"
            )
            if notaufnahme_occ >= 0.9 and t3_incoming >= 3:
                out.append({
                    "triggeredBy": [alert["id"]],
                    "action": "activate-kv-notdienst",
                    "targetHospitalIds": [overloaded["id"]],
                    "title": f"KV-Notdienst aktivieren: {overloaded['address']['city'] or overloaded['name']}",
                    "rationale": f"Notaufnahme bei {round(notaufnahme_occ * 100)} %, {t3_incoming} T3-Patienten im Zulauf.",
                    "expectedImpact": {"patientsRerouted": round(t3_incoming * 0.4), "bedsGained": round(t3_incoming * 0.4)},
                    "effortLevel": "medium",
                    "executable": True,
                })

            stable = [
                patient
                for patient in state["patients"]
                if patient.get("assignedHospitalId") == overloaded["id"]
                and patient["status"] == "inTreatment"
                and PZC_BY_CODE.get(patient["pzc"], {}).get("triage") in {"T2", "T3"}
            ]
            near_others = sorted(
                [hospital for hospital in hospitals if hospital["id"] != overloaded["id"] and free_beds_total(hospital) > len(stable)],
                key=lambda hospital: haversine_km(overloaded["coords"], hospital["coords"]),
            )[:2]
            if len(stable) >= 3 and near_others:
                out.append({
                    "triggeredBy": [alert["id"]],
                    "action": "transfer-stable",
                    "targetHospitalIds": [overloaded["id"], *[hospital["id"] for hospital in near_others]],
                    "title": "Stabile Patienten verlegen",
                    "rationale": f"{len(stable)} stabile T2/T3-Patienten in {overloaded['name']} koennen verlegt werden.",
                    "expectedImpact": {"bedsGained": len(stable), "patientsRerouted": len(stable)},
                    "effortLevel": "medium",
                    "executable": True,
                })

    return out


def merge_alerts(existing: list[dict[str, Any]], candidates: list[dict[str, Any]], sim_time: int) -> list[dict[str, Any]]:
    by_key = {alert_key(alert): copy.deepcopy(alert) for alert in existing}
    active_now: set[str] = set()
    for candidate in candidates:
        key = alert_key(candidate)
        active_now.add(key)
        previous = by_key.get(key)
        if previous and previous.get("resolvedAt") is None:
            previous["title"] = candidate["title"]
            previous["detail"] = candidate["detail"]
            previous["severity"] = candidate["severity"]
            continue
        by_key[key] = {**candidate, "id": f"A-{key}-{sim_time}", "firedAt": sim_time}
    for key, alert in by_key.items():
        if key not in active_now and alert.get("resolvedAt") is None:
            alert["resolvedAt"] = sim_time
    return [alert for alert in by_key.values() if alert.get("resolvedAt") is None or sim_time - alert["resolvedAt"] < 30]


def merge_recommendations(existing: list[dict[str, Any]], candidates: list[dict[str, Any]], sim_time: int) -> list[dict[str, Any]]:
    by_key = {recommendation_key(rec): copy.deepcopy(rec) for rec in existing}
    active_now: set[str] = set()
    for candidate in candidates:
        key = recommendation_key(candidate)
        active_now.add(key)
        previous = by_key.get(key)
        if previous and previous["executable"]:
            previous["title"] = candidate["title"]
            previous["rationale"] = candidate["rationale"]
            previous["expectedImpact"] = candidate["expectedImpact"]
            previous["triggeredBy"] = candidate["triggeredBy"]
            continue
        if previous and not previous["executable"]:
            continue
        by_key[key] = {**candidate, "id": f"R-{key}-{sim_time}"}
    return [rec for rec in by_key.values() if not rec["executable"] or recommendation_key(rec) in active_now]


def format_summary(state: dict[str, Any]) -> str:
    counts: dict[str, int] = {}
    for patient in state["patients"]:
        counts[patient["status"]] = counts.get(patient["status"], 0) + 1
    breakdown = " ".join(f"{status}:{count}" for status, count in sorted(counts.items()))
    return f"T+{state['simTime']}min patients={len(state['patients'])} {breakdown}"


def manv_pzc(sk_key: str) -> str:
    return {
        "SK1": "PZC-POLY-T1",
        "SK2": "PZC-ABDO-T2",
        "SK3": "PZC-MINOR-T3",
    }[sk_key]


def manv_capacity_split(hospital: dict[str, Any], capacity_mode: str = "available") -> dict[str, int]:
    emergency_total = int(hospital.get("emergencyBeds", 0) or 0)
    notaufnahme = hospital.get("disciplines", {}).get("notaufnahme") or {}
    notaufnahme_total = int(notaufnahme.get("bedsTotal", 0) or 0)
    free_notaufnahme = max(0, notaufnahme_total - int(notaufnahme.get("bedsOccupied", 0) or 0))
    if capacity_mode == "empty":
        emergency = min(emergency_total, notaufnahme_total)
    else:
        emergency = min(emergency_total, free_notaufnahme)
    if emergency <= 0:
        return {"SK1": 0, "SK2": 0, "SK3": 0}
    sk1 = max(0, round(emergency * 0.2))
    sk2 = max(0, round(emergency * 0.4))
    sk3 = max(0, emergency - sk1 - sk2)
    return {"SK1": sk1, "SK2": sk2, "SK3": sk3}


class SimController:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.reset()

    def _base_state(self) -> dict[str, Any]:
        baseline_hospitals = clone_hospitals()
        return {
            "simTime": 0,
            "incidents": [],
            "patients": [],
            "hospitals": clone_hospitals(),
            "baselineHospitals": baseline_hospitals,
            "childFlags": {},
            "unassigned": [],
            "tickLog": [],
            "occupancyHistory": [],
            "alerts": [],
            "recommendations": [],
            "isPaused": True,
            "speed": 1,
            "filters": copy.deepcopy(DEFAULT_FILTERS),
            "manvSettings": copy.deepcopy(DEFAULT_MANV_SETTINGS),
            "summary": "",
        }

    def reset(self) -> dict[str, Any]:
        with self.lock:
            self.state = self._base_state()
            self._rng = seeded_rng(INITIAL_SEED)
            return self.snapshot()

    def snapshot(self) -> dict[str, Any]:
        with self.lock:
            payload = copy.deepcopy(self.state)
            payload["scenarios"] = copy.deepcopy(SCENARIOS)
            payload["disciplineLabels"] = copy.deepcopy(DISCIPLINE_LABELS)
            payload["contextHospitals"] = copy.deepcopy(HOSPITALS_PAYLOAD["context"])
            payload["baselineHospitals"] = copy.deepcopy(self.state["baselineHospitals"])
            payload["manvSettings"] = copy.deepcopy(self.state["manvSettings"])
            payload["statusSummary"] = format_summary(self.state)
            return payload

    def _spawn_patients(self) -> None:
        for incident in self.state["incidents"]:
            existing = sum(1 for patient in self.state["patients"] if patient["incidentId"] == incident["id"])
            relative = self.state["simTime"] - incident["startedAt"]
            should_total = round(cumulative_arrival(incident, relative) * incident["estimatedCasualties"])
            to_spawn = should_total - existing
            if to_spawn <= 0:
                continue
            codes = draw_from_distribution(incident["pzcDistribution"], to_spawn, self._rng)
            for index, code in enumerate(codes):
                patient_id = f"P-{incident['id']}-{existing + index}"
                is_child = self._rng() < get_child_ratio(incident)
                self.state["childFlags"][patient_id] = is_child
                self.state["patients"].append({
                    "id": patient_id,
                    "pzc": code,
                    "incidentId": incident["id"],
                    "isChild": is_child,
                    "spawnedAt": self.state["simTime"],
                    "status": "onScene",
                })

    def _advance_transport(self) -> None:
        for patient in self.state["patients"]:
            if patient["status"] != "transport" or patient.get("arrivedAt") is None:
                continue
            if self.state["simTime"] < patient["arrivedAt"]:
                continue
            pzc = PZC_BY_CODE.get(patient["pzc"])
            hospital = self.state["hospitals"].get(patient.get("assignedHospitalId"))
            if not pzc or not hospital:
                patient["status"] = "deceased"
                continue
            assigned = False
            for discipline in [pzc["primaryDiscipline"], *pzc["requiredDisciplines"]]:
                cap = hospital["disciplines"].get(discipline)
                if cap:
                    cap["bedsOccupied"] += 1
                    patient["status"] = "inTreatment"
                    patient["dischargeAt"] = self.state["simTime"] + pzc["avgTreatmentMin"]
                    assigned = True
                    break
            if not assigned and self.state["simTime"] - patient["spawnedAt"] > 300:
                patient["status"] = "deceased"

    def _assign_patients(self) -> None:
        pending = [patient for patient in self.state["patients"] if patient["status"] == "onScene" and not patient.get("assignedHospitalId")]
        if not pending:
            return
        results = allocate_batch(self.state, pending)
        result_by_id = {entry["patientId"]: entry for entry in results["results"]}
        pending_ids = {patient["id"] for patient in pending}
        for patient in self.state["patients"]:
            if patient["id"] not in pending_ids:
                continue
            result = result_by_id.get(patient["id"])
            if result:
                patient["assignedHospitalId"] = result["hospitalId"]
                patient["status"] = "transport"
                patient["arrivedAt"] = self.state["simTime"] + result["etaMin"]

        current = set(self.state["unassigned"])
        for patient_id in pending_ids:
            if patient_id in result_by_id:
                current.discard(patient_id)
            elif patient_id in results["unassignedIds"]:
                current.add(patient_id)
        self.state["unassigned"] = sorted(current)

    def _advance_treatments(self) -> None:
        for patient in self.state["patients"]:
            if patient["status"] != "inTreatment" or patient.get("dischargeAt") is None:
                continue
            if self.state["simTime"] < patient["dischargeAt"]:
                continue
            pzc = PZC_BY_CODE.get(patient["pzc"])
            hospital = self.state["hospitals"].get(patient.get("assignedHospitalId"))
            if pzc and hospital:
                cap = hospital["disciplines"].get(pzc["primaryDiscipline"])
                if cap:
                    cap["bedsOccupied"] = max(0, cap["bedsOccupied"] - 1)
            patient["status"] = "discharged"

    def _record_occupancy(self) -> None:
        if self.state["simTime"] % 5 != 0:
            return
        snapshot = {"simTime": self.state["simTime"], "occupancy": {}}
        for hospital in self.state["hospitals"].values():
            snapshot["occupancy"][hospital["id"]] = total_occupancy(hospital)
        self.state["occupancyHistory"].append(snapshot)
        if len(self.state["occupancyHistory"]) > 12:
            self.state["occupancyHistory"].pop(0)

    def _recompute_alerts(self) -> None:
        self.state["alerts"] = merge_alerts(self.state["alerts"], detect_all(self.state), self.state["simTime"])
        self.state["recommendations"] = merge_recommendations(
            self.state["recommendations"],
            generate_recommendations(self.state, self.state["alerts"]),
            self.state["simTime"],
        )
        self.state["summary"] = format_summary(self.state)

    def run_tick(self, minutes: int = 1) -> dict[str, Any]:
        with self.lock:
            if self.state["isPaused"] or not self.state["incidents"]:
                return self.snapshot()
            for _ in range(max(1, int(minutes))):
                self.state["simTime"] += 1
                self._spawn_patients()
                self._advance_transport()
                self._assign_patients()
                self._advance_treatments()
                self._record_occupancy()
            self._recompute_alerts()
            return self.snapshot()

    def toggle_pause(self) -> dict[str, Any]:
        with self.lock:
            if not self.state["incidents"] and self.state["isPaused"]:
                return self.snapshot()
            self.state["isPaused"] = not self.state["isPaused"]
            return self.snapshot()

    def set_speed(self, speed: float) -> dict[str, Any]:
        with self.lock:
            self.state["speed"] = max(0.5, min(10, float(speed)))
            return self.snapshot()

    def launch_scenario(self, scenario_id: str) -> dict[str, Any]:
        with self.lock:
            scenario = SCENARIOS_BY_ID.get(scenario_id)
            if not scenario:
                raise KeyError(scenario_id)
            absolute_distribution: dict[str, int] = {}
            assigned = 0
            entries = list(scenario["pzcDistribution"].items())
            for index, (code, pct) in enumerate(entries):
                if index < len(entries) - 1:
                    amount = round((scenario["estimatedCasualties"] * pct) / 100)
                    absolute_distribution[code] = amount
                    assigned += amount
                else:
                    absolute_distribution[code] = scenario["estimatedCasualties"] - assigned
            self.state["incidents"].append({
                "id": f"I-{scenario['id']}-{self.state['simTime']}",
                "type": scenario["type"],
                "label": scenario["label"],
                "location": scenario["location"],
                "radius": scenario["radiusM"],
                "startedAt": self.state["simTime"],
                "estimatedCasualties": scenario["estimatedCasualties"],
                "pzcDistribution": absolute_distribution,
                "arrivalCurve": scenario["arrivalCurve"],
            })
            self.state["isPaused"] = False
            self._recompute_alerts()
            return self.snapshot()

    def escalate_hospital(self, hospital_id: str) -> dict[str, Any]:
        with self.lock:
            hospital = self.state["hospitals"].get(hospital_id)
            if hospital:
                current = ESCALATION_ORDER.index(hospital["escalationLevel"])
                hospital["escalationLevel"] = ESCALATION_ORDER[min(current + 1, len(ESCALATION_ORDER) - 1)]
            self._recompute_alerts()
            return self.snapshot()

    def toggle_hospital_exclusion(self, hospital_id: str) -> dict[str, Any]:
        with self.lock:
            hospital = self.state["hospitals"].get(hospital_id)
            if hospital:
                hospital["excludedFromAllocation"] = not hospital["excludedFromAllocation"]
            self._recompute_alerts()
            return self.snapshot()

    def set_filters(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            filters = self.state["filters"]
            for key in ["freeMin", "occupiedMax", "emergencyMin"]:
                if key in payload:
                    filters[key] = max(0, int(payload[key]))
            sk = payload.get("sk")
            if isinstance(sk, dict):
                for key in ["T1", "T2", "T3"]:
                    if key in sk:
                        filters["sk"][key] = bool(sk[key])
            return self.snapshot()

    def toggle_sk(self, key: str) -> dict[str, Any]:
        with self.lock:
            if key in self.state["filters"]["sk"]:
                self.state["filters"]["sk"][key] = not self.state["filters"]["sk"][key]
            return self.snapshot()

    def reset_filters(self) -> dict[str, Any]:
        with self.lock:
            self.state["filters"] = copy.deepcopy(DEFAULT_FILTERS)
            return self.snapshot()

    def set_manv_settings(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            thresholds = payload.get("transportThresholds", {})
            for key, default in DEFAULT_MANV_SETTINGS["transportThresholds"].items():
                if key in thresholds:
                    self.state["manvSettings"]["transportThresholds"][key] = max(1, int(thresholds[key]))
            if payload.get("capacityMode") in {"available", "empty"}:
                self.state["manvSettings"]["capacityMode"] = payload["capacityMode"]
            return self.snapshot()

    def create_manv(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            address = str(payload.get("address", "")).strip() or "Unbekannter Einsatzort"
            lat = float(payload["lat"])
            lng = float(payload["lng"])
            current_manv_settings = copy.deepcopy(self.state["manvSettings"])
            counts = payload.get("counts", {})
            sk_counts = {
                "SK1": max(0, int(counts.get("SK1", 0))),
                "SK2": max(0, int(counts.get("SK2", 0))),
                "SK3": max(0, int(counts.get("SK3", 0))),
            }
            self.state = self._base_state()
            self.state["manvSettings"] = current_manv_settings
            self._rng = seeded_rng(INITIAL_SEED)
            self.state["isPaused"] = True
            incident_id = f"I-manv-{self.state['simTime']}"
            self.state["incidents"] = [{
                "id": incident_id,
                "type": "manv",
                "label": f"MANV {address}",
                "location": [lng, lat],
                "radius": 1000,
                "startedAt": self.state["simTime"],
                "estimatedCasualties": sum(sk_counts.values()),
                "pzcDistribution": {},
                "arrivalCurve": "immediate",
            }]

            candidate_hospitals = [
                hospital for hospital in self.state["hospitals"].values()
                if hospital.get("emergencyBeds", 0) > 0 and not hospital.get("excludedFromAllocation")
            ]
            capacity_mode = self.state["manvSettings"].get("capacityMode", "available")
            capacities = {
                hospital["id"]: manv_capacity_split(hospital, capacity_mode)
                for hospital in candidate_hospitals
            }
            alerts: list[dict[str, Any]] = []
            patients: list[dict[str, Any]] = []
            unassigned: list[str] = []
            threshold_breaches: dict[str, list[int]] = {"SK1": [], "SK2": [], "SK3": []}
            threshold_breaches_by_hospital: dict[str, dict[str, Any]] = {}
            pid = 0

            for sk_key in ["SK1", "SK2", "SK3"]:
                threshold = self.state["manvSettings"]["transportThresholds"][sk_key]
                pzc_code = manv_pzc(sk_key)
                for _ in range(sk_counts[sk_key]):
                    pid += 1
                    patient_id = f"P-{incident_id}-{pid}"
                    sorted_hospitals = sorted(
                        candidate_hospitals,
                        key=lambda hospital: haversine_km([lng, lat], hospital["coords"]),
                    )
                    assignment = None
                    fallback_assignment = None
                    for hospital in sorted_hospitals:
                        eta = round(haversine_km([lng, lat], hospital["coords"]))
                        if capacities[hospital["id"]][sk_key] <= 0:
                            continue
                        if fallback_assignment is None:
                            fallback_assignment = (hospital, eta)
                        if eta <= threshold:
                            assignment = (hospital, eta)
                            break
                    if assignment is None and fallback_assignment is not None:
                        assignment = fallback_assignment
                        threshold_breaches[sk_key].append(fallback_assignment[1])
                        hospital, eta = fallback_assignment
                        hospital_entry = threshold_breaches_by_hospital.setdefault(
                            hospital["id"],
                            {
                                "hospital": hospital,
                                "count": 0,
                                "maxEta": 0,
                                "bySk": {"SK1": 0, "SK2": 0, "SK3": 0},
                            },
                        )
                        hospital_entry["count"] += 1
                        hospital_entry["maxEta"] = max(hospital_entry["maxEta"], eta)
                        hospital_entry["bySk"][sk_key] += 1
                    patient = {
                        "id": patient_id,
                        "pzc": pzc_code,
                        "incidentId": incident_id,
                        "isChild": False,
                        "spawnedAt": self.state["simTime"],
                        "status": "onScene",
                    }
                    if assignment:
                        hospital, eta = assignment
                        capacities[hospital["id"]][sk_key] -= 1
                        patient["assignedHospitalId"] = hospital["id"]
                        patient["status"] = "transport"
                        patient["arrivedAt"] = self.state["simTime"] + eta
                    else:
                        unassigned.append(patient_id)
                    patients.append(patient)

            self.state["patients"] = patients
            self.state["unassigned"] = unassigned

            for sk_key in ["SK1", "SK2", "SK3"]:
                threshold = self.state["manvSettings"]["transportThresholds"][sk_key]
                missing = sum(
                    1
                    for patient in patients
                    if patient["pzc"] == manv_pzc(sk_key) and not patient.get("assignedHospitalId")
                )
                if missing:
                    alerts.append({
                        "id": f"A-manv-{sk_key}",
                        "ruleName": f"MANVCapacity-{sk_key}",
                        "severity": "critical" if sk_key == "SK1" else "warn",
                        "scope": "system",
                        "scopeRef": incident_id,
                        "firedAt": self.state["simTime"],
                        "title": f"{missing} {sk_key}-Patient(en) ohne Zielklinik",
                        "detail": f"Keine Klinik mit freier {sk_key}-Kapazitaet innerhalb von {threshold} Minuten Transportzeit gefunden.",
                        "linkedRecommendations": [],
                    })
                if threshold_breaches[sk_key]:
                    alerts.append({
                        "id": f"A-manv-threshold-{sk_key}",
                        "ruleName": f"MANVThreshold-{sk_key}",
                        "severity": "critical" if sk_key == "SK1" else "warn",
                        "scope": "system",
                        "scopeRef": incident_id,
                        "firedAt": self.state["simTime"],
                        "title": f"{len(threshold_breaches[sk_key])} {sk_key}-Patient(en) ueber Ziel-Transportzeit",
                        "detail": f"Naechste verfuegbare Klinik lag ausserhalb des Zielwerts von {threshold} Minuten. Aktuell bis {max(threshold_breaches[sk_key])} Minuten.",
                        "linkedRecommendations": [],
                    })
            for hospital_id, breach in threshold_breaches_by_hospital.items():
                hospital = breach["hospital"]
                sk_parts = [f"{label} {count}" for label, count in breach["bySk"].items() if count > 0]
                alerts.append({
                    "id": f"A-manv-hospital-threshold-{hospital_id}",
                    "ruleName": "MANVHospitalThreshold",
                    "severity": "warn",
                    "scope": "hospital",
                    "scopeRef": hospital_id,
                    "firedAt": self.state["simTime"],
                    "title": f"Klinik ausserhalb Ziel-Transportzeit: {hospital['name']}",
                    "detail": f"{breach['count']} MANV-Zuweisungen ueber Zielwert, bis {breach['maxEta']} Minuten Transportzeit. {'; '.join(sk_parts)}.",
                    "linkedRecommendations": [],
                })

            self.state["alerts"] = alerts
            self.state["recommendations"] = []
            self.state["summary"] = format_summary(self.state)
            return self.snapshot()

    def execute_recommendation(self, recommendation_id: str) -> dict[str, Any]:
        with self.lock:
            recommendation = next((entry for entry in self.state["recommendations"] if entry["id"] == recommendation_id), None)
            if not recommendation:
                raise KeyError(recommendation_id)
            hospitals = self.state["hospitals"]
            if recommendation["action"] == "activate-surge":
                hospital = hospitals.get(recommendation["targetHospitalIds"][0])
                if hospital:
                    for cap in hospital["disciplines"].values():
                        if cap and not cap["surgeActive"] and cap["surgeCapacity"] > 0:
                            cap["surgeActive"] = True
                            cap["bedsTotal"] += cap["surgeCapacity"]
                            cap["surgeCapacity"] = 0
            elif recommendation["action"] == "alert-adjacent":
                for hospital_id in recommendation["targetHospitalIds"]:
                    hospital = hospitals.get(hospital_id)
                    if hospital and hospital["escalationLevel"] == "normal":
                        hospital["escalationLevel"] = "erhoeht"
            elif recommendation["action"] == "reroute":
                target_id, source_id = recommendation["targetHospitalIds"][:2]
                for patient in self.state["patients"]:
                    if patient.get("assignedHospitalId") == source_id and patient["status"] == "transport":
                        patient["assignedHospitalId"] = target_id
                        patient["arrivedAt"] = self.state["simTime"] + 15
            elif recommendation["action"] == "transfer-stable":
                source_id = recommendation["targetHospitalIds"][0]
                source = hospitals.get(source_id)
                freed = 0
                limit = recommendation["expectedImpact"].get("bedsGained", 3)
                if source:
                    for patient in self.state["patients"]:
                        if freed >= limit:
                            break
                        if patient.get("assignedHospitalId") != source_id or patient["status"] != "inTreatment":
                            continue
                        pzc = PZC_BY_CODE.get(patient["pzc"])
                        if not pzc or pzc["triage"] == "T1":
                            continue
                        cap = source["disciplines"].get(pzc["primaryDiscipline"])
                        if cap:
                            cap["bedsOccupied"] = max(0, cap["bedsOccupied"] - 1)
                        patient["status"] = "discharged"
                        freed += 1
            elif recommendation["action"] == "activate-kv-notdienst":
                hospital = hospitals.get(recommendation["targetHospitalIds"][0])
                if hospital:
                    cap = hospital["disciplines"].get("notaufnahme")
                    relief = recommendation["expectedImpact"].get("bedsGained", 4)
                    if cap:
                        cap["bedsOccupied"] = max(0, cap["bedsOccupied"] - relief)
            for item in self.state["recommendations"]:
                if item["id"] == recommendation_id:
                    item["executable"] = False
            self._recompute_alerts()
            return self.snapshot()
