/**
 * Dashboard page — the first screen users see after login.
 *
 * Adapts its content based on whether the user has imported any listening data:
 *   - With data: shows summary stats (tracks, artists, hours) and quick-nav
 *     cards linking to Vault, Heatmap, and Patterns.
 *   - Without data: shows a single call-to-action pointing to the Import page
 *     so new users have a clear next step.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { apiFetch } from "../lib/api";
import type { ApiResponse } from "../../shared/types";

interface VaultStats {
  totalTracks: number;
  totalArtists: number;
  totalMsPlayed: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<VaultStats | null>(null);
  // null = unknown (loading), true/false = resolved.
  // This three-state approach prevents flashing the wrong UI during fetch.
  const [hasHistory, setHasHistory] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch vault stats on mount to determine whether the user has any data.
  // If the request fails (e.g. no history yet), we treat it as "no data"
  // and show the import CTA instead of an error message.
  useEffect(() => {
    apiFetch<ApiResponse<VaultStats>>("/vault/stats")
      .then((res) => {
        setStats(res.data);
        setHasHistory(res.data.totalTracks > 0);
      })
      .catch(() => {
        setHasHistory(false);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold">
        Welcome back
        {user?.displayName ? `, ${user.displayName}` : ""}
      </h1>
      <p className="mt-1 text-strata-slate-400">
        Your personal music archive
      </p>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-strata-amber-300 border-t-transparent" />
        </div>
      ) : hasHistory ? (
        <>
          {/* Stats cards */}
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <StatsCard label="Tracks" value={stats!.totalTracks.toLocaleString()} />
            <StatsCard label="Artists" value={stats!.totalArtists.toLocaleString()} />
            <StatsCard
              label="Hours Listened"
              value={Math.floor(stats!.totalMsPlayed / 3_600_000).toLocaleString()}
            />
          </div>

          {/* Quick links */}
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <QuickLink to="/vault" title="The Vault" desc="Browse your full library" />
            <QuickLink to="/heatmap" title="Fandom Heatmap" desc="Visualize listening intensity" />
            <QuickLink to="/patterns" title="Patterns" desc="Discover listening habits" />
          </div>
        </>
      ) : (
        /* Import CTA */
        <div className="mt-8 rounded-lg border border-strata-border bg-strata-surface p-8 text-center">
          <h2 className="text-lg font-semibold text-strata-amber-300">
            Get Started
          </h2>
          <p className="mt-2 text-strata-slate-400">
            Import your Spotify Extended Streaming History to unlock your music archive.
          </p>
          <Link
            to="/import"
            className="mt-4 inline-block rounded-lg bg-strata-amber-500 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-strata-amber-400"
          >
            Import History
          </Link>
        </div>
      )}
    </div>
  );
}

/** Compact metric display card used in the stats grid. */
function StatsCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-strata-border bg-strata-surface p-5">
      <p className="text-sm text-strata-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-strata-amber-300">{value}</p>
    </div>
  );
}

/** Navigation card linking to a feature page, with a hover highlight. */
function QuickLink({
  to,
  title,
  desc,
}: {
  to: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      to={to}
      className="group rounded-lg border border-strata-border bg-strata-surface p-5 transition-colors hover:border-strata-amber-500/30"
    >
      <p className="font-medium text-white group-hover:text-strata-amber-300">
        {title}
      </p>
      <p className="mt-1 text-sm text-strata-slate-500">{desc}</p>
    </Link>
  );
}
