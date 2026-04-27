import { randomBytes } from "node:crypto";
import type { IceServerConfig } from "@quder/protocol";

try {
  process.loadEnvFile();
} catch {
  // Production platforms typically inject environment variables directly.
}

function splitList(value: string | undefined): string[] {
  return value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function numberFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const generatedSecret = randomBytes(32).toString("hex");

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: numberFromEnv("PORT", 8080),
  publicUrl: process.env.PUBLIC_URL ?? "http://localhost:5173",
  corsOrigins: splitList(process.env.CORS_ORIGINS ?? "http://localhost:5173"),
  jwtSecret: process.env.JWT_SECRET ?? generatedSecret,
  sessionTtlMs: numberFromEnv("SESSION_TTL_SECONDS", 900) * 1000,
  pairCodeDigits: Math.min(Math.max(numberFromEnv("PAIR_CODE_DIGITS", 9), 6), 12),
  stunUrls: splitList(process.env.STUN_URLS ?? "stun:stun.l.google.com:19302"),
  turnUrls: splitList(process.env.TURN_URLS),
  turnUsername: process.env.TURN_USERNAME,
  turnCredential: process.env.TURN_CREDENTIAL,
  logLevel: process.env.LOG_LEVEL ?? "info"
};

export function iceServers(): IceServerConfig[] {
  const servers: IceServerConfig[] = config.stunUrls.map((url) => ({ urls: url }));

  if (config.turnUrls.length > 0 && config.turnUsername && config.turnCredential) {
    servers.push({
      urls: config.turnUrls,
      username: config.turnUsername,
      credential: config.turnCredential
    });
  }

  return servers;
}
