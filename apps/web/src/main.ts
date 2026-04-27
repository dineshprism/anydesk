import {
  type ControlEvent,
  type IceServerConfig,
  type JoinPairingResponse,
  type SignalMessage,
  type StartPairingResponse,
  ControlEventSchema,
  formatPairCode,
  parseSignalMessage
} from "@quder/protocol";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

type HostState = {
  stream?: MediaStream;
  peer?: RTCPeerConnection;
  ws?: WebSocket;
  pairing?: StartPairingResponse;
  controlChannel?: RTCDataChannel;
};

type ViewerState = {
  peer?: RTCPeerConnection;
  ws?: WebSocket;
  join?: JoinPairingResponse;
  controlChannel?: RTCDataChannel;
  statsTimer?: number;
};

type PointerAction = Extract<ControlEvent, { type: "pointer" }>["action"];

const hostState: HostState = {};
const viewerState: ViewerState = {};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Missing app root");
}

app.innerHTML = `
  <section class="shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">Quder Remote</p>
        <h1>Secure Remote Desktop Console</h1>
      </div>
      <div class="signal-pill" id="serverStatus">Checking server</div>
    </header>

    <nav class="tabs" aria-label="Mode">
      <button class="tab active" data-panel="hostPanel">Host</button>
      <button class="tab" data-panel="viewerPanel">Viewer</button>
      <button class="tab" data-panel="opsPanel">Ops</button>
    </nav>

    <section class="panel active" id="hostPanel">
      <div class="work-grid">
        <div class="tool-surface">
          <div class="row">
            <label>
              Device name
              <input id="deviceName" maxlength="80" value="${defaultDeviceName()}" />
            </label>
            <button id="startHost" class="primary">Start Screen</button>
          </div>
          <div class="pair-code" id="pairCode">---</div>
          <div class="status-line" id="hostStatus">Idle</div>
          <div class="event-log" id="hostLog"></div>
        </div>
        <video class="preview" id="hostPreview" autoplay muted playsinline></video>
      </div>
    </section>

    <section class="panel" id="viewerPanel">
      <div class="viewer-layout">
        <aside class="tool-surface compact">
          <label>
            Support code
            <input id="pairCodeInput" inputmode="numeric" autocomplete="one-time-code" placeholder="000 000 000" />
          </label>
          <label>
            Viewer name
            <input id="viewerName" maxlength="80" value="Support Desk" />
          </label>
          <button id="connectViewer" class="primary">Connect</button>
          <div class="status-line" id="viewerStatus">Idle</div>
          <div class="metric-grid">
            <div><span id="rttMetric">--</span><small>RTT</small></div>
            <div><span id="fpsMetric">--</span><small>FPS</small></div>
            <div><span id="bitrateMetric">--</span><small>Mbps</small></div>
          </div>
        </aside>
        <section class="remote-stage">
          <video id="remoteVideo" tabindex="0" autoplay playsinline></video>
          <div class="stage-empty" id="stageEmpty">Waiting for video</div>
        </section>
      </div>
    </section>

    <section class="panel" id="opsPanel">
      <div class="ops-grid">
        <article class="ops-block">
          <h2>Connectivity</h2>
          <dl>
            <div><dt>Primary path</dt><dd>WebRTC P2P</dd></div>
            <div><dt>Fallback</dt><dd>TURN relay configured by env</dd></div>
            <div><dt>Signaling</dt><dd>Authenticated WebSocket</dd></div>
          </dl>
        </article>
        <article class="ops-block">
          <h2>Security</h2>
          <dl>
            <div><dt>Media</dt><dd>DTLS-SRTP</dd></div>
            <div><dt>Pairing</dt><dd>Short-lived signed tokens</dd></div>
            <div><dt>Access</dt><dd>Attended session approval</dd></div>
          </dl>
        </article>
        <article class="ops-block">
          <h2>Native Agent</h2>
          <dl>
            <div><dt>Capture</dt><dd>DXGI, ScreenCaptureKit, PipeWire</dd></div>
            <div><dt>Input</dt><dd>Platform adapter boundary</dd></div>
            <div><dt>Service</dt><dd>Unattended module boundary</dd></div>
          </dl>
        </article>
      </div>
    </section>
  </section>
`;

bindTabs();
bindHost();
bindViewer();
void checkHealth();

