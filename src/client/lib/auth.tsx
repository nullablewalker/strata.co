/**
 * Authentication context — provides user identity and auth state to the
 * entire React tree.
 *
 * On mount, AuthProvider calls GET /api/auth/me to check if the session
 * cookie contains a valid Spotify token. If it does, `user` is populated;
 * otherwise the user is treated as unauthenticated.
 *
 * Session tokens are stored in encrypted cookies (hono-sessions / CookieStore),
 * so no client-side token management is needed — the browser sends the cookie
 * automatically with every /api/* request.
 */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { User, ApiResponse } from "../../shared/types";
import { apiFetch } from "./api";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
}

// Default to null — consumers must be wrapped in AuthProvider (enforced by useAuth).
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Start as true so the app shows a loading spinner rather than
  // briefly flashing the login page while the /auth/me check is in-flight.
  const [isLoading, setIsLoading] = useState(true);

  // On first render, verify the session with the server. If the cookie is
  // missing or expired the catch branch leaves user as null (unauthenticated).
  useEffect(() => {
    apiFetch<ApiResponse<User>>("/auth/me")
      .then((res) => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  // Logout clears the server session and then performs a hard navigation
  // to "/" to fully reset client state (avoids stale data in React tree).
  const logout = useCallback(async () => {
    await apiFetch("/auth/logout", { method: "POST" });
    setUser(null);
    window.location.href = "/";
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticated: !!user, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access auth state from any component.
 * Throws if called outside AuthProvider — this is intentional to catch
 * misplaced components early in development.
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
