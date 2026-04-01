import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Podcast, Episode as BaseEpisode, User } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Episode extends BaseEpisode {
  hasTranscript?: boolean;
}

interface JobStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  total: number;
}

interface JobFailure {
  id: string;
  jobId: string;
  jobType: string;
  errorMessage: string;
  errorStack: string | null;
  isTransient: boolean;
  createdAt: string;
}

interface JobFailuresResponse {
  failures: JobFailure[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
  };
}

import { Library, Users, FileText, TrendingUp, Loader2, BookOpen, Star, Sparkles, Play, RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";

export default function AdminDashboard() {
  const { toast } = useToast();
  const [expandedFailures, setExpandedFailures] = useState<Set<string>>(new Set());

  const { data: podcasts = [], isLoading: podcastsLoading } = useQuery<Podcast[]>({
    queryKey: ["/api/podcasts"],
  });

  const { data: episodes = [], isLoading: episodesLoading } = useQuery<Episode[]>({
    queryKey: ["/api/episodes"],
  });

  const { data: users = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: jobStats } = useQuery<JobStats>({
    queryKey: ["/api/admin/jobs/stats"],
    refetchInterval: 5000,
  });

  const { data: jobFailuresData } = useQuery<JobFailuresResponse>({
    queryKey: ["/api/admin/jobs/failures"],
    refetchInterval: 30000,
  });

  const toggleFailureExpanded = (id: string) => {
    setExpandedFailures((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const backfillMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/jobs/backfill-youtube-transcripts");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Backfill Started",
        description: `Queued ${data.jobsCreated || 0} transcript jobs for processing`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs/stats"] });
    },
    onError: (error) => {
      toast({
        title: "Backfill Failed",
        description: error instanceof Error ? error.message : "Failed to start backfill",
        variant: "destructive",
      });
    },
  });

  const isLoading = podcastsLoading || episodesLoading || usersLoading;

  const stats = [
    {
      title: "Total Podcasts",
      value: podcasts.length,
      icon: Library,
      description: "Podcasts in library",
      link: "/admin/discover",
      linkText: "Add more",
    },
    {
      title: "Total Episodes",
      value: episodes.length,
      icon: FileText,
      description: "Episodes available",
      link: "/admin/episodes",
      linkText: "Manage episodes",
    },
    {
      title: "Registered Users",
      value: users.length,
      icon: Users,
      description: "Platform users",
      link: "/admin/users",
      linkText: "View users",
    },
    {
      title: "With Transcripts",
      value: episodes.filter(e => e.hasTranscript).length,
      icon: TrendingUp,
      description: "Episodes transcribed",
      link: "/admin/transcripts",
      linkText: "Transcription lab",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-dashboard-title">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overview of your podcast annotation platform
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat, index) => {
              const Icon = stat.icon;
              const colors = [
                "bg-blue-50 dark:bg-blue-900/20 text-blue-600",
                "bg-purple-50 dark:bg-purple-900/20 text-purple-600",
                "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600",
                "bg-amber-50 dark:bg-amber-900/20 text-amber-600"
              ];
              return (
                <Card key={stat.title} className="hover:shadow-md transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                    <div className={`p-2 rounded-lg ${colors[index]}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold tracking-tight">{stat.value}</div>
                    <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
                    <Button asChild variant="link" size="sm" className="px-0 h-auto mt-3 text-xs">
                      <Link href={stat.link}>
                        {stat.linkText} →
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common admin tasks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href="/admin/discover">
                    <Library className="h-4 w-4 mr-2" />
                    Discover & Import Podcasts
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href="/admin/transcripts">
                    <FileText className="h-4 w-4 mr-2" />
                    Generate Transcripts
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href="/admin/episodes">
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Manage Episodes
                  </Link>
                </Button>
                <div className="pt-2 border-t">
                  <Button 
                    variant="default" 
                    className="w-full justify-start"
                    onClick={() => backfillMutation.mutate()}
                    disabled={backfillMutation.isPending}
                    data-testid="button-backfill-transcripts"
                  >
                    {backfillMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Backfill YouTube Transcripts
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1 pl-6">
                    Queue transcript jobs for episodes with YouTube sources
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle>Background Jobs</CardTitle>
                  <CardDescription>Processing status</CardDescription>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/admin/settings">View All</Link>
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-yellow-100 dark:bg-yellow-900/30">
                      <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{jobStats?.pending || 0}</p>
                      <p className="text-xs text-muted-foreground">Pending</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30">
                      <RefreshCw className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{jobStats?.running || 0}</p>
                      <p className="text-xs text-muted-foreground">Running</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/30">
                      <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{jobStats?.completed || 0}</p>
                      <p className="text-xs text-muted-foreground">Completed</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/30">
                      <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{jobStats?.failed || 0}</p>
                      <p className="text-xs text-muted-foreground">Failed</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <div>
                  <CardTitle>Recent Episodes</CardTitle>
                  <CardDescription>Latest additions to your library</CardDescription>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/admin/episodes">View All</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {episodes.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No episodes yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {episodes.slice(0, 5).map((episode) => (
                      <Link 
                        key={episode.id} 
                        href={`/admin/episodes/${episode.id}`}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          episode.hasTranscript ? "bg-green-500" : "bg-amber-400"
                        }`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{episode.title}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            {episode.hasTranscript ? (
                              <>
                                <CheckCircle className="w-3 h-3 text-green-500" />
                                Transcribed
                              </>
                            ) : (
                              <>
                                <Clock className="w-3 h-3 text-amber-500" />
                                Pending
                              </>
                            )}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className={jobFailuresData && jobFailuresData.failures.length > 0 ? "border-red-200 dark:border-red-900/50" : ""} data-testid="card-job-failures">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className={`h-5 w-5 ${jobFailuresData && jobFailuresData.failures.length > 0 ? "text-red-500" : "text-muted-foreground"}`} />
                <div>
                  <CardTitle>Recent Job Failures</CardTitle>
                  <CardDescription>Permanent job failures requiring attention</CardDescription>
                </div>
              </div>
              {jobFailuresData && jobFailuresData.failures.length > 0 && (
                <Badge variant="destructive" data-testid="badge-failure-count">
                  {jobFailuresData.failures.length} failure{jobFailuresData.failures.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </CardHeader>
            <CardContent>
              {!jobFailuresData || jobFailuresData.failures.length === 0 ? (
                <div className="flex items-center gap-2 text-muted-foreground" data-testid="text-no-failures">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <p className="text-sm">No permanent job failures recorded</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {jobFailuresData.failures.slice(0, 10).map((failure) => (
                    <Collapsible
                      key={failure.id}
                      open={expandedFailures.has(failure.id)}
                      onOpenChange={() => toggleFailureExpanded(failure.id)}
                    >
                      <div className="border rounded-md p-3 bg-red-50/50 dark:bg-red-900/10" data-testid={`card-failure-${failure.id}`}>
                        <CollapsibleTrigger className="w-full text-left" data-testid={`button-toggle-failure-${failure.id}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="text-xs" data-testid={`badge-job-type-${failure.id}`}>
                                  {failure.jobType}
                                </Badge>
                                <span className="text-xs text-muted-foreground" data-testid={`text-failure-time-${failure.id}`}>
                                  {formatDistanceToNow(new Date(failure.createdAt), { addSuffix: true })}
                                </span>
                                {failure.isTransient && (
                                  <Badge variant="secondary" className="text-xs" data-testid={`badge-transient-${failure.id}`}>
                                    Transient
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-red-700 dark:text-red-300 mt-1 line-clamp-2" data-testid={`text-error-message-${failure.id}`}>
                                {failure.errorMessage}
                              </p>
                            </div>
                            <Button variant="ghost" size="icon" className="flex-shrink-0 h-6 w-6" data-testid={`button-expand-failure-${failure.id}`}>
                              {expandedFailures.has(failure.id) ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-800">
                            <p className="text-xs text-muted-foreground mb-1" data-testid={`text-job-id-${failure.id}`}>Job ID: {failure.jobId}</p>
                            {failure.errorStack && (
                              <pre className="text-xs bg-slate-900 text-slate-100 p-2 rounded overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap" data-testid={`text-error-stack-${failure.id}`}>
                                {failure.errorStack}
                              </pre>
                            )}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Getting Started Guide */}
          <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
            <CardHeader>
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                <CardTitle>Getting Started Guide</CardTitle>
              </div>
              <CardDescription>How to use the admin dashboard</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">1</div>
                    <h4 className="font-medium">Import Podcasts</h4>
                  </div>
                  <p className="text-sm text-muted-foreground pl-8">
                    Go to <strong>Discover & Import</strong> to search Podcast Index and add podcasts to your library.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">2</div>
                    <h4 className="font-medium">Generate Transcripts</h4>
                  </div>
                  <p className="text-sm text-muted-foreground pl-8">
                    Use <strong>Transcript Lab</strong> to generate AI transcripts with speaker identification.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">3</div>
                    <h4 className="font-medium">Curate Annotations</h4>
                  </div>
                  <p className="text-sm text-muted-foreground pl-8">
                    Visit <strong>Featured Annotations</strong> to curate the best insights for the homepage.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">4</div>
                    <h4 className="font-medium">Manage Users</h4>
                  </div>
                  <p className="text-sm text-muted-foreground pl-8">
                    Use <strong>User Management</strong> to update roles, certifications, or moderate accounts.
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-primary/10">
                <h4 className="font-medium flex items-center gap-2 mb-3">
                  <Sparkles className="h-4 w-4 text-yellow-500" />
                  Pro Tips
                </h4>
                <ul className="grid gap-2 md:grid-cols-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Star className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                    <span>Use the <strong>Episode Library</strong> to manually add episodes from non-indexed sources (LinkedIn, etc.)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Star className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                    <span>YouTube videos are fully supported - paste a YouTube URL as the audio source</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Star className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                    <span>Click on any episode to generate AI-powered annotations automatically</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Star className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                    <span>Use music detection to identify songs played in podcast episodes</span>
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
