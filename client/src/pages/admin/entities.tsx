import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  Loader2, 
  Plus, 
  Edit, 
  Trash2, 
  Search,
  Package,
  ShoppingBag,
  BookOpen,
  UtensilsCrossed,
  MapPin,
  Briefcase,
  Monitor,
  ExternalLink,
  CheckCircle,
  XCircle,
  BarChart3,
  ChevronDown,
  PlayCircle
} from "lucide-react";
import type { EntityWithMentionCount, InsertEntity } from "@shared/schema";

const entityTypes = [
  { value: "product", label: "Product", icon: ShoppingBag },
  { value: "book", label: "Book", icon: BookOpen },
  { value: "restaurant", label: "Restaurant", icon: UtensilsCrossed },
  { value: "venue", label: "Venue", icon: MapPin },
  { value: "service", label: "Service", icon: Briefcase },
  { value: "software", label: "Software", icon: Monitor },
  { value: "other", label: "Other", icon: Package },
];

const affiliateNetworks = [
  { value: "amazon", label: "Amazon Associates" },
  { value: "opentable", label: "OpenTable" },
  { value: "booking", label: "Booking.com" },
  { value: "yelp", label: "Yelp" },
  { value: "custom", label: "Custom" },
];

interface EntityEpisode {
  episodeId: string;
  episodeTitle: string;
  podcastTitle: string;
  mentionCount: number;
  mentionId: string;
  isApproved: boolean;
}

