# AWS App Runner Deployment

This repository can be deployed to AWS as a single App Runner service. The server already serves `apps/web/dist`, so the browser client, REST API, and WebSocket signaling all live behind one HTTPS origin.

## Why This Shape

- No separate frontend hosting is required.
- WebSocket signaling stays same-origin with the page.
- Android, desktop, and browser viewers can all open the same public URL.

## Prerequisites

- A GitHub repository that contains this project.
- An AWS account with App Runner access.
- A strong `JWT_SECRET`.
- A TURN service for restrictive networks if you need reliable cross-network WebRTC sessions.

## GitHub Source Deployment

1. Push this repository to GitHub.
2. In AWS App Runner, create a service from source code.
3. Connect the GitHub repository and branch.
4. Use repository configuration from `apprunner.yaml`.
5. Set the service port to `8080` if prompted.
6. Enable automatic deployments if you want pushes to redeploy.

## Runtime Environment

Set these runtime environment variables in App Runner:

- `NODE_ENV=production`
- `PUBLIC_URL=https://your-service-or-domain`
- `CORS_ORIGINS=https://your-service-or-domain`
- `JWT_SECRET=<at least 32 random bytes>`
- `SESSION_TTL_SECONDS=900`
- `PAIR_CODE_DIGITS=9`
- `STUN_URLS=stun:stun.l.google.com:19302,stun:global.stun.twilio.com:3478`

Optional relay settings:

- `TURN_URLS=turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349?transport=tcp`
- `TURN_USERNAME=<turn username>`
- `TURN_CREDENTIAL=<turn credential>`

## Health Check

Use `/health` for the service health check.

## Custom Domain

Attach your domain in App Runner and then update:

- `PUBLIC_URL`
- `CORS_ORIGINS`

Both should use the final HTTPS origin.

## Notes

- Without TURN, WebRTC may fail for some users behind strict NAT or carrier networks.
- The current browser host supports attended screen sharing. Full OS-level remote input still requires the future native agent described in `docs/native-agent.md`.
