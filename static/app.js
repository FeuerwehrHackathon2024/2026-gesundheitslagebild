const state = {
  data: null,
  selection: null,
  manvForm: {
    address: "",
    lat: null,
    lng: null,
    counts: { SK1: 0, SK2: 0, SK3: 0 },
    suggestions: [],
  },
  vorplanungForm: {
    date: "",
    address: "",
    lat: null,
    lng: null,
    counts: { SK1: 0, SK2: 0, SK3: 0 },
    suggestions: [],
  },
  transparenzLevel: 18,
  showContextHospitals: false,
  rightPanelBottomRatio: 50,
  rightPanelHospitalTab: "details",
  leftSections: {
    manv: true,
    vorplanung: true,
    settings: true,
    filters: true,
    patients: true,
    legend: true,
  },
  timer: null,
  requestNonce: 0,
  requestInFlight: false,
  geocodeTimer: null,
  map: null,
  baseLayersControl: null,
  layers: {
    context: null,
    incidents: null,
    hospitals: null,
    basemap: null,
  },
};

const speedOptions = [0.5, 1, 2, 5, 10];
const MUNICH_LANDKREIS_VIEW = { center: [48.154, 11.68], zoom: 9 };
const BAVARIA_BOUNDS = L.latLngBounds(
  [47.2, 8.9],
  [50.7, 13.9]
);
const BAYERN_WMTS_URL =
  "https://wmtsod1.bayernwolke.de/wmts/by_webkarte/smerc/{z}/{x}/{y}";

