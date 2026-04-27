# Quder Remote

Quder Remote is a production-oriented AnyDesk-style remote desktop foundation. It combines a secure pairing server, authenticated WebSocket signaling, WebRTC media transport, and a browser host/viewer console that can be run locally today.

This repository is not pretending that a full native AnyDesk replacement appears in one commit. The hard production parts are designed as clear module boundaries: native screen capture, input injection, unattended service mode, file transfer, clipboard, relay/TURN scale-out, auditing, and device management.

## What Was Built

- Secure short-lived pairing codes and signed host/viewer session tokens.
- Authenticated WebSocket signaling with schema validation.
- WebRTC screen streaming with ICE/STUN/TURN configuration.
- Low-latency unordered data channel for pointer, keyboard, clipboard, and ping/pong control events.
- Host console, viewer console, and ops status UI.
- Production docs for connectivity, security, native-agent boundaries, and OSS feature selection.
- Docker-ready server that can serve the built web client.

## Local Development

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

The server loads `.env` automatically when that file exists.

For a local loop test, open two browser windows:

1. In the first window, choose `Host`, then `Start Screen`.
2. Copy the generated support code.
3. In the second window, choose `Viewer`, paste the code, then `Connect`.

Browser hosts can stream the screen and receive control events, but browsers cannot inject mouse/keyboard events into the OS. The native agent boundary is documented in [docs/native-agent.md](docs/native-agent.md).

## Production Build

```powershell
npm run build
npm --workspace @quder/server run start
```

The server listens on `PORT` and serves `apps/web/dist` when present.

For a single-container production check on your machine:

```powershell
docker compose up --build
```

Open `http://127.0.0.1:8080`.

## Environment

Copy `.env.example` to `.env` and set:

- `PUBLIC_URL`: public HTTPS URL of the deployed app, such as `https://remote.example.com`.
- `JWT_SECRET`: at least 32 random bytes.
- `CORS_ORIGINS`: public web origins allowed to call the API.
- `STUN_URLS`: comma-separated STUN servers.
- `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`: relay fallback for restrictive NATs.
- `SESSION_TTL_SECONDS`: pairing/session lifetime.

## AWS

This app is ready for a one-service AWS App Runner deployment from GitHub. The production container serves the built web client and API from the same origin, which keeps browser pairing and WebSocket signaling simple.

See [docs/aws-apprunner.md](docs/aws-apprunner.md) for the production checklist and environment values.

## Architecture

Read these next:

- [docs/oss-feature-selection.md](docs/oss-feature-selection.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/security.md](docs/security.md)
- [docs/native-agent.md](docs/native-agent.md)
