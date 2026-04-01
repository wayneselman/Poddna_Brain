import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ShoppingBag, 
  BookOpen, 
  UtensilsCrossed, 
  MapPin, 
  Briefcase, 
  Monitor,
  Package,
  ExternalLink,
  Sparkles,
  Play,
  Clock
} from "lucide-react";
import type { EntityMentionWithDetails } from "@shared/schema";

interface MentionedEntitiesProps {
  episodeId: string;
  onSeek?: (time: number) => void;
}

const entityTypeIcons: Record<string, any> = {
  product: ShoppingBag,
  book: BookOpen,
  restaurant: UtensilsCrossed,
  venue: MapPin,
  service: Briefcase,
  software: Monitor,
  other: Package,
};

const entityTypeColors: Record<string, string> = {
  product: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  book: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  restaurant: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  venue: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  service: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  software: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
};

const affiliateLabels: Record<string, string> = {
  amazon: "Shop on Amazon",
  opentable: "Reserve a Table",
  booking: "Book Now",
  yelp: "View on Yelp",
  custom: "Learn More",
};

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export default function MentionedEntities({ episodeId, onSeek }: MentionedEntitiesProps) {
  const { data: mentions = [], isLoading } = useQuery<EntityMentionWithDetails[]>({
    queryKey: ["/api/episodes", episodeId, "entities"],
  });

  if (isLoading) {
    return (
      <Card className="border-0 shadow-md" data-testid="mentioned-entities-loading">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Mentioned In This Episode
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (mentions.length === 0) {
    return null;
  }

  const handleAffiliateClick = (entityId: string) => {
    window.open(`/api/entities/${entityId}/click`, '_blank');
  };

  const groupedMentions = mentions.reduce((acc, mention) => {
    const type = mention.entity.type;
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(mention);
    return acc;
  }, {} as Record<string, EntityMentionWithDetails[]>);

  return (
    <Card className="border-0 shadow-md" data-testid="mentioned-entities">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          Mentioned In This Episode
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(groupedMentions).map(([type, typeMentions]) => {
          const Icon = entityTypeIcons[type] || Package;
          const colorClass = entityTypeColors[type] || entityTypeColors.other;
          
          return (
            <div key={type} className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Icon className="w-4 h-4" />
                <span className="capitalize">{type}s</span>
                <Badge variant="secondary" className="text-xs px-1.5">
                  {typeMentions.length}
                </Badge>
              </div>
              
              <div className="space-y-2 pl-6">
                {typeMentions.map((mention) => {
                  const entity = mention.entity;
                  const hasAffiliate = entity.affiliateUrl && entity.affiliateNetwork;
                  const hasTimestamp = mention.timestamp !== null && mention.timestamp !== undefined;
                  
                  return (
                    <div
                      key={mention.id}
                      className={`group rounded-lg border bg-card p-3 hover-elevate ${hasTimestamp && onSeek ? 'cursor-pointer' : ''}`}
                      onClick={() => hasTimestamp && onSeek && onSeek(mention.timestamp!)}
                      data-testid={`entity-mention-${mention.id}`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Play button beside artwork */}
                        {hasTimestamp && onSeek && (
                          <Button
                            size="icon"
                            variant="secondary"
                            className="shrink-0 bg-primary/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSeek(mention.timestamp!);
                            }}
                            data-testid={`button-play-entity-${mention.id}`}
                          >
                            <Play className="w-4 h-4" />
                          </Button>
                        )}
                        
                        {/* Entity artwork or type icon */}
                        {entity.imageUrl ? (
                          <img 
                            src={entity.imageUrl} 
                            alt={entity.name}
                            className="w-12 h-12 rounded-md object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className={`w-12 h-12 rounded-md flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                            <Icon className="w-6 h-6" />
                          </div>
                        )}
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h4 className="font-medium text-sm text-foreground truncate">
                                {entity.name}
                              </h4>
                              {entity.brand && (
                                <p className="text-xs text-muted-foreground truncate">
                                  by {entity.brand}
                                </p>
                              )}
                              {entity.author && (
                                <p className="text-xs text-muted-foreground truncate">
                                  by {entity.author}
                                </p>
                              )}
                              {entity.location && (
                                <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {entity.location}
                                </p>
                              )}
                            </div>
                            
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              {hasTimestamp && (
                                <Badge variant="outline" className="text-xs font-mono">
                                  <Clock className="w-3 h-3 mr-1" />
                                  {formatTime(mention.timestamp!)}
                                </Badge>
                              )}
                              {entity.priceText && (
                                <Badge variant="outline" className="text-xs">
                                  {entity.priceText}
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          {mention.mentionText && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">
                              "{mention.mentionText}"
                            </p>
                          )}
                          
                          {hasAffiliate && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2 h-7 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAffiliateClick(entity.id);
                              }}
                              data-testid={`affiliate-link-${entity.id}`}
                            >
                              <ExternalLink className="w-3 h-3 mr-1" />
                              {affiliateLabels[entity.affiliateNetwork || 'custom']}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        
        <p className="text-xs text-muted-foreground text-center pt-2 border-t">
          Affiliate links help support the creators
        </p>
      </CardContent>
    </Card>
  );
}
