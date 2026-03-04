const WS_URL = "ws://192.168.1.217:8765";
const statusEl = document.getElementById("status");
const endpointEl = document.getElementById("endpoint");
const latestEl = document.getElementById("latest");
const fillColorEl = document.getElementById("fill-color");
const fillOpacityEl = document.getElementById("fill-opacity");
const fillOpacityValueEl = document.getElementById("fill-opacity-value");
const wireColorEl = document.getElementById("wire-color");
const wireOpacityEl = document.getElementById("wire-opacity");
const wireOpacityValueEl = document.getElementById("wire-opacity-value");
const wireVisibleEl = document.getElementById("wire-visible");
const resetStyleEl = document.getElementById("reset-style");

const DEFAULT_ORB_STYLE = {
  fillColor: "#5e07c3",
  fillOpacity: 0.2,
  wireColor: "#76f3f7",
  wireOpacity: 0.5,
  wireVisible: true,
};

let orbMissingWarned = false;

function setStatus(state, text) {
  statusEl.dataset.state = state;
  statusEl.textContent = text;
}

if (endpointEl) {
  endpointEl.textContent = WS_URL;
}

function setOpacityLabels() {
  if (fillOpacityValueEl) fillOpacityValueEl.textContent = Number(fillOpacityEl.value).toFixed(2);
  if (wireOpacityValueEl) wireOpacityValueEl.textContent = Number(wireOpacityEl.value).toFixed(2);
}

function readStyleFromControls() {
  return {
    fillColor: fillColorEl.value,
    fillOpacity: Number(fillOpacityEl.value),
    wireColor: wireColorEl.value,
    wireOpacity: Number(wireOpacityEl.value),
    wireVisible: wireVisibleEl.checked,
  };
}

function writeStyleToControls(style) {
  fillColorEl.value = style.fillColor;
  fillOpacityEl.value = String(style.fillOpacity);
  wireColorEl.value = style.wireColor;
  wireOpacityEl.value = String(style.wireOpacity);
  wireVisibleEl.checked = Boolean(style.wireVisible);
  setOpacityLabels();
}

function applyOrbStyleFromControls() {
  if (!window.orb || typeof window.orb.setStyle !== "function") return;
  window.orb.setStyle(readStyleFromControls());
}

function initializeOrbControls() {
  if (
    !fillColorEl ||
    !fillOpacityEl ||
    !fillOpacityValueEl ||
    !wireColorEl ||
    !wireOpacityEl ||
    !wireOpacityValueEl ||
    !wireVisibleEl ||
    !resetStyleEl
  ) {
    return;
  }

  const onInput = () => {
    setOpacityLabels();
    applyOrbStyleFromControls();
  };

  fillColorEl.addEventListener("input", onInput);
  fillOpacityEl.addEventListener("input", onInput);
  wireColorEl.addEventListener("input", onInput);
  wireOpacityEl.addEventListener("input", onInput);
  wireVisibleEl.addEventListener("change", onInput);

  resetStyleEl.addEventListener("click", () => {
    writeStyleToControls(DEFAULT_ORB_STYLE);
    applyOrbStyleFromControls();
  });

  setOpacityLabels();

  const syncFromOrb = () => {
    if (!window.orb || typeof window.orb.getStyle !== "function") return;
    writeStyleToControls(window.orb.getStyle());
    applyOrbStyleFromControls();
  };

  window.addEventListener("orb-ready", syncFromOrb, { once: true });
  if (window.orb && typeof window.orb.getStyle === "function") {
    syncFromOrb();
  }
}

function extractDirection(data) {
  if (!data || typeof data !== "object") return null;
  const source = data.dir && typeof data.dir === "object" ? data.dir : data;
  const x = Number(source.x);
  const y = Number(source.y);
  const z = Number(source.z);
  if (![x, y, z].every((v) => Number.isFinite(v))) return null;
  return { x, y, z };
}

function handleMessage(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn("Invalid JSON message:", raw);
    return;
  }

  const dir = extractDirection(parsed);
  if (!dir) {
    console.warn("Unexpected DOA message shape:", parsed);
    return;
  }

  const data = {
    dir,
  };

  latestEl.textContent = JSON.stringify(data, null, 2);

  if (window.orb && typeof window.orb.update === "function") {
    orbMissingWarned = false;
    window.orb.update(data);
  } else {
    if (!orbMissingWarned) {
      console.warn("window.orb.update(data) is not available yet.");
      orbMissingWarned = true;
    }
  }
}

function connect() {
  setStatus("connecting", "Connecting...");
  const ws = new WebSocket(WS_URL);

  ws.addEventListener("open", () => {
    setStatus("open", "Connected");
  });

  ws.addEventListener("message", (event) => {
    handleMessage(event.data);
  });

  ws.addEventListener("close", () => {
    setStatus("closed", "Disconnected (retrying in 2s)");
    setTimeout(connect, 2000);
  });

  ws.addEventListener("error", () => {
    setStatus("error", "Connection error");
  });
}

initializeOrbControls();
connect();
