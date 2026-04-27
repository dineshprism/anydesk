# Security Model

Remote desktop software is dual-use. Quder Remote is designed around explicit consent, short-lived authorization, encrypted transport, and auditable privileged actions.

## Current Protections

- Pairing codes expire.
- Host and viewer receive separate signed tokens.
- WebSocket upgrades require valid tokens.
- Pair-code join attempts are rate limited.
- Signaling payloads are schema validated.
- Media uses WebRTC DTLS-SRTP.
- Control events travel through a WebRTC data channel.
- The browser host never injects OS input.

## Required Before Internet Production

- Require HTTPS/WSS everywhere.
- Replace in-memory pairing state with Redis and durable audit logs.
- Add account login, device enrollment, roles, and MFA.
- Add per-session consent prompts and visible session indicators.
- Add TURN credentials with short TTL.
- Add host fingerprint verification or an authenticated E2E session key confirmation flow.
- Add admin policy for clipboard, file transfer, recording, unattended access, and terminal/shell.
- Add malware scanning and size limits for file transfer.
- Add code signing and auto-update verification for native agents.
- Add abuse controls: device bans, IP throttling, suspicious pairing alerts, and retention policy.

## Threat Notes

The signaling server cannot read WebRTC media, but a malicious or compromised signaling server can attempt a signaling-level man-in-the-middle unless peers verify an authenticated session fingerprint. Production should show a short authentication string on both sides or use an identity-bound key agreement.

Input injection must be native-only and permissioned. The browser version deliberately logs control packets on the host side instead of controlling the operating system.

