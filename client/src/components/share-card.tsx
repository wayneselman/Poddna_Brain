import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Share2, Copy, Check, ExternalLink } from "lucide-react";
import { SiX, SiFacebook, SiLinkedin } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import type { Annotation } from "@shared/schema";
import { 
  SHARE_CARD_CONFIG, 
  generateSocialShareUrl, 
  copyToClipboard,
  shareViaWebShare,
} from "@/lib/shareCards";

interface ShareCardProps {
  annotation: Annotation;
  episodeTitle: string;
  podcastTitle: string;
  artworkUrl?: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function ShareCard({
  annotation,
  episodeTitle,
  podcastTitle,
  artworkUrl,
  isOpen,
  onClose,
}: ShareCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const shareUrl = `${window.location.origin}/episode/${annotation.episodeId}#annotation-${annotation.id}`;
  const shareText = `"${annotation.text}" - ${podcastTitle}`;

  const handleCopyLink = async () => {
    const success = await copyToClipboard(shareUrl);
    if (success) {
      setCopied(true);
      toast({
        title: "Link copied",
        description: "Share link copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast({
        title: "Failed to copy",
        description: "Please copy the link manually",
        variant: "destructive",
      });
    }
  };

  const handleCopyQuote = async () => {
    const success = await copyToClipboard(shareText);
    if (success) {
      toast({
        title: "Quote copied",
        description: "Quote copied to clipboard",
      });
    } else {
      toast({
        title: "Failed to copy",
        description: "Please copy the quote manually",
        variant: "destructive",
      });
    }
  };

  const handleNativeShare = async () => {
    const success = await shareViaWebShare({
      title: episodeTitle,
      text: shareText,
      url: shareUrl,
    });
    if (!success) {
      handleCopyLink();
    }
  };

  const shareToTwitter = () => {
    window.open(generateSocialShareUrl("twitter", shareUrl, shareText), "_blank", "noopener,noreferrer");
  };

  const shareToFacebook = () => {
    window.open(generateSocialShareUrl("facebook", shareUrl, shareText), "_blank", "noopener,noreferrer");
  };

  const shareToLinkedIn = () => {
    window.open(generateSocialShareUrl("linkedin", shareUrl), "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5" />
            Share Quote
          </DialogTitle>
          <DialogDescription>
            Share this moment with your audience
          </DialogDescription>
        </DialogHeader>

        {/* Preview Card */}
        <div
          ref={cardRef}
          className="relative rounded-xl overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6 text-white"
          data-testid="share-card-preview"
        >
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-highlight/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-primary/20 rounded-full blur-2xl" />
          
          {/* Content */}
          <div className="relative z-10">
            {/* Quote */}
            <div className="mb-6">
              <div className="text-4xl text-highlight mb-2">"</div>
              <p className="text-xl font-medium leading-relaxed line-clamp-4">
                {annotation.text}
              </p>
              <div className="text-4xl text-highlight text-right -mt-2">"</div>
            </div>

            {/* Source */}
            <div className="flex items-center gap-3 pt-4 border-t border-white/20">
              {artworkUrl && (
                <img
                  src={artworkUrl}
                  alt={podcastTitle}
                  className="w-10 h-10 rounded-md object-cover"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{episodeTitle}</p>
                <p className="text-sm text-white/70 truncate">{podcastTitle}</p>
              </div>
              <Badge className="bg-highlight text-black font-bold shrink-0">
                PodDNA
              </Badge>
            </div>
          </div>
        </div>

        {/* Share Actions */}
        <div className="space-y-4">
          {/* Social Buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={shareToTwitter}
              data-testid="button-share-twitter"
            >
              <SiX className="w-4 h-4" />
              X
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={shareToFacebook}
              data-testid="button-share-facebook"
            >
              <SiFacebook className="w-4 h-4" />
              Facebook
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={shareToLinkedIn}
              data-testid="button-share-linkedin"
            >
              <SiLinkedin className="w-4 h-4" />
              LinkedIn
            </Button>
          </div>

          {/* Copy Actions */}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1 gap-2"
              onClick={handleCopyLink}
              data-testid="button-copy-link"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy Link"}
            </Button>
            <Button
              variant="secondary"
              className="flex-1 gap-2"
              onClick={handleCopyQuote}
              data-testid="button-copy-quote"
            >
              <Copy className="w-4 h-4" />
              Copy Quote
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
