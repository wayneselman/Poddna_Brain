// Based on Replit Auth blueprint (blueprint:javascript_log_in_with_replit)
import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import crypto from "crypto";

// Extend Express User type to include Replit Auth claims
declare global {
  namespace Express {
    interface User {
      claims?: {
        sub: string;
        email?: string;
        first_name?: string;
        last_name?: string;
        profile_image_url?: string;
        exp?: number;
        [key: string]: any;
      };
      access_token?: string;
      refresh_token?: string;
      expires_at?: number;
    }
  }
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 30 * 24 * 60 * 60 * 1000; // 30 days for longer persistence
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  const isProduction = process.env.NODE_ENV === "production";
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true, // Extend session on each request
    cookie: {
      httpOnly: true,
      secure: isProduction, // Only require HTTPS in production
      sameSite: isProduction ? "lax" : "lax", // Allow cross-site for OIDC redirects
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(
  claims: any,
) {
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  // Keep track of registered strategies
  const registeredStrategies = new Set<string>();

  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify,
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};

// Optional auth - populates req.user if session exists, but doesn't require it
// Use for public routes that show different content for logged-in users
export const optionalAuth: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  // No user = public access, continue
  if (!req.isAuthenticated || !req.isAuthenticated() || !user?.expires_at) {
    return next();
  }

  // User exists - check if token needs refresh
  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  // Try to refresh expired token
  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    return next(); // Can't refresh, but allow public access
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
  } catch {
    // Refresh failed, continue as public user
  }
  return next();
};

// Middleware to require admin role - must be used AFTER isAuthenticated
export const requireAdmin: RequestHandler = async (req, res, next) => {
  const user = req.user as any;
  
  if (!user?.claims?.sub) {
    console.warn("[AUTH] requireAdmin: No user sub in claims");
    return res.status(403).json({ message: "Forbidden: Admin access required" });
  }

  try {
    const dbUser = await storage.getUser(user.claims.sub);
    
    if (!dbUser) {
      console.warn(`[AUTH] requireAdmin: User ${user.claims.sub} not found in database`);
      return res.status(403).json({ message: "Forbidden: Admin access required" });
    }

    if (dbUser.role !== "admin") {
      console.warn(`[AUTH] requireAdmin: User ${user.claims.sub} has role '${dbUser.role}', not admin`);
      return res.status(403).json({ message: "Forbidden: Admin access required" });
    }

    // Attach the full user object to request for downstream use
    (req as any).dbUser = dbUser;
    return next();
  } catch (error) {
    console.error("[AUTH] requireAdmin: Error checking user role:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Middleware to require admin or moderator role - must be used AFTER isAuthenticated
export const requireAdminOrModerator: RequestHandler = async (req, res, next) => {
  const user = req.user as any;
  
  if (!user?.claims?.sub) {
    console.warn("[AUTH] requireAdminOrModerator: No user sub in claims");
    return res.status(403).json({ message: "Forbidden: Admin or moderator access required" });
  }

  try {
    const dbUser = await storage.getUser(user.claims.sub);
    
    if (!dbUser) {
      console.warn(`[AUTH] requireAdminOrModerator: User ${user.claims.sub} not found in database`);
      return res.status(403).json({ message: "Forbidden: Admin or moderator access required" });
    }

    if (dbUser.role !== "admin" && dbUser.role !== "moderator") {
      console.warn(`[AUTH] requireAdminOrModerator: User ${user.claims.sub} has role '${dbUser.role}', not admin or moderator`);
      return res.status(403).json({ message: "Forbidden: Admin or moderator access required" });
    }

    // Attach the full user object to request for downstream use
    (req as any).dbUser = dbUser;
    return next();
  } catch (error) {
    console.error("[AUTH] requireAdminOrModerator: Error checking user role:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Timing-safe comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  // Buffer both strings first to ensure constant-time comparison
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  
  if (bufA.length !== bufB.length) {
    // Compare bufA against itself to prevent timing leak on length difference
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// Middleware for admin API key authentication (for external scripts/tools)
// Accepts either session auth OR API key in X-Admin-API-Key header
export const requireAdminSessionOrKey: RequestHandler = async (req, res, next) => {
  const apiKey = req.headers["x-admin-api-key"] as string | undefined;
  const expectedKey = process.env.ADMIN_API_KEY;

  // Option 1: API key authentication
  if (apiKey && expectedKey) {
    if (timingSafeEqual(apiKey, expectedKey)) {
      console.log("[AUTH] Admin API key authenticated successfully");
      (req as any).authMethod = "api_key";
      return next();
    } else {
      console.warn("[AUTH] Invalid admin API key provided");
      return res.status(401).json({ message: "Invalid API key" });
    }
  }

  // Option 2: Session-based authentication (for browser users)
  const user = req.user as any;
  
  if (!req.isAuthenticated || !req.isAuthenticated() || !user?.claims?.sub) {
    return res.status(401).json({ 
      message: "Unauthorized: Provide X-Admin-API-Key header or login via browser" 
    });
  }

  // Verify admin role for session auth
  try {
    const dbUser = await storage.getUser(user.claims.sub);
    
    if (!dbUser || dbUser.role !== "admin") {
      return res.status(403).json({ message: "Forbidden: Admin access required" });
    }

    (req as any).dbUser = dbUser;
    (req as any).authMethod = "session";
    return next();
  } catch (error) {
    console.error("[AUTH] requireAdminSessionOrKey: Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
