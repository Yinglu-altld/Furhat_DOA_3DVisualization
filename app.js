const WS_URL = "ws://localhost:9000";
const statusEl = document.getElementById("status");
const latestEl = document.getElementById("latest");

function setStatus(state, text) {
  statusEl.dataset.state = state;
  statusEl.textContent = text;
}

function isValidDoaData(data) {
  if (!data || typeof data !== "object") return false;
  if (!data.dir || typeof data.dir !== "object") return false;
  const { x, y, z } = data.dir;
  const { strength } = data;
  return [x, y, z, strength].every((v) => typeof v === "number" && Number.isFinite(v));
}

function handleMessage(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn("Invalid JSON message:", raw);
    return;
  }

  if (!isValidDoaData(parsed)) {
    console.warn("Unexpected DOA message shape:", parsed);
    return;
  }

  const data = {
    dir: {
      x: parsed.dir.x,
      y: parsed.dir.y,
      z: parsed.dir.z,
    },
    strength: parsed.strength,
  };

  latestEl.textContent = JSON.stringify(data, null, 2);

  if (window.orb && typeof window.orb.update === "function") {
    window.orb.update(data);
  } else {
    console.warn("window.orb.update(data) is not available yet.");
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

connect();
