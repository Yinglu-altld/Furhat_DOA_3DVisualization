const WS_URL = "ws://192.168.1.217:8765";

const statusEl = document.getElementById("status");
const endpointEl = document.getElementById("endpoint");
const latestEl = document.getElementById("latest");

const modeFacesEl = document.getElementById("mode-faces");
const modeWireframeEl = document.getElementById("mode-wireframe");

const facesControlsEl = document.getElementById("controls-faces");
const wireControlsEl = document.getElementById("controls-wireframe");

const facesFillColorEl = document.getElementById("faces-fill-color");
const facesFillOpacityEl = document.getElementById("faces-fill-opacity");
const facesFillOpacityValueEl = document.getElementById("faces-fill-opacity-value");
const facesExplodeEl = document.getElementById("faces-explode");
const facesExplodeValueEl = document.getElementById("faces-explode-value");
const facesResetEl = document.getElementById("faces-reset-style");

const wireFillColorEl = document.getElementById("wire-fill-color");
const wireFillOpacityEl = document.getElementById("wire-fill-opacity");
const wireFillOpacityValueEl = document.getElementById("wire-fill-opacity-value");
const wireLineColorEl = document.getElementById("wire-line-color");
const wireLineOpacityEl = document.getElementById("wire-line-opacity");
const wireLineOpacityValueEl = document.getElementById("wire-line-opacity-value");
const wireResetEl = document.getElementById("wire-reset-style");

const DEFAULT_STYLE = {
  faces: {
    fillColor: "#0000ff",
    fillOpacity: 0.3,
    explodeAmount: 0.1,
  },
  wireframe: {
    fillColor: "#5e07c3",
    fillOpacity: 0.2,
    wireColor: "#76f3f7",
    wireOpacity: 0.5,
  },
};

function getOrbMode() {
  const fromUrl = new URLSearchParams(window.location.search).get("orbStyle");
  if (fromUrl === "faces" || fromUrl === "wireframe") return fromUrl;
  if (window.__orbStyle === "faces" || window.__orbStyle === "wireframe") return window.__orbStyle;
  return "faces";
}

const ORB_MODE = getOrbMode();
let orbMissingWarned = false;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function clampExplode(value) {
  return Math.max(0, Math.min(0.3, value));
}

function normalizeColor(value, fallback) {
  if (typeof value !== "string") return fallback;
  const hex = value.startsWith("#") ? value.slice(1) : value;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  return `#${hex.toLowerCase()}`;
}

function format2(value) {
  return Number(value).toFixed(2);
}

function setStatus(state, text) {
  statusEl.dataset.state = state;
  statusEl.textContent = text;
}

function setModeButtonsActive(mode) {
  if (!modeFacesEl || !modeWireframeEl) return;
  const isFaces = mode === "faces";
  modeFacesEl.dataset.active = isFaces ? "true" : "false";
  modeWireframeEl.dataset.active = isFaces ? "false" : "true";
  modeFacesEl.setAttribute("aria-pressed", isFaces ? "true" : "false");
  modeWireframeEl.setAttribute("aria-pressed", isFaces ? "false" : "true");
}

function setControlPanelsVisible(mode) {
  if (!facesControlsEl || !wireControlsEl) return;
  facesControlsEl.classList.toggle("hidden", mode !== "faces");
  wireControlsEl.classList.toggle("hidden", mode !== "wireframe");
}

function switchOrbMode(mode) {
  if (mode !== "faces" && mode !== "wireframe") return;
  const url = new URL(window.location.href);
  url.searchParams.set("orbStyle", mode);
  window.location.href = url.toString();
}
window.switchOrbMode = switchOrbMode;

function readStyleFromControls() {
  if (ORB_MODE === "faces") {
    return {
      fillColor: normalizeColor(facesFillColorEl.value, DEFAULT_STYLE.faces.fillColor),
      fillOpacity: clamp01(Number(facesFillOpacityEl.value)),
      explodeAmount: clampExplode(Number(facesExplodeEl.value)),
    };
  }

  return {
    fillColor: normalizeColor(wireFillColorEl.value, DEFAULT_STYLE.wireframe.fillColor),
    fillOpacity: clamp01(Number(wireFillOpacityEl.value)),
    wireColor: normalizeColor(wireLineColorEl.value, DEFAULT_STYLE.wireframe.wireColor),
    wireOpacity: clamp01(Number(wireLineOpacityEl.value)),
  };
}

