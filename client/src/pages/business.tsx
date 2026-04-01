import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { 
  Upload, 
  Sparkles, 
  Share2, 
  MessageSquare, 
  Users, 
  BarChart3,
  Search,
  FileText,
  Scissors,
  Tag,
  TrendingUp,
  Database,
  Play,
  Check,
  ArrowRight
} from "lucide-react";

const highlightMoments = [
  { time: "00:02:13", text: "Why churn dropped 12% last quarter" },
  { time: "00:14:45", text: "Pricing strategy breakdown" },
  { time: "00:27:09", text: "Customer implementation story" },
  { time: "00:39:51", text: "Live Q&A: biggest objections handled" },
];

const trustLogos = ["B2B SaaS Co", "VC Fund", "Consulting Firm", "Enterprise HR"];

const problemPoints = [
  "Webinar replays rarely get watched after the live event",
  "Your best ideas disappear inside hour-long recordings",
  "Marketing teams don't have time to mine videos for clips",
  "Sales can't find the exact moment that answers a prospect's objection",
];

const solutionPoints = [
  { text: "Time-aligned transcripts", icon: FileText },
  { text: "Clips & highlight moments", icon: Scissors },
  { text: "Topic & speaker tagging", icon: Tag },
  { text: "Knowledge hub for your org", icon: Database },
  { text: "Ready for marketing & sales teams", icon: TrendingUp },
];

const howItWorks = [
  {
    step: 1,
    title: "Upload or Connect",
    description: "Connect your webinar platform, upload your recording, or drop in a YouTube/LinkedIn Live link.",
    icon: Upload,
  },
  {
    step: 2,
    title: "We Analyze & Structure",
    description: "We transcribe, detect key moments, tag speakers, identify products/brands, and surface the most important segments.",
    icon: Sparkles,
  },
  {
    step: 3,
    title: "Share & Activate",
    description: "Publish as a branded podcast-style page, share clips to LinkedIn, and give your team a searchable archive.",
    icon: Share2,
  },
];

const useCases = [
  {
    title: "Marketing",
    description: "Turn every webinar into 10+ LinkedIn posts, a podcast episode, and a searchable resource for prospects.",
    icon: MessageSquare,
  },
  {
    title: "Sales Enablement",
    description: "Give reps instant access to objection handling clips, customer quotes, and product deep dives right from recordings.",
    icon: BarChart3,
  },
  {
    title: "Leadership & Culture",
    description: "Index founder panels, portfolio AMAs, and fireside chats so your best ideas are always one search away.",
    icon: Users,
  },
  {
    title: "People & HR",
    description: "Make town halls, culture talks, and leadership Q&As easy to revisit and share with new hires.",
    icon: Users,
  },
];

const features = [
  {
    title: "Searchable transcripts",
    description: "Every event is fully transcribed and time-aligned.",
    icon: Search,
  },
  {
    title: "Episode-style pages",
    description: "Present each recording like a podcast, with chapters and key moments.",
    icon: FileText,
  },
  {
    title: "Clip-ready highlights",
    description: "Auto-suggested moments ideal for LinkedIn, email snippets, and reels.",
    icon: Scissors,
  },
  {
    title: "Speaker & topic tags",
    description: "Filter content by person, topic, product, or customer segment.",
    icon: Tag,
  },
  {
    title: "Engagement insights",
    description: "See what themes and segments show up most across your catalog.",
    icon: TrendingUp,
  },
  {
    title: "Knowledge base search",
    description: 'Ask: "Show me every time we discussed AI pricing" across all recordings.',
    icon: Database,
  },
];

const pilotBenefits = [
  "Done-for-you setup",
  "Fast turnaround",
  "Clear ROI on your existing content",
];

