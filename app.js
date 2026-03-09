const WS_URL = "ws://192.168.1.217:8765";

const statusEl = document.getElementById("status");
const endpointEl = document.getElementById("endpoint");
const latestEl = document.getElementById("latest");

const modeFacesEl = document.getElementById("mode-faces");
const modeWireframeEl = document.getElementById("mode-wireframe");
const modeArrowEl = document.getElementById("mode-arrow");
const modeFurhatEl = document.getElementById("mode-furhat");

const styleControlsRowEl = document.getElementById("style-controls-row");

const facesControlsEl = document.getElementById("controls-faces");
const wireControlsEl = document.getElementById("controls-wireframe");
const arrowControlsEl = document.getElementById("controls-arrow");
const furhatControlsEl = document.getElementById("controls-furhat");

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

const arrowColorEl = document.getElementById("arrow-color");
const arrowLengthScaleEl = document.getElementById("arrow-length-scale");
const arrowLengthScaleValueEl = document.getElementById("arrow-length-scale-value");
const arrowIdlePulseEl = document.getElementById("arrow-idle-pulse");
const arrowIdlePulseValueEl = document.getElementById("arrow-idle-pulse-value");
const arrowResetEl = document.getElementById("arrow-reset-style");

const furhatAccentColorEl = document.getElementById("furhat-accent-color");
const furhatTurnGainEl = document.getElementById("furhat-turn-gain");
const furhatTurnGainValueEl = document.getElementById("furhat-turn-gain-value");
const furhatBobAmountEl = document.getElementById("furhat-bob-amount");
const furhatBobAmountValueEl = document.getElementById("furhat-bob-amount-value");
const furhatResetEl = document.getElementById("furhat-reset-style");

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
  arrow: {
    arrowColor: "#4de7c8",
    lengthScale: 1,
    idlePulse: 0.28,
  },
  furhat: {
    accentColor: "#22d6ff",
    turnGain: 1,
    bobAmount: 0.16,
  },
};

