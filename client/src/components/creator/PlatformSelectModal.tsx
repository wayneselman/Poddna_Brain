import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Smartphone, Type, Sparkles, AlignCenter, Zap } from "lucide-react";

interface PlatformOption {
  id: string;
  name: string;
  aspect: string;
  maxDuration: string;
  icon: typeof Smartphone;
}

const PLATFORMS: PlatformOption[] = [
  { id: "tiktok", name: "TikTok", aspect: "9:16", maxDuration: "60s", icon: Smartphone },
  { id: "reels", name: "Instagram Reels", aspect: "9:16", maxDuration: "90s", icon: Smartphone },
  { id: "shorts", name: "YouTube Shorts", aspect: "9:16", maxDuration: "60s", icon: Smartphone },
];

interface CaptionOption {
  id: string;
  name: string;
  description: string;
  icon: typeof Type;
}

const CAPTION_STYLES: CaptionOption[] = [
  { id: "highlight", name: "Highlight", description: "Word-by-word, active word in yellow. Best for interviews and high-energy content.", icon: Sparkles },
  { id: "subtitle", name: "Subtitle", description: "Two lines max, clean sentence breaks, bottom-third. Best for conversational content.", icon: AlignCenter },
  { id: "bold", name: "Bold", description: "One or two words at a time, large centred text. Best for punchy moments.", icon: Type },
];

interface PlatformSelectModalProps {
  open: boolean;
  onClose: () => void;
  onProcess: (selection: { platform: string; captionStyle: string; hookText: string | null; hookEnabled: boolean }) => void;
  isProcessing?: boolean;
  momentTitle?: string;
}

export function PlatformSelectModal({ open, onClose, onProcess, isProcessing, momentTitle }: PlatformSelectModalProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [selectedCaption, setSelectedCaption] = useState<string>("highlight");
  const [hookEnabled, setHookEnabled] = useState(true);
  const [hookText, setHookText] = useState(momentTitle || "");

  useEffect(() => {
    if (open && momentTitle) {
      setHookText(momentTitle);
    }
  }, [open, momentTitle]);

  const handleProcess = () => {
    if (!selectedPlatform || !selectedCaption) return;
    onProcess({
      platform: selectedPlatform,
      captionStyle: selectedCaption,
      hookText: hookEnabled ? hookText : null,
      hookEnabled,
    });
  };

  const handleClose = () => {
    setSelectedPlatform(null);
    setSelectedCaption("highlight");
    setHookEnabled(true);
    setHookText(momentTitle || "");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="bg-[#0a0a0f] border-white/10 text-white max-w-lg" data-testid="modal-platform-select">
        <DialogHeader>
          <DialogTitle className="text-white text-lg">Prepare your clip</DialogTitle>
          <DialogDescription className="text-white/40 text-sm">
            {momentTitle ? `"${momentTitle}"` : "Select platform and caption style"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          <div>
            <p className="text-sm font-medium text-white/60 mb-3">Choose your platform</p>
            <div className="grid grid-cols-3 gap-3">
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlatform(p.id)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-md border transition-colors cursor-pointer ${
                    selectedPlatform === p.id
                      ? "border-[#f5c542] bg-[#f5c542]/10"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                  }`}
                  data-testid={`button-platform-${p.id}`}
                >
                  <p.icon className={`h-5 w-5 ${selectedPlatform === p.id ? "text-[#f5c542]" : "text-white/50"}`} />
                  <span className={`text-sm font-medium ${selectedPlatform === p.id ? "text-[#f5c542]" : "text-white/80"}`}>
                    {p.name}
                  </span>
                  <span className="text-[10px] text-white/30">{p.aspect} · {p.maxDuration}</span>
                </button>
              ))}
            </div>
          </div>

          {selectedPlatform && (
            <div>
              <p className="text-sm font-medium text-white/60 mb-3">Caption style</p>
              <div className="space-y-2">
                {CAPTION_STYLES.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCaption(c.id)}
                    className={`flex items-start gap-3 w-full p-3 rounded-md border text-left transition-colors cursor-pointer ${
                      selectedCaption === c.id
                        ? "border-[#f5c542] bg-[#f5c542]/10"
                        : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                    }`}
                    data-testid={`button-caption-${c.id}`}
                  >
                    <c.icon className={`h-4 w-4 mt-0.5 shrink-0 ${selectedCaption === c.id ? "text-[#f5c542]" : "text-white/40"}`} />
                    <div>
                      <span className={`text-sm font-medium ${selectedCaption === c.id ? "text-[#f5c542]" : "text-white/80"}`}>
                        {c.name}
                      </span>
                      <p className="text-xs text-white/30 mt-0.5">{c.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedPlatform && (
            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <Zap className={`h-4 w-4 ${hookEnabled ? "text-[#f5c542]" : "text-white/30"}`} />
                  <p className="text-sm font-medium text-white/60">Auto hook</p>
                </div>
                <Switch
                  checked={hookEnabled}
                  onCheckedChange={setHookEnabled}
                  data-testid="switch-hook-toggle"
                />
              </div>
              <p className="text-xs text-white/30 mb-2">
                A text hook appears in the first 5 seconds to grab attention.
              </p>
              {hookEnabled && (
                <Input
                  value={hookText}
                  onChange={(e) => setHookText(e.target.value)}
                  placeholder="Enter hook text..."
                  maxLength={80}
                  className="bg-white/[0.05] border-white/10 text-white placeholder:text-white/20 text-sm"
                  data-testid="input-hook-text"
                />
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              variant="ghost"
              onClick={handleClose}
              className="text-white/40 flex-1"
              data-testid="button-cancel-platform"
            >
              Cancel
            </Button>
            <Button
              onClick={handleProcess}
              disabled={!selectedPlatform || !selectedCaption || isProcessing}
              className="bg-[#f5c542] text-[#0a0a0f] border-[#f5c542] font-semibold flex-1"
              data-testid="button-process-clip"
            >
              {isProcessing ? "Starting..." : "Process Clip"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