const faqs = [
  {
    question: "Do you host the audio or video?",
    answer: "We can host or work with embeds from platforms like YouTube or Vimeo. You keep control of your content.",
  },
  {
    question: "Is this only for public content?",
    answer: "No. Many customers use PodDNA internally for sales training, all-hands meetings, and leadership talks.",
  },
  {
    question: "Do we need a podcast feed already?",
    answer: "Not at all. We can help you launch one, or you can keep everything private and internal.",
  },
  {
    question: "How does pricing work?",
    answer: "We price based on volume of content and the level of services (DIY vs done-for-you). The pilot is fixed-price and low-risk.",
  },
  {
    question: "Is this compliant with our privacy/security requirements?",
    answer: "We can work with your security team to align with your data handling policies. Sensitive internal content can stay private to your SSO-protected environment.",
  },
];

const waveformHeights = [8, 16, 24, 12, 28, 20, 32, 16, 24, 20, 28, 12, 24, 32, 16];

export default function BusinessPage() {
  const scrollToSample = () => {
    document.getElementById("sample-episode")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-white" data-testid="page-business">
      {/* Hero Section - 120px top, 80px bottom per spec */}
      <section className="pt-24 pb-16 lg:pt-[120px] lg:pb-20 px-4 sm:px-6 lg:px-8" data-testid="section-hero">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left Column - Content (6 cols) */}
            <div className="space-y-6">
              <h1 className="text-4xl lg:text-[48px] font-bold text-gray-900 leading-[1.1] max-w-xl" data-testid="hero-heading">
                Turn your company's conversations into reusable business assets.
              </h1>
              <p className="text-xl text-gray-600 max-w-[480px] leading-relaxed" data-testid="hero-subheading">
                PodDNA transforms webinars, panels, fireside chats, and internal talks into searchable, shareable knowledge.
              </p>
              <div className="flex flex-wrap gap-6 pt-2">
                <a href="https://calendly.com/your-link-here" target="_blank" rel="noopener noreferrer">
                  <Button 
                    className="bg-[#F5C518] hover:bg-[#E5B608] text-gray-900 font-semibold px-7 py-3.5 h-auto text-base"
                    data-testid="button-book-pilot"
                  >
                    Book a pilot
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </a>
                <Button 
                  variant="outline" 
                  className="px-7 py-3.5 h-auto text-base font-medium border-gray-300"
                  onClick={scrollToSample}
                  data-testid="button-see-sample"
                >
                  See a sample episode
                </Button>
              </div>
            </div>

            {/* Right Column - Episode Mock Card (6 cols) */}
            <div className="lg:pl-8">
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.08)] max-w-[388px] mx-auto lg:mx-0" data-testid="card-episode-mock">
                <div className="text-sm font-medium text-gray-500 mb-2">Sample Episode</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-4">AI in B2B Sales: Lessons Learned</h3>
                
                {/* Waveform - Optimized with fewer DOM nodes */}
                <div className="h-12 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 rounded-lg mb-6 flex items-center px-4 gap-1">
                  {waveformHeights.map((h, i) => (
                    <div 
                      key={i} 
                      className="flex-1 bg-gray-400 rounded-full"
                      style={{ height: `${h}px`, opacity: i < 6 ? 1 : 0.4 }}
                    />
                  ))}
                </div>

                {/* Highlight moments */}
                <div className="space-y-3">
                  <div className="text-sm font-medium text-gray-700">Annotated Moments</div>
                  {highlightMoments.map((moment, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-start gap-3 p-3 bg-yellow-50 border-l-4 border-[#F5C518] rounded-r-lg"
                      data-testid={`highlight-moment-${idx}`}
                    >
                      <span className="text-sm font-mono text-gray-600 whitespace-nowrap">{moment.time}</span>
                      <span className="text-sm text-gray-800">{moment.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Strip - Height 120px */}
      <section className="py-8 bg-[#F7F8FA] border-y border-gray-200" data-testid="section-social-proof">
        <div className="max-w-[960px] mx-auto px-4 sm:px-6 text-center">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-[0.04em] mb-6">
            Trusted by teams investing in communication
          </p>
          <div className="flex flex-wrap justify-center gap-8">
            {trustLogos.map((logo) => (
              <div 
                key={logo} 
                className="px-6 py-3 bg-white border border-gray-200 rounded-xl text-gray-400 font-medium text-sm"
                data-testid={`trust-logo-${logo.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {logo}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Problem Section - 96px padding */}
      <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8" data-testid="section-problem">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20">
            <div>
              <h2 className="text-[32px] font-semibold text-gray-900 leading-tight max-w-md">
                Your smartest conversations shouldn't disappear.
              </h2>
            </div>
            <div>
              <ul className="space-y-4">
                {problemPoints.map((point, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-lg text-gray-600 leading-[1.6]">
                    <span className="w-2 h-2 bg-gray-400 rounded-full mt-2.5 flex-shrink-0" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Solution Section - 96px padding */}
      <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8 bg-gray-50" data-testid="section-solution">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-[32px] font-semibold text-gray-900 mb-12 max-w-2xl mx-auto">
            PodDNA turns conversations into searchable, shareable knowledge.
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {solutionPoints.map((point, idx) => (
              <div 
                key={idx} 
                className="flex items-center gap-3 bg-white p-4 rounded-xl border border-gray-200"
                data-testid={`solution-point-${idx}`}
              >
                <div className="w-10 h-10 bg-[#F5C518]/15 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Check className="w-5 h-5 text-[#D4A916]" />
                </div>
                <span className="text-base font-medium text-gray-800 text-left">{point.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section - 96px padding */}
      <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8" data-testid="section-how-it-works">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-[32px] font-semibold text-gray-900 text-center mb-16">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {howItWorks.map((step) => (
              <div 
                key={step.step} 
                className="bg-white border border-gray-200 rounded-xl p-8 hover:shadow-lg transition-shadow hover-elevate"
                style={{ minHeight: '240px' }}
                data-testid={`step-card-${step.step}`}
              >
                <div className="w-12 h-12 bg-[#F5C518]/15 rounded-xl flex items-center justify-center mb-6">
                  <step.icon className="w-6 h-6 text-[#D4A916]" />
                </div>
                <div className="text-sm font-semibold text-[#D4A916] mb-2">Step {step.step}</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{step.title}</h3>
                <p className="text-gray-600 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases Section - 96px padding */}
      <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8 bg-[#F7F8FA]" data-testid="section-use-cases">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-[32px] font-semibold text-gray-900 text-center mb-4">
            Built for modern B2B teams
          </h2>
          <p className="text-lg text-gray-600 text-center mb-16 max-w-2xl mx-auto">
            From marketing to HR, PodDNA helps teams unlock value from every conversation.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {useCases.map((useCase, idx) => (
              <div 
                key={idx} 
                className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow hover-elevate"
                style={{ minWidth: '300px' }}
                data-testid={`use-case-card-${idx}`}
              >
                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mb-4">
                  <useCase.icon className="w-6 h-6 text-gray-700" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{useCase.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{useCase.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid Section - 96px padding */}
      <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8" data-testid="section-features">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-[32px] font-semibold text-gray-900 text-center mb-4">
            What PodDNA for Business includes
          </h2>
          <p className="text-lg text-gray-600 text-center mb-16 max-w-2xl mx-auto">
            Everything you need to transform recordings into actionable content.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, idx) => (
              <div 
                key={idx} 
                className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow"
                style={{ minHeight: '160px' }}
                data-testid={`feature-card-${idx}`}
              >
                <div className="w-10 h-10 bg-[#F5C518]/15 rounded-lg flex items-center justify-center mb-4">
                  <feature.icon className="w-5 h-5 text-[#D4A916]" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sample Episode Section - 120px padding */}
      <section id="sample-episode" className="py-20 lg:py-[120px] px-4 sm:px-6 lg:px-8 bg-gray-50" data-testid="section-sample-episode">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-[32px] font-semibold text-gray-900 text-center mb-16">
            See PodDNA in action
          </h2>
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left - Timeline */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-700 mb-6">Episode Timeline</h3>
              {highlightMoments.map((moment, idx) => (
                <div 
                  key={idx} 
                  className="flex items-start gap-4 p-4 bg-white border border-gray-200 rounded-xl hover:border-[#F5C518] transition-colors cursor-pointer"
                  data-testid={`timeline-item-${idx}`}
                >
                  <div className="w-10 h-10 bg-[#F5C518]/15 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Play className="w-4 h-4 text-[#D4A916]" />
                  </div>
                  <div>
                    <span className="text-sm font-mono text-[#D4A916] font-medium">{moment.time}</span>
                    <p className="text-gray-800 font-medium mt-1">{moment.text}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Right - Highlights Card */}
            <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-lg">
              <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl mb-6 flex items-center justify-center">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-lg cursor-pointer hover:scale-105 transition-transform">
                  <Play className="w-6 h-6 text-gray-700 ml-1" />
                </div>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Your AI GTM Webinar → PodDNA Episode
              </h3>
              <p className="text-gray-600 mb-6">
                Ready for LinkedIn, your podcast feed, and your internal wiki.
              </p>
              <Button 
                className="w-full bg-[#F5C518] hover:bg-[#E5B608] text-gray-900 font-semibold"
                data-testid="button-play-demo"
              >
                <Play className="w-4 h-4 mr-2" />
                Play demo
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Pilot CTA Banner - 260px height equivalent */}
      <section className="py-16 lg:py-20 px-4 sm:px-6 lg:px-8 bg-gray-900" data-testid="section-pilot-cta">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-[32px] font-bold text-white mb-6">
            Start with a pilot—prove value fast.
          </h2>
          <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
            Most teams start by converting 1–3 existing webinars into PodDNA-powered episodes, clips, and a searchable hub.
          </p>
          <ul className="flex flex-wrap justify-center gap-6 mb-10">
            {pilotBenefits.map((benefit, idx) => (
              <li key={idx} className="flex items-center gap-2 text-gray-200">
                <Check className="w-5 h-5 text-[#F5C518]" />
                {benefit}
              </li>
            ))}
          </ul>
          <a href="https://calendly.com/your-link-here" target="_blank" rel="noopener noreferrer">
            <Button 
              className="bg-white hover:bg-gray-100 text-gray-900 font-semibold px-8 py-4 h-auto text-lg"
              data-testid="button-talk-to-sales"
            >
              Talk to sales
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </a>
        </div>
      </section>

      {/* FAQ Section - 96px padding */}
      <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8" data-testid="section-faq">
        <div className="max-w-[760px] mx-auto">
          <h2 className="text-[32px] font-semibold text-gray-900 text-center mb-12">
            Frequently asked questions
          </h2>
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, idx) => (
              <AccordionItem 
                key={idx} 
                value={`faq-${idx}`}
                className="bg-white border border-gray-200 rounded-xl px-6 data-[state=open]:shadow-md transition-shadow"
                data-testid={`faq-item-${idx}`}
              >
                <AccordionTrigger className="text-left font-semibold text-gray-900 py-5 hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-gray-600 pb-5 leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Footer - 260px height equivalent */}
      <footer className="py-12 lg:py-16 px-4 sm:px-6 lg:px-8 bg-gray-50 border-t border-gray-200" data-testid="section-footer">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="text-center md:text-left">
              <div className="font-bold text-gray-900 text-lg mb-1">© PodDNA</div>
              <p className="text-sm text-gray-500">
                Annotation and discovery for the world's most valuable conversations.
              </p>
            </div>
            <nav className="flex flex-wrap justify-center gap-6">
              <Link href="/business">
                <span className="text-sm text-gray-600 hover:text-gray-900 cursor-pointer">For Business</span>
              </Link>
              <a href="#" className="text-sm text-gray-600 hover:text-gray-900">Help</a>
              <a href="#" className="text-sm text-gray-600 hover:text-gray-900">Privacy</a>
              <a href="#" className="text-sm text-gray-600 hover:text-gray-900">Contact</a>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
