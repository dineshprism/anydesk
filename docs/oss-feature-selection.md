# OSS Feature Selection

This is the feature blend used for Quder Remote.

## RustDesk

Borrow:

- Rendezvous plus relay architecture.
- Self-hosted control over identity/signaling infrastructure.
- Separate capture, input, clipboard, file transfer, and connection modules.
- Native cross-platform agent as the long-term endpoint.

Do differently:

- Use browser-first WebRTC for the initial transport and UI because it gives rapid iteration, DTLS-SRTP, NAT traversal, and measurable stats from day one.
- Keep TURN relay interchangeable instead of baking in one relay protocol too early.

## MeshCentral

Borrow:

- Web management console.
- Reliable WebSocket control path before and during WebRTC negotiation.
- Agent and browser split.
- Device/session management mindset.

Do differently:

- Keep the remote desktop transport smaller and more latency-focused.
- Make the native agent responsible for OS-specific capture and input instead of pushing too much into the browser.

## Remotely

Borrow:

- Support-session workflow.
- Admin/device concepts.
- API-first server layout.
- Strong reverse-proxy and HTTPS assumptions.

Do differently:

- Avoid coupling the first version to one server framework or database.
- Use short-lived pairing tokens in the base flow before adding accounts and organizations.

## Sunshine and Moonlight

Borrow:

- Latency-first thinking.
- Hardware encoder roadmap.
- Capture-method matrix per OS and GPU.
- Client stats for RTT, FPS, and bitrate.

Do differently:

- Keep remote-support controls and security policy as first-class product concepts.
- Use general remote-desktop semantics rather than game-stream-only assumptions.

## TightVNC and xRDP

Borrow:

- Protocol compatibility as an enterprise bridge.
- Clear separation between display transport and input events.

Do differently:

- Default to encrypted WebRTC media rather than plain legacy protocol exposure.
- Treat VNC/RDP as optional adapters behind the Quder authorization and audit model.

## Required Production Features

- Attended support sessions.
- Unattended device enrollment.
- P2P-first WebRTC transport with TURN fallback.
- Geo-distributed TURN/relay pools.
- Hardware encoding in the native agent.
- Per-session authorization and explicit consent policy.
- Input injection only through signed native agent modules.
- Clipboard and file transfer over separate permissioned channels.
- Audit logs, session recording controls, retention policy, and admin roles.
- Crash-safe auto-update and code signing for agents.

