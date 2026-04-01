import { storage } from "../storage";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/youtube.readonly",
];

export function isGoogleOAuthConfigured(): boolean {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

export function getRedirectUri(host: string): string {
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}/api/auth/google/callback`;
}

export function getGoogleAuthUrl(host: string, state?: string): string {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error("Google OAuth not configured: Missing GOOGLE_CLIENT_ID");
  }

  const redirectUri = getRedirectUri(host);
  
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    ...(state && { state }),
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
}

export async function exchangeCodeForTokens(code: string, host: string): Promise<GoogleTokens> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth not configured");
  }

  const redirectUri = getRedirectUri(host);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("[GoogleOAuth] Token exchange failed:", error);
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  return response.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth not configured");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("[GoogleOAuth] Token refresh failed:", error);
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  return response.json();
}

export async function getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get user info: ${response.status}`);
  }

  return response.json();
}

export interface YouTubeChannel {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  subscriberCount: number;
  videoCount: number;
  uploadsPlaylistId: string;
}

export async function getYouTubeChannel(accessToken: string): Promise<YouTubeChannel | null> {
  const response = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&mine=true",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[YouTube] Failed to get channel:", response.status, errorText);
    return null;
  }

  const data = await response.json();
  const channel = data.items?.[0];

  if (!channel) {
    return null;
  }

  return {
    id: channel.id,
    title: channel.snippet.title,
    description: channel.snippet.description,
    thumbnailUrl: channel.snippet.thumbnails?.default?.url || "",
    subscriberCount: parseInt(channel.statistics.subscriberCount || "0"),
    videoCount: parseInt(channel.statistics.videoCount || "0"),
    uploadsPlaylistId: channel.contentDetails.relatedPlaylists.uploads,
  };
}

export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  publishedAt: string;
  duration: string;
  durationSeconds: number;
  viewCount: number;
}

function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0");
  const minutes = parseInt(match[2] || "0");
  const seconds = parseInt(match[3] || "0");
  return hours * 3600 + minutes * 60 + seconds;
}

export async function getYouTubeVideos(
  accessToken: string,
  playlistId: string,
  pageToken?: string,
  maxResults: number = 25
): Promise<{ videos: YouTubeVideo[]; nextPageToken?: string }> {
  const params = new URLSearchParams({
    part: "snippet,contentDetails",
    playlistId,
    maxResults: maxResults.toString(),
    ...(pageToken && { pageToken }),
  });

  const playlistResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!playlistResponse.ok) {
    console.error("[YouTube] Failed to get playlist items:", playlistResponse.status);
    return { videos: [] };
  }

  const playlistData = await playlistResponse.json();
  const videoIds = playlistData.items.map((item: any) => item.contentDetails.videoId).join(",");

  if (!videoIds) {
    return { videos: [], nextPageToken: playlistData.nextPageToken };
  }

  const videosResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoIds}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!videosResponse.ok) {
    console.error("[YouTube] Failed to get video details:", videosResponse.status);
    return { videos: [] };
  }

  const videosData = await videosResponse.json();

  const videos: YouTubeVideo[] = videosData.items.map((video: any) => ({
    id: video.id,
    title: video.snippet.title,
    description: video.snippet.description,
    thumbnailUrl: video.snippet.thumbnails?.medium?.url || video.snippet.thumbnails?.default?.url || "",
    publishedAt: video.snippet.publishedAt,
    duration: video.contentDetails.duration,
    durationSeconds: parseDuration(video.contentDetails.duration),
    viewCount: parseInt(video.statistics?.viewCount || "0"),
  }));

  return {
    videos,
    nextPageToken: playlistData.nextPageToken,
  };
}

export async function getValidAccessToken(userId: string): Promise<string | null> {
  const user = await storage.getUser(userId);
  if (!user) return null;

  if (!user.youtubeAccessToken || !user.youtubeRefreshToken) {
    return null;
  }

  const now = new Date();
  const tokenExpires = user.youtubeTokenExpires;

  if (tokenExpires && tokenExpires > now) {
    return user.youtubeAccessToken;
  }

  try {
    const tokens = await refreshAccessToken(user.youtubeRefreshToken);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await storage.updateUserYouTubeTokens(userId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || user.youtubeRefreshToken,
      expiresAt,
    });

    return tokens.access_token;
  } catch (error) {
    console.error("[GoogleOAuth] Failed to refresh token for user:", userId, error);
    return null;
  }
}
