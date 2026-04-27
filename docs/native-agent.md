# Native Agent Roadmap

The browser app proves pairing, signaling, WebRTC media negotiation, and control-channel semantics. The native agent turns that into a real AnyDesk-class product.

## Recommended Stack

- Rust for the privileged agent and service.
- WebRTC native stack for media and data channels.
- Tauri or Flutter for a desktop control UI.
- Platform-specific modules behind stable traits.

## Capture Modules

Windows:

- DXGI Desktop Duplication for service-mode capture.
- Windows.Graphics.Capture for modern attended capture.
- Media Foundation or GPU vendor encoders.

macOS:

- ScreenCaptureKit.
- VideoToolbox for encoding.
- Accessibility and Screen Recording permission management.

Linux:

- PipeWire/XDG Desktop Portal for Wayland.
- X11 capture where available.
- VAAPI/NVENC/QuickSync when supported.

## Input Modules

Use separate signed adapters for:

- Mouse movement and buttons.
- Keyboard events.
- Clipboard.
- File operations.

Every privileged adapter should check session policy before executing an event.

## Agent API Boundary

The agent should implement these internal traits:

```rust
trait CaptureSource {
    fn start(&mut self, options: CaptureOptions) -> Result<FrameStream>;
    fn stop(&mut self);
}

trait Encoder {
    fn configure(&mut self, options: EncodeOptions) -> Result<()>;
    fn encode(&mut self, frame: Frame) -> Result<EncodedFrame>;
}

trait InputSink {
    fn pointer(&mut self, event: PointerEvent) -> Result<()>;
    fn keyboard(&mut self, event: KeyboardEvent) -> Result<()>;
}

trait PolicyGate {
    fn allows(&self, action: PrivilegedAction) -> bool;
}
```

## Build Order

1. Windows attended agent with DXGI capture and input injection.
2. WebRTC native transport using the existing signaling protocol.
3. Secure unattended service enrollment.
4. Clipboard and file transfer.
5. Hardware encoder selection and adaptive bitrate.
6. macOS and Linux agents.
7. Admin dashboard, audit logs, and policy enforcement.

