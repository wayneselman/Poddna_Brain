export interface ZoomTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface ZoomRecordingFile {
  id: string;
  meeting_id: string;
  recording_start: string;
  recording_end: string;
  file_type: string;
  file_extension?: string;
  file_size?: number;
  play_url?: string;
  download_url?: string;
  status: string;
  recording_type?: string;
}

export interface ZoomRecordingMeeting {
  uuid: string;
  id: number;
  account_id: string;
  host_id: string;
  host_email: string;
  topic: string;
  type: number;
  start_time: string;
  timezone: string;
  duration: number;
  total_size?: number;
  recording_count?: number;
  recording_files?: ZoomRecordingFile[];
}

export interface ZoomRecordingsListResponse {
  from: string;
  to: string;
  page_count?: number;
  page_size?: number;
  total_records?: number;
  next_page_token?: string;
  meetings: ZoomRecordingMeeting[];
}

export interface ZoomMeetingRecordingsResponse {
  uuid: string;
  id: number;
  account_id: string;
  host_id: string;
  host_email: string;
  topic: string;
  type: number;
  start_time: string;
  timezone: string;
  duration: number;
  total_size?: number;
  recording_count?: number;
  recording_files?: ZoomRecordingFile[];
}

export interface ZoomImportResult {
  meetingsRequested: number;
  meetingsProcessed: number;
  transcriptsFound: number;
  transcriptsDownloaded: number;
  missingTranscripts: string[];
  errors: ZoomImportError[];
}

export interface ZoomImportError {
  meetingId: string;
  step: string;
  status?: number;
  message: string;
}