function bindTabs(): void {
  for (const tab of document.querySelectorAll<HTMLButtonElement>(".tab")) {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.panel ?? "")?.classList.add("active");
    });
  }
}

function bindHost(): void {
  const startButton = byId<HTMLButtonElement>("startHost");
  startButton.addEventListener("click", async () => {
    startButton.disabled = true;
    try {
      setText("hostStatus", "Requesting display");
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: "always",
          displaySurface: "monitor",
          frameRate: { ideal: 30, max: 60 },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        } as MediaTrackConstraints,
        audio: false
      });
      hostState.stream = stream;
      byId<HTMLVideoElement>("hostPreview").srcObject = stream;

      const pairing = await postJson<StartPairingResponse>("/api/pair/start", {
        deviceName: byId<HTMLInputElement>("deviceName").value,
        capabilities: {
          screen: true,
          input: true,
          fileTransfer: false,
          clipboard: true
        }
      });
      hostState.pairing = pairing;
      setText("pairCode", formatPairCode(pairing.pairCode));
      setText("hostStatus", "Online");
      connectHostSocket(pairing);
    } catch (error) {
      setText("hostStatus", error instanceof Error ? error.message : "Unable to start host");
      startButton.disabled = false;
    }
  });
}

function connectHostSocket(pairing: StartPairingResponse): void {
  const ws = createSignalSocket(pairing.hostToken);
  hostState.ws = ws;

  ws.addEventListener("open", () => {
    sendSignal(ws, {
      type: "client-hello",
      client: {
        name: byId<HTMLInputElement>("deviceName").value,
        platform: navigator.platform,
        version: "web-host"
      }
    });
  });

  ws.addEventListener("message", async (event) => {
    const message = parseWireMessage(event.data);
    if (!message) return;

    if (message.type === "viewer-joined") {
      appendHostLog(`${message.viewer.name} joined`);
      setText("hostStatus", "Viewer connected");
      return;
    }

    if (message.type === "webrtc-offer") {
      await answerViewer(message, pairing.iceServers);
      return;
    }

    if (message.type === "ice-candidate" && hostState.peer) {
      await hostState.peer.addIceCandidate(toIceCandidate(message));
      return;
    }

    if (message.type === "viewer-left") {
      appendHostLog("Viewer left");
      closePeer(hostState.peer, false);
      hostState.peer = undefined;
      return;
    }

    if (message.type === "error") {
      appendHostLog(message.message);
    }
  });

  ws.addEventListener("close", () => setText("hostStatus", "Offline"));
}

async function answerViewer(message: Extract<SignalMessage, { type: "webrtc-offer" }>, iceServers: IceServerConfig[]): Promise<void> {
  const ws = hostState.ws;
  const stream = hostState.stream;
  if (!ws || !stream) return;

  closePeer(hostState.peer, false);
  const peer = createPeer(iceServers);
  hostState.peer = peer;

  for (const track of stream.getTracks()) {
    if (track.kind === "video") {
      track.contentHint = "detail";
    }
    peer.addTrack(track, stream);
  }

  peer.addEventListener("datachannel", (event) => {
    hostState.controlChannel = event.channel;
    event.channel.addEventListener("message", (controlEvent) => handleHostControl(controlEvent.data));
  });

  peer.addEventListener("icecandidate", (event) => {
    if (!event.candidate) return;
    sendSignal(ws, fromIceCandidate(message.sessionId, event.candidate));
  });

  await peer.setRemoteDescription({ type: "offer", sdp: message.sdp });
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  sendSignal(ws, {
    type: "webrtc-answer",
    sessionId: message.sessionId,
    sdp: answer.sdp ?? ""
  });
}

