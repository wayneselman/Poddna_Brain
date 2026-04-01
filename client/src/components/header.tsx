import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { ThemeToggle } from "@/components/theme-toggle";
import { Search, LogOut, User, Play, Menu, X } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Podcast, Episode } from "@shared/schema";

interface SearchResults {
  podcasts: Podcast[];
  episodes: (Episode & { podcastTitle: string; artworkUrl?: string })[];
}

const creatorNavLinks = [
  { href: "/my-clips", label: "Generate Clips" },
  { href: "/pricing", label: "Pricing" },
];

const enterpriseNavLinks = [
  { href: "/explore", label: "Explore" },
  { href: "/create", label: "For Creators" },
  { href: "/request-demo", label: "Request Demo" },
];

export default function Header() {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const isCreatorPath = location.startsWith('/create') || 
                        location.startsWith('/my-clips') || 
                        location.startsWith('/clips') ||
                        location.startsWith('/pricing') ||
                        location.startsWith('/app');
  
  const navLinks = isCreatorPath ? creatorNavLinks : enterpriseNavLinks;

  const { data: searchResults } = useQuery<SearchResults>({
    queryKey: [`/api/search?q=${encodeURIComponent(searchQuery)}`],
    enabled: searchQuery.length > 0,
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isActive = (path: string) => {
    if (path === "/explore") {
      return location === "/explore" || location === "/" || location.startsWith("/explore/");
    }
    return location === path || location.startsWith(path + "/");
  };

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  const getUserInitials = () => {
    if (!user) return "U";
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  };

  const getUserDisplayName = () => {
    if (!user) return "User";
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user.firstName) return user.firstName;
    if (user.email) return user.email;
    return "User";
  };

  return (
    <>
      <header
        className="sticky top-0 z-50 bg-background border-b border-border"
        data-testid="header-main"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Left: Logo */}
            <Link href="/">
              <span className="flex items-center gap-2 cursor-pointer" data-testid="link-logo">
                <span className="w-8 h-8 bg-foreground rounded-md flex items-center justify-center">
                  <span className="text-background font-bold text-sm">P</span>
                </span>
                <span className="text-xl font-bold text-foreground hidden sm:block">
                  PODDNA
                </span>
              </span>
            </Link>

            {/* Center: Navigation Links (desktop) */}
            <nav className="hidden lg:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href}>
                  <span
                    className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                      isActive(link.href)
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid={`nav-link-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {link.label}
                  </span>
                </Link>
              ))}
            </nav>

            {/* Right: Search, Theme Toggle, Sign in, Start exploring */}
            <div className="flex items-center gap-2">
              {/* Search (desktop) */}
              <div className="hidden md:flex items-center relative" ref={searchRef}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search"
                    className="pl-9 pr-4 w-40 lg:w-48 h-9 bg-muted border-border text-sm focus:bg-background"
                    data-testid="input-search"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowResults(true);
                    }}
                    onFocus={() => setShowResults(true)}
                  />
                  
                  {showResults && searchQuery && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-lg shadow-lg max-h-96 overflow-y-auto z-50 min-w-[300px]">
                      {searchResults && ((searchResults.podcasts?.length ?? 0) > 0 || (searchResults.episodes?.length ?? 0) > 0) ? (
                        <div className="p-2">
                          {(searchResults.podcasts?.length ?? 0) > 0 && (
                            <div className="mb-3">
                              <div className="text-xs font-semibold text-muted-foreground px-3 py-1 uppercase tracking-wide">
                                Podcasts
                              </div>
                              {searchResults.podcasts?.map((podcast) => (
                                <div
                                  key={podcast.id}
                                  className="p-3 hover:bg-muted cursor-pointer rounded-md"
                                  onClick={() => {
                                    navigate(`/podcast/${podcast.id}`);
                                    setShowResults(false);
                                    setSearchQuery("");
                                  }}
                                  data-testid={`search-result-podcast-${podcast.id}`}
                                >
                                  <div className="font-medium text-foreground line-clamp-1">
                                    {podcast.title}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {podcast.host}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {(searchResults.episodes?.length ?? 0) > 0 && (
                            <div>
                              <div className="text-xs font-semibold text-muted-foreground px-3 py-1 uppercase tracking-wide">
                                Episodes
                              </div>
                              {searchResults.episodes?.map((episode) => (
                                <div
                                  key={episode.id}
                                  className="p-3 hover:bg-muted cursor-pointer rounded-md flex gap-3"
                                  onClick={() => {
                                    navigate(`/episode/${episode.id}`);
                                    setShowResults(false);
                                    setSearchQuery("");
                                  }}
                                  data-testid={`search-result-episode-${episode.id}`}
                                >
                                  <div className="flex-shrink-0">
                                    <div className="w-10 h-10 bg-muted rounded-md flex items-center justify-center">
                                      <Play className="w-4 h-4 text-muted-foreground" />
                                    </div>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-foreground line-clamp-1">
                                      {episode.title}
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      {episode.podcastTitle}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-6 text-center text-muted-foreground">
                          No results found for "{searchQuery}"
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Theme Toggle */}
              <ThemeToggle />

              {/* Auth section */}
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2"
                      data-testid="button-user-menu"
                    >
                      <Avatar className="w-7 h-7">
                        <AvatarImage src={user.profileImageUrl || undefined} alt={getUserDisplayName()} />
                        <AvatarFallback className="bg-primary text-white text-xs">
                          {getUserInitials()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="hidden sm:inline text-sm text-muted-foreground">{user.firstName || 'Account'}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{getUserDisplayName()}</p>
                        {user.email && (
                          <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                        )}
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild data-testid="menu-item-profile">
                      <Link href="/profile" className="cursor-pointer">
                        <User className="mr-2 h-4 w-4" />
                        <span>Profile</span>
                      </Link>
                    </DropdownMenuItem>
                    {user.role === 'admin' && (
                      <DropdownMenuItem asChild data-testid="menu-item-admin">
                        <Link href="/admin" className="cursor-pointer">
                          <User className="mr-2 h-4 w-4" />
                          <span>Admin</span>
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} data-testid="menu-item-logout">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Log out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <>
                  <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="button-sign-in">
                    Sign in
                  </Link>
                  <Link href="/request-demo">
                    <Button
                      className="bg-primary hover:bg-primary/90 text-white"
                      size="sm"
                      data-testid="button-request-demo"
                    >
                      Request Demo
                    </Button>
                  </Link>
                </>
              )}

              {/* Mobile menu button */}
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                data-testid="button-mobile-menu"
              >
                {mobileMenuOpen ? (
                  <X className="w-5 h-5" />
                ) : (
                  <Menu className="w-5 h-5" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-border bg-background">
            <div className="px-4 py-3">
              {/* Mobile search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search podcasts, guests, quotes..."
                  className="pl-9 w-full bg-muted border-border"
                  data-testid="input-search-mobile"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
              {/* Mobile nav links */}
              <nav className="space-y-1">
                {navLinks.map((link) => (
                  <Link key={link.href} href={link.href} onClick={() => setMobileMenuOpen(false)}>
                    <span
                      className={`block w-full text-left px-3 py-2 rounded-md text-sm font-medium ${
                        isActive(link.href)
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                      data-testid={`nav-link-mobile-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {link.label}
                    </span>
                  </Link>
                ))}
              </nav>

              {/* Mobile auth section */}
              <div className="mt-4 pt-4 border-t border-border">
                {user ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 px-3 py-2">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={user.profileImageUrl || undefined} alt={getUserDisplayName()} />
                        <AvatarFallback className="bg-primary text-white text-xs">
                          {getUserInitials()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium text-foreground">{getUserDisplayName()}</p>
                        {user.email && <p className="text-xs text-muted-foreground">{user.email}</p>}
                      </div>
                    </div>
                    <Link href="/profile" onClick={() => setMobileMenuOpen(false)}>
                      <span
                        className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                        data-testid="nav-link-mobile-profile"
                      >
                        <User className="w-4 h-4 mr-2" />
                        Profile
                      </span>
                    </Link>
                    {user.role === 'admin' && (
                      <Link href="/admin" onClick={() => setMobileMenuOpen(false)}>
                        <span
                          className="block w-full text-left px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                          data-testid="nav-link-mobile-admin"
                        >
                          Admin Dashboard
                        </span>
                      </Link>
                    )}
                    <button
                      className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        handleLogout();
                      }}
                      data-testid="nav-link-mobile-logout"
                    >
                      <LogOut className="w-4 h-4 inline-block mr-2" />
                      Log out
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Link href="/request-demo" onClick={() => setMobileMenuOpen(false)}>
                      <Button
                        className="w-full"
                        data-testid="button-request-demo-mobile"
                      >
                        Request Demo
                      </Button>
                    </Link>
                    <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                      <Button
                        variant="outline"
                        className="w-full"
                        data-testid="button-sign-in-mobile"
                      >
                        Sign in
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </header>
    </>
  );
}
