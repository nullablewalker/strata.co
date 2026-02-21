import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Vault from "./pages/Vault";
import Heatmap from "./pages/Heatmap";
import Patterns from "./pages/Patterns";
import Import from "./pages/Import";

function Landing() {
  const { isAuthenticated, isLoading } = useAuth();

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
      <Routes>
        <Route path="/" element={<Landing />} />
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
          <Route path="/import" element={<Import />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