function writeStyleToControls(rawStyle = {}) {
  if (ORB_MODE === "faces") {
    const s = { ...DEFAULT_STYLE.faces, ...rawStyle };
    facesFillColorEl.value = normalizeColor(s.fillColor, DEFAULT_STYLE.faces.fillColor);
    facesFillOpacityEl.value = String(clamp01(Number(s.fillOpacity)));
    facesExplodeEl.value = String(clampExplode(Number(s.explodeAmount)));

    facesFillOpacityValueEl.textContent = format2(facesFillOpacityEl.value);
    facesExplodeValueEl.textContent = format2(facesExplodeEl.value);
    return;
  }

  const s = { ...DEFAULT_STYLE.wireframe, ...rawStyle };
  wireFillColorEl.value = normalizeColor(s.fillColor, DEFAULT_STYLE.wireframe.fillColor);
  wireFillOpacityEl.value = String(clamp01(Number(s.fillOpacity)));
  wireLineColorEl.value = normalizeColor(s.wireColor, DEFAULT_STYLE.wireframe.wireColor);
  wireLineOpacityEl.value = String(clamp01(Number(s.wireOpacity)));

  wireFillOpacityValueEl.textContent = format2(wireFillOpacityEl.value);
  wireLineOpacityValueEl.textContent = format2(wireLineOpacityEl.value);
}

function applyOrbStyleFromControls() {
  if (!window.orb || typeof window.orb.setStyle !== "function") return;
  window.orb.setStyle(readStyleFromControls());
}

function initializeModeControls() {
  setModeButtonsActive(ORB_MODE);
  setControlPanelsVisible(ORB_MODE);

  if (modeFacesEl) {
    modeFacesEl.addEventListener("click", () => {
      if (ORB_MODE !== "faces") switchOrbMode("faces");
    });
  }

  if (modeWireframeEl) {
    modeWireframeEl.addEventListener("click", () => {
      if (ORB_MODE !== "wireframe") switchOrbMode("wireframe");
    });
  }
}

function initializeStyleControls() {
  if (ORB_MODE === "faces") {
    const onInput = () => {
      writeStyleToControls(readStyleFromControls());
      applyOrbStyleFromControls();
    };

    facesFillColorEl.addEventListener("input", onInput);
    facesFillOpacityEl.addEventListener("input", onInput);
    facesExplodeEl.addEventListener("input", onInput);

    facesResetEl.addEventListener("click", () => {
      writeStyleToControls(DEFAULT_STYLE.faces);
      applyOrbStyleFromControls();
    });

    writeStyleToControls(DEFAULT_STYLE.faces);
  } else {
    const onInput = () => {
      writeStyleToControls(readStyleFromControls());
      applyOrbStyleFromControls();
    };

    wireFillColorEl.addEventListener("input", onInput);
    wireFillOpacityEl.addEventListener("input", onInput);
    wireLineColorEl.addEventListener("input", onInput);
    wireLineOpacityEl.addEventListener("input", onInput);

    wireResetEl.addEventListener("click", () => {
      writeStyleToControls(DEFAULT_STYLE.wireframe);
      applyOrbStyleFromControls();
    });

    writeStyleToControls(DEFAULT_STYLE.wireframe);
  }

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

  const data = { dir };
  latestEl.textContent = JSON.stringify(data, null, 2);

  if (window.orb && typeof window.orb.update === "function") {
    orbMissingWarned = false;
    window.orb.update(data);
  } else if (!orbMissingWarned) {
    console.warn("window.orb.update(data) is not available yet.");
    orbMissingWarned = true;
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

if (endpointEl) {
  endpointEl.textContent = WS_URL;
}

initializeModeControls();
initializeStyleControls();
connect();
