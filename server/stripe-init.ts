import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from './stripeClient';

export async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.warn('[STRIPE] DATABASE_URL not set — skipping Stripe initialization');
    return;
  }

  try {
    console.log('[STRIPE] Initializing schema...');
    await runMigrations({
      databaseUrl,
      schema: 'stripe'
    });
    console.log('[STRIPE] Schema ready');

    const stripeSync = await getStripeSync();

    console.log('[STRIPE] Setting up managed webhook...');
    const domains = process.env.REPLIT_DOMAINS?.split(',') || [];
    if (domains.length > 0) {
      const webhookBaseUrl = `https://${domains[0]}`;
      try {
        const result = await stripeSync.findOrCreateManagedWebhook(
          `${webhookBaseUrl}/api/stripe/webhook`
        );
        const webhookUrl = result?.webhook?.url || result?.url || `${webhookBaseUrl}/api/stripe/webhook`;
        console.log(`[STRIPE] Webhook configured: ${webhookUrl}`);
      } catch (webhookErr: any) {
        console.warn('[STRIPE] Webhook setup warning:', webhookErr.message);
      }
    } else {
      console.warn('[STRIPE] No REPLIT_DOMAINS found — skipping webhook setup');
    }

    console.log('[STRIPE] Syncing data in background...');
    stripeSync.syncBackfill()
      .then(() => console.log('[STRIPE] Data synced'))
      .catch((err: any) => console.error('[STRIPE] Sync error:', err));
  } catch (error) {
    console.error('[STRIPE] Failed to initialize:', error);
  }
}
