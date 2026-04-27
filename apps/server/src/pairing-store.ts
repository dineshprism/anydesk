import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import type { ClientInfo, Role } from "@quder/protocol";
import { issueToken } from "./token.js";

type Session = {
  sessionId: string;
  viewerTokenId: string;
  viewer?: ClientInfo;
  createdAt: number;
};

export type PairingRoom = {
  pairId: string;
  pairCodeHash: string;
  deviceName: string;
  capabilities: Record<string, boolean>;
  hostTokenId: string;
  createdAt: number;
  expiresAt: number;
  sessions: Map<string, Session>;
};

export class PairingStore {
  private readonly rooms = new Map<string, PairingRoom>();

  constructor(
    private readonly secret: string,
    private readonly ttlMs: number,
    private readonly pairCodeDigits: number
  ) {}

  create(deviceName: string, capabilities: Record<string, boolean> = {}) {
    this.sweep();
    const pairId = randomBytes(16).toString("base64url");
    const pairCode = this.generateCode();
    const hostTokenId = randomUUID();
    const expiresAt = Date.now() + this.ttlMs;
    const room: PairingRoom = {
      pairId,
      pairCodeHash: this.hashPairCode(pairCode),
      deviceName,
      capabilities,
      hostTokenId,
      createdAt: Date.now(),
      expiresAt,
      sessions: new Map()
    };

    this.rooms.set(pairId, room);

    return {
      room,
      pairCode,
      hostToken: issueToken(this.secret, "host", pairId, this.ttlMs, hostTokenId)
    };
  }

  join(pairCode: string) {
    this.sweep();
    const pairCodeHash = this.hashPairCode(pairCode);
    const room = [...this.rooms.values()].find((candidate) => candidate.pairCodeHash === pairCodeHash);
    if (!room || room.expiresAt < Date.now()) {
      return undefined;
    }

    const sessionId = randomBytes(16).toString("base64url");
    const viewerTokenId = randomUUID();
    const session: Session = {
      sessionId,
      viewerTokenId,
      createdAt: Date.now()
    };
    room.sessions.set(sessionId, session);

    return {
      room,
      session,
      viewerToken: issueToken(this.secret, "viewer", room.pairId, room.expiresAt - Date.now(), viewerTokenId, sessionId)
    };
  }

  get(pairId: string): PairingRoom | undefined {
    const room = this.rooms.get(pairId);
    if (!room || room.expiresAt < Date.now()) {
      if (room) this.rooms.delete(pairId);
      return undefined;
    }
    return room;
  }

  authorize(role: Role, pairId: string, tokenId: string, sessionId?: string): boolean {
    const room = this.get(pairId);
    if (!room) return false;
    if (role === "host") return room.hostTokenId === tokenId;
    const session = sessionId ? room.sessions.get(sessionId) : undefined;
    return session?.viewerTokenId === tokenId;
  }

  attachViewer(pairId: string, sessionId: string, viewer: ClientInfo): void {
    const room = this.get(pairId);
    const session = room?.sessions.get(sessionId);
    if (session) {
      session.viewer = viewer;
    }
  }

  sweep(): void {
    const now = Date.now();
    for (const [pairId, room] of this.rooms.entries()) {
      if (room.expiresAt < now) {
        this.rooms.delete(pairId);
      }
    }
  }

  private generateCode(): string {
    const min = 10 ** (this.pairCodeDigits - 1);
    const max = 10 ** this.pairCodeDigits - 1;
    return String(randomInt(min, max));
  }

  private hashPairCode(pairCode: string): string {
    return createHash("sha256").update(pairCode.replace(/\D/g, "")).digest("hex");
  }
}
