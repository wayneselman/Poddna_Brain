import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Play,
  Film,
  Briefcase,
  Heart,
  Utensils,
  Laptop,
  Trophy,
  Newspaper,
  GraduationCap,
  Users,
  Atom,
  Search,
  Smile,
  LayoutGrid,
  MessageSquare,
  Mic,
} from "lucide-react";
import PodcastArtwork from "@/components/podcast-artwork";
import type { Category, Podcast } from "@shared/schema";

const categoryIcons: Record<string, any> = {
  Film,
  Briefcase,
  Heart,
  Utensils,
  Laptop,
  Trophy,
  Newspaper,
  GraduationCap,
  Users,
  Atom,
  Search,
  Smile,
};

interface CategoryResponse {
  category: Category;
  podcasts: Podcast[];
}

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();

  const { data, isLoading, error } = useQuery<CategoryResponse>({
    queryKey: ["/api/categories", slug],
    queryFn: async () => {
      const res = await fetch(`/api/categories/${slug}`);
      if (!res.ok) throw new Error("Category not found");
      return res.json();
    },
    enabled: !!slug,
  });

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-gray-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Category not found</h1>
          <p className="text-gray-500 mb-4">The category you're looking for doesn't exist.</p>
          <Link href="/explore">
            <Button>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Explore
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const category = data?.category;
  const podcasts = data?.podcasts || [];
  const IconComponent = categoryIcons[category?.iconName || "LayoutGrid"] || LayoutGrid;

  return (
    <div className="min-h-screen bg-gray-50">
      {isLoading ? (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <Skeleton className="h-8 w-32 mb-4" />
          <Skeleton className="h-48 w-full rounded-xl mb-8" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Yellow-themed header */}
          <div className="relative overflow-hidden bg-gradient-to-b from-yellow-50 to-gray-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
              <Link href="/explore">
                <Button variant="ghost" size="sm" className="mb-4 text-gray-600 hover:text-yellow-700 hover:bg-yellow-50" data-testid="button-back">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Explore
                </Button>
              </Link>
              
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg bg-gradient-to-br from-yellow-400 to-yellow-500">
                  <IconComponent className="w-10 h-10 text-white" />
                </div>
                <div>
                  <h1 
                    className="text-3xl md:text-4xl font-bold text-gray-900 mb-2"
                    data-testid="text-category-name"
                  >
                    {category?.name}
                  </h1>
                  {category?.description && (
                    <p className="text-gray-600 text-lg max-w-2xl" data-testid="text-category-description">
                      {category.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-3">
                    <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 text-sm" data-testid="badge-podcast-count">
                      <Mic className="w-3.5 h-3.5 mr-1" />
                      {podcasts.length} {podcasts.length === 1 ? "podcast" : "podcasts"}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Decorative yellow blur */}
            <div className="absolute top-0 right-0 w-64 h-64 opacity-20 rounded-full blur-3xl bg-yellow-300" />
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
            {podcasts.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {podcasts.map((podcast) => (
                  <PodcastCard key={podcast.id} podcast={podcast} />
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Mic className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No podcasts yet</h3>
                <p className="text-gray-500 mb-4">
                  There are no podcasts in this category yet.
                </p>
                <Link href="/explore">
                  <Button variant="outline">
                    Explore other categories
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PodcastCard({ podcast }: { podcast: Podcast }) {
  return (
    <Link href={`/podcast/${podcast.id}`}>
      <Card
        className="overflow-hidden hover:shadow-lg transition-all duration-200 cursor-pointer group h-full"
        data-testid={`podcast-card-${podcast.id}`}
      >
        <div className="aspect-square relative overflow-hidden">
          <PodcastArtwork
            src={podcast.artworkUrl}
            alt={podcast.title}
            size="lg"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button size="icon" className="h-10 w-10 rounded-full shadow-lg">
              <Play className="w-5 h-5 fill-current" />
            </Button>
          </div>
        </div>
        <CardContent className="p-3">
          <h3 className="font-semibold text-gray-900 text-sm truncate group-hover:text-primary transition-colors">
            {podcast.title}
          </h3>
          {podcast.host && (
            <p className="text-xs text-gray-500 truncate mt-0.5">{podcast.host}</p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
