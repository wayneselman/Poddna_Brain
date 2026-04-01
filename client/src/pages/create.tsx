import { Link, useLocation } from "wouter";
import { Helmet } from "react-helmet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Play,
  Zap,
  Clock,
  CheckCircle,
  ArrowRight,
  Sparkles,
  Video,
  MessageSquare
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { ViralMoment } from "@shared/schema";

interface ViralMomentsResponse {
  moments: ViralMoment[];
}

const fallbackMoments = [
  {
    suggestedTitle: "Why 90% AI Code Won't Replace Developers",
    viralityScore: 92,
    startTime: 1065,
    endTime: 1125,
    pullQuote: "90% AI code + 10x growth = same developer jobs",
    hookReason: "Counterintuitive framework that resolves the AI replacement paradox with specific math"
  },
  {
    suggestedTitle: "The Real Reason Black Wall Street Disappeared",
    viralityScore: 85,
    startTime: 825,
    endTime: 885,
    pullQuote: "You asked what happened? You happened.",
    hookReason: "Powerful reversal that answers common question by pointing finger back at questioner"
  }
];

const faqItems = [
  {
    question: "How does the AI find viral moments?",
    answer: "We use Claude AI with a 3-pass detection system: generate candidates, critique them, then rank by virality score. The AI looks for frameworks, insights, controversial takes, and memorable quotes."
  },
  {
    question: "What format are the clips?",
    answer: "MP4 files optimized for vertical video (1080x1920), perfect for TikTok, Instagram Reels, and YouTube Shorts. Captions are professionally burned in."
  },
  {
    question: "How long does it take?",
    answer: "Free analysis takes 20-30 minutes. Once you pay for clip generation, we deliver within 24 hours via email."
  },
  {
    question: "Can I use this for any podcast?",
    answer: "Yes! As long as it's on YouTube, we can analyze it. For clip generation, make sure you own the rights to the content."
  },
  {
    question: "What if the AI doesn't find good moments?",
    answer: "You only pay if you're happy with the detected moments. Try the free analysis first - if the moments look good, then order clips."
  }
];

