import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
  LayoutGrid,
  Mic2
} from "lucide-react";
import type { CategoryWithPodcastCount, InsertCategory } from "@shared/schema";

export default function AdminCategoriesPage() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryWithPodcastCount | null>(null);
  const [formData, setFormData] = useState<Partial<InsertCategory>>({
    name: "",
    slug: "",
    description: "",
    iconName: "",
  });

  const { data: categories = [], isLoading } = useQuery<CategoryWithPodcastCount[]>({
    queryKey: ["/api/categories"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertCategory) => {
      const res = await apiRequest("POST", "/api/admin/categories", data);
      if (!res.ok) throw new Error("Failed to create category");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "Category created successfully" });
      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to create category", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertCategory> }) => {
      const res = await apiRequest("PATCH", `/api/admin/categories/${id}`, data);
      if (!res.ok) throw new Error("Failed to update category");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "Category updated successfully" });
      setEditingCategory(null);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to update category", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/categories/${id}`);
      if (!res.ok) throw new Error("Failed to delete category");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "Category deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to delete category", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      slug: "",
      description: "",
      iconName: "",
    });
  };

  const handleEdit = (category: CategoryWithPodcastCount) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      slug: category.slug,
      description: category.description || "",
      iconName: category.iconName || "",
    });
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.slug) {
      toast({ title: "Name and slug are required", variant: "destructive" });
      return;
    }

    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, data: formData });
    } else {
      createMutation.mutate(formData as InsertCategory);
    }
  };

  const generateSlug = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-5xl">
      {/* Page Header with Yellow Accent */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-1 h-12 bg-yellow-400 rounded-full" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900" data-testid="text-categories-title">
              Category Management
            </h1>
            <p className="text-gray-600 mt-1">
              Organize podcasts by category for easier discovery
            </p>
          </div>
        </div>
        
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-yellow-500 hover:bg-yellow-600 text-black font-medium" data-testid="button-create-category">
              <Plus className="w-4 h-4 mr-2" />
              Add Category
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Category</DialogTitle>
              <DialogDescription>
                Add a new category for organizing podcasts
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ 
                      ...formData, 
                      name: e.target.value,
                      slug: generateSlug(e.target.value)
                    });
                  }}
                  placeholder="e.g., Technology"
                  data-testid="input-category-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="e.g., technology"
                  data-testid="input-category-slug"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description || ""}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of this category"
                  data-testid="input-category-description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="iconName">Icon (lucide icon name)</Label>
                <Input
                  id="iconName"
                  value={formData.iconName || ""}
                  onChange={(e) => setFormData({ ...formData, iconName: e.target.value })}
                  placeholder="e.g., Laptop, BookOpen, Heart"
                  data-testid="input-category-icon"
                />
              </div>
              <Button 
                onClick={handleSubmit} 
                disabled={createMutation.isPending}
                className="w-full"
                data-testid="button-submit-category"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Category
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Categories List */}
      <Card className="border border-gray-200 rounded-xl shadow-sm bg-white">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center">
              <LayoutGrid className="w-4 h-4 text-yellow-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              Categories
            </h2>
            <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
              {categories.length}
            </Badge>
          </div>
        </div>
        <CardContent className="p-6">
          <div className="space-y-3">
            {categories.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-white hover:shadow-md hover:border-yellow-200 transition-all duration-200"
                data-testid={`category-row-${category.id}`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-50 to-yellow-100 flex items-center justify-center border border-yellow-200">
                    <LayoutGrid className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{category.name}</h3>
                    <p className="text-sm text-gray-500">
                      /{category.slug}
                    </p>
                  </div>
                  <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100 flex items-center gap-1.5 ml-2">
                    <Mic2 className="w-3 h-3" />
                    {category.podcastCount} podcasts
                  </Badge>
                </div>
                
                <div className="flex items-center gap-1">
                  <Dialog open={editingCategory?.id === category.id} onOpenChange={(open) => !open && setEditingCategory(null)}>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-gray-500 hover:text-yellow-600 hover:bg-yellow-50" onClick={() => handleEdit(category)} data-testid={`button-edit-category-${category.id}`}>
                        <Edit className="w-4 h-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Edit Category</DialogTitle>
                        <DialogDescription>
                          Update the category details
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="edit-name">Name</Label>
                          <Input
                            id="edit-name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            data-testid="input-edit-category-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-slug">Slug</Label>
                          <Input
                            id="edit-slug"
                            value={formData.slug}
                            onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                            data-testid="input-edit-category-slug"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-description">Description</Label>
                          <Textarea
                            id="edit-description"
                            value={formData.description || ""}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            data-testid="input-edit-category-description"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-iconName">Icon</Label>
                          <Input
                            id="edit-iconName"
                            value={formData.iconName || ""}
                            onChange={(e) => setFormData({ ...formData, iconName: e.target.value })}
                            data-testid="input-edit-category-icon"
                          />
                        </div>
                        <Button 
                          onClick={handleSubmit} 
                          disabled={updateMutation.isPending}
                          className="w-full"
                          data-testid="button-update-category"
                        >
                          {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          Update Category
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-gray-400 hover:text-red-500 hover:bg-red-50" data-testid={`button-delete-category-${category.id}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Category</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "{category.name}"? This will not delete the podcasts in this category.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate(category.id)}
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
            ))}
            
            {categories.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No categories yet. Create your first category to get started.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