function bindViewer(): void {
  byId<HTMLButtonElement>("connectViewer").addEventListener("click", async () => {
    try {
      setText("viewerStatus", "Pairing");
      const joined = await postJson<JoinPairingResponse>("/api/pair/join", {
        pairCode: byId<HTMLInputElement>("pairCodeInput").value,
        viewerName: byId<HTMLInputElement>("viewerName").value
      });
      viewerState.join = joined;
      connectViewerSocket(joined);
    } catch (error) {
      setText("viewerStatus", error instanceof Error ? error.message : "Unable to connect");
    }
  });

  const video = byId<HTMLVideoElement>("remoteVideo");
  video.addEventListener("pointermove", (event) => sendPointer(video, event, "move"));
  video.addEventListener("pointerdown", (event) => {
    video.setPointerCapture(event.pointerId);
    video.focus();
    sendPointer(video, event, "down");
  });
  video.addEventListener("pointerup", (event) => sendPointer(video, event, "up"));
  video.addEventListener("wheel", (event) => {
    event.preventDefault();
    sendPointer(video, event, "wheel");
  });
  video.addEventListener("keydown", (event) => sendKeyboard(event, "down"));
  video.addEventListener("keyup", (event) => sendKeyboard(event, "up"));
}

function connectViewerSocket(joined: JoinPairingResponse): void {
  const ws = createSignalSocket(joined.viewerToken);
  viewerState.ws = ws;

  ws.addEventListener("open", async () => {
    sendSignal(ws, {
      type: "client-hello",
      client: {
        name: byId<HTMLInputElement>("viewerName").value,
        platform: navigator.platform,
        version: "web-viewer"
      }
    });
    await createViewerOffer(joined);
  });

  ws.addEventListener("message", async (event) => {
    const message = parseWireMessage(event.data);
    if (!message) return;

    if (message.type === "webrtc-answer" && viewerState.peer) {
      await viewerState.peer.setRemoteDescription({ type: "answer", sdp: message.sdp });
      setText("viewerStatus", `Connected to ${joined.deviceName}`);
      startStats();
      return;
    }

    if (message.type === "ice-candidate" && viewerState.peer) {
      await viewerState.peer.addIceCandidate(toIceCandidate(message));
      return;
    }

    if (message.type === "session-ended") {
      setText("viewerStatus", message.reason ?? "Session ended");
      closePeer(viewerState.peer, true);
      return;
    }

    if (message.type === "error") {
      setText("viewerStatus", message.message);
    }
  });
}

async function createViewerOffer(joined: JoinPairingResponse): Promise<void> {
  const ws = viewerState.ws;
  if (!ws) return;

  closePeer(viewerState.peer, true);
  const peer = createPeer(joined.iceServers);
  viewerState.peer = peer;

  const channel = peer.createDataChannel("control", {
    ordered: false,
    maxRetransmits: 0
  });
  viewerState.controlChannel = channel;
  channel.addEventListener("message", (event) => {
    const parsed = ControlEventSchema.safeParse(JSON.parse(event.data));
    if (parsed.success && parsed.data.type === "pong") {
      setText("rttMetric", `${Date.now() - parsed.data.ts}ms`);
    }
  });

  peer.addTransceiver("video", { direction: "recvonly" });
  peer.addEventListener("track", (event) => {
    byId<HTMLVideoElement>("remoteVideo").srcObject = event.streams[0] ?? new MediaStream([event.track]);
    byId<HTMLDivElement>("stageEmpty").classList.add("hidden");
  });
  peer.addEventListener("icecandidate", (event) => {
    if (!event.candidate) return;
    sendSignal(ws, fromIceCandidate(joined.sessionId, event.candidate));
  });

  const offer = await peer.createOffer({
    offerToReceiveVideo: true,
    offerToReceiveAudio: false
  });
  await peer.setLocalDescription(offer);
  sendSignal(ws, {
    type: "webrtc-offer",
    sessionId: joined.sessionId,
    sdp: offer.sdp ?? ""
  });
  setText("viewerStatus", "Negotiating");
}

function createPeer(iceServers: IceServerConfig[]): RTCPeerConnection {
  const peer = new RTCPeerConnection({
    iceServers,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require"
  });

  peer.addEventListener("connectionstatechange", () => {
    if (peer.connectionState === "failed") {
      peer.restartIce();
    }
  });

  return peer;
}

function sendPointer(target: HTMLElement, event: PointerEvent | WheelEvent, action: PointerAction): void {
  const rect = target.getBoundingClientRect();
  sendControl({
    type: "pointer",
    action,
    x: clamp((event.clientX - rect.left) / rect.width),
    y: clamp((event.clientY - rect.top) / rect.height),
    button: "button" in event ? event.button : undefined,
    deltaX: "deltaX" in event ? event.deltaX : undefined,
    deltaY: "deltaY" in event ? event.deltaY : undefined,
    ts: Date.now()
  });
}

