import { z } from "zod";

export const RoleSchema = z.enum(["host", "viewer"]);
export type Role = z.infer<typeof RoleSchema>;

export const IceServerSchema = z.object({
  urls: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  username: z.string().optional(),
  credential: z.string().optional()
});
export type IceServerConfig = z.infer<typeof IceServerSchema>;

export const StartPairingRequestSchema = z.object({
  deviceName: z.string().trim().min(1).max(80),
  capabilities: z
    .object({
      screen: z.boolean().default(true),
      input: z.boolean().default(false),
      fileTransfer: z.boolean().default(false),
      clipboard: z.boolean().default(false)
    })
    .partial()
    .optional()
});
export type StartPairingRequest = z.infer<typeof StartPairingRequestSchema>;

export const StartPairingResponseSchema = z.object({
  pairId: z.string().min(16),
  pairCode: z.string().regex(/^\d{6,12}$/),
  hostToken: z.string().min(20),
  expiresAt: z.string().datetime(),
  iceServers: z.array(IceServerSchema)
});
export type StartPairingResponse = z.infer<typeof StartPairingResponseSchema>;

export const JoinPairingRequestSchema = z.object({
  pairCode: z.preprocess(
    (value) => (typeof value === "string" ? value.replace(/\D/g, "") : value),
    z.string().regex(/^\d{6,12}$/)
  ),
  viewerName: z.string().trim().min(1).max(80)
});
export type JoinPairingRequest = z.infer<typeof JoinPairingRequestSchema>;

export const JoinPairingResponseSchema = z.object({
  pairId: z.string().min(16),
  sessionId: z.string().min(16),
  viewerToken: z.string().min(20),
  deviceName: z.string(),
  expiresAt: z.string().datetime(),
  iceServers: z.array(IceServerSchema)
});
export type JoinPairingResponse = z.infer<typeof JoinPairingResponseSchema>;

const ClientInfoSchema = z.object({
  name: z.string().trim().min(1).max(80),
  version: z.string().trim().max(40).optional(),
  platform: z.string().trim().max(80).optional()
});
export type ClientInfo = z.infer<typeof ClientInfoSchema>;

export const SignalMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("client-hello"),
    client: ClientInfoSchema
  }),
  z.object({
    type: z.literal("server-ready"),
    role: RoleSchema,
    pairId: z.string(),
    sessionId: z.string().optional(),
    expiresAt: z.string().datetime()
  }),
  z.object({
    type: z.literal("viewer-joined"),
    sessionId: z.string(),
    viewer: ClientInfoSchema
  }),
  z.object({
    type: z.literal("viewer-left"),
    sessionId: z.string()
  }),
  z.object({
    type: z.literal("webrtc-offer"),
    sessionId: z.string(),
    sdp: z.string().min(1)
  }),
  z.object({
    type: z.literal("webrtc-answer"),
    sessionId: z.string(),
    sdp: z.string().min(1)
  }),
  z.object({
    type: z.literal("ice-candidate"),
    sessionId: z.string(),
    candidate: z.string().min(1),
    sdpMid: z.string().nullable().optional(),
    sdpMLineIndex: z.number().int().nullable().optional()
  }),
  z.object({
    type: z.literal("session-ended"),
    sessionId: z.string(),
    reason: z.string().max(200).optional()
  }),
  z.object({
    type: z.literal("error"),
    code: z.string().max(80),
    message: z.string().max(300)
  })
]);
export type SignalMessage = z.infer<typeof SignalMessageSchema>;

export const ControlEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("pointer"),
    action: z.enum(["move", "down", "up", "wheel"]),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    button: z.number().int().min(0).max(5).optional(),
    deltaX: z.number().optional(),
    deltaY: z.number().optional(),
    ts: z.number().int().positive()
  }),
  z.object({
    type: z.literal("keyboard"),
    action: z.enum(["down", "up"]),
    key: z.string().max(64),
    code: z.string().max(64),
    altKey: z.boolean(),
    ctrlKey: z.boolean(),
    metaKey: z.boolean(),
    shiftKey: z.boolean(),
    ts: z.number().int().positive()
  }),
  z.object({
    type: z.literal("clipboard"),
    text: z.string().max(1_000_000),
    ts: z.number().int().positive()
  }),
  z.object({
    type: z.literal("ping"),
    id: z.string().min(4).max(80),
    ts: z.number().int().positive()
  }),
  z.object({
    type: z.literal("pong"),
    id: z.string().min(4).max(80),
    ts: z.number().int().positive()
  })
]);
export type ControlEvent = z.infer<typeof ControlEventSchema>;

export function parseSignalMessage(input: unknown): SignalMessage {
  return SignalMessageSchema.parse(input);
}

export function formatPairCode(code: string): string {
  return code.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
}
