import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { User } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
  Search, 
  Shield, 
  Ban, 
  CheckCircle, 
  Crown, 
  Star,
  Users as UsersIcon,
  Trash2,
  ShieldPlus,
  MoreVertical,
  UserCog,
  Eye
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function AdminUsersPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserForAction, setSelectedUserForAction] = useState<string | null>(null);
  const [banReason, setBanReason] = useState("");

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/role`, { role });
      if (!res.ok) throw new Error("Failed to update role");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Role updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update role", variant: "destructive" });
    },
  });

  const banUserMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/ban`, { reason });
      if (!res.ok) throw new Error("Failed to ban user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User banned successfully" });
      setSelectedUserForAction(null);
      setBanReason("");
    },
    onError: () => {
      toast({ title: "Failed to ban user", variant: "destructive" });
    },
  });

  const unbanUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/unban`);
      if (!res.ok) throw new Error("Failed to unban user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User unbanned successfully" });
    },
    onError: () => {
      toast({ title: "Failed to unban user", variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/users/${userId}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Failed to delete user", variant: "destructive" });
    },
  });

  const filteredUsers = users.filter(user => 
    user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.lastName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return <Badge className="bg-purple-500"><Crown className="w-3 h-3 mr-1" />Admin</Badge>;
      case "moderator":
        return <Badge className="bg-blue-500"><Shield className="w-3 h-3 mr-1" />Moderator</Badge>;
      case "contributor":
        return <Badge className="bg-green-500"><Star className="w-3 h-3 mr-1" />Contributor</Badge>;
      default:
        return <Badge variant="secondary">User</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-users-title">User Management</h1>
        <p className="text-muted-foreground mt-1">
          Manage platform users, roles, and permissions
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UsersIcon className="w-5 h-5" />
                All Users ({users.length})
              </CardTitle>
              <CardDescription>
                View and manage user accounts
              </CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-users"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <UsersIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No users found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUsers.map((user) => (
                <div 
                  key={user.id} 
                  className="flex items-center justify-between p-4 border rounded-lg"
                  data-testid={`user-row-${user.id}`}
                >
                  <div className="flex items-center gap-4">
                    <Avatar>
                      <AvatarImage src={user.profileImageUrl || undefined} />
                      <AvatarFallback>
                        {user.firstName?.[0] || user.email?.[0]?.toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">
                          {user.firstName && user.lastName 
                            ? `${user.firstName} ${user.lastName}`
                            : user.email?.split("@")[0] || "Unknown User"}
                        </p>
                        {getRoleBadge(user.role || "user")}
                        {user.isBanned && (
                          <Badge variant="destructive">
                            <Ban className="w-3 h-3 mr-1" />
                            Banned
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {/* Primary action: View Profile */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(`/user/${user.id}`, '_blank')}
                      data-testid={`button-view-profile-${user.id}`}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      View
                    </Button>
                    
                    {/* Actions dropdown menu */}
                    {user.role !== "admin" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            data-testid={`button-user-actions-${user.id}`}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuLabel>User Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          
                          {/* Role Management */}
                          <DropdownMenuItem
                            onClick={() => updateRoleMutation.mutate({ 
                              userId: user.id, 
                              role: user.role === "moderator" ? "user" : "moderator" 
                            })}
                            disabled={updateRoleMutation.isPending}
                            data-testid={`menu-toggle-mod-${user.id}`}
                          >
                            <Shield className="w-4 h-4 mr-2" />
                            {user.role === "moderator" ? "Remove Moderator" : "Make Moderator"}
                          </DropdownMenuItem>
                          
                          <DropdownMenuItem
                            onClick={() => setSelectedUserForAction(`admin-${user.id}`)}
                            data-testid={`menu-make-admin-${user.id}`}
                          >
                            <Crown className="w-4 h-4 mr-2" />
                            Make Admin
                          </DropdownMenuItem>
                          
                          <DropdownMenuSeparator />
                          
                          {/* Ban/Unban */}
                          {user.isBanned ? (
                            <DropdownMenuItem
                              onClick={() => unbanUserMutation.mutate(user.id)}
                              disabled={unbanUserMutation.isPending}
                              data-testid={`menu-unban-${user.id}`}
                            >
                              <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                              Unban User
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => setSelectedUserForAction(`ban-${user.id}`)}
                              className="text-orange-600 focus:text-orange-600"
                              data-testid={`menu-ban-${user.id}`}
                            >
                              <Ban className="w-4 h-4 mr-2" />
                              Ban User
                            </DropdownMenuItem>
                          )}
                          
                          <DropdownMenuSeparator />
                          
                          {/* Delete */}
                          <DropdownMenuItem
                            onClick={() => setSelectedUserForAction(`delete-${user.id}`)}
                            className="text-destructive focus:text-destructive"
                            data-testid={`menu-delete-${user.id}`}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    
                    {/* Admin badge indicator */}
                    {user.role === "admin" && (
                      <Badge variant="outline" className="text-purple-600 border-purple-300">
                        <Crown className="w-3 h-3 mr-1" />
                        Protected
                      </Badge>
                    )}
                  </div>
                  
                  {/* Confirmation Dialogs (outside the row but triggered by dropdown) */}
                  {/* Make Admin Dialog */}
                  <AlertDialog 
                    open={selectedUserForAction === `admin-${user.id}`}
                    onOpenChange={(open) => !open && setSelectedUserForAction(null)}
                  >
                    <AlertDialogContent className="border-purple-200">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                          <Crown className="w-5 h-5 text-purple-600" />
                          Promote to Admin
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to make <strong>{user.email}</strong> an admin? 
                          Admins have full access to manage the platform, including other users.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel data-testid={`button-cancel-admin-${user.id}`}>
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            updateRoleMutation.mutate({ userId: user.id, role: "admin" });
                            setSelectedUserForAction(null);
                          }}
                          className="bg-purple-600 text-white hover:bg-purple-700"
                          data-testid={`button-confirm-admin-${user.id}`}
                        >
                          <Crown className="w-4 h-4 mr-1" />
                          Confirm
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  
                  {/* Ban User Dialog */}
                  <AlertDialog 
                    open={selectedUserForAction === `ban-${user.id}`}
                    onOpenChange={(open) => {
                      if (!open) {
                        setSelectedUserForAction(null);
                        setBanReason("");
                      }
                    }}
                  >
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                          <Ban className="w-5 h-5 text-orange-600" />
                          Ban User
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to ban {user.email}? They will not be able to log in or interact with the platform.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <Input
                        placeholder="Reason for ban..."
                        value={banReason}
                        onChange={(e) => setBanReason(e.target.value)}
                        data-testid={`input-ban-reason-${user.id}`}
                      />
                      <AlertDialogFooter>
                        <AlertDialogCancel data-testid={`button-cancel-ban-${user.id}`}>
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            if (banReason.trim()) {
                              banUserMutation.mutate({ userId: user.id, reason: banReason });
                            }
                          }}
                          disabled={!banReason.trim()}
                          className="bg-orange-600 text-white hover:bg-orange-700"
                          data-testid={`button-confirm-ban-${user.id}`}
                        >
                          Ban User
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  
                  {/* Delete User Dialog */}
                  <AlertDialog 
                    open={selectedUserForAction === `delete-${user.id}`}
                    onOpenChange={(open) => !open && setSelectedUserForAction(null)}
                  >
                    <AlertDialogContent className="border-destructive/20">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                          <Trash2 className="w-5 h-5" />
                          Delete User
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to permanently delete <strong>{user.email}</strong>? 
                          This action cannot be undone and will remove all their data.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel data-testid={`button-cancel-delete-${user.id}`}>
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            deleteUserMutation.mutate(user.id);
                            setSelectedUserForAction(null);
                          }}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          data-testid={`button-confirm-delete-${user.id}`}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
