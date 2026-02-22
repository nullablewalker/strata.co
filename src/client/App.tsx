/**
 * Root application component — owns routing and the authentication boundary.
 *
 * Route structure:
 *   /           → Landing (public, redirects to /dashboard if already authed)
 *   /dashboard  → Dashboard   ┐
 *   /vault      → The Vault   │ All wrapped in ProtectedRoute + Layout
 *   /heatmap    → Heatmap     │ (requires Spotify auth, renders sidebar shell)
 *   /patterns   → Patterns    │
 *   /era-map    → Era Map     │
 *   /import     → Import      ┘
 *
 * AuthProvider sits at the top so every descendant can call useAuth().
 */
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { ToastProvider } from "./components/Toast";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Vault from "./pages/Vault";
import Heatmap from "./pages/Heatmap";
import Patterns from "./pages/Patterns";
import BumpChart from "./pages/BumpChart";
import EraMap from "./pages/EraMap";
import Mosaic from "./pages/Mosaic";
import Import from "./pages/Import";
import Autobiography from "./pages/Autobiography";
import Export from "./pages/Export";

/**
 * Landing page — the only public route.
 * Shows a branded hero with a Spotify login CTA. If the user is already
 * authenticated (session cookie valid), they are silently redirected to
 * /dashboard so they never see this page unnecessarily.
 */
function Landing() {
  const { isAuthenticated, isLoading } = useAuth();

  // Wait for the /auth/me check to resolve before deciding what to render,
  // otherwise we would briefly flash the login page for returning users.
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-strata-amber-300 border-t-transparent" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  // Login link points to the server-side OAuth route (Arctic / Spotify flow).
  // This is a full-page navigation, not an SPA transition, because the server
  // needs to redirect the browser to Spotify's authorization endpoint.
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-bold text-strata-amber-300">Strata</h1>
      <p className="mt-4 text-strata-slate-400">
        サブスクの海に、自分だけの「レコード棚」を取り戻す
      </p>
      <a
        href="/api/auth/login"
        className="mt-8 rounded-lg bg-strata-amber-500 px-6 py-3 font-medium text-white transition-colors hover:bg-strata-amber-400"
      >
        Spotifyでログイン
      </a>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          {/* Layout route: ProtectedRoute enforces auth, Layout provides the
              sidebar shell with an <Outlet /> for child pages. */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/vault" element={<Vault />} />
            <Route path="/heatmap" element={<Heatmap />} />
            <Route path="/patterns" element={<Patterns />} />
            <Route path="/rankings" element={<BumpChart />} />
            <Route path="/era-map" element={<EraMap />} />
            <Route path="/mosaic" element={<Mosaic />} />
            <Route path="/import" element={<Import />} />
            <Route path="/autobiography" element={<Autobiography />} />
            <Route path="/export" element={<Export />} />
          </Route>
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
