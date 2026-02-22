/**
 * Route guard that redirects unauthenticated users to the landing page.
 *
 * Used as a wrapper around the Layout route in App.tsx so that all
 * child pages (Dashboard, Vault, Heatmap, etc.) are only accessible
 * after Spotify OAuth login.
 *
 * Three-state rendering:
 *   1. isLoading=true  → show a spinner (waiting for /auth/me response)
 *   2. !isAuthenticated → redirect to "/" (landing page with login CTA)
 *   3. isAuthenticated  → render children (the Layout shell + page content)
 */
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-strata-amber-300 border-t-transparent" />
      </div>
    );
  }

  // `replace` prevents the login redirect from polluting browser history,
  // so pressing "Back" after login doesn't land on the bare "/" route.
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