async function api(path, options = {}) {
  const nonce = ++state.requestNonce;
  state.requestInFlight = true;
  const response = await fetch(path, {
    method: options.method || "POST",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json();
  if (nonce !== state.requestNonce) {
    return payload;
  }
  state.requestInFlight = false;
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  state.data = payload;
  render();
  syncTimer();
  return payload;
}

async function fetchState() {
  const nonce = ++state.requestNonce;
  const response = await fetch("/api/state");
  const payload = await response.json();
  if (nonce !== state.requestNonce) {
    return;
  }
  state.requestInFlight = false;
  state.data = payload;
  render();
  syncTimer();
}

async function fetchAddressSuggestions(query, target = "manv") {
  const formKey = target === "vorplanung" ? "vorplanungForm" : "manvForm";
  const trimmed = query.trim();
  if (trimmed.length < 3) {
    state[formKey].suggestions = [];
    renderLeftPanelCollapsible();
    return;
  }
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=de&q=${encodeURIComponent(trimmed)}`
  );
  const payload = await response.json();
  state[formKey].suggestions = payload.map((entry) => ({
    label: entry.display_name,
    lat: Number(entry.lat),
    lng: Number(entry.lon),
  }));
  renderLeftPanelCollapsible();
  const addressInput = document.getElementById(`${target}-address`);
  if (addressInput) {
    addressInput.focus();
    addressInput.setSelectionRange(addressInput.value.length, addressInput.value.length);
  }
}

function formatSimTime(minutes) {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mins = String(minutes % 60).padStart(2, "0");
  return `T+${hours}:${mins}:00`;
}

function formatAgo(minutes) {
  if (minutes < 1) return "jetzt";
  if (minutes < 60) return `-${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `-${hours}h ${mins}m` : `-${hours}h`;
}

function getHospitals() {
  return Object.values(state.data.hospitals);
}

function sumDisciplines(hospital) {
  return Object.values(hospital.disciplines).reduce((acc, cap) => {
    if (!cap) return acc;
    acc.total += cap.bedsTotal;
    acc.occupied += cap.bedsOccupied;
    return acc;
  }, { total: 0, occupied: 0 });
}

function incomingByHospital() {
  const incoming = {};
  for (const patient of state.data.patients) {
    if (!patient.assignedHospitalId) continue;
    if (patient.status !== "transport" && patient.status !== "inTreatment") continue;
    incoming[patient.assignedHospitalId] = (incoming[patient.assignedHospitalId] || 0) + 1;
  }
  return incoming;
}

function patientSkLabel(patient) {
  if (!patient) return null;
  if (patient.pzc === "PZC-POLY-T1") return "SK I";
  if (patient.pzc === "PZC-ABDO-T2") return "SK II";
  if (patient.pzc === "PZC-MINOR-T3") return "SK III";
  return null;
}

function incomingBreakdownByHospital() {
  const breakdown = {};
  for (const patient of state.data.patients) {
    if (!patient.assignedHospitalId) continue;
    if (patient.status !== "transport" && patient.status !== "inTreatment") continue;
    const sk = patientSkLabel(patient);
    if (!sk) continue;
    breakdown[patient.assignedHospitalId] ||= { "SK I": 0, "SK II": 0, "SK III": 0 };
    breakdown[patient.assignedHospitalId][sk] += 1;
  }
  return breakdown;
}

function manvAllocationByHospital() {
  const breakdown = {};
  for (const patient of state.data.patients) {
    if (!patient.assignedHospitalId) continue;
    const sk = patientSkLabel(patient);
    if (!sk) continue;
    breakdown[patient.assignedHospitalId] ||= { "SK I": 0, "SK II": 0, "SK III": 0 };
    breakdown[patient.assignedHospitalId][sk] += 1;
  }
  return breakdown;
}

function involvedHospitalIds() {
  const ids = new Set();
  for (const patient of state.data.patients) {
    if (patient.assignedHospitalId) {
      ids.add(patient.assignedHospitalId);
    }
  }
  return ids;
}

function hospitalPassesFilter(hospital) {
  const filters = state.data.filters;
  const stats = sumDisciplines(hospital);
  const free = Math.max(0, stats.total - stats.occupied);
  if (filters.freeMin > 0 && free < filters.freeMin) return false;
  if (filters.occupiedMax > 0 && stats.occupied > filters.occupiedMax) return false;
  if (filters.emergencyMin > 0 && hospital.emergencyBeds < filters.emergencyMin) return false;
  return true;
}

function triageAllowed(code) {
  const pzc = Object.fromEntries(state.data.scenarios.flatMap(() => []) );
  void pzc;
  return true;
}

function occupancyColor(ratio) {
  if (ratio >= 0.95) return "#e35f62";
  if (ratio >= 0.7) return "#f4b33e";
  return "#4dc17d";
}

function parseNonNegativeInt(value, fallback = 0) {
  const cleaned = String(value ?? "").replace(/[^\d]/g, "");
  if (!cleaned) return fallback;
  return Math.max(0, Number(cleaned));
}

function syncTimer() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  if (!state.data || state.data.isPaused || !state.data.incidents.length) return;
  const interval = Math.max(120, 1000 / state.data.speed);
  state.timer = setInterval(() => {
    if (state.requestInFlight) return;
    api("/api/control/step", { body: { minutes: 1 } });
  }, interval);
}

function renderTopbar() {
  const topbar = document.getElementById("topbar");
  const scenarioLabel = state.data.incidents.length
    ? state.data.incidents[state.data.incidents.length - 1].label
    : "kein Szenario";
  topbar.innerHTML = `
    <div class="row-between" style="gap:8px;">
      <span class="section-label">MANV Dashboard</span>
      <span class="badge mono">${state.data.isPaused ? "Pause" : "Live"}</span>
    </div>
    <div>
      <div class="section-label">Sim-Clock</div>
      <div class="mono">${formatSimTime(state.data.simTime)}</div>
    </div>
    <div>
      <div class="section-label">Speed</div>
      <div class="row-between" style="gap:6px; margin-top:4px;">
        ${speedOptions.map((speed) => `<button class="btn ${speed === state.data.speed ? "accent" : ""}" data-speed="${speed}">${speed}x</button>`).join("")}
      </div>
    </div>
    <div class="row-between" style="gap:8px;">
      <button class="btn" id="toggle-pause">${state.data.isPaused ? "Play" : "Pause"}</button>
      <button class="btn" data-step="10">+10 min</button>
      <button class="btn" data-step="60">+1 h</button>
      <button class="btn ghost" id="reset-sim">Reset</button>
    </div>
    <div style="margin-left:auto;">
      <div class="section-label">Szenario</div>
      <div class="mono">${scenarioLabel}</div>
    </div>
  `;
  topbar.querySelectorAll("[data-speed]").forEach((button) => {
    button.addEventListener("click", () => api("/api/control/speed", { body: { speed: Number(button.dataset.speed) } }));
  });
  topbar.querySelectorAll("[data-step]").forEach((button) => {
    button.addEventListener("click", () => api("/api/control/step", { body: { minutes: Number(button.dataset.step) } }));
  });
  document.getElementById("toggle-pause").onclick = () => {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
    api("/api/control/toggle-pause");
  };
  document.getElementById("reset-sim").onclick = () => {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
    api("/api/control/reset");
  };
}

function patientStats() {
  const stats = {
    onSceneUnassigned: 0,
    onScenePlanned: 0,
    transport: 0,
    inTreatment: 0,
    discharged: 0,
    deceased: 0,
  };
  for (const patient of state.data.patients) {
    if (patient.status === "onScene") {
      const key = patient.assignedHospitalId ? "onScenePlanned" : "onSceneUnassigned";
      stats[key] += 1;
    } else {
      stats[patient.status] += 1;
    }
  }
  return stats;
}

function incidentRows(incident) {
  const rows = {};
  for (const patient of state.data.patients) {
    if (patient.incidentId !== incident.id || !patient.assignedHospitalId) continue;
    const hospital = state.data.hospitals[patient.assignedHospitalId];
    if (!hospital) continue;
    rows[hospital.id] ||= { id: hospital.id, name: hospital.name, planned: 0, transport: 0, inTreatment: 0, done: 0, total: 0 };
    if (patient.status === "onScene") rows[hospital.id].planned += 1;
    else if (patient.status === "transport") rows[hospital.id].transport += 1;
    else if (patient.status === "inTreatment") rows[hospital.id].inTreatment += 1;
    else rows[hospital.id].done += 1;
    rows[hospital.id].total += 1;
  }
  return Object.values(rows).sort((a, b) => b.total - a.total);
}

function renderLeftPanel() {
  const counts = patientStats();
  const hasScenarioSelection = Boolean(state.selectedScenario);
  const activeHospitals = new Set(
    state.data.patients
      .filter((patient) => patient.assignedHospitalId && ["transport", "inTreatment"].includes(patient.status))
      .map((patient) => patient.assignedHospitalId)
  ).size;
  const left = document.getElementById("left-panel");
  left.innerHTML = `
    <section class="section">
      <div class="panel-head">
        <span class="section-label">Szenarien</span>
      </div>
      <div class="field" style="grid-template-columns: 1fr;">
        <select id="scenario-select">
          <option value="" ${!state.selectedScenario ? "selected" : ""}>Kein Szenario</option>
          ${state.data.scenarios.map((scenario) => `<option value="${scenario.id}" ${scenario.id === state.selectedScenario ? "selected" : ""}>${scenario.label}</option>`).join("")}
        </select>
      </div>
      <button class="btn primary" id="launch-scenario" style="width:100%;" ${hasScenarioSelection ? "" : "disabled"}>Szenario starten</button>
      ${state.data.incidents.length ? `
        <div style="margin-top:12px;" class="list">
          ${state.data.incidents.map((incident) => `
            <div class="card">
              <div>${incident.label}</div>
              <div class="muted mono">${incident.estimatedCasualties} Patienten · ab T+${incident.startedAt}min</div>
              <div style="margin-top:8px;">
                <div class="section-label">Zuteilung</div>
                <div class="list" style="margin-top:6px;">
                  ${incidentRows(incident).slice(0, 8).map((row) => `
                    <div class="hospital-row" data-hospital="${row.id}">
                      <span title="${row.name}">${row.name}</span>
                      <span class="muted mono">${row.planned}</span>
                      <span class="mono" style="color:var(--accent-cyan)">${row.transport}</span>
                      <span class="mono">${row.inTreatment}</span>
                      <span class="muted mono">${row.done}</span>
                    </div>
                  `).join("") || `<div class="muted">Noch keine Zuweisungen.</div>`}
                </div>
              </div>
            </div>
          `).join("")}
        </div>` : ""}
    </section>
    <section class="section">
      <div class="panel-head">
        <span class="section-label">Einstellungen</span>
      </div>
      <div class="checkbox-list" style="margin-top:8px;">
        <label>
          <input type="checkbox" id="toggle-context-hospitals" ${state.showContextHospitals ? "checked" : ""}>
          <span>Kontext-Krankenhaeuser anzeigen</span>
        </label>
        <div class="muted" style="font-size:12px;">
          Zusaetzliche Krankenhaeuser werden in fester Farbe angezeigt und dienen nur als Orientierung.
        </div>
      </div>
    </section>
    <section class="section">
      <div class="panel-head">
        <span class="section-label">Filter</span>
        <button class="btn ghost" id="reset-filters">Reset</button>
      </div>
      <label class="field"><span>Freie Betten</span><span class="muted mono">≥</span><input type="text" inputmode="numeric" pattern="[0-9]*" id="filter-free" value="${state.data.filters.freeMin || ""}"></label>
      <label class="field"><span>Belegte Betten</span><span class="muted mono">≤</span><input type="text" inputmode="numeric" pattern="[0-9]*" id="filter-occupied" value="${state.data.filters.occupiedMax || ""}"></label>
      <label class="field"><span>Notfallbetten</span><span class="muted mono">≥</span><input type="text" inputmode="numeric" pattern="[0-9]*" id="filter-emergency" value="${state.data.filters.emergencyMin || ""}"></label>
      <div class="section-label" style="margin-top:10px;">Sichtungskategorie</div>
      <div class="checkbox-list">
        ${["T1", "T2", "T3"].map((key) => `
          <label><input type="checkbox" data-sk="${key}" ${state.data.filters.sk[key] ? "checked" : ""}> <span class="mono">${key}</span></label>
        `).join("")}
      </div>
    </section>
    <section class="section">
      <div class="section-label">Patienten</div>
      <div class="stats-grid" style="margin-top:8px;">
        <span class="muted">Geplant</span><span class="mono">${counts.onScenePlanned}</span>
        <span class="muted">Transport</span><span class="mono">${counts.transport}</span>
        <span class="muted">Behandlung</span><span class="mono">${counts.inTreatment}</span>
        <span class="muted">Entlassen</span><span class="mono">${counts.discharged}</span>
        <span class="muted">Verstorben</span><span class="mono">${counts.deceased}</span>
        <span class="muted">Unvermittelt</span><span class="mono" style="color:${counts.onSceneUnassigned ? "var(--accent-red)" : "inherit"}">${counts.onSceneUnassigned}</span>
        <span class="muted">Haeuser aktiv</span><span class="mono">${activeHospitals}</span>
      </div>
    </section>
    <section class="section">
      <div class="section-label">Legende</div>
      <div class="legend" style="margin-top:8px;">
        <div><span class="legend-dot" style="background:var(--accent-green)"></span>Gruen: Auslastung unter 70 %</div>
        <div><span class="legend-dot" style="background:var(--accent-amber)"></span>Orange: Auslastung 70 % bis 95 %</div>
        <div><span class="legend-dot" style="background:var(--accent-red)"></span>Rot: Auslastung ueber 95 %</div>
        <div><span class="legend-dot" style="border:2px solid var(--accent-cyan); background:transparent"></span>Cyan-Ring: aktiver Zulauf / beteiligtes Krankenhaus</div>
        <div><span class="legend-dot" style="background:#36d1dc"></span>Blau: Einsatzort / Szenario</div>
        <div><span class="legend-dot" style="background:#7c9ab0"></span>Grau-Blau: optionale Kontext-Krankenhaeuser</div>
      </div>
    </section>
  `;

  document.getElementById("scenario-select").onchange = (event) => {
    state.selectedScenario = event.target.value;
    document.getElementById("launch-scenario").disabled = !state.selectedScenario;
  };
  document.getElementById("launch-scenario").onclick = () => {
    if (state.selectedScenario) {
      api(`/api/scenarios/${state.selectedScenario}/launch`);
    }
  };
  document.getElementById("toggle-context-hospitals").onchange = (event) => {
    state.showContextHospitals = event.target.checked;
    renderMap();
  };
  document.getElementById("reset-filters").onclick = () => api("/api/filters/reset");
  ["free", "occupied", "emergency"].forEach((name) => {
    document.getElementById(`filter-${name}`).addEventListener("change", () => {
      api("/api/filters", {
        body: {
          freeMin: Number(document.getElementById("filter-free").value || 0),
          occupiedMax: Number(document.getElementById("filter-occupied").value || 0),
          emergencyMin: Number(document.getElementById("filter-emergency").value || 0),
        },
      });
    });
  });
  left.querySelectorAll("[data-sk]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => api("/api/filters/toggle-sk", { body: { key: checkbox.dataset.sk } }));
  });
  left.querySelectorAll("[data-hospital]").forEach((row) => {
    row.addEventListener("click", () => {
      state.selection = { kind: "hospital", id: row.dataset.hospital };
      renderRightPanel();
    });
  });
}

function renderMap() {
  const wrap = document.getElementById("map-wrap");
  const incoming = incomingByHospital();
  const involved = involvedHospitalIds();
  const hospitals = getHospitals();
  const hasActiveScenario = state.data.incidents.length > 0;
  if (!state.map) {
    wrap.innerHTML = "";
    state.map = L.map(wrap, {
      zoomControl: true,
      minZoom: 3,
      maxZoom: 18,
    }).setView(MUNICH_LANDKREIS_VIEW.center, MUNICH_LANDKREIS_VIEW.zoom);

    const osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    });

    const bayernWmts = L.tileLayer(
      BAYERN_WMTS_URL,
      {
        maxZoom: 18,
        tileSize: 256,
        crossOrigin: true,
        attribution: "Bayerische Vermessungsverwaltung, GeoBasis-DE / BKG",
      }
    );

    bayernWmts.addTo(state.map);
    state.layers.basemap = bayernWmts;
    state.baseLayersControl = L.control.layers(
      {
        "Bayern WMTS by_webkarte": bayernWmts,
        "OpenStreetMap (Fallback)": osmLayer,
      },
      {},
      { position: "topright", collapsed: false }
    ).addTo(state.map);

    const bayernMinZoom = state.map.getBoundsZoom(BAVARIA_BOUNDS, true);
    state.map.setMinZoom(bayernMinZoom);

    state.map.on("baselayerchange", (event) => {
      if (event.name === "Bayern WMTS by_webkarte") {
        state.map.setMinZoom(bayernMinZoom);
        state.map.setView(MUNICH_LANDKREIS_VIEW.center, MUNICH_LANDKREIS_VIEW.zoom);
      } else if (event.name === "OpenStreetMap (Fallback)") {
        state.map.setMinZoom(3);
        state.map.setView(MUNICH_LANDKREIS_VIEW.center, MUNICH_LANDKREIS_VIEW.zoom);
      }
    });

    state.layers.context = L.layerGroup().addTo(state.map);
    state.layers.incidents = L.layerGroup().addTo(state.map);
    state.layers.hospitals = L.layerGroup().addTo(state.map);
  }

    if (!wrap.querySelector(".map-overlay-controls")) {
      const controls = document.createElement("div");
      controls.className = "map-overlay-controls";
      controls.innerHTML = `
        <div class="section-label">Punkte</div>
        <input type="range" id="transparenz-slider" min="5" max="60" step="1" value="${state.transparenzLevel}">
      `;
      wrap.appendChild(controls);
      controls.addEventListener("click", (event) => event.stopPropagation());
      L.DomEvent.disableClickPropagation(controls);
      L.DomEvent.disableScrollPropagation(controls);
      ["mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "touchend", "dblclick"].forEach((eventName) => {
        controls.addEventListener(eventName, (event) => event.stopPropagation());
      });
      controls.querySelector("#transparenz-slider").addEventListener("input", (event) => {
        state.transparenzLevel = Number(event.target.value || 18);
        renderMap();
      });
    }
  const overlayControls = wrap.querySelector(".map-overlay-controls");
  if (overlayControls) {
    overlayControls.style.display = hasActiveScenario ? "block" : "none";
    const slider = overlayControls.querySelector("#transparenz-slider");
    if (slider && slider.value !== String(state.transparenzLevel)) {
      slider.value = String(state.transparenzLevel);
    }
  }

  state.layers.context.clearLayers();
  state.layers.incidents.clearLayers();
  state.layers.hospitals.clearLayers();

    if (state.showContextHospitals) {
      state.data.contextHospitals.forEach((hospital) => {
        const contextOpacity = Math.max(0.08, state.transparenzLevel / 100);
        const marker = L.circleMarker([hospital.coords[1], hospital.coords[0]], {
          radius: 3,
          color: "#7c9ab0",
          fillColor: "#7c9ab0",
          fillOpacity: contextOpacity,
          opacity: Math.max(0.18, contextOpacity + 0.1),
          weight: 1,
          interactive: true,
        });

        marker
        .bindTooltip(
          `
            <div class="section-label">Kontext-Krankenhaus</div>
            <div>${hospital.name}</div>
            <div class="muted mono">${hospital.ort || ""}${hospital.bundesland ? ` · ${hospital.bundesland}` : ""}</div>
            <div class="muted mono">${hospital.art || "Nur Kontextdaten"}</div>
          `,
          {
            className: "dashboard-tooltip",
            sticky: true,
          }
        )
          .on("click", () => {
            state.selection = { kind: "context-hospital", id: hospital.id };
            renderRightPanel();
            renderMap();
          })
          .on("mouseover", () => {
            marker.setStyle({
              fillOpacity: 0.95,
              opacity: 1,
              radius: 5,
              weight: 2,
            });
          })
          .on("mouseout", () => {
            marker.setStyle({
              fillOpacity: contextOpacity,
              opacity: Math.max(0.18, contextOpacity + 0.1),
              radius: 3,
              weight: 1,
            });
          })
          .addTo(state.layers.context);
      });
    }

  state.data.incidents.forEach((incident) => {
    const latlng = [incident.location[1], incident.location[0]];
    const incidentCircle = L.circle(latlng, {
      radius: incident.radius || 1000,
      color: "#36d1dc",
      weight: 2,
      fillColor: "#36d1dc",
      fillOpacity: 0.14,
    });
    incidentCircle
      .bindTooltip(
        `<div class="section-label">Incident</div><div>${incident.label}</div><div class="muted mono">${incident.estimatedCasualties} Patienten</div>`,
        { className: "dashboard-tooltip", sticky: true }
      )
      .addTo(state.layers.incidents);
    incidentCircle.on("add", () => {
      const element = incidentCircle.getElement();
      if (element) element.classList.add("incident-pulse");
    });

    L.circleMarker(latlng, {
      radius: 4,
      color: "#36d1dc",
      fillColor: "#36d1dc",
      fillOpacity: 0.9,
      weight: 1,
    }).addTo(state.layers.incidents);
  });

  hospitals.forEach((hospital) => {
    const stats = sumDisciplines(hospital);
    const occupancy = stats.total ? stats.occupied / stats.total : 0;
    const color = occupancyColor(occupancy);
    const selected = state.selection?.id === hospital.id;
    const passes = hospitalPassesFilter(hospital);
    const isInvolved = involved.has(hospital.id);
      const fill = passes ? color : "#51606c";
      const fadedOpacity = state.transparenzLevel / 100;
      const fillOpacity = hasActiveScenario
        ? (passes
          ? (isInvolved ? 0.95 : fadedOpacity)
          : (isInvolved ? 0.45 : Math.max(0.08, fadedOpacity * 0.66)))
      : (passes ? 0.92 : 0.35);
    const strokeOpacity = hasActiveScenario
      ? (isInvolved ? 1 : Math.max(0.25, fadedOpacity + 0.1))
      : 1;
    const latlng = [hospital.coords[1], hospital.coords[0]];

    const marker = L.circleMarker(latlng, {
      radius: selected ? 8 : (hasActiveScenario && isInvolved ? 7 : 6),
      color: selected ? "#ffffff" : "#102030",
      weight: selected ? 2 : 1,
      fillColor: fill,
      fillOpacity,
      opacity: strokeOpacity,
    });

      marker
        .bindTooltip(hospitalTooltip(hospital, incoming[hospital.id] || 0), {
          className: "dashboard-tooltip",
          sticky: true,
        })
        .on("mouseover", () => {
          marker.setStyle({
            fillOpacity: 0.98,
            opacity: 1,
            radius: selected ? 8 : 7,
            weight: selected ? 2 : 2,
          });
        })
        .on("mouseout", () => {
          marker.setStyle({
            fillOpacity,
            opacity: strokeOpacity,
            radius: selected ? 8 : (hasActiveScenario && isInvolved ? 7 : 6),
            weight: selected ? 2 : 1,
          });
        })
        .on("click", () => {
          state.selection = { kind: "hospital", id: hospital.id };
          renderRightPanel();
          renderMap();
        })
      .addTo(state.layers.hospitals);
  });

  state.map.invalidateSize();
}

