import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, 
  Search, 
  Library, 
  FileText, 
  Users, 
  Settings,
  LogIn,
  ArrowLeft,
  Loader2,
  Shield,
  Star,
  Podcast,
  LayoutGrid,
  Package,
  Headphones,
  ShieldCheck,
  Flag,
  PanelLeftClose,
  PanelLeft,
  ChevronRight,
  Import,
  Bell,
  Tags,
  Radio,
  Clapperboard,
  TrendingUp,
  ShoppingCart,
  Video
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TranscriptionStatus } from "@/components/transcription-status";
import { useState, useEffect } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface AdminLayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly: boolean;
  showBadge?: boolean;
  hideKey?: string;
  clipStudioOnly?: boolean;
}

const allNavItems: NavItem[] = [
  { path: "/admin", label: "Dashboard", icon: LayoutDashboard, adminOnly: true },
  { path: "/admin/notifications", label: "Notifications", icon: Bell, adminOnly: true, showBadge: true },
  { path: "/admin/clip-studio", label: "Clip Studio", icon: Clapperboard, adminOnly: true, clipStudioOnly: true },
  { path: "/admin/discover", label: "Discover & Import", icon: Search, adminOnly: true },
  { path: "/admin/feed-import", label: "Feed Import", icon: Import, adminOnly: true },
  { path: "/admin/podcasts", label: "Podcast Library", icon: Podcast, adminOnly: true },
  { path: "/admin/episodes", label: "Episode Library", icon: Library, adminOnly: true },
  { path: "/admin/transcripts", label: "Transcript Lab", icon: FileText, adminOnly: true, hideKey: "TRANSCRIPTS_LAB" },
  { path: "/admin/annotations", label: "Featured Annotations", icon: Star, adminOnly: true, hideKey: "ANNOTATIONS" },
  { path: "/admin/moderation", label: "Moderation Queue", icon: ShieldCheck, adminOnly: false },
  { path: "/admin/resolution-queue", label: "Resolution Queue", icon: Shield, adminOnly: true },
  { path: "/admin/programs", label: "Ingestion Programs", icon: Radio, adminOnly: true, hideKey: "PROGRAMS" },
  { path: "/admin/reports", label: "User Reports", icon: Flag, adminOnly: false },
  { path: "/admin/clips", label: "Clip Library", icon: Headphones, adminOnly: true },
  { path: "/admin/clip-orders", label: "Clip Orders", icon: ShoppingCart, adminOnly: true },
  { path: "/admin/zoom-transcripts", label: "Zoom Transcripts", icon: Video, adminOnly: true },
  { path: "/admin/categories", label: "Categories", icon: LayoutGrid, adminOnly: true, hideKey: "CATEGORIES" },
  { path: "/admin/entities", label: "Entities & Affiliates", icon: Package, adminOnly: true, hideKey: "ENTITIES" },
  { path: "/admin/affiliate-arbitrage", label: "Affiliate Arbitrage", icon: TrendingUp, adminOnly: true },
  { path: "/admin/canonical-entities", label: "Knowledge Graph", icon: Star, adminOnly: true, hideKey: "ENTITIES" },
  { path: "/admin/topics", label: "Semantic Topics", icon: Tags, adminOnly: true, hideKey: "TOPICS" },
  { path: "/admin/users", label: "User Management", icon: Users, adminOnly: true },
  { path: "/admin/settings", label: "Settings", icon: Settings, adminOnly: true },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { flags, clipStudioMode } = useFeatureFlags();
  const [location] = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Filter nav items based on feature flags
  const navItems = allNavItems.filter(item => {
    // Show clip studio only when in clip studio mode
    if (item.clipStudioOnly && !clipStudioMode) return false;
    // Hide items based on feature flags
    if (item.hideKey && flags[`HIDE_${item.hideKey}`] === "true") return false;
    return true;
  });

  // Fetch unread notification count for badge display
  const { data: notificationSummary } = useQuery<{ unread_count: number }>({
    queryKey: ['/api/admin/notifications/summary'],
    refetchInterval: 30000, // Refresh every 30 seconds
    enabled: !!user && (user.role === 'admin'),
  });
  
  const unreadCount = notificationSummary?.unread_count || 0;

  // Get current page info for dynamic title and breadcrumbs
  const getCurrentPage = () => {
    const currentNav = navItems.find((item: NavItem) => 
      location === item.path || (item.path !== "/admin" && location.startsWith(item.path))
    );
    
    // Handle nested routes like /admin/episodes/:id
    if (location.match(/^\/admin\/episodes\/[^/]+$/)) {
      return { title: "Episode Details", parent: "Episode Library", parentPath: "/admin/episodes" };
    }
    if (location.match(/^\/admin\/podcasts\/[^/]+$/)) {
      return { title: "Podcast Details", parent: "Podcast Library", parentPath: "/admin/podcasts" };
    }
    if (location.match(/^\/admin\/canonical-entities\/[^/]+$/)) {
      return { title: "Entity Details", parent: "Knowledge Graph", parentPath: "/admin/canonical-entities" };
    }
    if (location.match(/^\/admin\/topics\/[^/]+$/)) {
      return { title: "Topic Details", parent: "Semantic Topics", parentPath: "/admin/topics" };
    }
    if (location.match(/^\/admin\/programs\/[^/]+$/)) {
      return { title: "Program Details", parent: "Ingestion Programs", parentPath: "/admin/programs" };
    }
    
    return currentNav ? { title: currentNav.label, parent: null, parentPath: null } : { title: "Admin Dashboard", parent: null, parentPath: null };
  };

  const currentPage = getCurrentPage();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Shield className="h-12 w-12 text-muted-foreground" />
            </div>
            <CardTitle>Admin Access Required</CardTitle>
            <CardDescription>
              You need to be logged in to access the admin dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild data-testid="button-admin-login">
              <a href="/login">
                <LogIn className="h-4 w-4 mr-2" />
                Sign In
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isAdmin = user?.role === "admin";
  const isModerator = user?.role === "moderator";
  const isModerationPage = location.startsWith("/admin/moderation");
  const isReportsPage = location.startsWith("/admin/reports");
  const isModeratorAllowedPage = isModerationPage || isReportsPage;

  if (!isAdmin && !isModerator) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Shield className="h-12 w-12 text-destructive" />
            </div>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to access the admin dashboard. 
              This area is restricted to administrators and moderators.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild variant="outline" data-testid="button-go-home">
              <a href="/">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go to Homepage
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isModerator && !isModeratorAllowedPage) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <ShieldCheck className="h-12 w-12 text-muted-foreground" />
            </div>
            <CardTitle>Moderator Access</CardTitle>
            <CardDescription>
              As a moderator, you have access to the moderation queue and user reports.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-2">
            <Button asChild data-testid="button-go-moderation">
              <a href="/admin/moderation">
                <ShieldCheck className="h-4 w-4 mr-2" />
                Moderation Queue
              </a>
            </Button>
            <Button asChild variant="outline" data-testid="button-go-reports">
              <a href="/admin/reports">
                <Flag className="h-4 w-4 mr-2" />
                User Reports
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className={`${sidebarCollapsed ? 'w-16' : 'w-64'} border-r bg-card flex flex-col transition-all duration-200 ease-in-out`}>
        <div className={`${sidebarCollapsed ? 'p-2' : 'p-4'} border-b flex items-center justify-between`}>
          {!sidebarCollapsed && (
            <Link href="/">
              <Button variant="ghost" size="sm" className="flex-1 justify-start">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to PODDNA
              </Button>
            </Link>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className={sidebarCollapsed ? 'mx-auto' : ''}
                data-testid="button-toggle-sidebar"
              >
                {sidebarCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            </TooltipContent>
          </Tooltip>
        </div>
        
        <nav className={`flex-1 ${sidebarCollapsed ? 'p-2' : 'p-4'} space-y-1`}>
          {navItems
            .filter(item => isAdmin || !item.adminOnly)
            .map((item) => {
              const isActive = location === item.path || 
                (item.path !== "/admin" && location.startsWith(item.path));
              const Icon = item.icon;
              
              const showNotificationBadge = (item as any).showBadge && unreadCount > 0;
              
              if (sidebarCollapsed) {
                return (
                  <Tooltip key={item.path}>
                    <TooltipTrigger asChild>
                      <Link href={item.path}>
                        <div className="relative">
                          <Button
                            variant={isActive ? "secondary" : "ghost"}
                            size="icon"
                            className={`w-full ${isActive ? "bg-primary/10 text-primary" : ""}`}
                            data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                          >
                            <Icon className="h-4 w-4" />
                          </Button>
                          {showNotificationBadge && (
                            <span 
                              className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-xs font-medium flex items-center justify-center px-1"
                              data-testid="badge-notification-count-collapsed"
                            >
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                          )}
                        </div>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {item.label}
                      {showNotificationBadge && ` (${unreadCount} unread)`}
                    </TooltipContent>
                  </Tooltip>
                );
              }
              
              return (
                <Link key={item.path} href={item.path}>
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    className={`w-full justify-start ${isActive ? "bg-primary/10 text-primary" : ""}`}
                    data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <div className="relative">
                      <Icon className="h-4 w-4 mr-3" />
                      {showNotificationBadge && (
                        <span 
                          className="absolute -top-1 -right-1 min-w-[16px] h-[16px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-medium flex items-center justify-center px-0.5"
                          data-testid="badge-notification-count"
                        >
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </div>
                    <span className="flex-1">{item.label}</span>
                    {showNotificationBadge && (
                      <Badge variant="destructive" className="ml-auto text-xs" data-testid="badge-notification-label">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </Badge>
                    )}
                  </Button>
                </Link>
              );
            })}
        </nav>

        <div className={`${sidebarCollapsed ? 'p-2' : 'p-4'} border-t`}>
          {sidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-10 h-10 mx-auto rounded-full bg-primary/10 flex items-center justify-center cursor-default">
                  <span className="text-sm font-medium text-primary">
                    {user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || "A"}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="font-medium">{user?.firstName || user?.email?.split("@")[0] || "Admin"}</p>
                <p className="text-xs text-muted-foreground">
                  {user?.role === "admin" ? "Administrator" : user?.role === "moderator" ? "Moderator" : "User"}
                </p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-medium text-primary">
                  {user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || "A"}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {user?.firstName || user?.email?.split("@")[0] || "Admin"}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {user?.role === "admin" ? "Administrator" : user?.role === "moderator" ? "Moderator" : "User"}
                </p>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Admin header with dynamic title and breadcrumbs */}
        <header className="h-14 border-b bg-card flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-2">
            {currentPage.parent && currentPage.parentPath && (
              <>
                <Link href={currentPage.parentPath}>
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground px-2">
                    {currentPage.parent}
                  </Button>
                </Link>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </>
            )}
            <h1 className="text-lg font-semibold text-foreground" data-testid="text-page-title">
              {currentPage.title}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <TranscriptionStatus />
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
