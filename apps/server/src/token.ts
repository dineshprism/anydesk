import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Role } from "@quder/protocol";

const TokenPayloadSchema = z.object({
  role: z.enum(["host", "viewer"]),
  pairId: z.string().min(16),
  sessionId: z.string().min(16).optional(),
  exp: z.number().int().positive(),
  jti: z.string().min(16)
});

export type TokenPayload = z.infer<typeof TokenPayloadSchema>;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function issueToken(
  secret: string,
  role: Role,
  pairId: string,
  ttlMs: number,
  jti: string,
  sessionId?: string
): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      role,
      pairId,
      sessionId,
      exp: Math.floor((Date.now() + ttlMs) / 1000),
      jti
    })
  );
  const signature = sign(`${header}.${payload}`, secret);
  return `${header}.${payload}.${signature}`;
}

export function verifyToken(token: string, secret: string): TokenPayload {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) {
    throw new Error("Malformed token");
  }

  const expected = sign(`${header}.${payload}`, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new Error("Invalid token signature");
  }

  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  const parsed = TokenPayloadSchema.parse(decoded);
  if (parsed.exp * 1000 < Date.now()) {
    throw new Error("Expired token");
  }

  return parsed;
}
