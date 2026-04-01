import { Link } from "wouter";
import { Helmet } from "react-helmet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  ArrowRight,
  MessageSquareQuote,
  Shield,
  Network,
  Megaphone,
  FileSearch,
  Search,
  Zap,
  Database,
  Lock,
  Globe,
  Cpu
} from "lucide-react";

const coreFeatures = [
  {
    icon: MessageSquareQuote,
    title: "Semantic Content Understanding",
    description: "Advanced NLP extracts meaning, sentiment, and context from every transcript. Understand not just what was said, but how and why.",
  },
  {
    icon: Shield,
    title: "Claim & Integrity Analysis",
    description: "Automatically detect financial claims, medical statements, and regulatory-sensitive content with AI-powered confidence scoring.",
  },
  {
    icon: Network,
    title: "Narrative Mapping",
    description: "Track how ideas, talking points, and stories propagate across the podcast ecosystem. See patterns invisible to human analysts.",
  },
  {
    icon: Megaphone,
    title: "Sponsor Context Analysis",
    description: "Full visibility into how sponsors are represented. Detect claims, sentiment, and compliance risks around brand mentions.",
  },
  {
    icon: FileSearch,
    title: "Cross-Source Transcript Diffing",
    description: "Compare transcripts from multiple sources to identify edits, omissions, and discrepancies. Trust but verify.",
  },
  {
    icon: Search,
    title: "Semantic Search",
    description: "Natural language search across millions of transcript segments. Find exactly what you're looking for with contextual precision.",
  }
];

const infrastructure = [
  {
    icon: Zap,
    title: "Real-Time Processing",
    description: "Episodes are analyzed within hours of publication, not days."
  },
  {
    icon: Database,
    title: "Portfolio Scale",
    description: "Monitor hundreds or thousands of podcasts simultaneously."
  },
  {
    icon: Lock,
    title: "Enterprise Security",
    description: "SOC 2 ready architecture with SSO and role-based access."
  },
  {
    icon: Globe,
    title: "API-First Design",
    description: "Full API access for integration with existing workflows."
  },
  {
    icon: Cpu,
    title: "AI-Powered",
    description: "Latest LLM technology for accuracy and insight depth."
  }
];

export default function PlatformPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-background">
      <Helmet>
        <title>Platform - PodDNA | Podcast Intelligence Infrastructure</title>
        <meta name="description" content="Explore PodDNA's AI-powered platform for semantic content understanding, claim detection, narrative mapping, and enterprise-scale podcast analysis." />
      </Helmet>
      
      {/* Hero */}
      <section className="py-20 lg:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-foreground mb-6" data-testid="text-platform-title">
              The PodDNA Platform
            </h1>
            <p className="text-xl text-gray-600 dark:text-muted-foreground mb-8">
              Enterprise-grade infrastructure for podcast content intelligence. From transcription to insight delivery.
            </p>
            <Link href="/request-demo">
              <Button size="lg" className="gap-2" data-testid="button-platform-demo">
                Request a Demo
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 bg-gray-50 dark:bg-muted/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-foreground text-center mb-12" data-testid="text-how-works-title">
            How It Works
          </h2>
          
          <div className="grid md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                1
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-foreground mb-2">Ingest</h3>
              <p className="text-gray-600 dark:text-muted-foreground text-sm">
                Connect RSS feeds, upload files, or integrate via API. We handle any audio format.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                2
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-foreground mb-2">Process</h3>
              <p className="text-gray-600 dark:text-muted-foreground text-sm">
                State-of-the-art transcription with speaker diarization and multi-language support.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                3
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-foreground mb-2">Analyze</h3>
              <p className="text-gray-600 dark:text-muted-foreground text-sm">
                AI extracts claims, entities, sentiment, sponsors, and narrative patterns automatically.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                4
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-foreground mb-2">Deliver</h3>
              <p className="text-gray-600 dark:text-muted-foreground text-sm">
                Access via dashboard, alerts, reports, or API. Intelligence when and where you need it.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Core Features */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-foreground text-center mb-4" data-testid="text-features-title">
            Core Capabilities
          </h2>
          <p className="text-gray-600 dark:text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
            Every capability designed for enterprise scale, accuracy, and actionable insights.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {coreFeatures.map((feature, index) => (
              <Card key={index} className="p-6" data-testid={`feature-card-${index}`}>
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600 dark:text-muted-foreground text-sm">
                  {feature.description}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Infrastructure */}
      <section className="py-20 bg-gray-50 dark:bg-muted/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-foreground text-center mb-4" data-testid="text-infrastructure-title">
            Enterprise Infrastructure
          </h2>
          <p className="text-gray-600 dark:text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
            Built for scale, security, and reliability from day one.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {infrastructure.map((item, index) => (
              <div key={index} className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <item.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-medium text-gray-900 dark:text-foreground mb-1 text-sm">
                  {item.title}
                </h3>
                <p className="text-gray-500 dark:text-muted-foreground text-xs">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-foreground mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-gray-600 dark:text-muted-foreground mb-8">
            See the platform in action with a personalized demo.
          </p>
          <Link href="/request-demo">
            <Button size="lg" className="gap-2" data-testid="button-platform-cta">
              Request a Demo
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
