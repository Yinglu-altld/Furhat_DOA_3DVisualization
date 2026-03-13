const crypto = require("crypto");
const http = require("http");
const { URL } = require("url");

const PORT = 9000;
const INTERVAL_MS = 500;
const ACTIVE_WINDOW_MS = 4000;
const SILENT_WINDOW_MS = 3000;

const clients = new Set();

function randomUnitVector() {
  const x = Math.random() * 2 - 1;
  const y = Math.random() * 2 - 1;
  const z = Math.random() * 2 - 1;
  const length = Math.hypot(x, y, z) || 1;
  return {
    x: +(x / length).toFixed(2),
    y: +(y / length).toFixed(2),
    z: +(z / length).toFixed(2),
  };
}

function buildPayload() {
  const dir = randomUnitVector();
  return {
    x: dir.x,
    y: dir.y,
    z: dir.z,
    volume: +(80 + Math.random() * 240).toFixed(2),
  };
}

function broadcast(payload) {
  const message = JSON.stringify(payload);
  const frame = encodeTextFrame(message);
  for (const socket of clients) {
    if (!socket.destroyed) {
      socket.write(frame);
    }
  }
}

function createAcceptValue(secWebSocketKey) {
  return crypto
    .createHash("sha1")
    .update(secWebSocketKey + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11", "binary")
    .digest("base64");
}

function encodeTextFrame(text) {
  const payload = Buffer.from(text, "utf8");
  const payloadLen = payload.length;

  if (payloadLen < 126) {
    return Buffer.concat([Buffer.from([0x81, payloadLen]), payload]);
  }

  if (payloadLen < 65536) {
    const header = Buffer.from([0x81, 126, payloadLen >> 8, payloadLen & 0xff]);
    return Buffer.concat([header, payload]);
  }

  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(payloadLen), 2);
  return Buffer.concat([header, payload]);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("Mock DOA WebSocket server is running.\n");
    return;
  }
  res.writeHead(404);
  res.end();
});

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  const upgradeHeader = req.headers.upgrade;

  if (!key || upgradeHeader?.toLowerCase() !== "websocket") {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return;
  }

  const acceptValue = createAcceptValue(key);
  const responseHeaders = [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${acceptValue}`,
    "\r\n",
  ];

  socket.write(responseHeaders.join("\r\n"));
  clients.add(socket);
  console.log(`Client connected: ${req.socket.remoteAddress}`);

  socket.on("close", () => {
    clients.delete(socket);
    console.log("Client disconnected");
  });

  socket.on("error", () => {
    clients.delete(socket);
  });

  socket.on("end", () => {
    clients.delete(socket);
  });
});

server.listen(PORT, () => {
  console.log(`Mock DOA WebSocket server running at ws://localhost:${PORT}`);
});

setInterval(() => {
  const cycleMs = ACTIVE_WINDOW_MS + SILENT_WINDOW_MS;
  const cyclePosition = Date.now() % cycleMs;
  const isActive = cyclePosition < ACTIVE_WINDOW_MS;

  if (isActive) {
    broadcast(buildPayload());
  }
}, INTERVAL_MS);