export default function AdminEntitiesPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<EntityWithMentionCount | null>(null);
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<InsertEntity>>({
    name: "",
    type: "product",
    description: "",
    imageUrl: "",
    affiliateNetwork: null,
    affiliateUrl: "",
    canonicalUrl: "",
    brand: "",
    author: "",
    location: "",
    priceText: "",
    rating: "",
    isActive: true,
  });

  const { data: entities = [], isLoading } = useQuery<EntityWithMentionCount[]>({
    queryKey: ["/api/admin/entities"],
  });

  const { data: entityEpisodes = [] } = useQuery<EntityEpisode[]>({
    queryKey: ["/api/admin/entities", expandedEntity, "episodes"],
    queryFn: async () => {
      if (!expandedEntity) return [];
      const res = await fetch(`/api/admin/entities/${expandedEntity}/episodes`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!expandedEntity,
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertEntity) => {
      const res = await apiRequest("POST", "/api/admin/entities", data);
      if (!res.ok) throw new Error("Failed to create entity");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/entities"] });
      toast({ title: "Entity created successfully" });
      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to create entity", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertEntity> }) => {
      const res = await apiRequest("PATCH", `/api/admin/entities/${id}`, data);
      if (!res.ok) throw new Error("Failed to update entity");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/entities"] });
      toast({ title: "Entity updated successfully" });
      setEditingEntity(null);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to update entity", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/entities/${id}`);
      if (!res.ok) throw new Error("Failed to delete entity");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/entities"] });
      toast({ title: "Entity deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to delete entity", variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (mentionId: string) => {
      const res = await apiRequest("POST", `/api/admin/entity-mentions/${mentionId}/approve`);
      if (!res.ok) throw new Error("Failed to approve mention");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/entities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/entities", expandedEntity, "episodes"] });
      toast({ title: "Entity mention approved - now visible on episode page" });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to approve mention", variant: "destructive" });
    },
  });

  const unapproveMutation = useMutation({
    mutationFn: async (mentionId: string) => {
      const res = await apiRequest("POST", `/api/admin/entity-mentions/${mentionId}/unapprove`);
      if (!res.ok) throw new Error("Failed to unapprove mention");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/entities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/entities", expandedEntity, "episodes"] });
      toast({ title: "Entity mention hidden from episode page" });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to unapprove mention", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      type: "product",
      description: "",
      imageUrl: "",
      affiliateNetwork: null,
      affiliateUrl: "",
      canonicalUrl: "",
      brand: "",
      author: "",
      location: "",
      priceText: "",
      rating: "",
      isActive: true,
    });
  };

  const handleEdit = (entity: EntityWithMentionCount) => {
    setEditingEntity(entity);
    setFormData({
      name: entity.name,
      type: entity.type,
      description: entity.description || "",
      imageUrl: entity.imageUrl || "",
      affiliateNetwork: entity.affiliateNetwork,
      affiliateUrl: entity.affiliateUrl || "",
      canonicalUrl: entity.canonicalUrl || "",
      brand: entity.brand || "",
      author: entity.author || "",
      location: entity.location || "",
      priceText: entity.priceText || "",
      rating: entity.rating || "",
      isActive: entity.isActive,
    });
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.type) {
      toast({ title: "Name and type are required", variant: "destructive" });
      return;
    }

    if (editingEntity) {
      updateMutation.mutate({ id: editingEntity.id, data: formData });
    } else {
      createMutation.mutate(formData as InsertEntity);
    }
  };

  const filteredEntities = entities.filter((entity) => {
    const matchesSearch = !searchQuery || 
      entity.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entity.brand?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entity.author?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = !typeFilter || entity.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const getTypeIcon = (type: string) => {
    const typeObj = entityTypes.find(t => t.value === type);
    return typeObj?.icon || Package;
  };

  const EntityForm = ({ isEditing = false }: { isEditing?: boolean }) => (
    <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Entity name"
            data-testid="input-entity-name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="type">Type *</Label>
          <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
            <SelectTrigger data-testid="select-entity-type">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {entityTypes.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  <div className="flex items-center gap-2">
                    <type.icon className="w-4 h-4" />
                    {type.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description || ""}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Brief description"
          data-testid="input-entity-description"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="brand">Brand</Label>
          <Input
            id="brand"
            value={formData.brand || ""}
            onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
            placeholder="e.g., Apple"
            data-testid="input-entity-brand"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="author">Author (for books)</Label>
          <Input
            id="author"
            value={formData.author || ""}
            onChange={(e) => setFormData({ ...formData, author: e.target.value })}
            placeholder="e.g., Malcolm Gladwell"
            data-testid="input-entity-author"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="location">Location (for venues/restaurants)</Label>
          <Input
            id="location"
            value={formData.location || ""}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            placeholder="e.g., New York, NY"
            data-testid="input-entity-location"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="priceText">Price</Label>
          <Input
            id="priceText"
            value={formData.priceText || ""}
            onChange={(e) => setFormData({ ...formData, priceText: e.target.value })}
            placeholder="e.g., $29.99 or $$$$"
            data-testid="input-entity-price"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="imageUrl">Image URL</Label>
        <Input
          id="imageUrl"
          value={formData.imageUrl || ""}
          onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
          placeholder="https://..."
          data-testid="input-entity-image"
        />
      </div>

      <div className="border-t pt-4 mt-4">
        <h4 className="font-medium mb-3">Affiliate Settings</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="affiliateNetwork">Affiliate Network</Label>
            <Select 
              value={formData.affiliateNetwork || "none"} 
              onValueChange={(value) => setFormData({ ...formData, affiliateNetwork: value === "none" ? null : value })}
            >
              <SelectTrigger data-testid="select-entity-affiliate">
                <SelectValue placeholder="Select network" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {affiliateNetworks.map((network) => (
                  <SelectItem key={network.value} value={network.value}>
                    {network.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rating">Rating</Label>
            <Input
              id="rating"
              value={formData.rating || ""}
              onChange={(e) => setFormData({ ...formData, rating: e.target.value })}
              placeholder="e.g., 4.5 stars"
              data-testid="input-entity-rating"
            />
          </div>
        </div>

        <div className="space-y-2 mt-4">
          <Label htmlFor="affiliateUrl">Affiliate URL</Label>
          <Input
            id="affiliateUrl"
            value={formData.affiliateUrl || ""}
            onChange={(e) => setFormData({ ...formData, affiliateUrl: e.target.value })}
            placeholder="https://amazon.com/dp/...?tag=youraffid"
            data-testid="input-entity-affiliate-url"
          />
        </div>

        <div className="space-y-2 mt-4">
          <Label htmlFor="canonicalUrl">Canonical URL (original without affiliate)</Label>
          <Input
            id="canonicalUrl"
            value={formData.canonicalUrl || ""}
            onChange={(e) => setFormData({ ...formData, canonicalUrl: e.target.value })}
            placeholder="https://..."
            data-testid="input-entity-canonical-url"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t">
        <div className="flex items-center space-x-2">
          <Switch
            id="isActive"
            checked={formData.isActive}
            onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
          />
          <Label htmlFor="isActive">Active</Label>
        </div>
        
        <Button 
          onClick={handleSubmit} 
          disabled={createMutation.isPending || updateMutation.isPending}
          data-testid={isEditing ? "button-update-entity" : "button-create-entity"}
        >
          {(createMutation.isPending || updateMutation.isPending) && (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          )}
          {isEditing ? "Update Entity" : "Create Entity"}
        </Button>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-6xl">
      {/* Page Header with Yellow Accent */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-1 h-12 bg-yellow-400 rounded-full" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900" data-testid="text-entities-title">Entity Management</h1>
            <p className="text-gray-600 mt-1">
              Manage products, books, restaurants, and other monetizable entities
            </p>
          </div>
        </div>
        
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-yellow-500 hover:bg-yellow-600 text-black font-medium" data-testid="button-create-entity">
              <Plus className="w-4 h-4 mr-2" />
              Add Entity
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Entity</DialogTitle>
              <DialogDescription>
                Add a product, book, restaurant, or other monetizable entity
              </DialogDescription>
            </DialogHeader>
            <EntityForm />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search entities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-entities"
          />
        </div>
        <Select value={typeFilter || "all"} onValueChange={(value) => setTypeFilter(value === "all" ? "" : value)}>
          <SelectTrigger className="w-40" data-testid="select-filter-type">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {entityTypes.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Entities List */}
      <Card className="border border-gray-200 rounded-xl shadow-sm bg-white">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center">
              <Package className="w-4 h-4 text-yellow-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              Entities
            </h2>
            <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
              {filteredEntities.length}
            </Badge>
          </div>
        </div>
        <CardContent className="p-6">
          <div className="space-y-3">
            {filteredEntities.map((entity) => {
              const TypeIcon = getTypeIcon(entity.type);
              const isExpanded = expandedEntity === entity.id;
              
              return (
                <Collapsible
                  key={entity.id}
                  open={isExpanded}
                  onOpenChange={(open) => setExpandedEntity(open ? entity.id : null)}
                >
                  <div
                    className={`rounded-xl border bg-white transition-all duration-200 ${
                      isExpanded ? "border-yellow-300 shadow-md" : "border-gray-200 hover:shadow-md hover:border-yellow-200"
                    }`}
                    data-testid={`entity-row-${entity.id}`}
                  >
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-4">
                        {entity.imageUrl ? (
                          <img 
                            src={entity.imageUrl} 
                            alt={entity.name}
                            className="w-12 h-12 rounded-xl object-cover border border-gray-100"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-50 to-yellow-100 flex items-center justify-center border border-yellow-200">
                            <TypeIcon className="w-5 h-5 text-yellow-600" />
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-gray-900">{entity.name}</h3>
                            {entity.isActive ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : (
                              <XCircle className="w-4 h-4 text-gray-400" />
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100 capitalize text-xs">
                              {entity.type}
                            </Badge>
                            {entity.brand && <span>{entity.brand}</span>}
                            {entity.author && <span>by {entity.author}</span>}
                          </div>
                        </div>
                      </div>
                  
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <CollapsibleTrigger asChild>
                            <button className="flex items-center gap-1.5 hover:text-yellow-600 transition-colors cursor-pointer">
                              <BarChart3 className="w-4 h-4 text-yellow-500" />
                              <span className="font-medium text-gray-700">{entity.mentionCount}</span> mentions
                              <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                            </button>
                          </CollapsibleTrigger>
                          {entity.affiliateUrl && (
                            <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 flex items-center gap-1">
                              <ExternalLink className="w-3 h-3" />
                              {entity.affiliateNetwork || "affiliate"}
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-1">
                          <Dialog open={editingEntity?.id === entity.id} onOpenChange={(open) => !open && setEditingEntity(null)}>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-gray-500 hover:text-yellow-600 hover:bg-yellow-50" onClick={() => handleEdit(entity)} data-testid={`button-edit-entity-${entity.id}`}>
                                <Edit className="w-4 h-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>Edit Entity</DialogTitle>
                                <DialogDescription>
                                  Update the entity details and affiliate settings
                                </DialogDescription>
                              </DialogHeader>
                              <EntityForm isEditing />
                            </DialogContent>
                          </Dialog>
                          
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-gray-400 hover:text-red-500 hover:bg-red-50" data-testid={`button-delete-entity-${entity.id}`}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Entity</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{entity.name}"? This will also remove all associated mentions.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMutation.mutate(entity.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>
                    
                    {/* Expandable Episodes Section */}
                    <CollapsibleContent>
                      <div className="px-4 pb-4 pt-2 border-t border-gray-100">
                        <div className="text-sm font-medium text-gray-700 mb-2">Appears in Episodes:</div>
                        {entityEpisodes.length > 0 ? (
                          <div className="space-y-2">
                            {entityEpisodes.map((ep) => (
                              <div 
                                key={ep.episodeId} 
                                className="flex items-center gap-2 p-2 rounded-lg hover:bg-yellow-50 transition-colors group"
                              >
                                <PlayCircle className="w-4 h-4 text-yellow-500" />
                                <Link 
                                  href={`/episode/${ep.episodeId}`}
                                  className="flex-1 min-w-0"
                                >
                                  <div className="font-medium text-gray-800 truncate group-hover:text-yellow-700">
                                    {ep.episodeTitle}
                                  </div>
                                  <div className="text-xs text-gray-500">{ep.podcastTitle}</div>
                                </Link>
                                <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 text-xs">
                                  {ep.mentionCount} {ep.mentionCount === 1 ? "mention" : "mentions"}
                                </Badge>
                                {ep.isApproved ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-green-600 border-green-300 hover:bg-green-50 gap-1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      unapproveMutation.mutate(ep.mentionId);
                                    }}
                                    disabled={unapproveMutation.isPending}
                                    data-testid={`button-unapprove-mention-${ep.mentionId}`}
                                  >
                                    <CheckCircle className="w-3 h-3" />
                                    Approved
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-gray-500 border-gray-300 hover:bg-yellow-50 hover:text-yellow-700 hover:border-yellow-400 gap-1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      approveMutation.mutate(ep.mentionId);
                                    }}
                                    disabled={approveMutation.isPending}
                                    data-testid={`button-approve-mention-${ep.mentionId}`}
                                  >
                                    <XCircle className="w-3 h-3" />
                                    Pending
                                  </Button>
                                )}
                                <Link href={`/episode/${ep.episodeId}`}>
                                  <ExternalLink className="w-3 h-3 text-gray-400 hover:text-yellow-600" />
                                </Link>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500 italic">Loading episodes...</div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
            
            {filteredEntities.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                {searchQuery || typeFilter
                  ? "No entities match your search criteria."
                  : "No entities yet. Entities are automatically extracted from transcripts or can be added manually."}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
