import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Headphones, 
  MessageSquare, 
  Users, 
  TrendingUp, 
  Search, 
  Highlighter,
  ThumbsUp,
  Share2,
  Play,
  Sparkles,
  Music,
  ArrowRight
} from "lucide-react";

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-12 space-y-20">
        
        <section className="text-center space-y-6">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight" data-testid="text-page-title">
            How PODDNA Works
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Discover, annotate, and discuss your favorite podcast moments with a community of passionate listeners.
          </p>
        </section>

        <section className="space-y-8">
          <h2 className="text-2xl font-bold text-center">What is PODDNA?</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="hover-elevate">
              <CardContent className="pt-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Headphones className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg">Listen</h3>
                <p className="text-muted-foreground text-sm">
                  Explore a curated library of podcasts with full transcripts and synchronized playback.
                </p>
              </CardContent>
            </Card>
            
            <Card className="hover-elevate">
              <CardContent className="pt-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto">
                  <Highlighter className="w-6 h-6 text-yellow-600" />
                </div>
                <h3 className="font-semibold text-lg">Annotate</h3>
                <p className="text-muted-foreground text-sm">
                  Highlight meaningful moments and add your insights, just like Genius does for music.
                </p>
              </CardContent>
            </Card>
            
            <Card className="hover-elevate">
              <CardContent className="pt-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                  <Users className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="font-semibold text-lg">Connect</h3>
                <p className="text-muted-foreground text-sm">
                  Join discussions, upvote the best insights, and discover what resonates with others.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="space-y-12">
          <h2 className="text-2xl font-bold text-center">How to Use PODDNA</h2>
          
          <div className="space-y-16">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                    1
                  </div>
                  <h3 className="text-xl font-semibold">Find a Podcast</h3>
                </div>
                <p className="text-muted-foreground ml-[52px]" data-testid="text-step-1-description">
                  Browse our library or use the search to find podcasts that interest you. 
                  Each podcast shows available episodes with transcripts ready for exploration.
                </p>
              </div>
              <Card className="bg-muted/30">
                <CardContent className="p-6 flex items-center justify-center gap-4">
                  <Search className="w-8 h-8 text-muted-foreground" />
                  <ArrowRight className="w-5 h-5 text-muted-foreground" />
                  <Headphones className="w-8 h-8 text-primary" />
                </CardContent>
              </Card>
            </div>

            <div className="grid md:grid-cols-2 gap-8 items-center">
              <Card className="bg-muted/30 md:order-1">
                <CardContent className="p-6 flex items-center justify-center gap-4">
                  <Play className="w-8 h-8 text-primary" />
                  <div className="flex-1 h-2 bg-primary/20 rounded-full relative">
                    <div className="absolute left-1/3 w-3 h-3 bg-primary rounded-full -top-0.5" />
                  </div>
                </CardContent>
              </Card>
              <div className="space-y-4 md:order-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                    2
                  </div>
                  <h3 className="text-xl font-semibold">Read & Listen Together</h3>
                </div>
                <p className="text-muted-foreground ml-[52px]" data-testid="text-step-2-description">
                  Open any episode to see the full transcript synchronized with the audio or video player. 
                  Click any segment to jump to that moment in the episode.
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                    3
                  </div>
                  <h3 className="text-xl font-semibold">Highlight & Annotate</h3>
                </div>
                <p className="text-muted-foreground ml-[52px]" data-testid="text-step-3-description">
                  Select any text in the transcript to create an annotation. Share your thoughts, 
                  add context, explain references, or start a discussion about that moment.
                </p>
              </div>
              <Card className="bg-yellow-500/10 border-yellow-500/30">
                <CardContent className="p-6 space-y-3">
                  <p className="text-sm">
                    <span className="bg-yellow-300/50 px-1">"The key insight here is that compound growth..."</span>
                  </p>
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MessageSquare className="w-4 h-4 mt-0.5 text-yellow-600" />
                    <span>This connects to what Charlie Munger said about mental models...</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid md:grid-cols-2 gap-8 items-center">
              <Card className="bg-muted/30 md:order-1">
                <CardContent className="p-6 flex items-center justify-center gap-6">
                  <div className="flex items-center gap-2">
                    <ThumbsUp className="w-6 h-6 text-green-600" />
                    <span className="font-semibold">42</span>
                  </div>
                  <div className="h-8 w-px bg-border" />
                  <div className="flex items-center gap-2">
                    <Share2 className="w-6 h-6 text-primary" />
                    <span className="text-sm text-muted-foreground">Share</span>
                  </div>
                </CardContent>
              </Card>
              <div className="space-y-4 md:order-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                    4
                  </div>
                  <h3 className="text-xl font-semibold">Vote & Share</h3>
                </div>
                <p className="text-muted-foreground ml-[52px]" data-testid="text-step-4-description">
                  Upvote annotations that add value and share your favorite insights. 
                  The best annotations rise to the top and may be featured on the homepage.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-8">
          <h2 className="text-2xl font-bold text-center">Special Features</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="hover-elevate">
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                    <Music className="w-5 h-5 text-purple-600" />
                  </div>
                  <h3 className="font-semibold">PodTap Music Discovery</h3>
                </div>
                <p className="text-muted-foreground text-sm">
                  Found a song playing in an episode? Use PodTap to identify music mentioned or 
                  played in podcasts. Discover new artists and save tracks to your favorites.
                </p>
              </CardContent>
            </Card>
            
            <Card className="hover-elevate">
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-blue-600" />
                  </div>
                  <h3 className="font-semibold">AI-Powered Transcripts</h3>
                </div>
                <p className="text-muted-foreground text-sm">
                  Our transcripts are generated using advanced AI with speaker identification. 
                  Each segment is timestamped so you can jump directly to any moment.
                </p>
              </CardContent>
            </Card>
            
            <Card className="hover-elevate">
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-orange-600" />
                  </div>
                  <h3 className="font-semibold">Trending Insights</h3>
                </div>
                <p className="text-muted-foreground text-sm">
                  See what the community is talking about. Trending annotations surface the most 
                  discussed and upvoted insights across all podcasts.
                </p>
              </CardContent>
            </Card>
            
            <Card className="hover-elevate">
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-pink-500/10 flex items-center justify-center">
                    <Share2 className="w-5 h-5 text-pink-600" />
                  </div>
                  <h3 className="font-semibold">Shareable Cards</h3>
                </div>
                <p className="text-muted-foreground text-sm">
                  Share your favorite annotations as beautiful visual cards. Perfect for 
                  social media, blogs, or anywhere you want to spread podcast wisdom.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="text-center space-y-6 py-12 rounded-xl bg-muted/30">
          <h2 className="text-2xl font-bold">Ready to Dive In?</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Start exploring podcasts and join our community of curious listeners who love 
            to discover and share insights.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/explore">
              <Button size="lg" data-testid="button-explore-podcasts">
                Explore Podcasts
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link href="/trending">
              <Button size="lg" variant="outline" data-testid="button-view-trending">
                View Trending
              </Button>
            </Link>
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-center">Frequently Asked Questions</h2>
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <div className="space-y-2">
              <h4 className="font-semibold">Do I need an account to browse?</h4>
              <p className="text-sm text-muted-foreground">
                No! You can browse podcasts, read transcripts, and view annotations without signing in. 
                An account is only needed to create annotations and vote.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">How do I create an annotation?</h4>
              <p className="text-sm text-muted-foreground">
                While reading a transcript, select any text you want to annotate. A popup will appear 
                where you can add your thoughts and submit.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">What makes a good annotation?</h4>
              <p className="text-sm text-muted-foreground">
                Great annotations add context, explain references, share relevant links, 
                or offer thoughtful analysis. Think of it as enriching the conversation.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">Can I request a podcast to be added?</h4>
              <p className="text-sm text-muted-foreground">
                We're always adding new podcasts to the platform. Stay tuned as our library 
                continues to grow with diverse voices and topics.
              </p>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
