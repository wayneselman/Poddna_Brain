import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Loader2, 
  RefreshCw,
  ExternalLink,
  Mail,
  CheckCircle,
  Clock,
  AlertCircle,
  Play
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface ClipOrder {
  id: string;
  userId: string;
  clipRequestId: string | null;
  youtubeUrl: string;
  youtubeVideoId: string;
  videoTitle: string | null;
  customerEmail: string;
  status: string;
  amountPaid: number | null;
  fulfillmentNotes: string | null;
  deliverablesUrl: string | null;
  clipUrls: string[];
  createdAt: string;
  completedAt: string | null;
}

interface ViralMoment {
  id: string;
  suggestedTitle: string;
  viralityScore: number;
  startTime: number;
  endTime: number;
  pullQuote: string | null;
}

interface OrderWithMoments extends ClipOrder {
  moments: ViralMoment[];
}

function getStatusBadge(status: string) {
  switch (status) {
    case "paid":
      return <Badge className="bg-blue-500"><Clock className="w-3 h-3 mr-1" />Paid - Awaiting</Badge>;
    case "processing":
      return <Badge className="bg-amber-500"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Processing</Badge>;
    case "completed":
      return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
    case "failed":
      return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function OrderDetailDialog({ 
  order, 
  open, 
  onClose 
}: { 
  order: ClipOrder | null; 
  open: boolean; 
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [status, setStatus] = useState(order?.status || "paid");
  const [notes, setNotes] = useState(order?.fulfillmentNotes || "");
  const [clipUrlsText, setClipUrlsText] = useState(order?.clipUrls?.join("\n") || "");

  const { data: orderDetails, isLoading } = useQuery<OrderWithMoments>({
    queryKey: ['/api/admin/clip-orders', order?.id],
    enabled: !!order?.id && open,
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const clipUrls = clipUrlsText.split("\n").filter(url => url.trim());
      const res = await apiRequest("PATCH", `/api/admin/clip-orders/${order?.id}`, {
        status,
        fulfillmentNotes: notes,
        clipUrls,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Order updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/clip-orders'] });
      onClose();
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update order", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Order Details</DialogTitle>
          <DialogDescription>
            Order {order.id.slice(0, 8)}... for {order.customerEmail}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Customer Email</label>
              <p className="text-sm text-muted-foreground">{order.customerEmail}</p>
            </div>
            <div>
              <label className="text-sm font-medium">Amount</label>
              <p className="text-sm text-muted-foreground">
                ${((order.amountPaid || 0) / 100).toFixed(2)}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Video</label>
              <p className="text-sm text-muted-foreground truncate" title={order.videoTitle || undefined}>
                {order.videoTitle || order.youtubeVideoId}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">YouTube Link</label>
              <a 
                href={order.youtubeUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                Open <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : orderDetails?.moments && orderDetails.moments.length > 0 ? (
            <div>
              <label className="text-sm font-medium block mb-2">
                Viral Moments ({orderDetails.moments.length})
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {orderDetails.moments.map((moment, i) => (
                  <div key={moment.id} className="p-3 bg-muted rounded-lg text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{i + 1}. {moment.suggestedTitle}</span>
                      <Badge variant="secondary">{moment.viralityScore}</Badge>
                    </div>
                    <div className="text-muted-foreground mt-1">
                      {formatTime(moment.startTime)} - {formatTime(moment.endTime)}
                      {moment.pullQuote && (
                        <span className="ml-2 italic">"{moment.pullQuote.slice(0, 50)}..."</span>
                      )}
                    </div>
                    <a 
                      href={`https://youtube.com/watch?v=${order.youtubeVideoId}&t=${moment.startTime}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary text-xs hover:underline flex items-center gap-1 mt-1"
                    >
                      <Play className="w-3 h-3" /> Preview on YouTube
                    </a>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <label className="text-sm font-medium block mb-2">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="paid">Paid - Awaiting</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium block mb-2">
              Clip Download URLs (one per line)
            </label>
            <Textarea 
              value={clipUrlsText}
              onChange={(e) => setClipUrlsText(e.target.value)}
              placeholder="https://storage.example.com/clip1.mp4&#10;https://storage.example.com/clip2.mp4"
              rows={4}
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-2">Fulfillment Notes</label>
            <Textarea 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes about this order..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button 
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminClipOrdersPage() {
  const { toast } = useToast();
  const [selectedOrder, setSelectedOrder] = useState<ClipOrder | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: orders, isLoading, refetch, isFetching } = useQuery<ClipOrder[]>({
    queryKey: ['/api/admin/clip-orders'],
  });

  const handleViewOrder = (order: ClipOrder) => {
    setSelectedOrder(order);
    setDialogOpen(true);
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Clip Orders</h1>
          <p className="text-muted-foreground">
            Manage paid clip generation orders
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : orders && orders.length > 0 ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Video</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      {order.customerEmail}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate" title={order.videoTitle || undefined}>
                    {order.videoTitle || order.youtubeVideoId}
                  </TableCell>
                  <TableCell>${((order.amountPaid || 0) / 100).toFixed(2)}</TableCell>
                  <TableCell>{getStatusBadge(order.status)}</TableCell>
                  <TableCell>
                    {format(new Date(order.createdAt), 'MMM d, h:mm a')}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleViewOrder(order)}
                      >
                        View / Edit
                      </Button>
                      <a 
                        href={order.youtubeUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                      >
                        <Button size="sm" variant="ghost">
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </a>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card className="text-center p-8">
          <CardTitle className="mb-2">No Orders Yet</CardTitle>
          <CardDescription>
            Orders will appear here when customers pay for clip generation.
          </CardDescription>
        </Card>
      )}

      <OrderDetailDialog 
        order={selectedOrder}
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setSelectedOrder(null);
        }}
      />
    </div>
  );
}
