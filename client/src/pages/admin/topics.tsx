import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Loader2, 
  Search,
  Tags,
  MessageSquare,
  Podcast,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Sparkles,
  Link2,
  HelpCircle,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface TopicSummary {
  id: string;
  name: string;
  description: string | null;
  statementCount: number;
  episodeCount: number;
  createdAt: string;
}

interface TopicsResponse {
  items: TopicSummary[];
  total: number;
}

const PAGE_SIZE = 20;

export default function AdminTopicsPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(0);
    const timeout = setTimeout(() => setDebouncedSearch(value), 300);
    return () => clearTimeout(timeout);
  };

  const { data, isLoading, refetch } = useQuery<TopicsResponse>({
    queryKey: ["/api/admin/topics", debouncedSearch, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("q", debouncedSearch);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));
      const res = await fetch(`/api/admin/topics?${params}`);
      if (!res.ok) throw new Error("Failed to fetch topics");
      return res.json();
    },
  });

  const discoverMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/topics/discover");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Topic Discovery Started",
        description: `Job ${data.jobId} has been queued`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/topics"] });
    },
    onError: () => {
      toast({
        title: "Discovery Failed",
        description: "Failed to start topic discovery job",
        variant: "destructive",
      });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/topics/assign");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Topic Assignment Started",
        description: `Job ${data.jobId} has been queued`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/topics"] });
    },
    onError: () => {
      toast({
        title: "Assignment Failed",
        description: "Failed to start topic assignment job",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/topics/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Topic Deleted",
        description: "The topic and all its links have been removed",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/topics"] });
    },
    onError: () => {
      toast({
        title: "Delete Failed",
        description: "Failed to delete topic",
        variant: "destructive",
      });
    },
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const topics = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Semantic Topics</h1>
          <p className="text-muted-foreground">
            AI-discovered thematic clusters from podcast statements
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => discoverMutation.mutate()}
            disabled={discoverMutation.isPending}
            variant="outline"
            data-testid="button-discover"
          >
            {discoverMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Discover Topics
          </Button>
          <Button 
            onClick={() => assignMutation.mutate()}
            disabled={assignMutation.isPending}
            variant="outline"
            data-testid="button-assign"
          >
            {assignMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Link2 className="h-4 w-4 mr-2" />
            )}
            Assign Statements
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search topics..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
            <Button variant="ghost" size="icon" onClick={() => refetch()} data-testid="button-refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : topics.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Tags className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No topics found</p>
              <p className="text-sm">
                {debouncedSearch 
                  ? "Try adjusting your search"
                  : "Run topic discovery to automatically cluster statements into themes"}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Topic</TableHead>
                    <TableHead className="text-right">Statements</TableHead>
                    <TableHead className="text-right">Episodes</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topics.map((topic) => (
                    <TableRow key={topic.id} data-testid={`row-topic-${topic.id}`}>
                      <TableCell>
                        <div>
                          <div className="flex items-center gap-2">
                            <Tags className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{topic.name}</span>
                          </div>
                          {topic.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                              {topic.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className="gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {topic.statementCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="gap-1">
                          <Podcast className="h-3 w-3" />
                          {topic.episodeCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/admin/topics/${topic.id}`}>
                            <Button size="sm" variant="ghost" data-testid={`button-view-${topic.id}`}>
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </Link>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" data-testid={`button-delete-${topic.id}`}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Topic</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete the topic "{topic.name}" and unlink all {topic.statementCount} statements associated with it.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => deleteMutation.mutate(topic.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, data?.total ?? 0)} of {data?.total ?? 0} topics
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page === 0}
                      onClick={() => setPage(p => p - 1)}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                      Page {page + 1} of {totalPages}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage(p => p + 1)}
                      data-testid="button-next-page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
