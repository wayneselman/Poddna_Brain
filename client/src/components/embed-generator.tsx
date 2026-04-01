import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Code2, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface EmbedGeneratorProps {
  episodeId: string;
}

export default function EmbedGenerator({ episodeId }: EmbedGeneratorProps) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [limit, setLimit] = useState("5");
  const [width, setWidth] = useState("100%");
  const [height, setHeight] = useState("600px");
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const generateEmbedCode = () => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const widgetUrl = `${baseUrl}/widget?episode=${episodeId}&theme=${theme}&limit=${limit}`;
    
    return `<iframe 
  src="${widgetUrl}"
  width="${width}"
  height="${height}"
  frameborder="0"
  style="border: 1px solid #e5e7eb; border-radius: 8px;"
  title="PodDNA Annotations"
></iframe>`;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generateEmbedCode());
      setCopied(true);
      toast({
        title: "Embed code copied!",
        description: "Paste it into your website HTML",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-testid="button-embed"
        >
          <Code2 className="w-4 h-4 mr-2" />
          Embed
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Embed Annotations</DialogTitle>
          <DialogDescription>
            Customize and copy the embed code to add PodDNA annotations to your website
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="theme">Theme</Label>
              <Select value={theme} onValueChange={(v) => setTheme(v as "light" | "dark")}>
                <SelectTrigger id="theme" data-testid="select-theme">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="limit">Number of annotations</Label>
              <Select value={limit} onValueChange={setLimit}>
                <SelectTrigger id="limit" data-testid="select-limit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="width">Width</Label>
              <Input
                id="width"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                placeholder="100%"
                data-testid="input-width"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="height">Height</Label>
              <Input
                id="height"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder="600px"
                data-testid="input-height"
              />
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <Label>Preview</Label>
            <div className="border rounded-lg p-2 bg-muted/30">
              <iframe
                src={typeof window !== 'undefined' ? `${window.location.origin}/widget?episode=${episodeId}&theme=${theme}&limit=${limit}` : ''}
                width="100%"
                height="400px"
                className="border-0 rounded"
                title="Widget Preview"
              />
            </div>
          </div>

          {/* Embed Code */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Embed Code</Label>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCopy}
                data-testid="button-copy-embed"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 mr-1" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 mr-1" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
              <code>{generateEmbedCode()}</code>
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