function hospitalTooltip(hospital, incoming) {
  const stats = sumDisciplines(hospital);
  const free = Math.max(0, stats.total - stats.occupied);
  const hasActiveScenario = state.data.incidents.length > 0;
  const incomingBreakdown = incomingBreakdownByHospital()[hospital.id] || { "SK I": 0, "SK II": 0, "SK III": 0 };
  return `
    <div class="section-label">Krankenhaus</div>
    <div>${hospital.name}</div>
    <div class="muted mono">${hospital.address.city} ? ${hospital.versorgungsstufe}</div>
    <div class="stats-grid" style="margin-top:8px;">
      <span class="muted">Belegt</span><span class="mono">${stats.occupied}/${stats.total}</span>
      <span class="muted">Frei</span><span class="mono">${free}</span>
      <span class="muted">Zulauf</span><span class="mono">${incoming}</span>
      ${hasActiveScenario ? `
        <span class="muted">SK I</span><span class="mono">${incomingBreakdown["SK I"]}</span>
        <span class="muted">SK II</span><span class="mono">${incomingBreakdown["SK II"]}</span>
        <span class="muted">SK III</span><span class="mono">${incomingBreakdown["SK III"]}</span>
      ` : ""}
    </div>
  `;
}

function renderRightPanel() {
  const right = document.getElementById("right-panel");
  const selectedHospital = state.selection?.kind === "hospital" ? state.data.hospitals[state.selection.id] : null;
  const selectedContextHospital = state.selection?.kind === "context-hospital"
    ? state.data.contextHospitals.find((entry) => entry.id === state.selection.id)
    : null;
  const incoming = incomingByHospital();
  const history = state.data.occupancyHistory.filter((entry) => selectedHospital && entry.occupancy[selectedHospital.id] != null);
  const hasActiveScenario = state.data.incidents.length > 0;
  const hospitalStats = selectedHospital ? sumDisciplines(selectedHospital) : { total: 0, occupied: 0 };
  const incomingTotal = selectedHospital ? (incoming[selectedHospital.id] || 0) : 0;
  const totalIncomingDisplay = selectedHospital ? Math.min(incomingTotal, Math.max(0, hospitalStats.total - hospitalStats.occupied)) : 0;
  const totalFree = selectedHospital ? Math.max(0, hospitalStats.total - hospitalStats.occupied - totalIncomingDisplay) : 0;
  const emergencyTotal = selectedHospital?.disciplines?.notaufnahme?.bedsTotal || 0;
  const emergencyOccupied = selectedHospital?.disciplines?.notaufnahme?.bedsOccupied || 0;
  const emergencyIncomingDisplay = selectedHospital ? Math.min(incomingTotal, Math.max(0, emergencyTotal - emergencyOccupied)) : 0;
  const emergencyFree = selectedHospital ? Math.max(0, emergencyTotal - emergencyOccupied - emergencyIncomingDisplay) : 0;
  const allocationBreakdown = selectedHospital ? (manvAllocationByHospital()[selectedHospital.id] || { "SK I": 0, "SK II": 0, "SK III": 0 }) : { "SK I": 0, "SK II": 0, "SK III": 0 };
  const baselineHospital = selectedHospital ? state.data.baselineHospitals[selectedHospital.id] : null;
  const currentPlan = state.data.vorplanung;
  const plannedBreakdown = selectedHospital && currentPlan
    ? (currentPlan.allocationsByHospital[selectedHospital.id] || { "SK I": 0, "SK II": 0, "SK III": 0 })
    : { "SK I": 0, "SK II": 0, "SK III": 0 };
  const baselineNotaufnahme = baselineHospital?.disciplines?.notaufnahme?.bedsOccupied || 0;
  const currentNotaufnahmeTotal = selectedHospital?.disciplines?.notaufnahme?.bedsTotal || 0;
  const totalManvAllocation = allocationBreakdown["SK I"] + allocationBreakdown["SK II"] + allocationBreakdown["SK III"];
  const totalPlannedAllocation = plannedBreakdown["SK I"] + plannedBreakdown["SK II"] + plannedBreakdown["SK III"];
  const combinedEmergencyLoad = baselineNotaufnahme + totalManvAllocation;
  const plannedEmergencyLoad = baselineNotaufnahme + totalPlannedAllocation;
  const combinedEmergencyRatio = currentNotaufnahmeTotal > 0 ? combinedEmergencyLoad / currentNotaufnahmeTotal : 0;
  const plannedEmergencyRatio = currentNotaufnahmeTotal > 0 ? plannedEmergencyLoad / currentNotaufnahmeTotal : 0;
  const hospitalTab = state.rightPanelHospitalTab || "details";
  const baselineWidth = currentNotaufnahmeTotal > 0 ? Math.min(100, (baselineNotaufnahme / currentNotaufnahmeTotal) * 100) : 0;
  const sk1Width = currentNotaufnahmeTotal > 0 ? Math.min(100, (allocationBreakdown["SK I"] / currentNotaufnahmeTotal) * 100) : 0;
  const sk2Width = currentNotaufnahmeTotal > 0 ? Math.min(100, (allocationBreakdown["SK II"] / currentNotaufnahmeTotal) * 100) : 0;
  const sk3Width = currentNotaufnahmeTotal > 0 ? Math.min(100, (allocationBreakdown["SK III"] / currentNotaufnahmeTotal) * 100) : 0;
  const plannedSk1Width = currentNotaufnahmeTotal > 0 ? Math.min(100, (plannedBreakdown["SK I"] / currentNotaufnahmeTotal) * 100) : 0;
  const plannedSk2Width = currentNotaufnahmeTotal > 0 ? Math.min(100, (plannedBreakdown["SK II"] / currentNotaufnahmeTotal) * 100) : 0;
  const plannedSk3Width = currentNotaufnahmeTotal > 0 ? Math.min(100, (plannedBreakdown["SK III"] / currentNotaufnahmeTotal) * 100) : 0;
  const sortedAlerts = [...state.data.alerts].sort((a, b) => {
    const sev = { critical: 0, warn: 1, info: 2 };
    if ((a.resolvedAt != null) !== (b.resolvedAt != null)) return a.resolvedAt != null ? 1 : -1;
    if (sev[a.severity] !== sev[b.severity]) return sev[a.severity] - sev[b.severity];
    return b.firedAt - a.firedAt;
  });
  const executableRecommendations = state.data.recommendations.filter((entry) => entry.executable);

  right.innerHTML = `
    <div class="right-panel-top" style="flex-basis: calc(${100 - state.rightPanelBottomRatio}% - 6px);">
      ${currentPlan ? `
        <section class="section">
          <div class="panel-head">
            <span class="section-label">Vorplanung</span>
            <span class="badge mono">${currentPlan.date}</span>
          </div>
          <div style="margin-top:8px;" class="muted mono">${currentPlan.address}</div>
          <div class="chips">
            <span class="badge mono">SK I ${currentPlan.counts.SK1}</span>
            <span class="badge mono">SK II ${currentPlan.counts.SK2}</span>
            <span class="badge mono">SK III ${currentPlan.counts.SK3}</span>
          </div>
        </section>
      ` : ""}
      ${selectedHospital ? `
        <section class="section">
          <div class="panel-head">
            <span class="section-label">Krankenhaus-Detail</span>
            <button class="btn ghost" id="close-selection">schliessen</button>
          </div>
          <div style="margin-top:8px;">${selectedHospital.name}</div>
          <div class="muted mono">${selectedHospital.address.city} &middot; ${selectedHospital.versorgungsstufe} &middot; ${selectedHospital.traeger}</div>
          <div class="row-between" style="margin-top:10px;">
            <span class="section-label">Stufe</span>
            <span class="badge mono">${selectedHospital.escalationLevel}</span>
          </div>
          <div class="panel-tabs" style="margin-top:12px;">
            <button class="btn ${hospitalTab === "details" ? "primary" : "ghost"} hospital-tab" data-tab="details">Details</button>
            <button class="btn ${hospitalTab === "capacity" ? "primary" : "ghost"} hospital-tab" data-tab="capacity">Kapazitaet</button>
          </div>
          ${hospitalTab === "capacity" ? `
            <div class="capacity-compare" style="margin-top:12px;">
              <div class="section-label">Kapazitaetsbild</div>
              <div class="capacity-vertical-bars">
                <div class="capacity-vertical-col">
                  <div class="capacity-head">
                    <span>Gesamt</span>
                    <span class="mono">${hospitalStats.total}</span>
                  </div>
                  <div class="capacity-vertical-track">
                    <div class="capacity-seg capacity-free" style="height:${hospitalStats.total ? (totalFree / hospitalStats.total) * 100 : 0}%"></div>
                    <div class="capacity-seg capacity-incoming" style="height:${hospitalStats.total ? (totalIncomingDisplay / hospitalStats.total) * 100 : 0}%"></div>
                    <div class="capacity-seg capacity-occupied" style="height:${hospitalStats.total ? (hospitalStats.occupied / hospitalStats.total) * 100 : 0}%"></div>
                  </div>
                  <div class="capacity-meta">
                    <span class="badge mono">Belegt ${hospitalStats.occupied}</span>
                    <span class="badge mono capacity-badge-incoming">Zulauf ${incomingTotal}</span>
                    <span class="badge mono capacity-badge-free">Frei ${totalFree}</span>
                  </div>
                </div>
                <div class="capacity-vertical-col">
                  <div class="capacity-head">
                    <span>Notaufnahme</span>
                    <span class="mono">${emergencyTotal}</span>
                  </div>
                  <div class="capacity-vertical-track">
                    <div class="capacity-seg capacity-free" style="height:${emergencyTotal ? (emergencyFree / emergencyTotal) * 100 : 0}%"></div>
                    <div class="capacity-seg capacity-incoming" style="height:${emergencyTotal ? (emergencyIncomingDisplay / emergencyTotal) * 100 : 0}%"></div>
                    <div class="capacity-seg capacity-occupied" style="height:${emergencyTotal ? (emergencyOccupied / emergencyTotal) * 100 : 0}%"></div>
                  </div>
                  <div class="capacity-meta">
                    <span class="badge mono">Belegt ${emergencyOccupied}</span>
                    <span class="badge mono capacity-badge-incoming">Zulauf ${incomingTotal}</span>
                    <span class="badge mono capacity-badge-free">Frei ${emergencyFree}</span>
                  </div>
                </div>
              </div>
            </div>
          ` : `
          ${currentPlan && totalPlannedAllocation > 0 && currentNotaufnahmeTotal > 0 ? `
            <div style="margin-top:12px;">
              <div class="row-between">
                <span class="section-label">Vorplanung Notaufnahme</span>
                <span class="mono" style="color:${occupancyColor(plannedEmergencyRatio)}">${plannedEmergencyLoad}/${currentNotaufnahmeTotal}</span>
              </div>
              <div class="muted mono" style="margin-top:4px;">Geplant fuer ${currentPlan.date}</div>
              <div style="height:12px;background:var(--bg-3);margin-top:6px;border:1px solid ${occupancyColor(plannedEmergencyRatio)};display:flex;overflow:hidden;">
                <div style="width:${baselineWidth}%;background:#5f7283;"></div>
                <div style="width:${plannedSk1Width}%;background:#e35f62;"></div>
                <div style="width:${plannedSk2Width}%;background:#f4b33e;"></div>
                <div style="width:${plannedSk3Width}%;background:#48c8f0;"></div>
              </div>
              <div class="chips" style="margin-top:6px;">
                <span class="badge mono">Vorher ${baselineNotaufnahme}</span>
                <span class="badge mono" style="color:#e35f62;">SK I ${plannedBreakdown["SK I"]}</span>
                <span class="badge mono" style="color:#f4b33e;">SK II ${plannedBreakdown["SK II"]}</span>
                <span class="badge mono" style="color:#48c8f0;">SK III ${plannedBreakdown["SK III"]}</span>
              </div>
            </div>
          ` : ""}
          ${hasActiveScenario && currentNotaufnahmeTotal > 0 ? `
            <div style="margin-top:12px;">
              <div class="row-between">
                <span class="section-label">Notaufnahme vor / nach MANV</span>
                <span class="mono" style="color:${occupancyColor(combinedEmergencyRatio)}">${combinedEmergencyLoad}/${currentNotaufnahmeTotal}</span>
              </div>
              <div style="height:12px;background:var(--bg-3);margin-top:6px;border:1px solid ${occupancyColor(combinedEmergencyRatio)};display:flex;overflow:hidden;">
                <div style="width:${baselineWidth}%;background:#5f7283;"></div>
                <div style="width:${sk1Width}%;background:#e35f62;"></div>
                <div style="width:${sk2Width}%;background:#f4b33e;"></div>
                <div style="width:${sk3Width}%;background:#48c8f0;"></div>
              </div>
              <div class="chips" style="margin-top:6px;">
                <span class="badge mono">Vor MANV ${baselineNotaufnahme}</span>
                <span class="badge mono" style="color:#e35f62;">SK I ${allocationBreakdown["SK I"]}</span>
                <span class="badge mono" style="color:#f4b33e;">SK II ${allocationBreakdown["SK II"]}</span>
                <span class="badge mono" style="color:#48c8f0;">SK III ${allocationBreakdown["SK III"]}</span>
              </div>
            </div>
          ` : ""}
          <div class="row-between" style="gap:8px; margin-top:8px;">
            <button class="btn" id="escalate-hospital">Stufe erhoehen</button>
            <button class="btn ${selectedHospital.excludedFromAllocation ? "danger" : ""}" id="toggle-exclusion">${selectedHospital.excludedFromAllocation ? "Wieder aufnehmen" : "Aus Zuteilung nehmen"}</button>
          </div>
          <div style="margin-top:12px;" class="list">
            ${Object.entries(selectedHospital.disciplines).map(([discipline, cap]) => {
              const ratio = cap.bedsTotal ? cap.bedsOccupied / cap.bedsTotal : 0;
              return `
                <div>
                  <div class="row-between">
                    <span>${state.data.disciplineLabels[discipline] || discipline}</span>
                    <span class="mono">${cap.bedsOccupied}/${cap.bedsTotal}${cap.surgeActive ? " [surge]" : ""}</span>
                  </div>
                  <div style="height:6px;background:var(--bg-3);margin-top:4px;">
                    <div style="height:100%;width:${Math.min(100, ratio * 100)}%;background:${occupancyColor(ratio)};"></div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
          ${history.length >= 2 ? `<div class="spark">${history.map((entry) => `<span style="height:${Math.max(8, entry.occupancy[selectedHospital.id] * 100)}%;"></span>`).join("")}</div>` : ""}
          `}
        </section>
      ` : ""}
      ${selectedContextHospital ? `
        <section class="section">
          <div class="panel-head">
            <span class="section-label">Kontext-Krankenhaus</span>
            <button class="btn ghost" id="close-selection">schliessen</button>
          </div>
          <div style="margin-top:8px;">${selectedContextHospital.name}</div>
          <div class="muted mono">
            ${selectedContextHospital.ort || "Unbekannter Ort"}${selectedContextHospital.bundesland ? ` &middot; ${selectedContextHospital.bundesland}` : ""}
          </div>
          <div class="stats-grid" style="margin-top:10px;">
            <span class="muted">Typ</span><span class="mono">${selectedContextHospital.art || "-"}</span>
            <span class="muted">Betten</span><span class="mono">${selectedContextHospital.betten ?? "-"}</span>
            <span class="muted">Interaktion</span><span class="mono">Kontextdaten</span>
          </div>
        </section>
      ` : ""}
    </div>
    <div class="right-panel-resizer" id="right-panel-resizer" title="Bereich anpassen"></div>
    <div class="right-panel-bottom" style="flex-basis: ${state.rightPanelBottomRatio}%;">
      <section class="section">
        <div class="panel-head"><span class="section-label">Alerts</span><span class="badge mono">${state.data.alerts.length}</span></div>
        <div class="list" style="margin-top:8px;">
          ${sortedAlerts.length ? sortedAlerts.map((alert) => `
            <div class="card alert severity-${alert.severity} ${alert.resolvedAt != null ? "resolved" : ""}">
              <div class="row-between"><span class="section-label">${alert.severity}</span><span class="muted mono">${formatAgo(state.data.simTime - alert.firedAt)}</span></div>
              <div style="margin-top:6px;">${alert.title}</div>
              <div class="muted mono">${alert.detail}</div>
            </div>
          `).join("") : `<div class="muted">Keine Alerts.</div>`}
        </div>
      </section>
      <section class="section">
        <div class="panel-head"><span class="section-label">Empfehlungen</span><span class="badge mono">${executableRecommendations.length}</span></div>
        <div class="list" style="margin-top:8px;">
          ${executableRecommendations.length ? executableRecommendations.map((rec) => `
            <div class="card">
              <div class="row-between">
                <div>${rec.title}</div>
                <span class="badge mono">${rec.effortLevel}</span>
              </div>
              <div class="muted mono" style="margin-top:6px;">${rec.rationale}</div>
              <div class="chips">
                ${rec.expectedImpact.bedsGained ? `<span class="badge mono">+${rec.expectedImpact.bedsGained} Betten</span>` : ""}
                ${rec.expectedImpact.timeBoughtMin ? `<span class="badge mono">+${rec.expectedImpact.timeBoughtMin} min</span>` : ""}
                ${rec.expectedImpact.patientsRerouted ? `<span class="badge mono">${rec.expectedImpact.patientsRerouted} umgeleitet</span>` : ""}
              </div>
              <button class="btn accent execute-rec" data-id="${rec.id}">Ausfuehren</button>
            </div>
          `).join("") : `<div class="muted">Keine Empfehlungen.</div>`}
        </div>
      </section>
    </div>
  `;
  const close = document.getElementById("close-selection");
  if (close) close.onclick = () => { state.selection = null; renderRightPanel(); renderMap(); };
  right.querySelectorAll(".hospital-tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.rightPanelHospitalTab = button.dataset.tab || "details";
      renderRightPanel();
    });
  });
  const escalate = document.getElementById("escalate-hospital");
  if (escalate) escalate.onclick = () => api(`/api/hospitals/${selectedHospital.id}/escalate`);
  const exclusion = document.getElementById("toggle-exclusion");
  if (exclusion) exclusion.onclick = () => api(`/api/hospitals/${selectedHospital.id}/toggle-exclusion`);
  right.querySelectorAll(".execute-rec").forEach((button) => {
    button.addEventListener("click", () => api(`/api/recommendations/${button.dataset.id}/execute`));
  });
  const resizer = document.getElementById("right-panel-resizer");
  if (resizer) {
    resizer.onmousedown = (event) => {
      event.preventDefault();
      const sidebar = document.getElementById("right-panel");
      if (!sidebar) return;
      const bounds = sidebar.getBoundingClientRect();
      const onMove = (moveEvent) => {
        const offsetFromTop = moveEvent.clientY - bounds.top;
        const nextTopRatio = Math.max(20, Math.min(80, (offsetFromTop / bounds.height) * 100));
        state.rightPanelBottomRatio = 100 - nextTopRatio;
        renderRightPanel();
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    };
  }
}

function renderTimeline() {
  const timeline = document.getElementById("timeline");
  const cursorPct = Math.min(100, (state.data.simTime / (24 * 60)) * 100);
  timeline.innerHTML = `
    <div class="row-between">
      <span class="section-label">Timeline</span>
      <span class="mono">${formatSimTime(state.data.simTime)}</span>
    </div>
    <div class="timeline-axis">
      <div class="timeline-line"></div>
      ${state.data.incidents.map((incident) => `<div class="timeline-marker incident" style="left:${Math.min(100, (incident.startedAt / (24 * 60)) * 100)}%;" title="${incident.label}"></div>`).join("")}
      ${state.data.alerts.filter((alert) => alert.severity === "critical").map((alert) => `<div class="timeline-marker alert" style="left:${Math.min(100, (alert.firedAt / (24 * 60)) * 100)}%;" title="${alert.title}"></div>`).join("")}
      <div class="cursor" style="left:${cursorPct}%;"></div>
    </div>
  `;
}

function renderLeftPanelCollapsible() {
  const counts = patientStats();
  const activeHospitals = new Set(
    state.data.patients
      .filter((patient) => patient.assignedHospitalId && ["transport", "inTreatment"].includes(patient.status))
      .map((patient) => patient.assignedHospitalId)
  ).size;
  const left = document.getElementById("left-panel");
  const sections = state.leftSections;
  const thresholds = state.data.manvSettings.transportThresholds;
  const capacityMode = state.data.manvSettings.capacityMode || "available";
  const totalManv = Object.values(state.manvForm.counts).reduce((sum, value) => sum + Number(value || 0), 0);
  const totalVorplanung = Object.values(state.vorplanungForm.counts).reduce((sum, value) => sum + Number(value || 0), 0);
  const currentPlan = state.data.vorplanung;
  const activeElement = document.activeElement;
  const activeId = activeElement && "id" in activeElement ? activeElement.id : null;
  const activeSelectionStart =
    activeElement && typeof activeElement.selectionStart === "number"
      ? activeElement.selectionStart
      : null;
  const activeSelectionEnd =
    activeElement && typeof activeElement.selectionEnd === "number"
      ? activeElement.selectionEnd
      : null;

  left.innerHTML = `
    <section class="section">
      <div class="panel-head">
        <button class="btn ghost section-toggle" data-section="manv">${sections.manv ? "&#9662;" : "&#9656;"} MANV</button>
      </div>
      ${sections.manv ? `
        <label class="field"><span>Adresse</span><span></span><input type="text" id="manv-address" value="${state.manvForm.address}" placeholder="Adresse eingeben"></label>
        ${state.manvForm.suggestions.length ? `<div class="list">${state.manvForm.suggestions.map((item, index) => `<button class="btn ghost address-suggestion" data-target="manv" data-index="${index}" style="text-align:left;">${item.label}</button>`).join("")}</div>` : ""}
        ${state.manvForm.lat != null ? `<div class="muted mono" style="margin:8px 0;">${state.manvForm.lat.toFixed(5)}, ${state.manvForm.lng.toFixed(5)}</div>` : ""}
        <label class="field"><span>SK I</span><span></span><input type="text" inputmode="numeric" pattern="[0-9]*" id="manv-sk1" value="${state.manvForm.counts.SK1}"></label>
        <label class="field"><span>SK II</span><span></span><input type="text" inputmode="numeric" pattern="[0-9]*" id="manv-sk2" value="${state.manvForm.counts.SK2}"></label>
        <label class="field"><span>SK III</span><span></span><input type="text" inputmode="numeric" pattern="[0-9]*" id="manv-sk3" value="${state.manvForm.counts.SK3}"></label>
        <div class="settings-group" style="margin-top:10px;">
          <div class="section-label">Kapazitaet</div>
          <div class="checkbox-list" style="margin-top:8px;">
            <label><input type="radio" name="capacity-mode" value="available" ${capacityMode === "available" ? "checked" : ""}> <span>Aktuelle Situation</span></label>
            <label><input type="radio" name="capacity-mode" value="empty" ${capacityMode === "empty" ? "checked" : ""}> <span>Notaufnahme leer</span></label>
          </div>
        </div>
        <button class="btn primary" id="start-manv" style="width:100%;" ${state.manvForm.lat == null || totalManv <= 0 ? "disabled" : ""}>MANV verteilen</button>
      ` : ""}
    </section>
    <section class="section">
      <div class="panel-head">
        <button class="btn ghost section-toggle" data-section="vorplanung">${sections.vorplanung ? "&#9662;" : "&#9656;"} Vorplanung</button>
      </div>
      ${sections.vorplanung ? `
        <label class="field"><span>Datum</span><span></span><input type="date" id="vorplanung-date" value="${state.vorplanungForm.date}"></label>
        <label class="field"><span>Adresse</span><span></span><input type="text" id="vorplanung-address" value="${state.vorplanungForm.address}" placeholder="Adresse eingeben"></label>
        ${state.vorplanungForm.suggestions.length ? `<div class="list">${state.vorplanungForm.suggestions.map((item, index) => `<button class="btn ghost address-suggestion" data-target="vorplanung" data-index="${index}" style="text-align:left;">${item.label}</button>`).join("")}</div>` : ""}
        ${state.vorplanungForm.lat != null ? `<div class="muted mono" style="margin:8px 0;">${state.vorplanungForm.lat.toFixed(5)}, ${state.vorplanungForm.lng.toFixed(5)}</div>` : ""}
        <label class="field"><span>SK I</span><span></span><input type="text" inputmode="numeric" pattern="[0-9]*" id="vorplanung-sk1" value="${state.vorplanungForm.counts.SK1}"></label>
        <label class="field"><span>SK II</span><span></span><input type="text" inputmode="numeric" pattern="[0-9]*" id="vorplanung-sk2" value="${state.vorplanungForm.counts.SK2}"></label>
        <label class="field"><span>SK III</span><span></span><input type="text" inputmode="numeric" pattern="[0-9]*" id="vorplanung-sk3" value="${state.vorplanungForm.counts.SK3}"></label>
        <button class="btn primary" id="start-vorplanung" style="width:100%;" ${state.vorplanungForm.lat == null || totalVorplanung <= 0 || !state.vorplanungForm.date ? "disabled" : ""}>Vorplanung speichern</button>
        ${currentPlan ? `
          <div class="settings-group" style="margin-top:10px;">
            <div class="section-label">Gespeichert</div>
            <div class="muted mono" style="margin-top:6px;">${currentPlan.date}</div>
            <div class="muted mono">${currentPlan.address}</div>
          </div>
        ` : ""}
      ` : ""}
    </section>
    <section class="section">
      <div class="panel-head">
        <button class="btn ghost section-toggle" data-section="settings">${sections.settings ? "&#9662;" : "&#9656;"} Einstellungen</button>
      </div>
      ${sections.settings ? `
        <div class="settings-group">
          <div class="section-label">Karte</div>
          <div class="checkbox-list" style="margin-top:8px;">
            <label><input type="checkbox" id="toggle-context-hospitals" ${state.showContextHospitals ? "checked" : ""}> <span>Kontext-Krankenhaeuser anzeigen</span></label>
          </div>
        </div>
        <div class="settings-group">
          <div class="section-label">Transportzeiten</div>
          <div class="muted" style="font-size:12px; margin:6px 0 10px;">Grenzwerte fuer Warnung und Zuweisung je Sichtungskategorie.</div>
          <label class="field"><span>SK I max. Min.</span><span></span><input type="text" inputmode="numeric" pattern="[0-9]*" id="threshold-sk1" value="${thresholds.SK1}"></label>
          <label class="field"><span>SK II max. Min.</span><span></span><input type="text" inputmode="numeric" pattern="[0-9]*" id="threshold-sk2" value="${thresholds.SK2}"></label>
          <label class="field"><span>SK III max. Min.</span><span></span><input type="text" inputmode="numeric" pattern="[0-9]*" id="threshold-sk3" value="${thresholds.SK3}"></label>
        </div>
      ` : ""}
    </section>
    <section class="section">
      <div class="panel-head">
        <button class="btn ghost section-toggle" data-section="filters">${sections.filters ? "&#9662;" : "&#9656;"} Filter</button>
        ${sections.filters ? `<button class="btn ghost" id="reset-filters">Reset</button>` : ""}
      </div>
      ${sections.filters ? `
        <label class="field"><span>Freie Betten</span><span class="muted mono">&#8805;</span><input type="text" inputmode="numeric" pattern="[0-9]*" id="filter-free" value="${state.data.filters.freeMin || ""}"></label>
        <label class="field"><span>Belegte Betten</span><span class="muted mono">&#8804;</span><input type="text" inputmode="numeric" pattern="[0-9]*" id="filter-occupied" value="${state.data.filters.occupiedMax || ""}"></label>
        <label class="field"><span>Notfallbetten</span><span class="muted mono">&#8805;</span><input type="text" inputmode="numeric" pattern="[0-9]*" id="filter-emergency" value="${state.data.filters.emergencyMin || ""}"></label>
      ` : ""}
    </section>
    <section class="section">
      <div class="panel-head">
        <button class="btn ghost section-toggle" data-section="patients">${sections.patients ? "&#9662;" : "&#9656;"} Patienten</button>
      </div>
      ${sections.patients ? `
        <div class="stats-grid" style="margin-top:8px;">
          <span class="muted">Geplant</span><span class="mono">${counts.onScenePlanned}</span>
          <span class="muted">Transport</span><span class="mono">${counts.transport}</span>
          <span class="muted">Behandlung</span><span class="mono">${counts.inTreatment}</span>
          <span class="muted">Entlassen</span><span class="mono">${counts.discharged}</span>
          <span class="muted">Verstorben</span><span class="mono">${counts.deceased}</span>
          <span class="muted">Unvermittelt</span><span class="mono" style="color:${counts.onSceneUnassigned ? "var(--accent-red)" : "inherit"}">${counts.onSceneUnassigned}</span>
          <span class="muted">Haeuser aktiv</span><span class="mono">${activeHospitals}</span>
        </div>
      ` : ""}
    </section>
    <section class="section">
      <div class="panel-head">
        <button class="btn ghost section-toggle" data-section="legend">${sections.legend ? "&#9662;" : "&#9656;"} Legende</button>
      </div>
      ${sections.legend ? `
        <div class="legend" style="margin-top:8px;">
          <div><span class="legend-dot" style="background:var(--accent-green)"></span>Gruen: Auslastung unter 70 %</div>
          <div><span class="legend-dot" style="background:var(--accent-amber)"></span>Orange: Auslastung 70 % bis 95 %</div>
          <div><span class="legend-dot" style="background:var(--accent-red)"></span>Rot: Auslastung ueber 95 %</div>
          <div><span class="legend-dot" style="border:2px solid var(--accent-cyan); background:transparent"></span>Cyan-Ring: beteiligtes Krankenhaus</div>
          <div><span class="legend-dot" style="background:#36d1dc"></span>Blau: MANV-Ort</div>
        </div>
      ` : ""}
    </section>
  `;

  left.querySelectorAll(".section-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      state.leftSections[button.dataset.section] = !state.leftSections[button.dataset.section];
      renderLeftPanelCollapsible();
    });
  });

  [["manv", state.manvForm], ["vorplanung", state.vorplanungForm]].forEach(([target, form]) => {
    const addressInput = document.getElementById(`${target}-address`);
    if (addressInput) {
      addressInput.oninput = (event) => {
        form.address = event.target.value;
        form.lat = null;
        form.lng = null;
        if (state.geocodeTimer) clearTimeout(state.geocodeTimer);
        state.geocodeTimer = setTimeout(() => {
          fetchAddressSuggestions(event.target.value, target);
        }, 250);
      };
    }
  });

  const vorplanungDate = document.getElementById("vorplanung-date");
  if (vorplanungDate) {
    vorplanungDate.onchange = (event) => {
      state.vorplanungForm.date = event.target.value;
      const button = document.getElementById("start-vorplanung");
      if (button) {
        const currentTotal = Object.values(state.vorplanungForm.counts).reduce((sum, value) => sum + Number(value || 0), 0);
        button.disabled = state.vorplanungForm.lat == null || currentTotal <= 0 || !state.vorplanungForm.date;
      }
    };
  }

  left.querySelectorAll(".address-suggestion").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.target;
      const form = target === "vorplanung" ? state.vorplanungForm : state.manvForm;
      const item = form.suggestions[Number(button.dataset.index)];
      form.address = item.label;
      form.lat = item.lat;
      form.lng = item.lng;
      form.suggestions = [];
      renderLeftPanelCollapsible();
    });
  });

  [["manv", state.manvForm], ["vorplanung", state.vorplanungForm]].forEach(([target, form]) => {
    ["SK1", "SK2", "SK3"].forEach((key) => {
      const input = document.getElementById(`${target}-${key.toLowerCase()}`);
      if (input) {
        input.oninput = (event) => {
          const cleaned = String(event.target.value || "").replace(/[^\d]/g, "");
          event.target.value = cleaned;
          form.counts[key] = parseNonNegativeInt(cleaned, 0);
          const button = document.getElementById(target === "manv" ? "start-manv" : "start-vorplanung");
          if (button) {
            const currentTotal = Object.values(form.counts).reduce((sum, value) => sum + Number(value || 0), 0);
            button.disabled = form.lat == null || currentTotal <= 0 || (target === "vorplanung" && !state.vorplanungForm.date);
          }
        };
      }
    });
  });

  const startManv = document.getElementById("start-manv");
  if (startManv) {
    startManv.onclick = () => api("/api/manv", {
      body: {
        address: state.manvForm.address,
        lat: state.manvForm.lat,
        lng: state.manvForm.lng,
        counts: state.manvForm.counts,
      },
    });
  }

  const startVorplanung = document.getElementById("start-vorplanung");
  if (startVorplanung) {
    startVorplanung.onclick = () => api("/api/vorplanung", {
      body: {
        date: state.vorplanungForm.date,
        address: state.vorplanungForm.address,
        lat: state.vorplanungForm.lat,
        lng: state.vorplanungForm.lng,
        counts: state.vorplanungForm.counts,
      },
    });
  }

  const toggleContext = document.getElementById("toggle-context-hospitals");
  if (toggleContext) toggleContext.onchange = (event) => { state.showContextHospitals = event.target.checked; renderMap(); };

  ["SK1", "SK2", "SK3"].forEach((key) => {
    const input = document.getElementById(`threshold-${key.toLowerCase()}`);
    if (input) {
      input.oninput = (event) => {
        event.target.value = String(event.target.value || "").replace(/[^\d]/g, "");
      };
      input.onchange = () => api("/api/settings/manv", { body: { transportThresholds: { SK1: Math.max(1, parseNonNegativeInt(document.getElementById("threshold-sk1")?.value, 10)), SK2: Math.max(1, parseNonNegativeInt(document.getElementById("threshold-sk2")?.value, 15)), SK3: Math.max(1, parseNonNegativeInt(document.getElementById("threshold-sk3")?.value, 30)) } } });
    }
  });

  left.querySelectorAll('input[name="capacity-mode"]').forEach((radio) => {
    radio.onchange = () => {
      if (!radio.checked) return;
      api("/api/settings/manv", { body: { capacityMode: radio.value } });
    };
  });

  const resetFilters = document.getElementById("reset-filters");
  if (resetFilters) resetFilters.onclick = () => api("/api/filters/reset");
  ["free", "occupied", "emergency"].forEach((name) => {
    const input = document.getElementById(`filter-${name}`);
    if (input) {
      input.addEventListener("input", (event) => {
        event.target.value = String(event.target.value || "").replace(/[^\d]/g, "");
      });
      input.addEventListener("change", () => api("/api/filters", { body: { freeMin: parseNonNegativeInt(document.getElementById("filter-free")?.value, 0), occupiedMax: parseNonNegativeInt(document.getElementById("filter-occupied")?.value, 0), emergencyMin: parseNonNegativeInt(document.getElementById("filter-emergency")?.value, 0) } }));
    }
  });

  if (activeId) {
    const nextActive = document.getElementById(activeId);
    if (nextActive) {
      nextActive.focus();
      if (
        typeof nextActive.setSelectionRange === "function" &&
        activeSelectionStart != null &&
        activeSelectionEnd != null
      ) {
        nextActive.setSelectionRange(activeSelectionStart, activeSelectionEnd);
      }
    }
  }
}

function render() {
  renderTopbar();
  renderLeftPanelCollapsible();
  renderMap();
  renderRightPanel();
  renderTimeline();
}

document.addEventListener("keydown", (event) => {
  if (!state.data) return;
  if (event.code === "Space") {
    event.preventDefault();
    api("/api/control/toggle-pause");
  } else if (event.key === "r" || event.key === "R") {
    api("/api/control/reset");
  } else if (["1", "2", "3", "4", "5"].includes(event.key)) {
    api("/api/control/speed", { body: { speed: speedOptions[Number(event.key) - 1] } });
  } else if (event.key === "Escape") {
    state.selection = null;
    renderRightPanel();
    renderMap();
  }
});

fetchState();
