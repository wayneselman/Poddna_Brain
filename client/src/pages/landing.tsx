import { Link } from "wouter";
import { Helmet } from "react-helmet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  BarChart3, 
  Shield, 
  FileSearch, 
  Users, 
  Building2, 
  Newspaper, 
  Megaphone,
  ArrowRight,
  CheckCircle2,
  Scale,
  Layers,
  Mail
} from "lucide-react";

const icpCards = [
  {
    icon: Building2,
    title: "Podcast Networks & Studios",
    bullets: [
      "Monitor every episode for compliance and brand risk before distribution",
      "Automate compliance screening before distribution",
      "Identify high-value licensing opportunities"
    ]
  },
  {
    icon: Megaphone,
    title: "Brands & Agencies",
    bullets: [
      "Track brand mentions and sentiment to protect reputation at scale",
      "Verify sponsor integration accuracy",
      "Identify emerging creator partnerships"
    ]
  },
  {
    icon: Newspaper,
    title: "Media & IP Teams",
    bullets: [
      "Research statements at scale with timestamped, verifiable evidence",
      "Cross-reference claims across multiple episodes",
      "Build comprehensive media intelligence reports"
    ]
  },
  {
    icon: Users,
    title: "Researchers & Journalists",
    bullets: [
      "Find quotes with full context and track narrative evolution",
      "Verify claims with timestamped evidence",
      "Build sourced research from audio archives"
    ]
  }
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-background">
      <Helmet>
        <title>PodDNA - Podcast Intelligence for Media, Brands & IP Owners</title>
        <meta name="description" content="Transform podcast content into actionable intelligence. AI-powered analysis for media companies, brands, and IP owners to understand what podcasts actually say." />
        <meta property="og:title" content="PodDNA - Podcast Intelligence Platform" />
        <meta property="og:description" content="AI-powered podcast intelligence for media companies, brands, and IP owners. Semantic understanding, claim detection, and narrative analysis at scale." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://poddna.io" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="PodDNA - Podcast Intelligence Platform" />
        <meta name="twitter:description" content="AI-powered podcast intelligence for media companies, brands, and IP owners." />
      </Helmet>
      
      {/* Hero Section */}
      <section className="py-20 lg:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-foreground leading-tight mb-6" data-testid="text-hero-title">
              Podcast Intelligence for Media, Brands, and IP Owners
            </h1>
            
            <p className="text-xl text-gray-600 dark:text-muted-foreground mb-10 max-w-3xl mx-auto" data-testid="text-hero-subtitle">
              Understand what podcasts actually say — claims, narratives, and sponsor context — so you can manage risk, protect brands, and scale audio IP with confidence.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/request-demo">
                <Button size="lg" className="gap-2 text-base px-8" data-testid="button-hero-demo">
                  Request a Demo
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/sample-analysis">
                <Button variant="outline" size="lg" className="gap-2 text-base px-8" data-testid="button-hero-sample">
                  View Sample Analysis
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* What PodDNA Is Section */}
      <section className="py-16 bg-gray-50 dark:bg-muted/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-foreground mb-4" data-testid="text-what-is-title">
              Not Analytics. Intelligence.
            </h2>
            <p className="text-lg text-gray-600 dark:text-muted-foreground max-w-2xl mx-auto">
              Traditional podcast analytics measure distribution. PodDNA measures meaning — what was said, how it was framed, and why it matters.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-foreground mb-2">Beyond Downloads</h3>
              <p className="text-gray-600 dark:text-muted-foreground text-sm">
                Downloads measure reach. We measure meaning — what was said, claimed, and implied.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Layers className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-foreground mb-2">Beyond Mentions</h3>
              <p className="text-gray-600 dark:text-muted-foreground text-sm">
                Mentions are noise. We extract claims, context, and narrative patterns that matter.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Scale className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-foreground mb-2">Beyond Episodes</h3>
              <p className="text-gray-600 dark:text-muted-foreground text-sm">
                Episodes are containers. We reveal the narratives, entities, and risks within.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Who It's For Section */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-foreground mb-4" data-testid="text-who-for-title">
              Built for Teams Who Need to Know
            </h2>
            <p className="text-lg text-gray-600 dark:text-muted-foreground max-w-2xl mx-auto">
              When the stakes are high, you can't rely on summaries and samples.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {icpCards.map((card, index) => (
              <Card key={index} className="p-6 hover-elevate" data-testid={`icp-card-${index}`}>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <card.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-foreground text-lg mb-3">
                      {card.title}
                    </h3>
                    <ul className="space-y-2">
                      {card.bullets.map((bullet, i) => (
                        <li key={i} className="flex items-start gap-2 text-gray-600 dark:text-muted-foreground text-sm">
                          <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Platform CTA */}
      <section className="py-12 bg-gray-50 dark:bg-muted/20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-lg text-gray-600 dark:text-muted-foreground mb-4">
            Want to see the technical capabilities?
          </p>
          <Link href="/platform">
            <Button variant="outline" size="lg" className="gap-2" data-testid="button-explore-platform">
              Explore the Platform
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Why This Matters Section */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-foreground mb-4" data-testid="text-why-matters-title">
              Why This Matters Now
            </h2>
            <p className="text-lg text-gray-600 dark:text-muted-foreground max-w-2xl mx-auto">
              Podcasts now generate hundreds of millions in annual revenue and shape public opinion at scale — yet remain largely ungoverned.
            </p>
          </div>

          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="font-semibold text-gray-900 dark:text-foreground mb-2">
                Podcasts are unindexed influence channels
              </h3>
              <p className="text-gray-600 dark:text-muted-foreground">
                3 million+ podcasts generate billions of hours of content annually. Most of it is invisible to traditional media monitoring. Statements made in podcasts drive markets, shape opinions, and create legal exposure — often without any record.
              </p>
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold text-gray-900 dark:text-foreground mb-2">
                The gap between what's said and what's tracked is growing
              </h3>
              <p className="text-gray-600 dark:text-muted-foreground">
                As podcast advertising grows past $2B annually and hosts increasingly make claims about products, health, and finance, the compliance and reputation risks grow with it. Most organizations are flying blind.
              </p>
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold text-gray-900 dark:text-foreground mb-2">
                AI makes comprehensive analysis finally possible
              </h3>
              <p className="text-gray-600 dark:text-muted-foreground">
                Until now, analyzing podcast content at scale required prohibitive manual effort. PodDNA combines state-of-the-art speech recognition, LLM analysis, and knowledge graphs to deliver intelligence that was previously impossible.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* What Makes PodDNA Different */}
      <section className="py-20 bg-gray-50 dark:bg-muted/20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-foreground mb-4" data-testid="text-different-title">
              What Makes PodDNA Different
            </h2>
            <p className="text-lg text-gray-600 dark:text-muted-foreground max-w-3xl mx-auto">
              PodDNA is not a podcast tool. It is an intelligence layer for spoken media. We don't optimize creators. We enable organizations to understand, govern, and scale audio content responsibly.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-gray-900 dark:text-foreground mb-1">Full Transcript Intelligence</h4>
                <p className="text-gray-600 dark:text-muted-foreground text-sm">
                  Not just keywords — full semantic understanding of every statement, claim, and context.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-gray-900 dark:text-foreground mb-1">Speaker Identification</h4>
                <p className="text-gray-600 dark:text-muted-foreground text-sm">
                  Know who said what, with AI-powered speaker diarization and attribution.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-gray-900 dark:text-foreground mb-1">Claim Classification</h4>
                <p className="text-gray-600 dark:text-muted-foreground text-sm">
                  Automatic detection and categorization of financial, medical, and sensitive claims.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-gray-900 dark:text-foreground mb-1">Portfolio-Scale Analysis</h4>
                <p className="text-gray-600 dark:text-muted-foreground text-sm">
                  Monitor hundreds of shows across your network or competitive landscape.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-gray-900 dark:text-foreground mb-1">Enterprise Security</h4>
                <p className="text-gray-600 dark:text-muted-foreground text-sm">
                  SOC 2 readiness, SSO integration, and data residency options.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-gray-900 dark:text-foreground mb-1">API-First Architecture</h4>
                <p className="text-gray-600 dark:text-muted-foreground text-sm">
                  Integrate podcast intelligence directly into your existing workflows.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security & Governance Section */}
      <section id="security" className="py-20 bg-gray-900 dark:bg-gray-950" data-testid="section-security">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Shield className="w-6 h-6 text-yellow-500" />
              <span className="text-yellow-500 font-medium uppercase tracking-wide text-sm">Enterprise Trust</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4" data-testid="text-security-title">
              Security & Governance Support
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Built for enterprises with strict compliance and security requirements.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="flex items-start gap-4 p-4 rounded-lg bg-gray-800/50">
              <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                <FileSearch className="w-5 h-5 text-yellow-500" />
              </div>
              <div>
                <h4 className="font-semibold text-white mb-1">Audit-Friendly Outputs</h4>
                <p className="text-gray-400 text-sm">
                  Every analysis includes timestamped citations and source links for compliance audits.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-lg bg-gray-800/50">
              <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                <Layers className="w-5 h-5 text-yellow-500" />
              </div>
              <div>
                <h4 className="font-semibold text-white mb-1">Source Provenance</h4>
                <p className="text-gray-400 text-sm">
                  Full chain of custody for transcripts — know exactly where every data point comes from.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-lg bg-gray-800/50">
              <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                <Scale className="w-5 h-5 text-yellow-500" />
              </div>
              <div>
                <h4 className="font-semibold text-white mb-1">Explainable AI</h4>
                <p className="text-gray-400 text-sm">
                  Transparent confidence scoring and reasoning chains for every claim and detection.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-lg bg-gray-800/50">
              <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-yellow-500" />
              </div>
              <div>
                <h4 className="font-semibold text-white mb-1">Compliance Support</h4>
                <p className="text-gray-400 text-sm">
                  SOC 2 readiness, SSO integration, data residency options, and custom SLAs.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-12 text-center">
            <Link href="/request-demo">
              <Button size="lg" className="gap-2 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold" data-testid="button-security-demo">
                Discuss Your Security Requirements
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-foreground mb-4" data-testid="text-cta-title">
            See What You've Been Missing
          </h2>
          <p className="text-lg text-gray-600 dark:text-muted-foreground mb-8">
            Schedule a demo to see how PodDNA can transform your podcast intelligence capabilities.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/request-demo">
              <Button size="lg" className="gap-2 text-base px-8" data-testid="button-final-demo">
                Request a Demo
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/sample-analysis">
              <Button variant="outline" size="lg" className="text-base px-8" data-testid="button-final-sample">
                View Sample Analysis
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-50 dark:bg-muted/30 border-t border-gray-200 dark:border-border py-12" data-testid="section-footer">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <span className="text-primary-foreground font-bold text-sm">P</span>
                </div>
                <span className="text-lg font-semibold text-gray-900 dark:text-foreground">PodDNA</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-muted-foreground mb-4">
                Podcast intelligence for media, brands, and IP owners.
              </p>
              <a 
                href="mailto:hello@poddna.io" 
                className="text-sm text-gray-600 dark:text-muted-foreground hover:text-primary flex items-center gap-2"
                data-testid="link-footer-email"
              >
                <Mail className="w-4 h-4" />
                hello@poddna.io
              </a>
            </div>
            
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-foreground mb-4">Platform</h4>
              <ul className="space-y-2">
                <li>
                  <Link href="/platform" className="text-sm text-gray-600 dark:text-muted-foreground hover:text-primary" data-testid="link-footer-platform">
                    Platform Overview
                  </Link>
                </li>
                <li>
                  <Link href="/use-cases" className="text-sm text-gray-600 dark:text-muted-foreground hover:text-primary" data-testid="link-footer-use-cases">
                    Use Cases
                  </Link>
                </li>
                <li>
                  <Link href="/sample-analysis" className="text-sm text-gray-600 dark:text-muted-foreground hover:text-primary" data-testid="link-footer-sample">
                    Sample Analysis
                  </Link>
                </li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-foreground mb-4">Industries</h4>
              <ul className="space-y-2">
                <li className="text-sm text-gray-600 dark:text-muted-foreground">Podcast Networks</li>
                <li className="text-sm text-gray-600 dark:text-muted-foreground">Brands & Agencies</li>
                <li className="text-sm text-gray-600 dark:text-muted-foreground">Media & IP Teams</li>
                <li className="text-sm text-gray-600 dark:text-muted-foreground">Researchers</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-foreground mb-4">Get Started</h4>
              <ul className="space-y-2">
                <li>
                  <Link href="/request-demo" className="text-sm text-gray-600 dark:text-muted-foreground hover:text-primary" data-testid="link-footer-demo">
                    Request Demo
                  </Link>
                </li>
                <li>
                  <Link href="/analyzer" className="text-sm text-gray-600 dark:text-muted-foreground hover:text-primary" data-testid="link-footer-analyzer">
                    Try Preview
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          
          <div className="mt-10 pt-8 border-t border-gray-200 dark:border-border">
            <p className="text-center text-sm text-gray-500 dark:text-muted-foreground">
              &copy; {new Date().getFullYear()} PodDNA. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
