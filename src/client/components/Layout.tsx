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
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

const navGroups = [
  {
    label: null, // No header for primary section
    items: [
      { to: "/dashboard", label: "Dashboard", icon: "◉" },
    ],
  },
  {
    label: "Library",
    items: [
      { to: "/vault", label: "The Vault", icon: "♫" },
      { to: "/import", label: "Import", icon: "↑" },
      { to: "/export", label: "Export", icon: "↓" },
    ],
  },
  {
    label: "Insights",
    items: [
      { to: "/heatmap", label: "Heatmap", icon: "▦" },
      { to: "/patterns", label: "Patterns", icon: "◎" },
      { to: "/rankings", label: "Rankings", icon: "♛" },
    ],
  },
  {
    label: "Stories",
    items: [
      { to: "/era-map", label: "Era Map", icon: "⌖" },
      { to: "/autobiography", label: "Autobiography", icon: "☰" },
      { to: "/mosaic", label: "Mosaic", icon: "▣" },
    ],
  },
];

export default function Layout() {
  const { user, logout } = useAuth();
  // Controls mobile sidebar visibility; ignored on desktop via CSS (lg:static).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="flex min-h-screen">
      {/* Ambient gradient orbs — geological atmosphere */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="absolute -right-32 -top-32 h-[500px] w-[500px] rounded-full opacity-[0.07]"
          style={{
            background: "radial-gradient(circle, #a66b1f 0%, transparent 70%)",
            animation: "drift-1 45s ease-in-out infinite",
          }}
        />
        <div
          className="absolute -bottom-48 -left-32 h-[600px] w-[600px] rounded-full opacity-[0.05]"
          style={{
            background: "radial-gradient(circle, #2d4f39 0%, transparent 70%)",
            animation: "drift-2 55s ease-in-out infinite",
          }}
        />
        <div
          className="absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.04]"
          style={{
            background: "radial-gradient(circle, #8b3a1f 0%, transparent 70%)",
            animation: "drift-1 60s ease-in-out infinite reverse",
          }}
        />
        <div className="noise-overlay absolute inset-0" />
      </div>

      {/* Semi-transparent backdrop — closes sidebar on tap (mobile only). */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          role="button"
          aria-label="メニューを閉じる"
        />
      )}

      {/* Sidebar — fixed+off-screen on mobile, static on desktop.
          The translate-x transition provides a smooth slide-in animation. */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-white/[0.06] bg-strata-surface/80 backdrop-blur-xl transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center px-5">
          <NavLink
            to="/dashboard"
            className="text-xl font-bold text-strata-amber-300 transition-opacity hover:opacity-80 active:scale-[0.97]"
          >
            Strata
          </NavLink>
        </div>

        {/* Primary navigation — NavLink provides automatic "isActive" styling
            so the current page is visually highlighted in amber. */}
        <nav aria-label="メインナビゲーション" className="flex-1 overflow-y-auto px-3 py-2">
          {navGroups.map((group, gi) => (
            <div key={gi} className={gi > 0 ? "mt-5" : ""}>
              {group.label && (
                <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-strata-slate-500/70">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? "bg-strata-amber-500/15 text-strata-amber-300 shadow-[inset_3px_0_0_0] shadow-strata-amber-400"
                          : "text-strata-slate-400 hover:bg-white/[0.04] hover:text-white active:scale-[0.98]"
                      }`
                    }
                  >
                    <span className="w-4 text-center text-xs opacity-60">{item.icon}</span>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
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
              className="text-xs text-strata-slate-500 transition-all hover:text-white active:scale-[0.95]"
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
        <header className="flex h-14 items-center border-b border-white/[0.06] bg-strata-bg/80 backdrop-blur-xl px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="メニューを開く"
            className="text-strata-slate-400 hover:text-white transition-all active:scale-[0.9]"
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
          <div key={location.pathname} className="mx-auto max-w-7xl animate-page-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