function getOrbMode() {
  const fromUrl = new URLSearchParams(window.location.search).get("orbStyle");
  if (fromUrl === "faces" || fromUrl === "wireframe" || fromUrl === "arrow" || fromUrl === "furhat") {
    return fromUrl;
  }
  if (
    window.__orbStyle === "faces" ||
    window.__orbStyle === "wireframe" ||
    window.__orbStyle === "arrow" ||
    window.__orbStyle === "furhat"
  ) {
    return window.__orbStyle;
  }
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

function clampLengthScale(value) {
  return Math.max(0.5, Math.min(2.5, value));
}

function clampIdlePulse(value) {
  return Math.max(0, Math.min(1, value));
}

function clampTurnGain(value) {
  return Math.max(0.2, Math.min(2.5, value));
}

function clampBobAmount(value) {
  return Math.max(0, Math.min(0.4, value));
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
  if (!modeFacesEl || !modeWireframeEl || !modeArrowEl || !modeFurhatEl) return;

  const isFaces = mode === "faces";
  const isWireframe = mode === "wireframe";
  const isArrow = mode === "arrow";
  const isFurhat = mode === "furhat";

  modeFacesEl.dataset.active = isFaces ? "true" : "false";
  modeWireframeEl.dataset.active = isWireframe ? "true" : "false";
  modeArrowEl.dataset.active = isArrow ? "true" : "false";
  modeFurhatEl.dataset.active = isFurhat ? "true" : "false";

  modeFacesEl.setAttribute("aria-pressed", isFaces ? "true" : "false");
  modeWireframeEl.setAttribute("aria-pressed", isWireframe ? "true" : "false");
  modeArrowEl.setAttribute("aria-pressed", isArrow ? "true" : "false");
  modeFurhatEl.setAttribute("aria-pressed", isFurhat ? "true" : "false");
}

function setControlPanelsVisible(mode) {
  if (!facesControlsEl || !wireControlsEl || !arrowControlsEl || !furhatControlsEl) return;

  facesControlsEl.classList.toggle("hidden", mode !== "faces");
  wireControlsEl.classList.toggle("hidden", mode !== "wireframe");
  arrowControlsEl.classList.toggle("hidden", mode !== "arrow");
  furhatControlsEl.classList.toggle("hidden", mode !== "furhat");

  if (styleControlsRowEl) {
    const hasModeControls = mode === "faces" || mode === "wireframe" || mode === "arrow" || mode === "furhat";
    styleControlsRowEl.classList.toggle("hidden", !hasModeControls);
  }
}

function switchOrbMode(mode) {
  if (mode !== "faces" && mode !== "wireframe" && mode !== "arrow" && mode !== "furhat") return;
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

  if (ORB_MODE === "wireframe") {
    return {
      fillColor: normalizeColor(wireFillColorEl.value, DEFAULT_STYLE.wireframe.fillColor),
      fillOpacity: clamp01(Number(wireFillOpacityEl.value)),
      wireColor: normalizeColor(wireLineColorEl.value, DEFAULT_STYLE.wireframe.wireColor),
      wireOpacity: clamp01(Number(wireLineOpacityEl.value)),
    };
  }

  if (ORB_MODE === "arrow") {
    return {
      arrowColor: normalizeColor(arrowColorEl.value, DEFAULT_STYLE.arrow.arrowColor),
      lengthScale: clampLengthScale(Number(arrowLengthScaleEl.value)),
      idlePulse: clampIdlePulse(Number(arrowIdlePulseEl.value)),
    };
  }

  if (ORB_MODE === "furhat") {
    return {
      accentColor: normalizeColor(furhatAccentColorEl.value, DEFAULT_STYLE.furhat.accentColor),
      turnGain: clampTurnGain(Number(furhatTurnGainEl.value)),
      bobAmount: clampBobAmount(Number(furhatBobAmountEl.value)),
    };
  }

  return {};
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

  if (ORB_MODE === "wireframe") {
    const s = { ...DEFAULT_STYLE.wireframe, ...rawStyle };
    wireFillColorEl.value = normalizeColor(s.fillColor, DEFAULT_STYLE.wireframe.fillColor);
    wireFillOpacityEl.value = String(clamp01(Number(s.fillOpacity)));
    wireLineColorEl.value = normalizeColor(s.wireColor, DEFAULT_STYLE.wireframe.wireColor);
    wireLineOpacityEl.value = String(clamp01(Number(s.wireOpacity)));

    wireFillOpacityValueEl.textContent = format2(wireFillOpacityEl.value);
    wireLineOpacityValueEl.textContent = format2(wireLineOpacityEl.value);
    return;
  }

  if (ORB_MODE === "arrow") {
    const s = { ...DEFAULT_STYLE.arrow, ...rawStyle };
    arrowColorEl.value = normalizeColor(s.arrowColor, DEFAULT_STYLE.arrow.arrowColor);
    arrowLengthScaleEl.value = String(clampLengthScale(Number(s.lengthScale)));
    arrowIdlePulseEl.value = String(clampIdlePulse(Number(s.idlePulse)));

    arrowLengthScaleValueEl.textContent = format2(arrowLengthScaleEl.value);
    arrowIdlePulseValueEl.textContent = format2(arrowIdlePulseEl.value);
    return;
  }

  if (ORB_MODE === "furhat") {
    const s = { ...DEFAULT_STYLE.furhat, ...rawStyle };
    furhatAccentColorEl.value = normalizeColor(s.accentColor, DEFAULT_STYLE.furhat.accentColor);
    furhatTurnGainEl.value = String(clampTurnGain(Number(s.turnGain)));
    furhatBobAmountEl.value = String(clampBobAmount(Number(s.bobAmount)));

    furhatTurnGainValueEl.textContent = format2(furhatTurnGainEl.value);
    furhatBobAmountValueEl.textContent = format2(furhatBobAmountEl.value);
  }
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

  if (modeArrowEl) {
    modeArrowEl.addEventListener("click", () => {
      if (ORB_MODE !== "arrow") switchOrbMode("arrow");
    });
  }

  if (modeFurhatEl) {
    modeFurhatEl.addEventListener("click", () => {
      if (ORB_MODE !== "furhat") switchOrbMode("furhat");
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
  } else if (ORB_MODE === "wireframe") {
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
  } else if (ORB_MODE === "arrow") {
    const onInput = () => {
      writeStyleToControls(readStyleFromControls());
      applyOrbStyleFromControls();
    };

    arrowColorEl.addEventListener("input", onInput);
    arrowLengthScaleEl.addEventListener("input", onInput);
    arrowIdlePulseEl.addEventListener("input", onInput);

    arrowResetEl.addEventListener("click", () => {
      writeStyleToControls(DEFAULT_STYLE.arrow);
      applyOrbStyleFromControls();
    });

    writeStyleToControls(DEFAULT_STYLE.arrow);
  } else if (ORB_MODE === "furhat") {
    const onInput = () => {
      writeStyleToControls(readStyleFromControls());
      applyOrbStyleFromControls();
    };

    furhatAccentColorEl.addEventListener("input", onInput);
    furhatTurnGainEl.addEventListener("input", onInput);
    furhatBobAmountEl.addEventListener("input", onInput);

    furhatResetEl.addEventListener("click", () => {
      writeStyleToControls(DEFAULT_STYLE.furhat);
      applyOrbStyleFromControls();
    });

    writeStyleToControls(DEFAULT_STYLE.furhat);
  } else {
    return;
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
