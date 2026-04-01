import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading, refetch } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const isAdmin = user?.role === "admin";
  const isModerator = user?.role === "moderator";

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    isAdmin,
    isModerator,
    isStaff: isAdmin || isModerator,
    refetch,
  };
}
