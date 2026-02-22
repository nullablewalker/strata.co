/**
 * Test wrapper components for rendering React components in a test environment
 * with all required providers (Router, Toast, Auth).
 */
import { type ReactNode, createContext, useContext } from "react";
import { BrowserRouter } from "react-router-dom";
import { ToastProvider } from "../../client/components/Toast";
import type { User } from "../../shared/types";

// ---------------------------------------------------------------------------
// TestProviders — Router + Toast (no Auth, tests mock auth separately)
// ---------------------------------------------------------------------------

/**
 * Wraps children with BrowserRouter and ToastProvider.
 * Does NOT include AuthProvider — tests should use MockAuthProvider
 * to inject auth state without network calls.
 */
export function TestProviders({ children }: { children: ReactNode }) {
  return (
    <BrowserRouter>
      <ToastProvider>{children}</ToastProvider>
    </BrowserRouter>
  );
}

// ---------------------------------------------------------------------------
// MockAuthProvider — controllable auth context for tests
// ---------------------------------------------------------------------------

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
}

/**
 * Minimal re-creation of the AuthContext for tests.
 * We cannot import the real AuthContext (it's not exported), so we create
 * a parallel context. Components under test that use `useAuth()` should
 * either be wrapped with the real AuthProvider (integration-style) or
 * the module should be mocked to return this context.
 */
const MockAuthContext = createContext<AuthContextValue | null>(null);

export interface MockAuthProviderProps {
  children: ReactNode;
  user?: User | null;
  isLoading?: boolean;
  isAuthenticated?: boolean;
  logout?: () => Promise<void>;
}

export const mockUser: User = {
  id: "test-user-uuid-123",
  spotifyId: "spotify_user_1",
  displayName: "Test User",
  email: "test@example.com",
  avatarUrl: "https://example.com/avatar.jpg",
};

/**
 * Provides a controllable AuthContext without any network calls.
 *
 * Usage:
 *   render(
 *     <MockAuthProvider user={mockUser}>
 *       <ProtectedComponent />
 *     </MockAuthProvider>
 *   );
 */
export function MockAuthProvider({
  children,
  user = mockUser,
  isLoading = false,
  isAuthenticated,
  logout = async () => {},
}: MockAuthProviderProps) {
  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: isAuthenticated ?? !!user,
    logout,
  };

  return <MockAuthContext.Provider value={value}>{children}</MockAuthContext.Provider>;
}

/**
 * Hook for tests to read the mock auth context.
 * Mirror of the real `useAuth()` but backed by MockAuthContext.
 */
export function useMockAuth(): AuthContextValue {
  const ctx = useContext(MockAuthContext);
  if (!ctx) {
    throw new Error("useMockAuth must be used within MockAuthProvider");
  }
  return ctx;
}

/**
 * All-in-one wrapper: Router + Toast + Auth.
 * Use when a component needs the full provider stack.
 */
export function TestProvidersWithAuth({
  children,
  ...authProps
}: MockAuthProviderProps) {
  return (
    <BrowserRouter>
      <ToastProvider>
        <MockAuthProvider {...authProps}>{children}</MockAuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
