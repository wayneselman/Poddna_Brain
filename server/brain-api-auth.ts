import type { RequestHandler } from "express";
import crypto from "crypto";
import { storage } from "./storage";
import type { BrainApiKey } from "@shared/schema";

declare global {
  namespace Express {
    interface Request {
      brainApiKey?: BrainApiKey;
    }
  }
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function hashKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

export function generateBrainApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = `pk_brain_${crypto.randomBytes(32).toString("hex")}`;
  const hash = hashKey(raw);
  const prefix = raw.substring(0, 16);
  return { raw, hash, prefix };
}

export const requireBrainApiKey: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Authentication required",
      message: "Provide a valid API key via Authorization: Bearer <key>",
    });
  }

  const rawKey = authHeader.slice(7).trim();
  if (!rawKey) {
    return res.status(401).json({ error: "Empty API key" });
  }

  try {
    const keyHash = hashKey(rawKey);
    const apiKey = await storage.getBrainApiKeyByHash(keyHash);

    if (!apiKey) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    if (!apiKey.isActive) {
      return res.status(403).json({ error: "API key has been revoked" });
    }

    const now = Date.now();
    const rateKey = apiKey.id;
    let rateState = rateLimitMap.get(rateKey);

    if (!rateState || now > rateState.resetAt) {
      rateState = { count: 0, resetAt: now + 60_000 };
      rateLimitMap.set(rateKey, rateState);
    }

    rateState.count++;
    if (rateState.count > apiKey.rateLimitPerMin) {
      const retryAfter = Math.ceil((rateState.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfter.toString());
      res.setHeader("X-RateLimit-Limit", apiKey.rateLimitPerMin.toString());
      res.setHeader("X-RateLimit-Remaining", "0");
      return res.status(429).json({
        error: "Rate limit exceeded",
        retryAfter,
      });
    }

    res.setHeader("X-RateLimit-Limit", apiKey.rateLimitPerMin.toString());
    res.setHeader("X-RateLimit-Remaining", (apiKey.rateLimitPerMin - rateState.count).toString());

    storage.touchBrainApiKeyLastUsed(apiKey.id).catch(() => {});

    req.brainApiKey = apiKey;
    next();
  } catch (error) {
    console.error("[BRAIN-AUTH] Error validating API key:", error);
    return res.status(500).json({ error: "Authentication service error" });
  }
};
