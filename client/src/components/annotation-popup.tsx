import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { X, LogIn } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface AnnotationPopupProps {
  position: { top: number; left: number };
  selectedText: string;
  onClose: () => void;
  segmentId: string;
  startOffset: number;
  endOffset: number;
  maxChars?: number;
}

export default function AnnotationPopup({
  position,
  selectedText,
  onClose,
  segmentId,
  startOffset,
  endOffset,
  maxChars = 300,
}: AnnotationPopupProps) {
  const { id: episodeId } = useParams<{ id: string }>();
  const [content, setContent] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  
  const remainingChars = maxChars - content.length;
  const isOverLimit = remainingChars < 0;

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!episodeId) throw new Error("Episode ID required");
      
      return apiRequest("POST", "/api/annotations", {
        episodeId,
        segmentId,
        text: selectedText,
        startOffset,
        endOffset,
        content,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/episodes", episodeId, "annotations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/annotations/trending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile/annotations"] });
      toast({
        title: "Success",
        description: "Annotation created successfully",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create annotation. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      toast({
        title: "Error",
        description: "Please enter annotation content",
        variant: "destructive",
      });
      return;
    }
    if (isOverLimit) {
      toast({
        title: "Content too long",
        description: `Maximum ${maxChars} characters allowed`,
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate();
  };

  const handleLogin = () => {
    window.location.href = "/login";
  };

  // Ensure popup stays within viewport bounds
  const adjustedPosition = {
    top: Math.min(position.top, window.innerHeight - 400),
    left: Math.max(200, Math.min(position.left, window.innerWidth - 200)),
  };

  return (
    <>
      <div 
        className="fixed inset-0 z-[9998] bg-black/20" 
        onClick={onClose} 
        data-testid="overlay-annotation"
      />
      <Card
        className="fixed z-[9999] w-96 max-w-[90vw] shadow-2xl pointer-events-auto"
        style={{
          top: `${adjustedPosition.top}px`,
          left: `${adjustedPosition.left}px`,
          transform: "translateX(-50%)",
          maxHeight: "80vh",
          overflowY: "auto",
        }}
        data-testid="card-annotation-form"
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Add Annotation</CardTitle>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={onClose}
              data-testid="button-close-form"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="bg-highlight/20 border-l-4 border-highlight p-3 mb-4 rounded-r-md">
            <p className="text-sm font-serif text-foreground" data-testid="text-selected-quote">
              "{selectedText}"
            </p>
          </div>

          {authLoading ? (
            <div className="py-4 text-center text-muted-foreground">
              Loading...
            </div>
          ) : !user ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-4">
                Sign in to add your annotation
              </p>
              <Button onClick={handleLogin} className="gap-2" data-testid="button-login-to-annotate">
                <LogIn className="w-4 h-4" />
                Sign in with Replit
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="annotation-content">Your insight</Label>
                <Textarea
                  id="annotation-content"
                  placeholder="Share your insight about this moment..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={4}
                  maxLength={maxChars + 50}
                  data-testid="textarea-content"
                />
                <div className="flex justify-end mt-1">
                  <span className={`text-xs ${isOverLimit ? 'text-destructive' : remainingChars < 50 ? 'text-yellow-600' : 'text-muted-foreground'}`}>
                    {remainingChars} characters remaining
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || isOverLimit}
                  data-testid="button-submit"
                >
                  {createMutation.isPending ? "Creating..." : "Create Annotation"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </>
  );
}