function sendKeyboard(event: KeyboardEvent, action: "down" | "up"): void {
  if (!viewerState.controlChannel || viewerState.controlChannel.readyState !== "open") return;
  event.preventDefault();
  sendControl({
    type: "keyboard",
    action,
    key: event.key,
    code: event.code,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    ts: Date.now()
  });
}

function sendControl(event: ControlEvent): void {
  if (viewerState.controlChannel?.readyState === "open") {
    viewerState.controlChannel.send(JSON.stringify(event));
  }
}

function handleHostControl(raw: string): void {
  try {
    const parsed = ControlEventSchema.parse(JSON.parse(raw));
    if (parsed.type === "ping") {
      hostState.controlChannel?.send(JSON.stringify({ type: "pong", id: parsed.id, ts: parsed.ts }));
      return;
    }
    appendHostLog(`${parsed.type}:${"action" in parsed ? parsed.action : "sync"}`);
  } catch {
    appendHostLog("Invalid control packet");
  }
}

function startStats(): void {
  if (viewerState.statsTimer) {
    window.clearInterval(viewerState.statsTimer);
  }

  let previousBytes = 0;
  let previousTs = 0;
  viewerState.statsTimer = window.setInterval(async () => {
    const peer = viewerState.peer;
    if (!peer) return;
    viewerState.controlChannel?.send(JSON.stringify({ type: "ping", id: crypto.randomUUID(), ts: Date.now() }));
    const stats = await peer.getStats();
    stats.forEach((report) => {
      if (report.type === "inbound-rtp" && report.kind === "video") {
        if (typeof report.framesPerSecond === "number") {
          setText("fpsMetric", report.framesPerSecond.toFixed(0));
        }
        if (typeof report.bytesReceived === "number" && typeof report.timestamp === "number" && previousTs > 0) {
          const bits = (report.bytesReceived - previousBytes) * 8;
          const seconds = (report.timestamp - previousTs) / 1000;
          setText("bitrateMetric", (bits / seconds / 1_000_000).toFixed(2));
        }
        previousBytes = report.bytesReceived ?? previousBytes;
        previousTs = report.timestamp ?? previousTs;
      }
      if (report.type === "candidate-pair" && report.state === "succeeded" && typeof report.currentRoundTripTime === "number") {
        setText("rttMetric", `${Math.round(report.currentRoundTripTime * 1000)}ms`);
      }
    });
  }, 1500);
}

function createSignalSocket(token: string): WebSocket {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const base = API_BASE ? new URL(API_BASE) : location;
  return new WebSocket(`${protocol}//${base.host}/signal?token=${encodeURIComponent(token)}`);
}

function sendSignal(ws: WebSocket, message: SignalMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function parseWireMessage(raw: unknown): SignalMessage | undefined {
  try {
    return parseSignalMessage(JSON.parse(String(raw)));
  } catch {
    return undefined;
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? response.statusText);
  }
  return (await response.json()) as T;
}

async function checkHealth(): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/health`);
    setText("serverStatus", response.ok ? "Server online" : "Server offline");
  } catch {
    setText("serverStatus", "Server offline");
  }
}

function fromIceCandidate(sessionId: string, candidate: RTCIceCandidate): SignalMessage {
  return {
    type: "ice-candidate",
    sessionId,
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex
  };
}

function toIceCandidate(message: Extract<SignalMessage, { type: "ice-candidate" }>): RTCIceCandidateInit {
  return {
    candidate: message.candidate,
    sdpMid: message.sdpMid,
    sdpMLineIndex: message.sdpMLineIndex
  };
}

function closePeer(peer: RTCPeerConnection | undefined, stopTracks: boolean): void {
  if (stopTracks) {
    peer?.getSenders().forEach((sender) => sender.track?.stop());
  }
  peer?.close();
}

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
}

function setText(id: string, value: string): void {
  byId(id).textContent = value;
}

function appendHostLog(value: string): void {
  const log = byId<HTMLDivElement>("hostLog");
  const item = document.createElement("div");
  item.textContent = `${new Date().toLocaleTimeString()} ${value}`;
  log.prepend(item);
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function defaultDeviceName(): string {
  return `${navigator.platform || "Device"} host`;
}
