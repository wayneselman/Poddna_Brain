import { Router } from "express";
import { storage } from "../storage";
import { 
  isGoogleOAuthConfigured, 
  getGoogleAuthUrl, 
  exchangeCodeForTokens, 
  getGoogleUserInfo,
  getYouTubeChannel,
  getYouTubeVideos,
  getValidAccessToken,
  getRedirectUri,
} from "../services/google-oauth";
import { isAuthenticated } from "../replitAuth";

const router = Router();

router.get("/api/auth/google/configured", (req, res) => {
  res.json({ configured: isGoogleOAuthConfigured() });
});

router.get("/api/auth/google", isAuthenticated, (req, res) => {
  try {
    const user = req.user as any;
    const state = user?.claims?.sub || "";
    const host = req.get("host") || "localhost:5000";
    const authUrl = getGoogleAuthUrl(host, state);
    console.log("[GoogleAuth] Redirecting to Google OAuth with redirect URI:", getRedirectUri(host));
    res.redirect(authUrl);
  } catch (error: any) {
    console.error("[GoogleAuth] Error generating auth URL:", error);
    res.redirect("/app?error=google_auth_failed");
  }
});

router.get("/api/auth/google/callback", async (req, res) => {
  console.log("[GoogleAuth] Callback received, query:", req.query);
  const { code, state, error } = req.query;

  if (error) {
    console.error("[GoogleAuth] OAuth error:", error);
    return res.redirect("/app?error=google_auth_denied");
  }

  if (!code || typeof code !== "string") {
    console.error("[GoogleAuth] No auth code received");
    return res.redirect("/app?error=no_auth_code");
  }

  // Try to get user from session first, fallback to state parameter
  const user = req.user as any;
  let userId = user?.claims?.sub;
  
  // If no session, use state parameter (which contains the userId)
  if (!userId && state && typeof state === "string") {
    userId = state;
    console.log("[GoogleAuth] Using state as userId:", userId);
  }
  
  console.log("[GoogleAuth] User ID:", userId);

  if (!userId) {
    console.error("[GoogleAuth] No userId found");
    return res.redirect("/app?error=not_authenticated");
  }

  try {
    const host = req.get("host") || "localhost:5000";
    console.log("[GoogleAuth] Exchanging code for tokens, host:", host);
    const tokens = await exchangeCodeForTokens(code, host);
    console.log("[GoogleAuth] Got tokens, expires_in:", tokens.expires_in);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    const channel = await getYouTubeChannel(tokens.access_token);
    console.log("[GoogleAuth] Got channel:", channel?.title);

    await storage.updateUserYouTubeTokens(userId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || "",
      expiresAt,
      channelId: channel?.id,
      channelTitle: channel?.title,
    });

    console.log("[GoogleAuth] YouTube connected for user:", userId, "Channel:", channel?.title);
    res.redirect("/app?youtube=connected");
  } catch (error: any) {
    console.error("[GoogleAuth] Token exchange failed:", error);
    res.redirect("/app?error=token_exchange_failed");
  }
});

router.get("/api/auth/google/disconnect", isAuthenticated, async (req, res) => {
  const user = req.user as any;
  const userId = user?.claims?.sub;

  if (!userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  try {
    await storage.updateUserYouTubeTokens(userId, {
      accessToken: "",
      refreshToken: "",
      expiresAt: new Date(0),
      channelId: undefined,
      channelTitle: undefined,
    });
    res.json({ success: true });
  } catch (error: any) {
    console.error("[GoogleAuth] Disconnect failed:", error);
    res.status(500).json({ message: "Failed to disconnect YouTube" });
  }
});

router.get("/api/youtube/channel", isAuthenticated, async (req, res) => {
  const user = req.user as any;
  const userId = user?.claims?.sub;

  if (!userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    return res.status(401).json({ message: "YouTube not connected", needsConnect: true });
  }

  try {
    const channel = await getYouTubeChannel(accessToken);
    if (!channel) {
      return res.status(404).json({ message: "No YouTube channel found" });
    }
    res.json(channel);
  } catch (error: any) {
    console.error("[YouTube] Failed to get channel:", error);
    res.status(500).json({ message: "Failed to get channel" });
  }
});

router.get("/api/youtube/videos", isAuthenticated, async (req, res) => {
  const user = req.user as any;
  const userId = user?.claims?.sub;

  if (!userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    return res.status(401).json({ message: "YouTube not connected", needsConnect: true });
  }

  const { pageToken, limit } = req.query;

  try {
    const dbUser = await storage.getUser(userId);
    if (!dbUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const channel = await getYouTubeChannel(accessToken);
    if (!channel) {
      return res.status(404).json({ message: "No YouTube channel found" });
    }

    const maxResults = limit ? parseInt(limit as string) : 25;
    const result = await getYouTubeVideos(
      accessToken, 
      channel.uploadsPlaylistId, 
      pageToken as string | undefined,
      Math.min(maxResults, 50)
    );

    res.json({
      videos: result.videos,
      nextPageToken: result.nextPageToken,
      channel: {
        id: channel.id,
        title: channel.title,
        thumbnailUrl: channel.thumbnailUrl,
      },
    });
  } catch (error: any) {
    console.error("[YouTube] Failed to get videos:", error);
    res.status(500).json({ message: "Failed to get videos" });
  }
});

router.get("/api/youtube/video/:videoId", isAuthenticated, async (req, res) => {
  const user = req.user as any;
  const userId = user?.claims?.sub;
  const { videoId } = req.params;

  if (!userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    return res.status(401).json({ message: "YouTube not connected", needsConnect: true });
  }

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.status}`);
    }

    const data = await response.json();
    const video = data.items?.[0];

    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }

    res.json({
      id: video.id,
      title: video.snippet.title,
      description: video.snippet.description,
      thumbnailUrl: video.snippet.thumbnails?.medium?.url || video.snippet.thumbnails?.default?.url,
      publishedAt: video.snippet.publishedAt,
      duration: video.contentDetails.duration,
      viewCount: parseInt(video.statistics?.viewCount || "0"),
      channelTitle: video.snippet.channelTitle,
    });
  } catch (error: any) {
    console.error("[YouTube] Failed to get video:", error);
    res.status(500).json({ message: "Failed to get video details" });
  }
});

export default router;
