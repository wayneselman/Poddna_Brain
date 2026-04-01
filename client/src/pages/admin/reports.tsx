import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Loader2, 
  Flag,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Check,
  X,
  Eye,
  AlertTriangle,
  Trash2,
  Ban
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface AnnotationReport {
  id: string;
  annotationId: string;
  reporterId: string;
  reason: string;
  details: string | null;
  status: "pending" | "reviewed" | "dismissed" | "actioned";
  reviewedAt: string | null;
  reviewedBy: string | null;
  resolution: string | null;
  createdAt: string;
  reporter: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
  annotation: {
    id: string;
    text: string | null;
    content: string;
    userId: string;
  };
  annotationAuthor: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
  reviewer: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

interface ReportsResponse {
  reports: AnnotationReport[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

const REASON_LABELS: Record<string, string> = {
  spam: "Spam or Advertising",
  harassment: "Harassment or Abuse",
  misinformation: "Misinformation",
  offtopic: "Off-topic or Irrelevant",
  other: "Other",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "default",
  reviewed: "secondary",
  dismissed: "outline",
  actioned: "destructive",
};

const PAGE_SIZE = 20;

export default function AdminReportsPage() {
  const { toast } = useToast();
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<AnnotationReport | null>(null);
  const [actionType, setActionType] = useState<"dismiss" | "action">("dismiss");
  const [adminNotes, setAdminNotes] = useState("");
  const [deleteAnnotation, setDeleteAnnotation] = useState(false);

  const { data, isLoading, isFetching } = useQuery<ReportsResponse>({
    queryKey: ["/api/admin/reports", statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: PAGE_SIZE.toString(),
        offset: (page * PAGE_SIZE).toString(),
        status: statusFilter,
      });
      const res = await fetch(`/api/admin/reports?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch reports");
      return res.json();
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ 
      reportId, 
      status, 
      notes,
      deleteAnnotation
    }: { 
      reportId: string; 
      status: "dismissed" | "actioned"; 
      notes?: string;
      deleteAnnotation?: boolean;
    }) => {
      const res = await apiRequest("PATCH", `/api/admin/reports/${reportId}`, {
        status,
        adminNotes: notes,
        deleteAnnotation,
      });
      if (!res.ok) throw new Error("Failed to update report");
      return await res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] });
      toast({ 
        title: variables.status === "dismissed" ? "Report dismissed" : "Action taken",
        description: variables.deleteAnnotation 
          ? "Report reviewed and annotation removed"
          : "Report has been reviewed",
      });
      setActionDialogOpen(false);
      setSelectedReport(null);
      setAdminNotes("");
      setDeleteAnnotation(false);
    },
    onError: () => {
      toast({ 
        title: "Failed to update report", 
        description: "Please try again",
        variant: "destructive" 
      });
    },
  });

  const handleOpenAction = (report: AnnotationReport, type: "dismiss" | "action") => {
    setSelectedReport(report);
    setActionType(type);
    setAdminNotes("");
    setDeleteAnnotation(false);
    setActionDialogOpen(true);
  };

  const handleConfirmAction = () => {
    if (!selectedReport) return;
    reviewMutation.mutate({
      reportId: selectedReport.id,
      status: actionType === "dismiss" ? "dismissed" : "actioned",
      notes: adminNotes.trim() || undefined,
      deleteAnnotation: actionType === "action" ? deleteAnnotation : false,
    });
  };

  const totalPages = Math.ceil((data?.pagination.total || 0) / PAGE_SIZE);

  const getUserName = (user: { firstName: string | null; lastName: string | null; email: string }) => {
    if (user.firstName || user.lastName) {
      return [user.firstName, user.lastName].filter(Boolean).join(" ");
    }
    return user.email.split("@")[0];
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Flag className="h-6 w-6 text-muted-foreground" />
          Annotation Reports
        </h1>
        <p className="text-muted-foreground mt-1">
          Review and manage user-submitted reports
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="status-filter">Status:</Label>
          <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPage(0); }}>
            <SelectTrigger id="status-filter" className="w-40" data-testid="select-report-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
              <SelectItem value="actioned">Actioned</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {data && (
          <span className="text-sm text-muted-foreground">
            {data.pagination.total} report{data.pagination.total !== 1 ? "s" : ""} found
          </span>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            {statusFilter === "pending" && <AlertTriangle className="h-5 w-5 text-yellow-500" />}
            {statusFilter === "pending" ? "Pending Reports" : 
             statusFilter === "dismissed" ? "Dismissed Reports" :
             statusFilter === "actioned" ? "Actioned Reports" :
             statusFilter === "reviewed" ? "Reviewed Reports" : "All Reports"}
          </CardTitle>
          <CardDescription>
            {statusFilter === "pending" 
              ? "Reports waiting for review"
              : `Showing ${statusFilter === "all" ? "all" : statusFilter} reports`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !data?.reports?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <Flag className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No reports found</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Annotation</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Reporter</TableHead>
                    <TableHead>Reported</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.reports.map((report) => (
                    <TableRow key={report.id} data-testid={`row-report-${report.id}`}>
                      <TableCell className="font-medium">
                        <div className="space-y-1">
                          <p className="text-sm line-clamp-2" title={report.annotation.content}>
                            "{report.annotation.content}"
                          </p>
                          <p className="text-xs text-muted-foreground">
                            by {getUserName(report.annotationAuthor)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge variant="outline">
                            {REASON_LABELS[report.reason] || report.reason}
                          </Badge>
                          {report.details && (
                            <p className="text-xs text-muted-foreground line-clamp-2" title={report.details}>
                              {report.details}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {getUserName(report.reporter)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[report.status]}>
                          {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {report.status === "pending" ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenAction(report, "dismiss")}
                              disabled={reviewMutation.isPending}
                              data-testid={`button-dismiss-${report.id}`}
                            >
                              <X className="h-4 w-4 mr-1" />
                              Dismiss
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleOpenAction(report, "action")}
                              disabled={reviewMutation.isPending}
                              data-testid={`button-action-${report.id}`}
                            >
                              <Ban className="h-4 w-4 mr-1" />
                              Take Action
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedReport(report);
                              setActionDialogOpen(true);
                            }}
                            data-testid={`button-view-${report.id}`}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Page {page + 1} of {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0 || isFetching}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => p + 1)}
                      disabled={page >= totalPages - 1 || isFetching}
                      data-testid="button-next-page"
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedReport?.status === "pending" 
                ? (actionType === "dismiss" ? "Dismiss Report" : "Take Action on Report")
                : "Report Details"}
            </DialogTitle>
            <DialogDescription>
              {selectedReport?.status === "pending" 
                ? (actionType === "dismiss" 
                    ? "Mark this report as not requiring action."
                    : "Take action on this reported annotation.")
                : `This report was ${selectedReport?.status}.`}
            </DialogDescription>
          </DialogHeader>

          {selectedReport && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Reported Content</Label>
                <div className="p-3 bg-muted rounded-md text-sm italic">
                  "{selectedReport.annotation.content}"
                </div>
                <p className="text-xs text-muted-foreground">
                  Posted by {getUserName(selectedReport.annotationAuthor)}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Report Reason</Label>
                <Badge variant="outline">
                  {REASON_LABELS[selectedReport.reason] || selectedReport.reason}
                </Badge>
                {selectedReport.details && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedReport.details}
                  </p>
                )}
              </div>

              {selectedReport.status === "pending" && (
                <>
                  {actionType === "action" && (
                    <div className="flex items-center space-x-2 p-3 bg-destructive/10 rounded-md border border-destructive/20">
                      <input
                        type="checkbox"
                        id="delete-annotation"
                        checked={deleteAnnotation}
                        onChange={(e) => setDeleteAnnotation(e.target.checked)}
                        className="h-4 w-4"
                        data-testid="checkbox-delete-annotation"
                      />
                      <Label htmlFor="delete-annotation" className="text-sm font-medium text-destructive">
                        <Trash2 className="h-4 w-4 inline mr-1" />
                        Delete this annotation
                      </Label>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="admin-notes">Admin Notes (optional)</Label>
                    <Textarea
                      id="admin-notes"
                      placeholder="Add any notes about this decision..."
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      className="min-h-[80px]"
                      data-testid="textarea-admin-notes"
                    />
                  </div>
                </>
              )}

              {selectedReport.status !== "pending" && selectedReport.adminNotes && (
                <div className="space-y-2">
                  <Label>Admin Notes</Label>
                  <p className="text-sm text-muted-foreground">
                    {selectedReport.adminNotes}
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setActionDialogOpen(false)}
              disabled={reviewMutation.isPending}
            >
              {selectedReport?.status === "pending" ? "Cancel" : "Close"}
            </Button>
            {selectedReport?.status === "pending" && (
              <Button
                variant={actionType === "dismiss" ? "secondary" : "destructive"}
                onClick={handleConfirmAction}
                disabled={reviewMutation.isPending}
                data-testid="button-confirm-action"
              >
                {reviewMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {actionType === "dismiss" ? (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    Dismiss Report
                  </>
                ) : (
                  <>
                    <Ban className="h-4 w-4 mr-1" />
                    Confirm Action
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
