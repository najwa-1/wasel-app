# Wasel — Signaling Server

WebSocket signaling for the Wasel platform. Relays **SDP** and **ICE** only.
No media/control/file data passes through it — that's all peer-to-peer.
Wrapped in an HTTP server so cloud hosts detect the port and pass health checks.

## Run locally
```bash
npm install
npm start          # http://localhost:8080  (ws on the same port)
```

## Deploy free + permanent on Render  (recommended)
Render's free plan gives a permanent `wss://` URL with no credit card.
(It sleeps after ~15 min idle and takes ~1 min to wake on the first hit —
open the URL once before a demo to pre-warm it.)

1. Put **this `signaling-server` folder** in its own GitHub repo (folder = repo root).
   ```bash
   cd signaling-server
   git init && git add . && git commit -m "Wasel signaling"
   # create an empty repo on github.com, then:
   git remote add origin https://github.com/<you>/wasel-signaling.git
   git push -u origin main
   ```
2. Go to https://render.com → sign up (free, no card) → **New → Web Service**.
3. Connect the repo. Render auto-detects Node and reads `render.yaml`:
   - Build: `npm install`   Start: `npm start`   Plan: Free
4. Deploy. You'll get a URL like `https://wasel-signaling.onrender.com`.
5. Your signaling URL for the apps is the **wss** form:
   `wss://wasel-signaling.onrender.com`

Open `https://wasel-signaling.onrender.com` in a browser — you should see
"Wasel signaling server is running." That means it's live.

### Use the URL
- Phone APK: set `SIGNALING_URL` in `cordova-shell/www/config.js` to the wss URL, then rebuild.
- Host agent (on the controlled PC): paste the same wss URL in its server field.

## Protocol
Client → Server: `join {sessionId, role}` · `sdp` · `ice` · `leave`
Server → Client: `joined` · `peer-joined` · `peer-left` · `sdp` · `ice` · `full` · `error`
