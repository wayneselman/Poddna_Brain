import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  generateAnnotationCard,
  downloadBlob,
  generatePlatformText,
  PLATFORM_SIZES,
  type PlatformSize,
} from "@/lib/generate-card";
import {
  Download,
  Copy,
  Check,
  Image as ImageIcon,
  Type,
  Loader2,
  Info,
  ExternalLink,
  Edit3,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import {
  SiInstagram,
  SiTiktok,
  SiLinkedin,
  SiX,
  SiYoutube,
  SiReddit,
} from "react-icons/si";
import type { Annotation, Episode, Podcast } from "@shared/schema";

const CARD_CHAR_LIMITS: Record<PlatformSize, number> = {
  "instagram-square": 200,
  "instagram-portrait": 280,
  "tiktok": 320,
  "linkedin": 140,
  "twitter-square": 180,
  "twitter-landscape": 140,
};

interface PlatformShareModalProps {
  annotation: Annotation;
  episode?: Episode;
  podcast?: Podcast;
  segmentStartTime?: number;
  isOpen: boolean;
  onClose: () => void;
}

function extractYouTubeVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

type PlatformTab = "instagram" | "tiktok" | "linkedin" | "twitter" | "youtube" | "text";

interface PlatformConfig {
  id: PlatformTab;
  name: string;
  icon: typeof SiInstagram;
  imageSizes: PlatformSize[];
  color: string;
  supportsLinks: boolean;
}

const PLATFORMS: PlatformConfig[] = [
  {
    id: "instagram",
    name: "Instagram",
    icon: SiInstagram,
    imageSizes: ["instagram-square", "instagram-portrait"],
    color: "bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400",
    supportsLinks: false,
  },
  {
    id: "tiktok",
    name: "TikTok",
    icon: SiTiktok,
    imageSizes: ["tiktok"],
    color: "bg-black",
    supportsLinks: false,
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    icon: SiLinkedin,
    imageSizes: ["linkedin"],
    color: "bg-[#0A66C2]",
    supportsLinks: true,
  },
  {
    id: "twitter",
    name: "X / Twitter",
    icon: SiX,
    imageSizes: ["twitter-square", "twitter-landscape"],
    color: "bg-black",
    supportsLinks: true,
  },
  {
    id: "youtube",
    name: "YouTube",
    icon: SiYoutube,
    imageSizes: [],
    color: "bg-[#FF0000]",
    supportsLinks: true,
  },
  {
    id: "text",
    name: "Text Only",
    icon: Type as any,
    imageSizes: [],
    color: "bg-gray-600",
    supportsLinks: true,
  },
];

function formatTimestamp(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}h${mins}m${secs}s`;
  }
  return `${mins}m${secs}s`;
}

export default function PlatformShareModal({
  annotation,
  episode,
  podcast,
  segmentStartTime,
  isOpen,
  onClose,
}: PlatformShareModalProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<PlatformTab>("instagram");
  const [generating, setGenerating] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<PlatformSize>("instagram-square");
  const [customQuoteText, setCustomQuoteText] = useState<string>(annotation.text);
  const [isEditingQuote, setIsEditingQuote] = useState<boolean>(false);

  useEffect(() => {
    setCustomQuoteText(annotation.text);
  }, [annotation.text]);

  const youtubeVideoId = extractYouTubeVideoId(episode?.videoUrl);

  const buildShareUrl = (includeTimestamp: boolean = false) => {
    if (typeof window === "undefined") return "";
    let url = `${window.location.origin}/episode/${annotation.episodeId}?a=${annotation.id}`;
    if (includeTimestamp && segmentStartTime !== undefined) {
      url += `&t=${Math.floor(segmentStartTime)}`;
    }
    return url;
  };

  const buildYouTubeUrl = () => {
    if (!youtubeVideoId) return null;
    const timestamp = segmentStartTime !== undefined ? Math.floor(segmentStartTime) : 0;
    return `https://youtube.com/watch?v=${youtubeVideoId}&t=${timestamp}`;
  };

  const shareUrl = buildShareUrl(true);
  const youtubeDirectUrl = buildYouTubeUrl();

  const handleClose = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setCopiedField(null);
    setActiveTab("instagram");
    setSelectedSize("instagram-square");
    setCustomQuoteText(annotation.text);
    setIsEditingQuote(false);
    onClose();
  };

  const handleResetQuote = () => {
    setCustomQuoteText(annotation.text);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  const currentCharLimit = CARD_CHAR_LIMITS[selectedSize] || 200;
  const isOverLimit = customQuoteText.length > currentCharLimit;
  const customAnnotation = { ...annotation, text: customQuoteText };

  const handleTabChange = (tab: PlatformTab) => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setActiveTab(tab);
    const platform = PLATFORMS.find(p => p.id === tab);
    if (platform) {
      if (platform.imageSizes.length > 0) {
        setSelectedSize(platform.imageSizes[0]);
      } else {
        setSelectedSize("instagram-square");
      }
    }
  };

  const textTemplates = generatePlatformText(annotation, episode, podcast, shareUrl);
  const activePlatform = PLATFORMS.find(p => p.id === activeTab)!;

  const handleGenerateImage = async (size: PlatformSize) => {
    setGenerating(size);
    setSelectedSize(size);
    try {
      const blob = await generateAnnotationCard({
        annotation: customAnnotation,
        episode,
        podcast,
        platform: size,
      });
      
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      
      toast({
        title: "Image generated!",
        description: "Preview ready. Click download to save.",
      });
    } catch (error) {
      console.error("Failed to generate image:", error);
      toast({
        title: "Failed to generate image",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setGenerating(null);
    }
  };

  const handleDownloadImage = async () => {
    if (!previewUrl) return;
    
    try {
      const response = await fetch(previewUrl);
      const blob = await response.blob();
      const dimensions = PLATFORM_SIZES[selectedSize];
      const filename = `poddna-${activeTab}-${dimensions.width}x${dimensions.height}-${annotation.id.slice(0, 8)}.png`;
      downloadBlob(blob, filename);
      
      toast({
        title: "Downloaded!",
        description: `Saved as ${filename}`,
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const handleCopyText = async (platform: string) => {
    const template = textTemplates[platform];
    if (!template) return;
    
    try {
      await navigator.clipboard.writeText(template.template);
      setCopiedField(platform);
      toast({
        title: "Copied!",
        description: `${template.platform} text copied to clipboard`,
      });
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Please select and copy manually",
        variant: "destructive",
      });
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedField("link");
      toast({
        title: "Link copied!",
        description: "Share link copied to clipboard",
      });
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Please copy manually",
        variant: "destructive",
      });
    }
  };

  const currentTemplate = textTemplates[activeTab] || textTemplates.text;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-highlight flex items-center justify-center">
              <ImageIcon className="w-4 h-4 text-black" />
            </span>
            Share to Social Media
          </DialogTitle>
          <DialogDescription>
            Choose a platform and get optimized content for maximum engagement
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => handleTabChange(v as PlatformTab)}>
          <TabsList className="grid grid-cols-6 w-full">
            {PLATFORMS.map((platform) => (
              <TabsTrigger
                key={platform.id}
                value={platform.id}
                className="flex flex-col gap-1 py-2 px-1"
                data-testid={`tab-platform-${platform.id}`}
              >
                <platform.icon className="w-4 h-4" />
                <span className="text-[10px] hidden sm:block">{platform.name}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {PLATFORMS.map((platform) => (
            <TabsContent key={platform.id} value={platform.id} className="space-y-4 mt-4">
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-8 h-8 rounded-lg ${platform.color} flex items-center justify-center`}>
                  <platform.icon className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold">{platform.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {platform.supportsLinks ? "Supports clickable links" : "Link in bio recommended"}
                  </p>
                </div>
                {!platform.supportsLinks && (
                  <Badge variant="secondary" className="ml-auto text-xs">
                    No direct links
                  </Badge>
                )}
              </div>

              {platform.imageSizes.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" />
                    Image Card
                  </h4>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium flex items-center gap-1.5">
                        <Edit3 className="w-3 h-3" />
                        Quote Text (editable)
                      </Label>
                      <div className="flex items-center gap-2">
                        {customQuoteText !== annotation.text && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleResetQuote}
                            className="h-6 text-xs"
                            data-testid="button-reset-quote"
                          >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            Reset
                          </Button>
                        )}
                        <span className={`text-xs ${isOverLimit ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                          {customQuoteText.length}/{currentCharLimit}
                        </span>
                      </div>
                    </div>
                    <Textarea
                      value={customQuoteText}
                      onChange={(e) => {
                        setCustomQuoteText(e.target.value);
                        if (previewUrl) {
                          URL.revokeObjectURL(previewUrl);
                          setPreviewUrl(null);
                        }
                      }}
                      className={`min-h-[80px] text-sm resize-none ${isOverLimit ? "border-destructive focus-visible:ring-destructive" : ""}`}
                      placeholder="Edit the quote text for your share card..."
                      data-testid="textarea-custom-quote"
                    />
                    {isOverLimit && (
                      <div className="flex items-center gap-1.5 text-xs text-destructive">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Text exceeds recommended length for {PLATFORM_SIZES[selectedSize].name} - may be truncated</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    {platform.imageSizes.map((size) => {
                      const dims = PLATFORM_SIZES[size];
                      const sizeLimit = CARD_CHAR_LIMITS[size];
                      const sizeOverLimit = customQuoteText.length > sizeLimit;
                      return (
                        <Button
                          key={size}
                          variant={selectedSize === size && previewUrl ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleGenerateImage(size)}
                          disabled={generating !== null}
                          className={sizeOverLimit && !previewUrl ? "border-amber-500/50" : ""}
                          data-testid={`button-generate-${size}`}
                        >
                          {generating === size ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : sizeOverLimit ? (
                            <AlertTriangle className="w-4 h-4 mr-2 text-amber-500" />
                          ) : (
                            <ImageIcon className="w-4 h-4 mr-2" />
                          )}
                          {dims.name} ({dims.width}x{dims.height})
                        </Button>
                      );
                    })}
                  </div>

                  {previewUrl && (
                    <div className="space-y-2">
                      <div className="relative rounded-lg overflow-hidden bg-muted max-h-64 flex items-center justify-center">
                        <img
                          src={previewUrl}
                          alt="Preview"
                          className="max-h-64 w-auto object-contain"
                          data-testid="img-share-preview"
                        />
                      </div>
                      <Button
                        onClick={handleDownloadImage}
                        className="w-full"
                        data-testid="button-download-image"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download Image
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Type className="w-4 h-4" />
                  Caption / Text
                </h4>
                
                <div className="relative">
                  <Textarea
                    value={currentTemplate.template}
                    readOnly
                    className="min-h-[120px] text-sm resize-none pr-12"
                    data-testid={`textarea-caption-${platform.id}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={() => handleCopyText(platform.id)}
                    data-testid={`button-copy-caption-${platform.id}`}
                  >
                    {copiedField === platform.id ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                
                <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
                  <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    {currentTemplate.instructions}
                  </p>
                </div>

                {currentTemplate.charLimit && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Character count: {currentTemplate.template.length}</span>
                    <span className={currentTemplate.template.length > currentTemplate.charLimit ? "text-destructive" : ""}>
                      Limit: {currentTemplate.charLimit}
                    </span>
                  </div>
                )}
              </div>

              {platform.id === "youtube" && youtubeDirectUrl && (
                <div className="pt-3 border-t">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        <SiYoutube className="w-4 h-4 text-red-600" />
                        YouTube with Timestamp
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {segmentStartTime !== undefined ? `Jump to ${formatTimestamp(segmentStartTime)}` : "Direct link to video"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          await navigator.clipboard.writeText(youtubeDirectUrl);
                          setCopiedField("youtube");
                          toast({ title: "YouTube link copied!", description: "Link includes timestamp" });
                          setTimeout(() => setCopiedField(null), 2000);
                        }}
                        data-testid="button-copy-youtube-link"
                      >
                        {copiedField === "youtube" ? (
                          <Check className="w-4 h-4 mr-1" />
                        ) : (
                          <Copy className="w-4 h-4 mr-1" />
                        )}
                        Copy
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => window.open(youtubeDirectUrl, "_blank")}
                        className="bg-red-600 hover:bg-red-700"
                        data-testid="button-open-youtube"
                      >
                        <ExternalLink className="w-4 h-4 mr-1" />
                        Open YouTube
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">PODDNA Link</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                      {shareUrl}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyLink}
                      data-testid="button-copy-share-link"
                    >
                      {copiedField === "link" ? (
                        <Check className="w-4 h-4 mr-1" />
                      ) : (
                        <Copy className="w-4 h-4 mr-1" />
                      )}
                      Copy Link
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(shareUrl, "_blank")}
                      data-testid="button-open-link"
                    >
                      <ExternalLink className="w-4 h-4 mr-1" />
                      Open
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <div className="mt-4 p-3 bg-highlight/10 border border-highlight/30 rounded-lg">
          <p className="text-xs text-center">
            <span className="font-semibold text-highlight">Pro tip:</span>{" "}
            For best SEO backlinks, add <span className="font-mono bg-highlight/20 px-1 rounded">poddna.io</span> to your bio on platforms that don't support direct links
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
