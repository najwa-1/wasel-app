/**
 * Wasel — Signaling Server
 * ------------------------------------------------------------------
 * WebSocket server whose ONLY job is to introduce two peers in the same
 * session and relay their SDP + ICE. No audio/video/control/file data ever
 * passes through here — that is all peer-to-peer over WebRTC.
 *
 * Wrapped in a plain HTTP server so that:
 *   - hosting platforms (Render, Koyeb, etc.) detect the open port, and
 *   - their health check on GET / gets a 200 instead of failing.
 *
 * Session model: 1 host : 1 controller.
 * Run:  npm install && npm start     (PORT defaults to 8080; Render sets it)
 */

import http from "node:http";
import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT) || 8080;
const HEARTBEAT_MS = 30_000;

/** @type {Map<string, { host?: import("ws").WebSocket, controller?: import("ws").WebSocket }>} */
const sessions = new Map();

// Plain HTTP server: health check + friendly landing text.
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Wasel signaling server is running.\n");
});

// Attach the WebSocket server to the same HTTP server / port.
const wss = new WebSocketServer({ server });

function send(socket, msg) {
  if (socket && socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
}

/** Return the peer socket opposite to `role` within a session. */
function peerOf(session, role) {
  return role === "host" ? session.controller : session.host;
}

function leaveSession(socket) {
  const { sessionId, role } = socket.meta || {};
  if (!sessionId) return;
  const session = sessions.get(sessionId);
  if (!session) return;

  send(peerOf(session, role), { type: "peer-left" });

  if (session.host === socket) session.host = undefined;
  if (session.controller === socket) session.controller = undefined;

  if (!session.host && !session.controller) {
    sessions.delete(sessionId);
    console.log(`[wasel] session ${sessionId} closed`);
  }
}

function handleJoin(socket, msg) {
  const { sessionId, role } = msg;
  if (!sessionId || (role !== "host" && role !== "controller")) {
    send(socket, { type: "error", message: "join requires sessionId and role (host|controller)" });
    return;
  }

  let session = sessions.get(sessionId);
  if (!session) {
    session = {};
    sessions.set(sessionId, session);
  }

  if (session[role]) {
    send(socket, { type: "full", message: `A ${role} is already connected to this session.` });
    return;
  }

  session[role] = socket;
  socket.meta = { sessionId, role, id: randomUUID() };
  send(socket, { type: "joined", sessionId, role });
  console.log(`[wasel] ${role} joined session ${sessionId}`);

  const peer = peerOf(session, role);
  if (peer) {
    send(peer, { type: "peer-joined", role });
    send(socket, { type: "peer-joined", role: role === "host" ? "controller" : "host" });
  }
}

function relay(socket, msg) {
  const { sessionId, role } = socket.meta || {};
  if (!sessionId) return;
  const session = sessions.get(sessionId);
  if (!session) return;
  const peer = peerOf(session, role);
  if (!peer) {
    send(socket, { type: "error", message: "Peer is not connected." });
    return;
  }
  send(peer, msg); // forwarded verbatim; server never inspects SDP/ICE
}

wss.on("connection", (socket) => {
  socket.isAlive = true;
  socket.on("pong", () => { socket.isAlive = true; });

  socket.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(socket, { type: "error", message: "Invalid JSON." });
      return;
    }
    switch (msg.type) {
      case "join": handleJoin(socket, msg); break;
      case "sdp":
      case "ice": relay(socket, msg); break;
      case "leave": leaveSession(socket); break;
      default: send(socket, { type: "error", message: `Unknown message type: ${msg.type}` });
    }
  });

  socket.on("close", () => leaveSession(socket));
  socket.on("error", () => leaveSession(socket));
});

// Drop dead connections so stale session slots don't block new joins.
const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.isAlive === false) {
      leaveSession(socket);
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, HEARTBEAT_MS);

wss.on("close", () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`[wasel] signaling server listening on port ${PORT}`);
});

process.on("SIGINT", () => {
  console.log("\n[wasel] shutting down");
  server.close(() => process.exit(0));
});
