/**
 * Application shell layout — renders the persistent sidebar navigation and
 * the main content area via React Router's <Outlet />.
 *
 * Responsive behavior:
 *   - Desktop (lg+): sidebar is always visible as a static column.
 *   - Mobile (<lg): sidebar slides in from the left as an overlay, toggled
 *     by a hamburger button in the top header bar.
 *
 * This component is used as a "layout route" in App.tsx, meaning all
 * authenticated pages (Dashboard, Vault, Heatmap, Patterns, Import) are
 * rendered inside its <Outlet />.
 */
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/vault", label: "The Vault" },
  { to: "/heatmap", label: "Heatmap" },
  { to: "/patterns", label: "Patterns" },
  { to: "/rankings", label: "Rankings" },
  { to: "/import", label: "Import" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  // Controls mobile sidebar visibility; ignored on desktop via CSS (lg:static).
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Semi-transparent backdrop — closes sidebar on tap (mobile only). */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — fixed+off-screen on mobile, static on desktop.
          The translate-x transition provides a smooth slide-in animation. */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-strata-border bg-strata-surface transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center px-5">
          <NavLink
            to="/dashboard"
            className="text-xl font-bold text-strata-amber-300"
          >
            Strata
          </NavLink>
        </div>

        {/* Primary navigation — NavLink provides automatic "isActive" styling
            so the current page is visually highlighted in amber. */}
        <nav className="flex-1 space-y-1 px-3 py-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-strata-amber-500/15 text-strata-amber-300"
                    : "text-strata-slate-400 hover:bg-strata-border/50 hover:text-white"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User info pinned to sidebar bottom — shows Spotify avatar (or
            initial fallback) and a logout button. */}
        <div className="border-t border-strata-border p-4">
          <div className="flex items-center gap-3">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="h-8 w-8 rounded-full"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-strata-border text-sm text-strata-slate-400">
                {user?.displayName?.[0]?.toUpperCase() ?? "?"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {user?.displayName ?? "User"}
              </p>
            </div>
            <button
              onClick={logout}
              className="text-xs text-strata-slate-500 transition-colors hover:text-white"
            >
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col">
        {/* Mobile-only top bar with hamburger menu — hidden on desktop
            where the sidebar is always visible. */}
        <header className="flex h-14 items-center border-b border-strata-border px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-strata-slate-400 hover:text-white"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <span className="ml-3 text-lg font-bold text-strata-amber-300">
            Strata
          </span>
        </header>

        {/* Child page content is rendered here via React Router's Outlet. */}
        <main className="flex-1 p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
