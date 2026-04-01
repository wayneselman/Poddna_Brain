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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Loader2, 
  Check, 
  X,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Clock,
  User,
  Shield
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface PendingAnnotation {
  id: string;
  content: string;
  status: string;
  createdAt: string;
  episodeId: string;
  segmentId: string;
  startOffset: number;
  endOffset: number;
  userId: string;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
  episode: {
    id: string;
    title: string;
    podcast: {
      id: string;
      title: string;
      artworkUrl: string | null;
    };
  };
  highlightedText: string;
}

interface PendingResponse {
  items: PendingAnnotation[];
  limit: number;
  offset: number;
}

const PAGE_SIZE = 20;

export default function AdminModerationPage() {
  const { toast } = useToast();
  const [page, setPage] = useState(0);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedAnnotation, setSelectedAnnotation] = useState<PendingAnnotation | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data, isLoading, isFetching } = useQuery<PendingResponse>({
    queryKey: ["/api/admin/annotations/pending", page],
    queryFn: async () => {
      const res = await fetch(`/api/admin/annotations/pending?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch pending annotations");
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/annotations/${id}/approve`);
      if (!res.ok) throw new Error("Failed to approve annotation");
      return await res.json();
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["/api/admin/annotations/pending", page] });
      
      const previousData = queryClient.getQueryData<PendingResponse>(["/api/admin/annotations/pending", page]);
      
      if (previousData) {
        queryClient.setQueryData<PendingResponse>(["/api/admin/annotations/pending", page], {
          ...previousData,
          items: previousData.items.filter(item => item.id !== id),
        });
      }
      
      return { previousData };
    },
    onError: (_error, _id, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["/api/admin/annotations/pending", page], context.previousData);
      }
      toast({ 
        title: "Failed to approve", 
        description: "Please try again",
        variant: "destructive" 
      });
    },
    onSuccess: () => {
      toast({ title: "Annotation approved" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/annotations/pending"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/admin/annotations/${id}/reject`, { reason });
      if (!res.ok) throw new Error("Failed to reject annotation");
      return await res.json();
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/admin/annotations/pending", page] });
      
      const previousData = queryClient.getQueryData<PendingResponse>(["/api/admin/annotations/pending", page]);
      
      if (previousData) {
        queryClient.setQueryData<PendingResponse>(["/api/admin/annotations/pending", page], {
          ...previousData,
          items: previousData.items.filter(item => item.id !== id),
        });
      }
      
      return { previousData };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["/api/admin/annotations/pending", page], context.previousData);
      }
      toast({ 
        title: "Failed to reject", 
        description: "Please try again",
        variant: "destructive" 
      });
    },
    onSuccess: () => {
      toast({ title: "Annotation rejected" });
      setRejectDialogOpen(false);
      setSelectedAnnotation(null);
      setRejectReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/annotations/pending"] });
    },
  });

  const handleReject = (annotation: PendingAnnotation) => {
    setSelectedAnnotation(annotation);
    setRejectReason("");
    setRejectDialogOpen(true);
  };

  const confirmReject = () => {
    if (selectedAnnotation) {
      rejectMutation.mutate({ id: selectedAnnotation.id, reason: rejectReason });
    }
  };

  const getUserDisplayName = (user: PendingAnnotation["user"]) => {
    if (user.firstName || user.lastName) {
      return `${user.firstName || ""} ${user.lastName || ""}`.trim();
    }
    return user.email.split("@")[0];
  };

  const items = data?.items || [];
  const hasMore = items.length === PAGE_SIZE;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-moderation-title">
          <Shield className="w-6 h-6" />
          Moderation Queue
        </h1>
        <p className="text-muted-foreground">
          Review and approve or reject pending annotations
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Pending Annotations
            </span>
            {isFetching && !isLoading && (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            )}
          </CardTitle>
          <CardDescription>
            Annotations awaiting approval before they become visible
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium text-muted-foreground">
                No pending annotations
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                All annotations have been reviewed
              </p>
            </div>
          ) : (
            <>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Content</TableHead>
                      <TableHead className="hidden md:table-cell">Episode</TableHead>
                      <TableHead className="hidden lg:table-cell w-[120px]">Author</TableHead>
                      <TableHead className="hidden lg:table-cell w-[100px]">Submitted</TableHead>
                      <TableHead className="w-[140px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map(annotation => (
                      <TableRow key={annotation.id} data-testid={`row-annotation-${annotation.id}`}>
                        <TableCell>
                          <div className="max-w-[200px]">
                            <p className="text-sm font-medium line-clamp-2">
                              "{annotation.highlightedText}"
                            </p>
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                              {annotation.content}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-2">
                            {annotation.episode.podcast.artworkUrl && (
                              <img 
                                src={annotation.episode.podcast.artworkUrl} 
                                alt="" 
                                className="w-8 h-8 rounded object-cover"
                              />
                            )}
                            <div className="min-w-0">
                              <p className="text-sm line-clamp-1">{annotation.episode.title}</p>
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {annotation.episode.podcast.title}
                              </p>
                            </div>
                            <a 
                              href={`/episode/${annotation.episodeId}?a=${annotation.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0"
                            >
                              <Button variant="ghost" size="icon" className="h-6 w-6">
                                <ExternalLink className="w-3 h-3" />
                              </Button>
                            </a>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3 h-3 text-muted-foreground" />
                            <span className="text-sm truncate max-w-[100px]">
                              {getUserDisplayName(annotation.user)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(annotation.createdAt), { addSuffix: true })}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => approveMutation.mutate(annotation.id)}
                              disabled={approveMutation.isPending || rejectMutation.isPending}
                              className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20"
                              data-testid={`button-approve-${annotation.id}`}
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleReject(annotation)}
                              disabled={approveMutation.isPending || rejectMutation.isPending}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                              data-testid={`button-reject-${annotation.id}`}
                            >
                              <X className="w-4 h-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <span className="text-sm text-muted-foreground">
                  {items.length > 0 && `Showing ${page * PAGE_SIZE + 1}-${page * PAGE_SIZE + items.length}`}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0 || isFetching}
                    data-testid="button-prev-page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => p + 1)}
                    disabled={!hasMore || isFetching}
                    data-testid="button-next-page"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Annotation</DialogTitle>
            <DialogDescription>
              Optionally provide a reason for rejecting this annotation. The author will see this message.
            </DialogDescription>
          </DialogHeader>
          
          {selectedAnnotation && (
            <div className="py-4">
              <div className="bg-muted/50 rounded-lg p-3 mb-4">
                <p className="text-sm font-medium mb-1">
                  "{selectedAnnotation.highlightedText}"
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedAnnotation.content}
                </p>
              </div>
              
              <Textarea
                placeholder="Enter rejection reason (optional)..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="min-h-[100px]"
                data-testid="textarea-reject-reason"
              />
            </div>
          )}
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
              disabled={rejectMutation.isPending}
              data-testid="button-cancel-reject"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReject}
              disabled={rejectMutation.isPending}
              data-testid="button-confirm-reject"
            >
              {rejectMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <X className="w-4 h-4 mr-2" />
              )}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
