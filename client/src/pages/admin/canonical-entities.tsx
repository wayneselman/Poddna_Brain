import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Loader2, 
  Search,
  User,
  Package,
  BookOpen,
  Building2,
  MapPin,
  Lightbulb,
  HelpCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Link2,
  RefreshCw
} from "lucide-react";

interface CanonicalEntitySummary {
  id: string;
  name: string;
  type: string;
  mentionCount: number;
  episodeCount: number;
}

interface CanonicalEntitiesResponse {
  items: CanonicalEntitySummary[];
  total: number;
}

const entityTypeIcons: Record<string, typeof User> = {
  person: User,
  product: Package,
  book: BookOpen,
  company: Building2,
  place: MapPin,
  concept: Lightbulb,
  other: HelpCircle,
};

const entityTypeColors: Record<string, string> = {
  person: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  product: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  book: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  company: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  place: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
  concept: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
};

const PAGE_SIZE = 20;

export default function AdminCanonicalEntitiesPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(0);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(0);
    const timeout = setTimeout(() => setDebouncedSearch(value), 300);
    return () => clearTimeout(timeout);
  };

  const { data, isLoading, refetch } = useQuery<CanonicalEntitiesResponse>({
    queryKey: ["/api/admin/canonical-entities", debouncedSearch, typeFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (typeFilter && typeFilter !== "all") params.set("type", typeFilter);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));
      const res = await fetch(`/api/admin/canonical-entities?${params}`);
      if (!res.ok) throw new Error("Failed to fetch entities");
      return res.json();
    },
  });

  const backfillMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/entities/link/backfill");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Backfill Started",
        description: `Queued entity linking for ${data.episodesQueued} episode(s)`,
      });
    },
    onError: () => {
      toast({
        title: "Backfill Failed",
        description: "Failed to start entity link backfill",
        variant: "destructive",
      });
    },
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const entities = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Canonical Entities</h1>
          <p className="text-muted-foreground">
            Knowledge graph entities extracted from podcast transcripts
          </p>
        </div>
        <Button 
          onClick={() => backfillMutation.mutate()}
          disabled={backfillMutation.isPending}
          variant="outline"
          data-testid="button-backfill"
        >
          {backfillMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Link2 className="h-4 w-4 mr-2" />
          )}
          Backfill Entity Links
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search entities..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[150px]" data-testid="select-type-filter">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="person">Person</SelectItem>
                <SelectItem value="product">Product</SelectItem>
                <SelectItem value="book">Book</SelectItem>
                <SelectItem value="company">Company</SelectItem>
                <SelectItem value="place">Place</SelectItem>
                <SelectItem value="concept">Concept</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" onClick={() => refetch()} data-testid="button-refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : entities.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <HelpCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No entities found</p>
              <p className="text-sm">
                {debouncedSearch || typeFilter !== "all" 
                  ? "Try adjusting your search or filters"
                  : "Run entity linking jobs to populate the knowledge graph"}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Mentions</TableHead>
                    <TableHead className="text-right">Episodes</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entities.map((entity) => {
                    const Icon = entityTypeIcons[entity.type] || HelpCircle;
                    return (
                      <TableRow key={entity.id} data-testid={`row-entity-${entity.id}`}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            {entity.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={entityTypeColors[entity.type]}>
                            {entity.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{entity.mentionCount}</TableCell>
                        <TableCell className="text-right">{entity.episodeCount}</TableCell>
                        <TableCell className="text-right">
                          <Link href={`/admin/canonical-entities/${entity.id}`}>
                            <Button variant="ghost" size="sm" data-testid={`button-view-${entity.id}`}>
                              <ExternalLink className="h-4 w-4 mr-1" />
                              View
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, data?.total ?? 0)} of {data?.total ?? 0}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => p + 1)}
                      disabled={page >= totalPages - 1}
                      data-testid="button-next-page"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {data && data.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Total canonical entities: <strong>{data.total}</strong>
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
