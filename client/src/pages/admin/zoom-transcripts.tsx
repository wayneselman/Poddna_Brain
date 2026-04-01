import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Upload, FileText, Search, Eye, Calendar, Clock, User, MessageSquare, BarChart3, AlertTriangle, CheckCircle, Target, ShieldAlert, Megaphone, Building2, Pencil, Tag, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

interface ZoomMeeting {
  zoomMeetingId: string;
  topic: string;
  startTime: string;
  durationSec: number | null;
  hostEmail: string;
  companyName: string | null;
  contactName: string | null;
  meetingDate: string | null;
  notes: string | null;
  tags: string[] | null;
  hasTranscript: boolean;
  episodeId: string | null;
  hasAnalysis: boolean;
}

interface ZoomTranscriptDetail {
  meeting: {
    zoomMeetingId: string;
    topic: string;
    startTime: string;
    durationSec: number | null;
    hostEmail: string;
  };
  hasTranscript: boolean;
  hasSpeakerLabels: boolean;
  utterancesJson: Array<{
    speaker: string | null;
    startMs: number;
    endMs: number;
    text: string;
  }>;
  transcriptText: string | null;
}

interface InventoryResponse {
  meetings: ZoomMeeting[];
  total: number;
}

interface ClaimInstance {
  id: string;
  claimText: string;
  claimKind: string;
  speakerRole: string | null;
  startMs: number | null;
  claimMeta: Record<string, any> | null;
}

interface AnalysisResponse {
  episode: {
    id: string;
    title: string;
  };
  hasAnalysis: boolean;
  analysisVersion?: number;
  claimInstances?: ClaimInstance[];
}

interface EditFormState {
  companyName: string;
  contactName: string;
  meetingDate: string;
  notes: string;
  tags: string[];
  newTag: string;
}