export default function CreateLandingPage() {
  const [, setLocation] = useLocation();

  const { data: viralMomentsData } = useQuery<ViralMomentsResponse>({
    queryKey: ['/api/viral-moments/top?limit=4'],
  });

  const displayMoments = viralMomentsData?.moments?.slice(0, 4) || [];

  const formatTimestamp = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const scrollToPricing = () => {
    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-white dark:bg-background">
      <Helmet>
        <title>Turn Your Podcast Into Viral Clips | PodDNA</title>
        <meta name="description" content="AI finds the best moments in your podcast. We generate clips with captions. You get more views in 24 hours. Free analysis, $49 for professional clips." />
        <meta property="og:title" content="Turn Your Podcast Into Viral Clips | PodDNA" />
        <meta property="og:description" content="AI finds the best moments. We generate clips with captions. You get more views in 24 hours." />
        <meta property="og:type" content="website" />
      </Helmet>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 py-20 text-center" data-testid="section-hero">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6 text-foreground leading-tight">
          Turn Your Podcast Into
          <span className="text-primary"> Viral Clips</span>
        </h1>
        
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          AI finds the best moments. We generate clips with captions. 
          You get more views in 24 hours.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/my-clips">
            <Button size="lg" className="gap-2 text-base" data-testid="button-analyze-free">
              Analyze Your Video Free
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Button 
            size="lg" 
            variant="outline" 
            onClick={scrollToPricing}
            data-testid="button-see-pricing"
          >
            See Pricing
          </Button>
        </div>
        
        <p className="text-sm text-muted-foreground mt-4">
          No credit card required • Free viral moment analysis
        </p>
      </section>

      {/* How It Works */}
      <section className="max-w-6xl mx-auto px-4 py-20" data-testid="section-how-it-works">
        <h2 className="text-3xl font-bold text-center mb-4 text-foreground">
          Dead Simple. Incredibly Powerful.
        </h2>
        <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
          From YouTube URL to ready-to-post clips in three steps
        </p>
        
        <div className="grid md:grid-cols-3 gap-8">
          <Card className="p-6">
            <CardContent className="p-0">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <Play className="w-6 h-6 text-primary" />
              </div>
              <div className="text-4xl font-bold text-primary mb-4">1</div>
              <h3 className="text-xl font-semibold mb-2 text-foreground">Paste Your Video</h3>
              <p className="text-muted-foreground">
                Submit any YouTube podcast URL. AI analyzes the entire episode in 20-30 minutes.
              </p>
            </CardContent>
          </Card>
          
          <Card className="p-6">
            <CardContent className="p-0">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div className="text-4xl font-bold text-primary mb-4">2</div>
              <h3 className="text-xl font-semibold mb-2 text-foreground">AI Finds Gold</h3>
              <p className="text-muted-foreground">
                3-pass Claude AI detection finds 3-5 viral moments with scores, quotes, and timestamps.
              </p>
            </CardContent>
          </Card>
          
          <Card className="p-6">
            <CardContent className="p-0">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <Video className="w-6 h-6 text-primary" />
              </div>
              <div className="text-4xl font-bold text-primary mb-4">3</div>
              <h3 className="text-xl font-semibold mb-2 text-foreground">Get Your Clips</h3>
              <p className="text-muted-foreground">
                Pay $49, receive professional clips with captions in 24 hours. Ready to post.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Example Moments */}
      <section className="bg-muted/30 py-20" data-testid="section-examples">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-4 text-foreground">
            See What AI Finds
          </h2>
          <p className="text-center text-muted-foreground mb-12">
            Real viral moments detected by our AI
          </p>
          
          <div className="grid md:grid-cols-2 gap-6">
            {(displayMoments.length > 0 ? displayMoments : fallbackMoments).map((moment, index) => (
              <Card key={index} className="p-6">
                <CardContent className="p-0">
                  <div className="flex flex-wrap justify-between items-start gap-2 mb-3">
                    <h3 className="font-semibold text-foreground line-clamp-2">
                      {moment.suggestedTitle}
                    </h3>
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      Score: {moment.viralityScore}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    {formatTimestamp(moment.startTime)} - {formatTimestamp(moment.endTime)} • {moment.endTime - moment.startTime}s
                  </p>
                  {moment.pullQuote && (
                    <p className="text-sm italic text-foreground/80 mb-3">
                      "{moment.pullQuote}"
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    <strong className="text-foreground">Why it's viral:</strong> {moment.hookReason}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          
          <div className="text-center mt-8">
            <Link href="/my-clips">
              <Button className="gap-2" data-testid="button-try-video">
                Try With Your Video
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-6xl mx-auto px-4 py-20" id="pricing" data-testid="section-pricing">
        <h2 className="text-3xl font-bold text-center mb-4 text-foreground">
          Simple, Transparent Pricing
        </h2>
        <p className="text-center text-muted-foreground mb-12">
          Try for free. Pay only when you want clips.
        </p>
        
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Free Tier */}
          <Card className="p-8 border-2">
            <CardContent className="p-0">
              <h3 className="text-2xl font-bold mb-2 text-foreground">Free Analysis</h3>
              <div className="text-4xl font-bold mb-4 text-foreground">$0</div>
              <p className="text-muted-foreground mb-6">
                Perfect for trying it out
              </p>
              
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-foreground">Analyze any YouTube video</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-foreground">See 3-5 viral moments with scores</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-foreground">View timestamps & quotes</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-foreground">Preview on YouTube</span>
                </li>
              </ul>
              
              <Link href="/my-clips">
                <Button variant="outline" className="w-full" data-testid="button-try-free">
                  Try Free
                </Button>
              </Link>
            </CardContent>
          </Card>
          
          {/* Paid Tier */}
          <Card className="p-8 border-2 border-primary relative">
            <CardContent className="p-0">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-primary text-primary-foreground px-4 py-1">
                  Most Popular
                </Badge>
              </div>
              
              <h3 className="text-2xl font-bold mb-2 text-foreground">Clip Generation</h3>
              <div className="text-4xl font-bold mb-4 text-foreground">
                $49
                <span className="text-lg font-normal text-muted-foreground">/video</span>
              </div>
              <p className="text-muted-foreground mb-6">
                Get professional clips ready to post
              </p>
              
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-foreground">Everything in Free, plus:</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-foreground">3-5 video clips extracted</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-foreground">Professional captions burned in</span>
                </li>
                <li className="flex items-start gap-2">
                  <Clock className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-foreground">Delivered in 24 hours</span>
                </li>
                <li className="flex items-start gap-2">
                  <Zap className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-foreground">Ready for TikTok, Reels, Shorts</span>
                </li>
              </ul>
              
              <Link href="/my-clips">
                <Button className="w-full" data-testid="button-get-started">
                  Get Started
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-4xl mx-auto px-4 py-20" data-testid="section-faq">
        <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
          Frequently Asked Questions
        </h2>
        
        <div className="space-y-4">
          {faqItems.map((item, index) => (
            <Card key={index} className="p-6">
              <CardContent className="p-0">
                <h3 className="font-semibold mb-2 text-foreground flex items-start gap-2">
                  <MessageSquare className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  {item.question}
                </h3>
                <p className="text-muted-foreground pl-7">
                  {item.answer}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-primary text-primary-foreground py-20" data-testid="section-cta">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Ready to Go Viral?
          </h2>
          <p className="text-xl mb-8 opacity-90">
            Analyze your first video for free. No credit card required.
          </p>
          <Link href="/my-clips">
            <Button 
              size="lg" 
              variant="secondary"
              className="gap-2"
              data-testid="button-start-analysis"
            >
              Start Free Analysis
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="text-white font-bold text-lg mb-4">PodDNA</div>
              <p className="text-sm">AI-powered podcast clips in 24 hours</p>
            </div>
            
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/my-clips" className="hover:text-white transition-colors">Generate Clips</Link></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#faq" className="hover:text-white transition-colors">FAQ</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-white font-semibold mb-4">Contact</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="mailto:support@poddna.io" className="hover:text-white transition-colors">support@poddna.io</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-12 pt-8 text-center text-sm">
            <p>© 2026 PodDNA. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
