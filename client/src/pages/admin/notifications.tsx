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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Loader2, 
  Check, 
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Clock,
  AlertCircle,
  AlertTriangle,
  Info,
  Bell,
  BellOff
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { Link } from "wouter";
import type { AdminNotification } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

interface NotificationsResponse {
  notifications: AdminNotification[];
  total: number;
}

const PAGE_SIZE = 20;

function getSeverityIcon(severity: string) {
  switch (severity) {
    case 'error':
      return <AlertCircle className="h-4 w-4 text-destructive" />;
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case 'info':
    default:
      return <Info className="h-4 w-4 text-blue-500" />;
  }
}

function getSeverityBadge(severity: string) {
  switch (severity) {
    case 'error':
      return <Badge variant="destructive">Error</Badge>;
    case 'warning':
      return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white">Warning</Badge>;
    case 'info':
    default:
      return <Badge variant="secondary">Info</Badge>;
  }
}

export default function AdminNotificationsPage() {
  const { toast } = useToast();
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<'all' | 'unread'>('unread');

  const { data, isLoading, isFetching } = useQuery<NotificationsResponse>({
    queryKey: ["/api/admin/notifications", filter, page],
    queryFn: async () => {
      const res = await fetch(`/api/admin/notifications?status=${filter}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
  });

  const { data: summary } = useQuery<{ unread_count: number }>({
    queryKey: ['/api/admin/notifications/summary'],
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/notifications/${id}/read`);
      if (!res.ok) throw new Error("Failed to mark notification as read");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications/summary"] });
    },
    onError: () => {
      toast({ 
        title: "Failed to mark as read", 
        description: "Please try again",
        variant: "destructive" 
      });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/notifications/read-all`);
      if (!res.ok) throw new Error("Failed to mark all notifications as read");
      return await res.json();
    },
    onSuccess: (result) => {
      toast({ title: `Marked ${result.updated} notifications as read` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications/summary"] });
    },
    onError: () => {
      toast({ 
        title: "Failed to mark all as read", 
        description: "Please try again",
        variant: "destructive" 
      });
    },
  });

  const handleRowClick = (notification: AdminNotification) => {
    if (!notification.isRead) {
      markReadMutation.mutate(notification.id);
    }
  };

  const notifications = data?.notifications || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const unreadCount = summary?.unread_count || 0;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Admin Notifications
            </CardTitle>
            <CardDescription>
              System notifications and job alerts
              {unreadCount > 0 && (
                <span className="ml-2 text-destructive font-medium">
                  ({unreadCount} unread)
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                data-testid="button-mark-all-read"
              >
                {markAllReadMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCheck className="h-4 w-4 mr-2" />
                )}
                Mark All Read
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={filter} onValueChange={(v) => { setFilter(v as 'all' | 'unread'); setPage(0); }}>
            <TabsList className="mb-4">
              <TabsTrigger value="unread" data-testid="tab-unread">
                Unread
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="ml-2">{unreadCount}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
            </TabsList>

            <TabsContent value={filter}>
              {notifications.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center mb-4">
                    <BellOff className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">
                    {filter === 'unread' ? 'No unread notifications' : 'No notifications'}
                  </h3>
                  <p className="text-muted-foreground">
                    {filter === 'unread' 
                      ? 'All caught up! Check the "All" tab to see previous notifications.'
                      : 'Notifications will appear here when jobs fail or system events occur.'}
                  </p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">Severity</TableHead>
                        <TableHead>Notification</TableHead>
                        <TableHead className="w-[120px]">Type</TableHead>
                        <TableHead className="w-[150px]">Time</TableHead>
                        <TableHead className="w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {notifications.map((notification) => (
                        <TableRow 
                          key={notification.id}
                          className={`cursor-pointer ${!notification.isRead ? 'bg-muted/30 font-medium' : ''}`}
                          onClick={() => handleRowClick(notification)}
                          data-testid={`row-notification-${notification.id}`}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getSeverityIcon(notification.severity)}
                              {getSeverityBadge(notification.severity)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                {!notification.isRead && (
                                  <span className="w-2 h-2 rounded-full bg-primary" />
                                )}
                                <span className={`${!notification.isRead ? 'font-semibold' : ''}`}>
                                  {notification.title}
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {notification.message}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {notification.jobType || notification.type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <Clock className="h-3.5 w-3.5" />
                              <span title={format(new Date(notification.createdAt), 'PPpp')}>
                                {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              {notification.episodeId && (
                                <Link href={`/admin/episodes/${notification.episodeId}`}>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    title="View Episode"
                                    data-testid={`button-view-episode-${notification.id}`}
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                </Link>
                              )}
                              {!notification.isRead && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => markReadMutation.mutate(notification.id)}
                                  disabled={markReadMutation.isPending}
                                  title="Mark as read"
                                  data-testid={`button-mark-read-${notification.id}`}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                      <p className="text-sm text-muted-foreground">
                        Showing {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage(p => p - 1)}
                          disabled={page === 0 || isFetching}
                          data-testid="button-prev-page"
                        >
                          <ChevronLeft className="h-4 w-4 mr-1" />
                          Previous
                        </Button>
                        <span className="text-sm text-muted-foreground px-2">
                          Page {page + 1} of {totalPages}
                        </span>
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
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
