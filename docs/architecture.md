# Architecture

Quder Remote is organized around four paths: control plane, signaling plane, media plane, and native endpoint plane.

## Control Plane

The control plane owns accounts, organizations, devices, policy, audit logs, and session approval. The current repository has the first step: short-lived pairing codes and signed host/viewer tokens.

Future storage:

- PostgreSQL for users, devices, organizations, policy, audit logs.
- Redis for pairing sessions, rate limits, and WebSocket presence.
- Object storage for optional recordings and file-transfer quarantine.

## Signaling Plane

The signaling server:

- Issues short-lived pair codes.
- Exchanges host/viewer WebRTC offers, answers, and ICE candidates.
- Validates every message through the shared protocol package.
- Keeps media out of the server path unless TURN is required.

Current implementation:

- `apps/server/src/index.ts`
- `apps/server/src/pairing-store.ts`
- `packages/protocol/src/index.ts`

## Media Plane

The browser build uses WebRTC:

- DTLS-SRTP for encrypted media.
- ICE for direct P2P discovery.
- TURN for relay fallback when configured.
- Unordered, unreliable data channel for low-latency control events.

Production media roadmap:

- Native host captures frames using OS APIs.
- Native host chooses hardware encoder when available.
- Viewer decodes through browser WebRTC, native WebRTC, or a custom desktop client.
- Adaptive bitrate and resolution react to packet loss, RTT, and frame pacing.

## Native Endpoint Plane

The native agent owns privileged operations:

- Screen capture.
- Audio capture.
- Mouse and keyboard injection.
- Clipboard.
- File transfer.
- Service mode for unattended access.
- OS permission prompts and security boundaries.

The browser host in this repo is an attended screen-share host. It cannot perform OS-level input injection because browsers intentionally block that.

## Session Flow

1. Host captures a display and calls `POST /api/pair/start`.
2. Server returns a pair code and signed host token.
3. Host opens `/signal?token=...`.
4. Viewer submits the pair code through `POST /api/pair/join`.
5. Server returns a signed viewer token.
6. Viewer opens `/signal?token=...`.
7. Viewer creates a WebRTC offer.
8. Host answers and both sides exchange ICE candidates.
9. Media flows P2P when possible, through TURN when required.
10. Control events flow on the WebRTC data channel.

## Scale-Out Path

- Put the signaling server behind an HTTPS load balancer with sticky WebSocket routing.
- Move pairing/session state into Redis.
- Run TURN servers regionally.
- Prefer anycast or geo-DNS for TURN entry points.
- Emit session metrics to Prometheus/OpenTelemetry.
- Store audit events append-only.

