import { getZoomAccessToken } from "./zoomAuth";

export async function downloadTranscriptVtt(downloadUrl: string): Promise<string> {
  const token = await getZoomAccessToken();

  let response = await fetch(downloadUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const urlWithToken = downloadUrl.includes("?")
      ? `${downloadUrl}&access_token=${token}`
      : `${downloadUrl}?access_token=${token}`;

    response = await fetch(urlWithToken);

    if (!response.ok) {
      throw new Error(
        `Failed to download transcript: ${response.status} - ${await response.text()}`
      );
    }
  }

  return await response.text();
}
