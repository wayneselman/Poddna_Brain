import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface VoteButtonsProps {
  annotationId: string;
  episodeId: string;
  upvotes: number;
  downvotes: number;
  userVote: "up" | "down" | null;
}

export default function VoteButtons({ annotationId, episodeId, upvotes, downvotes, userVote }: VoteButtonsProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const voteMutation = useMutation({
    mutationFn: async (type: "up" | "down") => {
      return apiRequest("POST", `/api/annotations/${annotationId}/vote`, { type });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", episodeId, "annotations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/annotations/trending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile/annotations"] });
    },
    onError: (error: any) => {
      const message = error?.message || "Failed to record vote. Please try again.";
      if (error?.status === 401) {
        toast({
          title: "Sign in required",
          description: "Please sign in to vote on annotations",
          variant: "destructive",
        });
      } else if (error?.status === 403) {
        toast({
          title: "Voting restricted",
          description: message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: message,
          variant: "destructive",
        });
      }
    },
  });

  const handleVote = (type: "up" | "down") => {
    if (voteMutation.isPending) return;
    
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to vote on annotations",
      });
      return;
    }
    
    voteMutation.mutate(type);
  };

  const netVotes = upvotes - downvotes;
  const isLoading = voteMutation.isPending;

  return (
    <div className="flex flex-col items-center gap-1" data-testid={`votes-${annotationId}`}>
      <Button
        size="icon"
        variant="ghost"
        className={`h-7 w-7 ${userVote === "up" ? "text-primary bg-primary/10" : "text-muted-foreground"} ${isLoading ? "opacity-50" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          handleVote("up");
        }}
        disabled={isLoading}
        data-testid={`button-upvote-${annotationId}`}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" data-testid={`loader-vote-${annotationId}`} />
        ) : (
          <ArrowUp className={`w-4 h-4 ${userVote === "up" ? "fill-current" : ""}`} />
        )}
      </Button>
      
      <span
        className={`text-sm font-semibold ${
          netVotes > 0 ? "text-primary" : netVotes < 0 ? "text-destructive" : "text-muted-foreground"
        } ${isLoading ? "opacity-50" : ""}`}
        data-testid={`text-votes-${annotationId}`}
      >
        {netVotes}
      </span>
      
      <Button
        size="icon"
        variant="ghost"
        className={`h-7 w-7 ${userVote === "down" ? "text-destructive bg-destructive/10" : "text-muted-foreground"} ${isLoading ? "opacity-50" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          handleVote("down");
        }}
        disabled={isLoading}
        data-testid={`button-downvote-${annotationId}`}
      >
        <ArrowDown className={`w-4 h-4 ${userVote === "down" ? "fill-current" : ""}`} />
      </Button>
    </div>
  );
}
