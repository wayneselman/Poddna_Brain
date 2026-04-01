import { getZoomAccessToken } from "./zoomAuth";
import type {
  ZoomMeetingRecordingsResponse,
  ZoomRecordingsListResponse,
  ZoomRecordingFile,
} from "./zoomTypes";

const ZOOM_API_BASE = "https://api.zoom.us/v2";

export async function getMeetingRecordings(
  meetingId: string
): Promise<ZoomMeetingRecordingsResponse | null> {
  const token = await getZoomAccessToken();
  const url = `${ZOOM_API_BASE}/meetings/${encodeURIComponent(meetingId)}/recordings`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Zoom API error: ${response.status} - ${errorText}`);
  }

  return (await response.json()) as ZoomMeetingRecordingsResponse;
}

export async function listUserRecordings(
  userId: string,
  from: string,
  to: string,
  pageToken?: string
): Promise<ZoomRecordingsListResponse> {
  const token = await getZoomAccessToken();
  let url = `${ZOOM_API_BASE}/users/${encodeURIComponent(userId)}/recordings?from=${from}&to=${to}&page_size=300`;

  if (pageToken) {
    url += `&next_page_token=${encodeURIComponent(pageToken)}`;
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Zoom API error: ${response.status} - ${errorText}`);
  }

  return (await response.json()) as ZoomRecordingsListResponse;
}

export function findTranscriptFile(
  files?: ZoomRecordingFile[]
): ZoomRecordingFile | null {
  if (!files || files.length === 0) return null;

  const vttFile = files.find(
    (f) => f.file_type === "VTT" && f.download_url
  );
  if (vttFile) return vttFile;

  const transcriptFile = files.find(
    (f) =>
      f.recording_type?.toLowerCase().includes("transcript") && f.download_url
  );
  if (transcriptFile) return transcriptFile;

  return null;
}