function EditMetadataDialog({ meeting, onSaved }: { meeting: ZoomMeeting; onSaved: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EditFormState>({
    companyName: meeting.companyName || "",
    contactName: meeting.contactName || "",
    meetingDate: meeting.meetingDate ? format(new Date(meeting.meetingDate), "yyyy-MM-dd") : "",
    notes: meeting.notes || "",
    tags: meeting.tags || [],
    newTag: "",
  });

  const mutation = useMutation({
    mutationFn: async (data: Partial<EditFormState>) => {
      const body: Record<string, any> = {};
      if (data.companyName !== undefined) body.companyName = data.companyName || null;
      if (data.contactName !== undefined) body.contactName = data.contactName || null;
      if (data.meetingDate !== undefined) body.meetingDate = data.meetingDate || null;
      if (data.notes !== undefined) body.notes = data.notes || null;
      if (data.tags !== undefined) body.tags = data.tags && data.tags.length > 0 ? data.tags : null;
      return apiRequest("PATCH", `/api/admin/zoom/meetings/${meeting.zoomMeetingId}`, body);
    },
    onSuccess: () => {
      toast({ title: "Metadata updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/zoom/inventory"] });
      onSaved();
      setOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    mutation.mutate({
      companyName: form.companyName,
      contactName: form.contactName,
      meetingDate: form.meetingDate,
      notes: form.notes,
      tags: form.tags,
    });
  };

  const addTag = () => {
    const tag = form.newTag.trim();
    if (tag && !form.tags.includes(tag)) {
      setForm(f => ({ ...f, tags: [...f.tags, tag], newTag: "" }));
    }
  };

  const removeTag = (tag: string) => {
    setForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" data-testid={`button-edit-${meeting.zoomMeetingId}`}>
          <Pencil className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Meeting Metadata</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground truncate">{meeting.topic}</p>

          <div className="space-y-2">
            <Label htmlFor="companyName">Company Name</Label>
            <Input
              id="companyName"
              value={form.companyName}
              onChange={(e) => setForm(f => ({ ...f, companyName: e.target.value }))}
              placeholder="e.g. Acme Corp"
              data-testid="input-company-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactName">Contact Name</Label>
            <Input
              id="contactName"
              value={form.contactName}
              onChange={(e) => setForm(f => ({ ...f, contactName: e.target.value }))}
              placeholder="e.g. Jane Smith"
              data-testid="input-contact-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="meetingDate">Meeting Date</Label>
            <Input
              id="meetingDate"
              type="date"
              value={form.meetingDate}
              onChange={(e) => setForm(f => ({ ...f, meetingDate: e.target.value }))}
              data-testid="input-meeting-date"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Meeting notes..."
              className="resize-none"
              rows={3}
              data-testid="input-notes"
            />
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex items-center gap-2">
              <Input
                value={form.newTag}
                onChange={(e) => setForm(f => ({ ...f, newTag: e.target.value }))}
                placeholder="Add tag..."
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                data-testid="input-new-tag"
              />
              <Button variant="outline" size="sm" onClick={addTag} data-testid="button-add-tag">
                <Tag className="w-4 h-4" />
              </Button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {form.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="ml-1 rounded-full"
                      data-testid={`button-remove-tag-${tag}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={mutation.isPending} data-testid="button-save-metadata">
              {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminZoomTranscriptsPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: inventory, isLoading } = useQuery<InventoryResponse>({
    queryKey: ["/api/admin/zoom/inventory"],
  });

  const { data: transcriptDetail, isLoading: isLoadingDetail } = useQuery<ZoomTranscriptDetail>({
    queryKey: ["/api/admin/zoom/transcript", selectedMeetingId],
    enabled: !!selectedMeetingId,
  });

  const { data: analysisData, isLoading: isLoadingAnalysis } = useQuery<AnalysisResponse>({
    queryKey: ["/api/admin/zoom/analysis", selectedEpisodeId],
    enabled: !!selectedEpisodeId,
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/admin/zoom/upload-transcript", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload failed");
      }

      const result = await response.json();
      toast({
        title: "Transcript uploaded",
        description: `${result.utteranceCount} utterances extracted from "${result.title || file.name}"`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/zoom/inventory"] });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const filteredMeetings = inventory?.meetings?.filter(meeting =>
    meeting.topic?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    meeting.hostEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    meeting.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    meeting.contactName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    meeting.zoomMeetingId?.includes(searchQuery)
  ) || [];

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "—";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatTimestamp = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Zoom Transcripts</h1>
          <p className="text-muted-foreground">Upload and browse meeting transcripts</p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.docx"
            onChange={handleFileUpload}
            className="hidden"
            data-testid="input-file-upload"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            data-testid="button-upload-transcript"
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Upload Transcript
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Transcript Library</CardTitle>
              <CardDescription>
                {inventory?.total || 0} meetings imported
              </CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search meetings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-meetings"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredMeetings.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No transcripts found</p>
              <p className="text-sm mt-1">Upload a transcript to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMeetings.map((meeting) => (
                <div
                  key={meeting.zoomMeetingId}
                  className="flex items-center justify-between gap-3 p-4 border rounded-md hover-elevate"
                  data-testid={`meeting-row-${meeting.zoomMeetingId}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate" data-testid={`text-topic-${meeting.zoomMeetingId}`}>{meeting.topic}</span>
                      {meeting.hasTranscript ? (
                        <Badge variant="default" className="bg-green-600 dark:bg-green-700">Has Transcript</Badge>
                      ) : (
                        <Badge variant="secondary">No Transcript</Badge>
                      )}
                      {meeting.hasAnalysis && (
                        <Badge variant="default" className="bg-blue-600 dark:bg-blue-700">
                          <BarChart3 className="w-3 h-3 mr-1" />
                          Analyzed
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                      {meeting.companyName && (
                        <span className="flex items-center gap-1" data-testid={`text-company-${meeting.zoomMeetingId}`}>
                          <Building2 className="w-3 h-3" />
                          {meeting.companyName}
                        </span>
                      )}
                      {meeting.contactName && (
                        <span className="flex items-center gap-1" data-testid={`text-contact-${meeting.zoomMeetingId}`}>
                          <User className="w-3 h-3" />
                          {meeting.contactName}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {meeting.startTime ? format(new Date(meeting.startTime), "MMM d, yyyy") : "—"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDuration(meeting.durationSec)}
                      </span>
                      {!meeting.companyName && !meeting.contactName && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {meeting.hostEmail}
                        </span>
                      )}
                    </div>
                    {meeting.tags && meeting.tags.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {meeting.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs" data-testid={`tag-${meeting.zoomMeetingId}-${tag}`}>
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <EditMetadataDialog meeting={meeting} onSaved={() => {}} />
                    {meeting.hasTranscript && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              setSelectedMeetingId(meeting.zoomMeetingId);
                              setSelectedEpisodeId(meeting.episodeId);
                            }}
                            data-testid={`button-view-${meeting.zoomMeetingId}`}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[80vh]">
                          <DialogHeader>
                            <DialogTitle>{meeting.topic}</DialogTitle>
                            {(meeting.companyName || meeting.contactName) && (
                              <div className="flex items-center gap-3 text-sm text-muted-foreground pt-1">
                                {meeting.companyName && (
                                  <span className="flex items-center gap-1">
                                    <Building2 className="w-3 h-3" />
                                    {meeting.companyName}
                                  </span>
                                )}
                                {meeting.contactName && (
                                  <span className="flex items-center gap-1">
                                    <User className="w-3 h-3" />
                                    {meeting.contactName}
                                  </span>
                                )}
                              </div>
                            )}
                          </DialogHeader>
                          <Tabs defaultValue="analysis" className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                              <TabsTrigger value="analysis" data-testid="tab-analysis">
                                <BarChart3 className="w-4 h-4 mr-2" />
                                Analysis
                              </TabsTrigger>
                              <TabsTrigger value="transcript" data-testid="tab-transcript">
                                <MessageSquare className="w-4 h-4 mr-2" />
                                Transcript
                              </TabsTrigger>
                            </TabsList>
                            <TabsContent value="analysis" className="mt-4">
                              {isLoadingAnalysis ? (
                                <div className="flex items-center justify-center py-12">
                                  <Loader2 className="w-8 h-8 animate-spin" />
                                </div>
                              ) : analysisData?.hasAnalysis && analysisData.claimInstances ? (
                                <ScrollArea className="h-[55vh]">
                                  <div className="space-y-6 pr-4">
                                    {["buyer_claim", "gate_check", "decision_signal", "risk_frame", "seller_emphasis"].map(kind => {
                                      const claims = analysisData.claimInstances?.filter(c => c.claimKind === kind) || [];
                                      if (claims.length === 0) return null;
                                      const icons: Record<string, any> = {
                                        buyer_claim: <Target className="w-4 h-4" />,
                                        gate_check: <CheckCircle className="w-4 h-4" />,
                                        decision_signal: <AlertTriangle className="w-4 h-4" />,
                                        risk_frame: <ShieldAlert className="w-4 h-4" />,
                                        seller_emphasis: <Megaphone className="w-4 h-4" />,
                                      };
                                      const labels: Record<string, string> = {
                                        buyer_claim: "Buyer Claims",
                                        gate_check: "Gate Checks",
                                        decision_signal: "Decision Signals",
                                        risk_frame: "Risk Frames",
                                        seller_emphasis: "Seller Emphasis",
                                      };
                                      return (
                                        <div key={kind}>
                                          <h3 className="font-semibold flex items-center gap-2 mb-3">
                                            {icons[kind]}
                                            {labels[kind]}
                                            <Badge variant="secondary" className="ml-2">{claims.length}</Badge>
                                          </h3>
                                          <div className="space-y-2 pl-6">
                                            {claims.map((claim) => (
                                              <div key={claim.id} className="p-3 border rounded-md bg-muted/30">
                                                <p className="text-sm">{claim.claimText}</p>
                                                {claim.startMs && (
                                                  <span className="text-xs text-muted-foreground mt-1 block">
                                                    @ {formatTimestamp(claim.startMs)}
                                                  </span>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </ScrollArea>
                              ) : (
                                <div className="text-center py-12 text-muted-foreground">
                                  <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                  <p>No analysis available</p>
                                  <p className="text-sm mt-1">Run analysis job to extract buyer signals</p>
                                </div>
                              )}
                            </TabsContent>
                            <TabsContent value="transcript" className="mt-4">
                              {isLoadingDetail ? (
                                <div className="flex items-center justify-center py-12">
                                  <Loader2 className="w-8 h-8 animate-spin" />
                                </div>
                              ) : transcriptDetail?.utterancesJson ? (
                                <ScrollArea className="h-[55vh]">
                                  <div className="space-y-3 pr-4">
                                    {transcriptDetail.utterancesJson.map((utterance, idx) => (
                                      <div key={idx} className="flex gap-3">
                                        <div className="w-16 text-xs text-muted-foreground shrink-0 pt-1">
                                          {formatTimestamp(utterance.startMs)}
                                        </div>
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2 mb-1">
                                            <Badge variant="outline" className="text-xs">
                                              {utterance.speaker || "Unknown"}
                                            </Badge>
                                          </div>
                                          <p className="text-sm">{utterance.text}</p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </ScrollArea>
                              ) : (
                                <p className="text-muted-foreground">No transcript data available</p>
                              )}
                            </TabsContent>
                          </Tabs>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
