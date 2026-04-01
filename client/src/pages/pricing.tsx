import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, Zap } from "lucide-react";

const freeTierFeatures = [
  "Submit any YouTube URL",
  "AI analyzes your video",
  "See 3-5 viral moments detected",
  "View timestamps and virality scores",
  "Preview clips on YouTube",
];

const proTierFeatures = [
  "Everything in Free",
  "Professional captions burned in",
  "Optimized for TikTok/Reels/Shorts",
  "Download ready-to-post MP4 files",
  "Delivered within 24 hours",
];

export default function PricingPage() {
  return (
    <div className="min-h-[80vh] py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4" data-testid="text-pricing-title">
            Simple, Transparent Pricing
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Start free. See what viral moments AI finds in your podcast. 
            Pay only when you want downloadable clips.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          <Card className="relative" data-testid="card-pricing-free">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-muted-foreground" />
                Free
              </CardTitle>
              <CardDescription>
                Discover your best moments
              </CardDescription>
              <div className="mt-4">
                <span className="text-4xl font-bold">$0</span>
                <span className="text-muted-foreground ml-2">/ video</span>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {freeTierFeatures.map((feature, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Link href="/app" className="w-full">
                <Button variant="outline" className="w-full" data-testid="button-get-started-free">
                  Get Started Free
                </Button>
              </Link>
            </CardFooter>
          </Card>

          <Card className="relative border-primary" data-testid="card-pricing-pro">
            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
              Most Popular
            </Badge>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                Pro Clips
              </CardTitle>
              <CardDescription>
                Ready-to-post video clips
              </CardDescription>
              <div className="mt-4">
                <span className="text-4xl font-bold">$49</span>
                <span className="text-muted-foreground ml-2">/ video</span>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {proTierFeatures.map((feature, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Link href="/app" className="w-full">
                <Button className="w-full" data-testid="button-get-started-pro">
                  Start Analyzing
                </Button>
              </Link>
            </CardFooter>
          </Card>
        </div>

        <div className="text-center mt-12">
          <p className="text-muted-foreground text-sm">
            No subscriptions. No hidden fees. Pay per video.
          </p>
        </div>
      </div>
    </div>
  );
}
