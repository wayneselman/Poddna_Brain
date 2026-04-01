import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { User, ArrowUp, Clock, MessageCircle, Play, Pencil, Camera, Loader2, Upload } from "lucide-react";
import type { AnnotationWithMetadata } from "@shared/schema";
import ImageUploader from "@/components/image-uploader";

export default function ProfilePage() {
  const { user, refetch: refetchUser } = useAuth();
  const { toast } = useToast();
  
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const { data: annotations, isLoading } = useQuery<AnnotationWithMetadata[]>({
    queryKey: ["/api/profile/annotations"],
    enabled: !!user,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { firstName?: string; lastName?: string; profileImageUrl?: string }) => {
      const response = await apiRequest("PATCH", "/api/profile", data);
      return response.json();
    },
    onSuccess: () => {
      refetchUser();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
      setIsEditDialogOpen(false);
      setIsImageDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    },
  });

  const handleEditClick = () => {
    setFirstName(user?.firstName || "");
    setLastName(user?.lastName || "");
    setIsEditDialogOpen(true);
  };

  const handleImageClick = () => {
    setImageUrl(user?.profileImageUrl || "");
    setIsImageDialogOpen(true);
  };

  const handleSaveProfile = () => {
    updateProfileMutation.mutate({
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
    });
  };

  const handleSaveImage = () => {
    updateProfileMutation.mutate({
      profileImageUrl: imageUrl.trim() || undefined,
    });
  };

  const formatTimeAgo = (date: Date | string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <h2 className="text-2xl font-bold text-foreground">Sign in required</h2>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              You need to be signed in to view your profile.
            </p>
            <Button onClick={() => window.location.href = "/login"} data-testid="button-login">
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <Skeleton className="h-32 mb-8" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const totalUpvotes = annotations?.reduce((sum, ann) => sum + ann.upvotes, 0) || 0;
  const totalAnnotations = annotations?.length || 0;
  const displayName = user.firstName && user.lastName
    ? `${user.firstName} ${user.lastName}`
    : user.email;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Profile Header */}
        <Card className="mb-8">
          <CardContent className="p-8">
            <div className="flex items-start gap-6">
              {/* Profile Picture with Edit Overlay */}
              <div className="relative group cursor-pointer" onClick={handleImageClick} data-testid="button-edit-picture">
                <Avatar className="w-20 h-20">
                  <AvatarImage src={user.profileImageUrl ?? undefined} alt={user.email ?? ""} />
                  <AvatarFallback>
                    <User className="w-10 h-10" />
                  </AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-6 h-6 text-white" />
                </div>
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-user-name">
                    {displayName}
                  </h1>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleEditClick}
                    data-testid="button-edit-profile"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-muted-foreground mb-6">{user.email}</p>
                
                {/* Stats */}
                <div className="flex gap-8">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-foreground" data-testid="text-annotation-count">
                      {totalAnnotations}
                    </div>
                    <div className="text-sm text-muted-foreground">Annotations</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary" data-testid="text-total-upvotes">
                      {totalUpvotes}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Upvotes</div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Annotations List */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-6">
            <MessageCircle className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-display font-bold text-foreground">
              Your Annotations
            </h2>
          </div>
        </div>

        {!annotations || annotations.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">No annotations yet</h3>
              <p className="text-muted-foreground mb-6">
                Start annotating podcast transcripts to share your insights
              </p>
              <Link href="/">
                <Button data-testid="button-browse-podcasts">
                  <Play className="w-4 h-4 mr-2" />
                  Browse Podcasts
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {annotations.map((annotation) => (
              <Link
                key={annotation.id}
                href={`/episode/${annotation.episodeId}#annotation-${annotation.id}`}
              >
                <Card
                  className="hover-elevate cursor-pointer transition-all"
                  data-testid={`annotation-card-${annotation.id}`}
                >
                  <CardContent className="p-6">
                    <div className="flex gap-4">
                      {/* Podcast Artwork */}
                      {annotation.artworkUrl && (
                        <div className="flex-shrink-0">
                          <img
                            src={annotation.artworkUrl}
                            alt={annotation.podcastTitle}
                            className="w-16 h-16 rounded-md object-cover"
                          />
                        </div>
                      )}

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {/* Episode Info */}
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-foreground line-clamp-1">
                              {annotation.episodeTitle}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {annotation.podcastTitle}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground flex-shrink-0">
                            <Clock className="w-4 h-4" />
                            {formatTimeAgo(annotation.createdAt)}
                          </div>
                        </div>

                        {/* Highlighted Text */}
                        <div className="bg-muted/30 p-3 rounded-md mb-3">
                          <p className="text-sm text-foreground">
                            {annotation.text.substring(0, annotation.startOffset)}
                            <mark className="bg-[#FFE066] text-foreground font-medium px-0.5">
                              {annotation.text.substring(annotation.startOffset, annotation.endOffset)}
                            </mark>
                            {annotation.text.substring(annotation.endOffset)}
                          </p>
                        </div>

                        {/* Annotation Content (italic) */}
                        {annotation.content && (
                          <p className="text-foreground mb-3 line-clamp-2 italic">
                            {annotation.content}
                          </p>
                        )}

                        {/* Footer */}
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1 text-sm">
                            <ArrowUp className="w-4 h-4 text-primary" />
                            <span className="font-medium text-foreground">
                              {annotation.upvotes}
                            </span>
                            <span className="text-muted-foreground">upvotes</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Edit Name Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>
              Update your display name
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Enter your first name"
                data-testid="input-first-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Enter your last name"
                data-testid="input-last-name"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveProfile}
              disabled={updateProfileMutation.isPending}
              data-testid="button-save-profile"
            >
              {updateProfileMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Picture Dialog */}
      <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Profile Picture</DialogTitle>
            <DialogDescription>
              Upload an image or enter a URL for your profile picture
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-center">
              <Avatar className="w-24 h-24">
                <AvatarImage src={imageUrl || user?.profileImageUrl || undefined} alt="Preview" />
                <AvatarFallback>
                  <User className="w-12 h-12" />
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="flex justify-center">
              <ImageUploader
                currentImageUrl={imageUrl || user?.profileImageUrl || undefined}
                onUploadComplete={(url) => setImageUrl(url)}
                buttonText="Upload Photo"
                showPreview={false}
              />
            </div>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or use URL
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="imageUrl">Image URL</Label>
              <Input
                id="imageUrl"
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/your-photo.jpg"
                data-testid="input-image-url"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsImageDialogOpen(false)}
              data-testid="button-cancel-image"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveImage}
              disabled={updateProfileMutation.isPending}
              data-testid="button-save-image"
            >
              {updateProfileMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Picture"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
