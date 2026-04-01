import crypto from "crypto";
import { storage } from "./storage";
import type { Webhook } from "@shared/schema";

/**
 * Main webhook dispatcher - fires events to all subscribed webhooks
 * Does NOT block the caller (fire-and-forget with error logging)
 */
export async function fireWebhookEvent(
  eventType: string,
  payload: Record<string, any>
): Promise<void> {
  try {
    const webhooks = await storage.getActiveWebhooksForEvent(eventType);
    
    // Fire deliveries in background without awaiting
    webhooks.forEach((webhook) => {
      deliverWebhook(webhook, eventType, payload).catch((error) => {
        console.error(
          `Failed to deliver webhook ${webhook.id} for event ${eventType}:`,
          error
        );
      });
    });
  } catch (error) {
    console.error(`Error fetching webhooks for event ${eventType}:`, error);
  }
}

/**
 * Delivers a single webhook - handles HTTP delivery, signature generation, and failure tracking
 */
async function deliverWebhook(
  webhook: Webhook,
  eventType: string,
  payload: Record<string, any>
): Promise<void> {
  const deliveryId = crypto.randomUUID();
  const jsonPayload = JSON.stringify(payload);
  
  // Compute HMAC-SHA256 signature
  const signature = crypto
    .createHmac("sha256", webhook.secret)
    .update(jsonPayload)
    .digest("hex");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": `sha256=${signature}`,
        "X-Webhook-Event": eventType,
        "X-Webhook-Delivery-Id": deliveryId,
      },
      body: jsonPayload,
      signal: controller.signal,
    });

    const responseBody = await response.text();
    const success = response.ok;
    
    // Log delivery
    await storage.createWebhookDelivery({
      webhookId: webhook.id,
      eventType,
      payload,
      statusCode: response.status,
      responseBody: responseBody.substring(0, 500),
      success,
      attemptCount: 1,
    });

    if (success) {
      // Reset failure count on successful delivery
      await storage.resetWebhookFailure(webhook.id);
    } else {
      // Handle failed delivery
      await storage.incrementWebhookFailure(webhook.id);
      
      // Check if we should auto-disable the webhook
      // If this webhook already had failureCount >= 9, after increment it will be >= 10
      if (webhook.failureCount >= 9) {
        await storage.updateWebhook(webhook.id, { isActive: false });
        console.warn(
          `Webhook ${webhook.id} auto-disabled after 10 consecutive failures`
        );
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Log failed delivery
    await storage.createWebhookDelivery({
      webhookId: webhook.id,
      eventType,
      payload,
      statusCode: undefined,
      responseBody: errorMessage.substring(0, 500),
      success: false,
      attemptCount: 1,
    });

    // Handle failure
    await storage.incrementWebhookFailure(webhook.id);
    
    // Check if we should auto-disable the webhook
    // If this webhook already had failureCount >= 9, after increment it will be >= 10
    if (webhook.failureCount >= 9) {
      await storage.updateWebhook(webhook.id, { isActive: false });
      console.warn(
        `Webhook ${webhook.id} auto-disabled after 10 consecutive failures`
      );
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
