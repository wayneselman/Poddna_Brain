import { useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/header";
import AdminLayout from "@/components/admin-layout";
import LandingPage from "@/pages/landing";
import ExplorePage from "@/pages/explore";
import PodcastPage from "@/pages/podcast";
import EpisodePage from "@/pages/episode";
import EpisodePageV2 from "@/pages/episode-v2";
import EpisodePublicPage from "@/pages/episode-public";
import TrendingPage from "@/pages/trending";
import DiscoveryEpisodesPage from "@/pages/discovery-episodes";
import PodTapPage from "@/pages/podtap";
import WidgetPage from "@/pages/widget";
import ProfilePage from "@/pages/profile";
import HowItWorksPage from "@/pages/how-it-works";
import BusinessPage from "@/pages/business";
import CategoryPage from "@/pages/category";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import ResetPasswordPage from "@/pages/reset-password";
import NotFound from "@/pages/not-found";
import ClipPage from "@/pages/clip";
import IntegrityReportPage from "@/pages/integrity-report";
import AppPage from "@/pages/app";
import MyClipsPage from "@/pages/my-clips";
import ClipsDetailPage from "@/pages/clips-detail";
import AnalyzerPage from "@/pages/analyzer";
import CatalogPage from "@/pages/catalog";
import SearchPage from "@/pages/search";
import PlatformPage from "@/pages/platform";
import UseCasesPage from "@/pages/use-cases";
import RequestDemoPage from "@/pages/request-demo";
import SampleAnalysisPage from "@/pages/sample-analysis";
import PricingPage from "@/pages/pricing";
import CreateLandingPage from "@/pages/create";
import { IntegrityScoreSharePage } from "@/pages/share-integrity-score";
import { ShareAnnotationPage } from "@/pages/share-annotation";
import CreatorLandingPage from "@/pages/creator-landing";
import CreatorAnalyzePage from "@/pages/creator-analyze";
import CreatorDashboardPage from "@/pages/creator-dashboard";
import { 
  AdminDashboard, 
  AdminUsersPage, 
  AdminPodcastsPage,
  AdminEpisodesPage, 
  AdminEpisodeDetailPage,
  AdminDiscoverPage,
  AdminFeedImportPage,
  AdminTranscriptsPage,
  AdminAnnotationsPage,
  AdminModerationPage,
  AdminReportsPage,
  AdminClipsPage,
  AdminClipStudioPage,
  AdminCategoriesPage,
  AdminEntitiesPage,
  AdminCanonicalEntitiesPage,
  AdminCanonicalEntityDetailPage,
  AdminTopicsPage,
  AdminTopicDetailPage,
  AdminSettingsPage,
  AdminNotificationsPage,
  AdminResolutionQueuePage,
  AdminProgramsPage,
  AdminProgramDetailPage,
  AdminAffiliateArbitragePage,
  AdminClipOrdersPage,
  AdminZoomTranscriptsPage
} from "@/pages/admin/index";

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

function useGA4PageTracking() {
  const [location] = useLocation();
  useEffect(() => {
    if (window.gtag) {
      window.gtag("event", "page_view", {
        page_path: location,
        page_title: document.title,
      });
    }
  }, [location]);
}

function Router() {
  useGA4PageTracking();
  const [location] = useLocation();
  const isWidget = location.startsWith("/widget");
  const isClip = location.startsWith("/clip/");
  const isReport = location.startsWith("/reports/");
  const isShare = location.startsWith("/share/");
  const isCreator = location.startsWith("/creator");
  const isAdmin = location.startsWith("/admin");
  const isApp = location.startsWith("/app") || location.startsWith("/my-clips") || location.startsWith("/clips/");
  const isAuthPage = location === "/login" || location === "/register" || location.startsWith("/reset-password");

  // Widget routes are always accessible without header
  if (isWidget) {
    return (
      <div className="min-h-screen bg-background">
        <Switch>
          <Route path="/widget" component={WidgetPage} />
          <Route component={NotFound} />
        </Switch>
      </div>
    );
  }

  // Clip pages have their own dark themed layout
  if (isClip) {
    return (
      <Switch>
        <Route path="/clip/:id" component={ClipPage} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  // Report pages have their own standalone layout (no header, print-friendly)
  if (isReport) {
    return (
      <Switch>
        <Route path="/reports/:id" component={IntegrityReportPage} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  // Share pages have their own dark-themed layout (for social sharing)
  if (isShare) {
    return (
      <Switch>
        <Route path="/share/integrity/:id" component={IntegrityScoreSharePage} />
        <Route path="/share/annotation/:id" component={ShareAnnotationPage} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  // Creator pages have their own dark-themed layout (no header, no sidebar)
  if (isCreator) {
    return (
      <Switch>
        <Route path="/creator" component={CreatorLandingPage} />
        <Route path="/creator/dashboard" component={CreatorDashboardPage} />
        <Route path="/creator/analyze/:id" component={CreatorAnalyzePage} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  // Auth pages have their own layout (no header)
  if (isAuthPage) {
    return (
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/register" component={RegisterPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  // User-facing app (clip generation)
  if (isApp) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <Switch>
          <Route path="/app" component={AppPage} />
          <Route path="/my-clips" component={MyClipsPage} />
          <Route path="/clips/:id" component={ClipsDetailPage} />
          <Route component={NotFound} />
        </Switch>
      </div>
    );
  }

  // Admin routes with sidebar layout
  if (isAdmin) {
    return (
      <AdminLayout>
        <Switch>
          <Route path="/admin" component={AdminDashboard} />
          <Route path="/admin/notifications" component={AdminNotificationsPage} />
          <Route path="/admin/discover" component={AdminDiscoverPage} />
          <Route path="/admin/feed-import" component={AdminFeedImportPage} />
          <Route path="/admin/podcasts" component={AdminPodcastsPage} />
          <Route path="/admin/episodes" component={AdminEpisodesPage} />
          <Route path="/admin/episodes/:id" component={AdminEpisodeDetailPage} />
          <Route path="/admin/transcripts" component={AdminTranscriptsPage} />
          <Route path="/admin/annotations" component={AdminAnnotationsPage} />
          <Route path="/admin/moderation" component={AdminModerationPage} />
          <Route path="/admin/reports" component={AdminReportsPage} />
          <Route path="/admin/clips" component={AdminClipsPage} />
          <Route path="/admin/clip-studio" component={AdminClipStudioPage} />
          <Route path="/admin/categories" component={AdminCategoriesPage} />
          <Route path="/admin/entities" component={AdminEntitiesPage} />
          <Route path="/admin/canonical-entities" component={AdminCanonicalEntitiesPage} />
          <Route path="/admin/canonical-entities/:id" component={AdminCanonicalEntityDetailPage} />
          <Route path="/admin/topics" component={AdminTopicsPage} />
          <Route path="/admin/topics/:id" component={AdminTopicDetailPage} />
          <Route path="/admin/users" component={AdminUsersPage} />
          <Route path="/admin/resolution-queue" component={AdminResolutionQueuePage} />
          <Route path="/admin/programs" component={AdminProgramsPage} />
          <Route path="/admin/programs/:id" component={AdminProgramDetailPage} />
          <Route path="/admin/affiliate-arbitrage" component={AdminAffiliateArbitragePage} />
          <Route path="/admin/clip-orders" component={AdminClipOrdersPage} />
          <Route path="/admin/zoom-transcripts" component={AdminZoomTranscriptsPage} />
          <Route path="/admin/settings" component={AdminSettingsPage} />
          <Route component={NotFound} />
        </Switch>
      </AdminLayout>
    );
  }

  // Landing page has its own header via the Header component
  // All content is publicly accessible - show to everyone
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/create" component={CreateLandingPage} />
        <Route path="/explore" component={ExplorePage} />
        <Route path="/search" component={SearchPage} />
        <Route path="/episodes" component={CatalogPage} />
        <Route path="/podcast/:id" component={PodcastPage} />
        <Route path="/episode/:id" component={EpisodePublicPage} />
        <Route path="/episodes/:id" component={EpisodePublicPage} />
        <Route path="/trending" component={TrendingPage} />
        <Route path="/discovery/episodes" component={DiscoveryEpisodesPage} />
        <Route path="/podtap" component={PodTapPage} />
        <Route path="/category/:slug" component={CategoryPage} />
        <Route path="/collections" component={ExplorePage} />
        <Route path="/creators" component={ExplorePage} />
        <Route path="/how-it-works" component={HowItWorksPage} />
        <Route path="/business" component={BusinessPage} />
        <Route path="/blog" component={ExplorePage} />
        <Route path="/analyzer" component={AnalyzerPage} />
        <Route path="/platform" component={PlatformPage} />
        <Route path="/use-cases" component={UseCasesPage} />
        <Route path="/request-demo" component={RequestDemoPage} />
        <Route path="/sample-analysis" component={SampleAnalysisPage} />
        <Route path="/pricing" component={PricingPage} />
        <Route path="/profile" component={ProfilePage} />
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
