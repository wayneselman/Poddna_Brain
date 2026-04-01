import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return { apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email };
}

async function getResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail,
  };
}

export async function sendWelcomeEmail(toEmail: string, name?: string | null) {
  try {
    const { client, fromEmail } = await getResendClient();
    const displayName = name || 'there';

    await client.emails.send({
      from: fromEmail || 'PODDNA <noreply@poddna.com>',
      to: toEmail,
      subject: 'Welcome to PODDNA',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
          <div style="text-align: center; margin-bottom: 32px;">
            <div style="display: inline-block; background: #f5c542; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px;">
              <span style="font-size: 20px; font-weight: 800; color: #0a0a0f; letter-spacing: -0.5px;">PODDNA</span>
            </div>
          </div>
          <h1 style="font-size: 22px; font-weight: 700; margin: 0 0 16px;">Hey ${displayName},</h1>
          <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 16px;">
            Welcome to PODDNA — the podcast intelligence platform that finds the moments that matter.
          </p>
          <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 16px;">
            You can start by pasting any YouTube podcast URL into the analyzer. We'll detect viral moments, map narrative structure, and surface patterns across episodes.
          </p>
          <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 24px;">
            Your free account includes 3 clip downloads to get started.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="https://poddna.replit.app/creator" style="display: inline-block; background: #f5c542; color: #0a0a0f; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px;">
              Analyze Your First Episode
            </a>
          </div>
          <p style="font-size: 13px; color: #999; margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px;">
            PODDNA — Podcast Intelligence Platform
          </p>
        </div>
      `,
    });
    console.log(`[EMAIL] Welcome email sent to ${toEmail}`);
  } catch (err: any) {
    console.error(`[EMAIL] Failed to send welcome email to ${toEmail}:`, err.message);
  }
}

export async function sendCreatorUpgradeEmail(toEmail: string, name?: string | null) {
  try {
    const { client, fromEmail } = await getResendClient();
    const displayName = name || 'there';

    await client.emails.send({
      from: fromEmail || 'PODDNA <noreply@poddna.com>',
      to: toEmail,
      subject: 'Welcome to the Creator Plan',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
          <div style="text-align: center; margin-bottom: 32px;">
            <div style="display: inline-block; background: #f5c542; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px;">
              <span style="font-size: 20px; font-weight: 800; color: #0a0a0f; letter-spacing: -0.5px;">PODDNA</span>
            </div>
          </div>
          <h1 style="font-size: 22px; font-weight: 700; margin: 0 0 16px;">You're on the Creator plan!</h1>
          <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 16px;">
            Hey ${displayName}, thanks for upgrading. Here's what you just unlocked:
          </p>
          <ul style="font-size: 15px; line-height: 1.8; color: #444; padding-left: 20px; margin: 0 0 16px;">
            <li>Unlimited clip downloads</li>
            <li>Full episode intelligence reports</li>
            <li>Narrative maps and entity analysis</li>
            <li>Chapter timestamps</li>
            <li>Priority processing</li>
          </ul>
          <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 24px;">
            Head to your dashboard to start analyzing episodes with full access.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="https://poddna.replit.app/creator/dashboard" style="display: inline-block; background: #f5c542; color: #0a0a0f; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px;">
              Go to Dashboard
            </a>
          </div>
          <p style="font-size: 13px; color: #999; margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px;">
            PODDNA — Podcast Intelligence Platform
          </p>
        </div>
      `,
    });
    console.log(`[EMAIL] Creator upgrade email sent to ${toEmail}`);
  } catch (err: any) {
    console.error(`[EMAIL] Failed to send upgrade email to ${toEmail}:`, err.message);
  }
}

export async function sendClipReadyEmail(
  toEmail: string,
  episodeTitle: string,
  momentTitle: string,
  platform: string,
  downloadUrl: string,
  expiresAt: Date
) {
  try {
    const { client, fromEmail } = await getResendClient();
    const platformLabel = platform === "tiktok" ? "TikTok" : platform === "reels" ? "Instagram Reels" : platform === "shorts" ? "YouTube Shorts" : platform;
    const expiryStr = expiresAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });

    await client.emails.send({
      from: fromEmail || 'PODDNA <noreply@poddna.com>',
      to: toEmail,
      subject: 'Your PODDNA clip is ready to download',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
          <div style="text-align: center; margin-bottom: 32px;">
            <div style="display: inline-block; background: #f5c542; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px;">
              <span style="font-size: 20px; font-weight: 800; color: #0a0a0f; letter-spacing: -0.5px;">PODDNA</span>
            </div>
          </div>
          <h1 style="font-size: 22px; font-weight: 700; margin: 0 0 16px;">Your clip is ready!</h1>
          <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 8px;">
            <strong>${episodeTitle}</strong>
          </p>
          <p style="font-size: 14px; line-height: 1.5; color: #666; margin: 0 0 16px;">
            "${momentTitle}" — optimized for ${platformLabel}
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${downloadUrl}" style="display: inline-block; background: #f5c542; color: #0a0a0f; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px;">
              Download Your Clip
            </a>
          </div>
          <p style="font-size: 13px; color: #e74c3c; text-align: center; margin: 0 0 24px;">
            This link expires ${expiryStr}
          </p>
          <div style="text-align: center;">
            <a href="https://poddna.replit.app/creator" style="font-size: 13px; color: #666; text-decoration: underline;">
              Analyze another episode
            </a>
          </div>
          <p style="font-size: 13px; color: #999; margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px;">
            PODDNA — Podcast Intelligence Platform
          </p>
        </div>
      `,
    });
    console.log(`[EMAIL] Clip ready email sent to ${toEmail}`);
  } catch (err: any) {
    console.error(`[EMAIL] Failed to send clip ready email to ${toEmail}:`, err.message);
  }
}
