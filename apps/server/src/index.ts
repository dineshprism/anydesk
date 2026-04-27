import http from "node:http";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pino from "pino";
import { WebSocketServer, type WebSocket } from "ws";
import {
  type ClientInfo,
  type SignalMessage,
  JoinPairingRequestSchema,
  parseSignalMessage,
  StartPairingRequestSchema
} from "@quder/protocol";
import { config, iceServers } from "./config.js";
import { PairingStore } from "./pairing-store.js";
import { SlidingWindowLimiter } from "./rate-limit.js";
import { verifyToken, type TokenPayload } from "./token.js";

const log = pino({ level: config.logLevel });
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024 });
const pairings = new PairingStore(config.jwtSecret, config.sessionTtlMs, config.pairCodeDigits);
const joinLimiter = new SlidingWindowLimiter(12, 60_000);

type SocketRecord = {
  ws: WebSocket;
  token: TokenPayload;
  client?: ClientInfo;
};

const hostSockets = new Map<string, SocketRecord>();
const viewerSockets = new Map<string, SocketRecord>();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false
  })
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed"));
    },
    credentials: false
  })
);
app.use(express.json({ limit: "128kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "quder-signal", ts: new Date().toISOString() });
});

app.get("/api/ice", (_req, res) => {
  res.json({ iceServers: iceServers() });
});

app.post("/api/pair/start", (req, res) => {
  const parsed = StartPairingRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
    return;
  }

  const created = pairings.create(parsed.data.deviceName, parsed.data.capabilities);
  res.status(201).json({
    pairId: created.room.pairId,
    pairCode: created.pairCode,
    hostToken: created.hostToken,
    expiresAt: new Date(created.room.expiresAt).toISOString(),
    iceServers: iceServers()
  });
});

app.post("/api/pair/join", (req, res) => {
  const remoteKey = `${req.ip}:${req.body?.pairCode ?? "missing"}`;
  if (!joinLimiter.hit(remoteKey)) {
    res.status(429).json({ error: "rate_limited" });
    return;
  }

  const parsed = JoinPairingRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
    return;
  }

  const joined = pairings.join(parsed.data.pairCode);
  if (!joined) {
    res.status(404).json({ error: "pair_not_found" });
    return;
  }

  res.status(201).json({
    pairId: joined.room.pairId,
    sessionId: joined.session.sessionId,
    viewerToken: joined.viewerToken,
    deviceName: joined.room.deviceName,
    expiresAt: new Date(joined.room.expiresAt).toISOString(),
    iceServers: iceServers()
  });
});

const webDist = resolve(process.cwd(), "apps/web/dist");
if (existsSync(webDist)) {
  app.use(express.static(webDist, { index: false, maxAge: "1h" }));
  app.get(/^\/(?!api|signal|health).*/, (_req, res) => {
    res.sendFile(join(webDist, "index.html"));
  });
}

server.on("upgrade", (req, socket, head) => {
  try {
    const url = new URL(req.url ?? "", `http://${req.headers.host}`);
    if (url.pathname !== "/signal") {
      socket.destroy();
      return;
    }

    const token = url.searchParams.get("token");
    if (!token) {
      socket.destroy();
      return;
    }

    const payload = verifyToken(token, config.jwtSecret);
    if (!pairings.authorize(payload.role, payload.pairId, payload.jti, payload.sessionId)) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, payload);
    });
  } catch (error) {
    log.warn({ error }, "Rejected websocket upgrade");
    socket.destroy();
  }
});

wss.on("connection", (ws, token: TokenPayload) => {
  const record: SocketRecord = { ws, token };
  if (token.role === "host") {
    hostSockets.set(token.pairId, record);
  } else if (token.sessionId) {
    viewerSockets.set(token.sessionId, record);
  }

  send(ws, {
    type: "server-ready",
    role: token.role,
    pairId: token.pairId,
    sessionId: token.sessionId,
    expiresAt: new Date(token.exp * 1000).toISOString()
  });

  ws.on("message", (payload) => handleSocketMessage(record, payload.toString("utf8")));
  ws.on("close", () => handleSocketClose(record));
  ws.on("error", (error) => log.warn({ error, role: token.role, pairId: token.pairId }, "websocket error"));
});

function handleSocketMessage(record: SocketRecord, raw: string): void {
  let message: SignalMessage;
  try {
    message = parseSignalMessage(JSON.parse(raw));
  } catch {
    send(record.ws, { type: "error", code: "invalid_message", message: "Message failed schema validation." });
    return;
  }

  if (message.type === "client-hello") {
    record.client = message.client;
    if (record.token.role === "viewer" && record.token.sessionId) {
      pairings.attachViewer(record.token.pairId, record.token.sessionId, message.client);
      const host = hostSockets.get(record.token.pairId);
      if (host) {
        send(host.ws, { type: "viewer-joined", sessionId: record.token.sessionId, viewer: message.client });
      }
    }
    return;
  }

  if (!("sessionId" in message) || !message.sessionId) {
    return;
  }

  if (record.token.role === "viewer") {
    const host = hostSockets.get(record.token.pairId);
    if (!host) {
      send(record.ws, { type: "error", code: "host_offline", message: "The host is not connected." });
      return;
    }
    send(host.ws, message);
    return;
  }

  const viewer = viewerSockets.get(message.sessionId);
  if (!viewer) {
    send(record.ws, { type: "error", code: "viewer_offline", message: "The viewer is not connected." });
    return;
  }
  send(viewer.ws, message);
}

function handleSocketClose(record: SocketRecord): void {
  if (record.token.role === "host") {
    hostSockets.delete(record.token.pairId);
    for (const viewer of viewerSockets.values()) {
      if (viewer.token.pairId === record.token.pairId && viewer.token.sessionId) {
        send(viewer.ws, {
          type: "session-ended",
          sessionId: viewer.token.sessionId,
          reason: "host disconnected"
        });
      }
    }
    return;
  }

  if (record.token.sessionId) {
    viewerSockets.delete(record.token.sessionId);
    const host = hostSockets.get(record.token.pairId);
    if (host) {
      send(host.ws, { type: "viewer-left", sessionId: record.token.sessionId });
    }
  }
}

function send(ws: WebSocket, message: SignalMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

setInterval(() => {
  pairings.sweep();
  joinLimiter.sweep();
}, 30_000).unref();

server.listen(config.port, () => {
  log.info({ port: config.port, publicUrl: config.publicUrl }, "Quder signaling server listening");
});
