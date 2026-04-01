import { Link } from "wouter";
import { Helmet } from "react-helmet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  ArrowRight,
  Building2,
  Megaphone,
  Newspaper,
  Users,
  Shield,
  TrendingUp,
  FileSearch,
  Scale,
  Target,
  Eye,
  AlertTriangle
} from "lucide-react";

const useCases = [
  {
    icon: Building2,
    title: "Podcast Networks & Studios",
    subtitle: "Content oversight at portfolio scale",
    description: "When you manage dozens or hundreds of shows, manual review isn't an option. PodDNA gives you automated visibility into every episode across your entire catalog.",
    challenges: [
      "Can't manually review every episode for compliance",
      "No visibility into what hosts are actually saying",
      "IP licensing decisions based on incomplete information",
      "Brand safety concerns from sponsors"
    ],
    solutions: [
      "Automated claim detection flags compliance risks before distribution",
      "Portfolio dashboards show content trends across all shows",
      "Full transcript search for IP due diligence",
      "Real-time alerts for sensitive content"
    ]
  },
  {
    icon: Megaphone,
    title: "Brands & Agencies",
    subtitle: "Protect and measure your podcast investments",
    description: "Podcast sponsorships are a $2B+ market, but brands often have no visibility into how they're represented. PodDNA changes that.",
    challenges: [
      "No way to verify what hosts actually said about your brand",
      "Can't track competitor mentions at scale",
      "Sponsorship reporting limited to downloads",
      "Risk of association with problematic content"
    ],
    solutions: [
      "Full transcript of every mention with context",
      "Competitive intelligence across podcast ecosystem",
      "Sentiment and claim analysis for brand mentions",
      "Automated brand safety screening"
    ]
  },
  {
    icon: Newspaper,
    title: "Media & IP Teams",
    subtitle: "Research and intelligence at scale",
    description: "When a public figure makes a claim on a podcast, you need to find it, verify it, and cite it accurately. PodDNA makes that possible.",
    challenges: [
      "Audio content is hard to search and cite",
      "No reliable way to track what executives say",
      "Statements made in podcasts often go untracked",
      "Manual research is prohibitively time-consuming"
    ],
    solutions: [
      "Timestamped, searchable transcripts with speaker attribution",
      "Entity tracking across the podcast ecosystem",
      "Claim extraction with confidence scoring",
      "Export-ready citations for reporting"
    ]
  },
  {
    icon: Users,
    title: "Researchers & Journalists",
    subtitle: "Find the truth in the noise",
    description: "Podcasts are where stories break, opinions form, and narratives develop. PodDNA gives researchers the tools to track and analyze this critical medium.",
    challenges: [
      "Important statements buried in hours of audio",
      "No way to track narrative evolution over time",
      "Verification of podcast claims is difficult",
      "Cross-referencing across episodes is manual"
    ],
    solutions: [
      "Natural language search across millions of segments",
      "Timeline view of how narratives develop",
      "Claim verification with source attribution",
      "Export and citation tools for academic use"
    ]
  }
];

const commonChallenges = [
  {
    icon: Eye,
    title: "Visibility Gap",
    description: "Podcasts generate billions of hours of content annually. Most of it is invisible to traditional monitoring."
  },
  {
    icon: AlertTriangle,
    title: "Compliance Risk",
    description: "Financial, medical, and regulatory claims are made constantly. Without monitoring, exposure grows daily."
  },
  {
    icon: Target,
    title: "Competitive Blind Spot",
    description: "Your competitors, partners, and customers are on podcasts. Are you tracking what's being said?"
  }
];

export default function UseCasesPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-background">
      <Helmet>
        <title>Use Cases - PodDNA | Podcast Intelligence for Every Industry</title>
        <meta name="description" content="See how podcast networks, brands, media teams, and researchers use PodDNA for content oversight, brand monitoring, and media intelligence." />
      </Helmet>
      
      {/* Hero */}
      <section className="py-20 lg:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-foreground mb-6" data-testid="text-use-cases-title">
              Use Cases
            </h1>
            <p className="text-xl text-gray-600 dark:text-muted-foreground mb-8">
              See how organizations use PodDNA to transform podcast content into actionable intelligence.
            </p>
          </div>
        </div>
      </section>

      {/* Common Challenges */}
      <section className="py-12 bg-gray-50 dark:bg-muted/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid md:grid-cols-3 gap-8">
            {commonChallenges.map((challenge, index) => (
              <div key={index} className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <challenge.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-foreground mb-2">{challenge.title}</h3>
                <p className="text-gray-600 dark:text-muted-foreground text-sm">{challenge.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Case Details */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="space-y-16">
            {useCases.map((useCase, index) => (
              <div key={index} className="grid lg:grid-cols-2 gap-8 items-start" data-testid={`use-case-${index}`}>
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <useCase.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 dark:text-foreground">
                        {useCase.title}
                      </h2>
                      <p className="text-primary text-sm font-medium">{useCase.subtitle}</p>
                    </div>
                  </div>
                  <p className="text-gray-600 dark:text-muted-foreground mb-6">
                    {useCase.description}
                  </p>
                </div>

                <div className="grid gap-4">
                  <Card className="p-5">
                    <h4 className="font-medium text-gray-900 dark:text-foreground mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-orange-500" />
                      Challenges
                    </h4>
                    <ul className="space-y-2">
                      {useCase.challenges.map((challenge, i) => (
                        <li key={i} className="text-gray-600 dark:text-muted-foreground text-sm flex items-start gap-2">
                          <span className="text-orange-500 mt-1">•</span>
                          {challenge}
                        </li>
                      ))}
                    </ul>
                  </Card>
                  <Card className="p-5">
                    <h4 className="font-medium text-gray-900 dark:text-foreground mb-3 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-primary" />
                      How PodDNA Helps
                    </h4>
                    <ul className="space-y-2">
                      {useCase.solutions.map((solution, i) => (
                        <li key={i} className="text-gray-600 dark:text-muted-foreground text-sm flex items-start gap-2">
                          <span className="text-primary mt-1">•</span>
                          {solution}
                        </li>
                      ))}
                    </ul>
                  </Card>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gray-50 dark:bg-muted/20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-foreground mb-4">
            See How PodDNA Works for Your Use Case
          </h2>
          <p className="text-gray-600 dark:text-muted-foreground mb-8">
            Schedule a personalized demo focused on your specific needs.
          </p>
          <Link href="/request-demo">
            <Button size="lg" className="gap-2" data-testid="button-use-cases-cta">
              Request a Demo
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
