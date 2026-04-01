import { type Server } from "node:http";

import express, {
  type Express,
  type Request,
  Response,
  NextFunction,
} from "express";

import { initializeRoutes } from "./routes/index";
import { WebhookHandlers } from "./webhookHandlers";
import { sendCreatorUpgradeEmail } from "./email";

async function handleStripeEvent(event: any) {
  try {
    const { storage } = await import("./storage");
    const type = event.type;
    const data = event.data?.object;

    if (type === "checkout.session.completed" && data?.metadata?.userId) {
      const userId = data.metadata.userId;
      const subscriptionId = data.subscription;
      const customerId = data.customer;
      console.log(`[STRIPE] Checkout completed for user ${userId}, subscription: ${subscriptionId}`);
      await storage.updateUserStripeFields(userId, {
        stripeCustomerId: typeof customerId === "string" ? customerId : undefined,
        stripeSubscriptionId: typeof subscriptionId === "string" ? subscriptionId : undefined,
        subscriptionTier: "creator",
      });
      const upgradedUser = await storage.getUser(userId);
      if (upgradedUser?.email) {
        sendCreatorUpgradeEmail(upgradedUser.email, upgradedUser.firstName).catch(() => {});
      }
    } else if (type === "customer.subscription.deleted" && data?.id) {
      const { db } = await import("./db");
      const { users } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [user] = await db.select().from(users).where(eq(users.stripeSubscriptionId, data.id));
      if (user) {
        console.log(`[STRIPE] Subscription deleted for user ${user.id}`);
        await storage.updateUserStripeFields(user.id, {
          subscriptionTier: "free",
        });
      }
    } else if (type === "invoice.payment_failed") {
      const customerId = data?.customer;
      console.log(`[STRIPE] Invoice payment failed for customer ${customerId}. Not downgrading — Stripe will retry.`);
    }
  } catch (err: any) {
    console.error("[STRIPE] Event handler error:", err.message);
  }
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export const app = express();

// Health check endpoint for monitoring
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }
    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      if (!Buffer.isBuffer(req.body)) {
        console.error('[STRIPE] Webhook body is not a Buffer');
        return res.status(500).json({ error: 'Webhook processing error' });
      }
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);

      const payload = JSON.parse(req.body.toString());
      await handleStripeEvent(payload);

      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('[STRIPE] Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  limit: '50mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

export default async function runApp(
  setup: (app: Express, server: Server) => Promise<void>,
): Promise<Server> {
  // Health check routes are already registered at module initialization (top of file)
  // This ensures they respond before any other middleware

  const server = await initializeRoutes(app);

  // Global error handler with proper logging
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    
    // Log all errors with context
    const errorContext = {
      status,
      message,
      path: req.path,
      method: req.method,
      ip: req.ip,
      userId: (req as any).user?.claims?.sub || "anonymous",
      timestamp: new Date().toISOString(),
    };
    
    if (status >= 500) {
      // Log full error for 500s
      console.error("[ERROR] Server error:", errorContext, err.stack);
    } else if (status === 401 || status === 403) {
      // Log auth failures
      console.warn("[AUTH] Access denied:", errorContext);
    } else {
      // Log other client errors briefly
      console.warn("[WARN] Client error:", errorContext);
    }

    // Send clean response (don't expose internal details in production)
    const isProduction = process.env.NODE_ENV === "production";
    res.status(status).json({ 
      error: isProduction && status >= 500 ? "Internal Server Error" : message,
      ...(isProduction ? {} : { stack: err.stack })
    });
  });

  // importantly run the final setup after setting up all the other routes so
  // the catch-all route doesn't interfere with the other routes
  await setup(app, server);

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  
  return new Promise((resolve) => {
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      log(`serving on port ${port}`);
      resolve(server);
    });
  });
}
