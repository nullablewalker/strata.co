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

interface DormantArtist {
  artistName: string;
  totalMsPlayed: number;
  playCount: number;
  lastPlayed: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<VaultStats | null>(null);
  // null = unknown (loading), true/false = resolved.
  // This three-state approach prevents flashing the wrong UI during fetch.
  const [hasHistory, setHasHistory] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [dormantArtists, setDormantArtists] = useState<DormantArtist[]>([]);

  // Fetch vault stats on mount to determine whether the user has any data.
  // If the request fails (e.g. no history yet), we treat it as "no data"
  // and show the import CTA instead of an error message.
  useEffect(() => {
    apiFetch<ApiResponse<VaultStats>>("/vault/stats")
      .then((res) => {
        setStats(res.data);
        setHasHistory(res.data.totalTracks > 0);

        // Only fetch dormant artists if user has listening data
        if (res.data.totalTracks > 0) {
          apiFetch<ApiResponse<DormantArtist[]>>("/vault/dormant-artists")
            .then((dormantRes) => setDormantArtists(dormantRes.data))
            .catch(() => {
              // Silently ignore — section simply won't render
            });
        }
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

          {/* Dormant Artists */}
          {dormantArtists.length > 0 && (
            <DormantArtistsSection artists={dormantArtists} />
          )}
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

/**
 * Dormant Artists section — shows artists the user was passionate about
 * but hasn't listened to in 6+ months. Initially displays up to 5, with
 * a toggle to reveal the full list (up to 10).
 */
function DormantArtistsSection({ artists }: { artists: DormantArtist[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? artists : artists.slice(0, 5);

  return (
    <div className="mt-8 rounded-lg border border-strata-border bg-strata-surface p-6">
      <h2 className="text-lg font-semibold text-white">
        眠れるアーティスト
      </h2>
      <p className="mt-1 text-sm text-strata-slate-400">
        かつて愛聴したアーティストたち
      </p>

      <div className="mt-4 space-y-3">
        {visible.map((artist) => (
          <div
            key={artist.artistName}
            className="flex flex-col gap-1 rounded-md border border-strata-border/50 bg-strata-bg/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="font-medium text-amber-300">
              {artist.artistName}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-strata-slate-400">
              <span>
                {Math.floor(artist.totalMsPlayed / 3_600_000)}時間再生
              </span>
              <span>{artist.playCount}回再生</span>
              <span>
                最後に聴いた日:{" "}
                {new Date(artist.lastPlayed).toLocaleDateString("ja-JP", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
          </div>
        ))}
      </div>

      {artists.length > 5 && (
        <button
          type="button"
          onClick={() => setShowAll((prev) => !prev)}
          className="mt-4 text-sm text-strata-amber-300 transition-colors hover:text-strata-amber-200"
        >
          {showAll ? "折りたたむ" : "すべて表示"}
        </button>
      )}
    </div>
  );
}
