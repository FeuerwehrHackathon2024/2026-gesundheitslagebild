# 2026 Gesundheitslagebild

Flask-based MANV dashboard for hospital allocation and Lagebild support.

This repository now contains the Python version of the project. The old frontend/framework code has been removed, so the active application is fully centered around Flask, Python simulation logic, and a browser UI served from Flask.

## What The App Does

- starts a MANV from an address with geocoding support
- allocates `SK I`, `SK II`, and `SK III` patients to nearby hospitals
- respects configurable transport-time thresholds
- supports two allocation assumptions:
  - current emergency department situation
  - emergency department treated as empty
- shows hospitals, incident location, and optional context hospitals on the map
- highlights alerts and recommendations in the right information panel
- regenerates hospital base data from the original Excel source

## Tech Stack

- Python
- Flask
- openpyxl
- HTML / CSS / JavaScript
- Leaflet

## Project Structure

- [app.py](D:/2026-gesundheitslagebild-Mandana/app.py): Flask entrypoint and API routes
- [flask_app/sim.py](D:/2026-gesundheitslagebild-Mandana/flask_app/sim.py): simulation and MANV allocation logic
- [templates/index.html](D:/2026-gesundheitslagebild-Mandana/templates/index.html): Flask template
- [static/app.js](D:/2026-gesundheitslagebild-Mandana/static/app.js): frontend behavior
- [static/app.css](D:/2026-gesundheitslagebild-Mandana/static/app.css): frontend styling
- [scripts/gen_hospitals.py](D:/2026-gesundheitslagebild-Mandana/scripts/gen_hospitals.py): Excel-to-JSON generator
- [lib/data/hospitals.json](D:/2026-gesundheitslagebild-Mandana/lib/data/hospitals.json): generated hospital data
- [doc/Krankenhäuser_D.xlsx](D:/2026-gesundheitslagebild-Mandana/doc/Krankenhäuser_D.xlsx): original Excel source

## Installation

Install the Python dependencies:

```powershell
python -m pip install -r requirements.txt
```

If you are using this workspace as-is, `app.py` can also load packages from the local [`.vendor`](D:/2026-gesundheitslagebild-Mandana/.vendor) directory.

## Run The App

```powershell
python app.py
```

Then open:

```text
http://127.0.0.1:5000
```

If you want to use the bundled runtime on this machine:

```powershell
& 'C:\Users\Mandana\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' app.py
```

## Regenerate Hospital Data

The hospital dataset is generated from the original Excel file:

```powershell
python scripts/gen_hospitals.py
```

This reads [doc/Krankenhäuser_D.xlsx](D:/2026-gesundheitslagebild-Mandana/doc/Krankenhäuser_D.xlsx) and rewrites [lib/data/hospitals.json](D:/2026-gesundheitslagebild-Mandana/lib/data/hospitals.json).

## Current MANV Workflow

1. Enter an address in the `MANV` section.
2. Choose a suggested geocoded address.
3. Enter values for `SK I`, `SK II`, and `SK III`.
4. Choose the capacity assumption:
   - `Aktuelle Situation`
   - `Notaufnahme leer`
5. Adjust transport thresholds in `Einstellungen` if needed.
6. Start the MANV allocation.

## Notes

- Geocoding suggestions require internet access because they use OpenStreetMap Nominatim.
- The Bayern background map requires online tile access.
- Transport time is currently based on straight-line distance, not real road routing.

## Status

This repository is now prepared as a Python/Flask project for further development and Git publishing.
