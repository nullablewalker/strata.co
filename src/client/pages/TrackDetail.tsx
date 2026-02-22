/**
 * Track Detail page — shows comprehensive information about a single track.
 *
 * Route: /vault/track/:trackSpotifyId
 *
 * Displays album art, track metadata, listening stats (play count, total time,
 * first/last played, average per session), and a Spotify Embed player.
 */
import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { apiFetch } from "../lib/api";

// --- Types ---

interface VaultTrack {
  trackSpotifyId: string;
  trackName: string;
  artistName: string;
  albumName: string | null;
  playCount: number;
  totalMsPlayed: number;
  firstPlayedAt: string;
  lastPlayedAt: string;
}

interface TrackMetadata {
  albumArt: string;
  albumName: string;
}

// --- Helpers ---

function formatMs(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-CA"); // YYYY-MM-DD
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return formatDate(dateStr);
}

function formatAvgPerSession(totalMs: number, playCount: number): string {
  if (playCount === 0) return "--";
  const avgMs = totalMs / playCount;
  const avgMin = avgMs / 60000;
  if (avgMin < 1) return `${Math.round(avgMs / 1000)}s`;
  return `${avgMin.toFixed(1)} min`;
}

// --- Skeleton Components ---

function HeroSkeleton() {
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
      <div className="bg-strata-border/50 h-[300px] w-[300px] shrink-0 shimmer rounded-lg" />
      <div className="flex-1 space-y-4 pt-2">
        <div className="bg-strata-border/50 h-8 w-72 shimmer rounded" />
        <div className="bg-strata-border/50 h-5 w-48 shimmer rounded" />
        <div className="bg-strata-border/50 h-4 w-40 shimmer rounded" />
        <div className="mt-6 flex gap-3">
          <div className="bg-strata-border/50 h-10 w-40 shimmer rounded-lg" />
        </div>
      </div>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="glass-card p-4">
      <div className="bg-strata-border/50 mb-2 h-3 w-20 shimmer rounded" />
      <div className="bg-strata-border/50 h-7 w-24 shimmer rounded" />
    </div>
  );
}

// --- Main Component ---

export default function TrackDetail() {
  const { trackSpotifyId } = useParams<{ trackSpotifyId: string }>();

  const [track, setTrack] = useState<VaultTrack | null>(null);
  const [metadata, setMetadata] = useState<TrackMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!trackSpotifyId) {
      setError("No track ID provided");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Fetch track data and metadata in parallel
    const trackPromise = apiFetch<{ data: VaultTrack[]; total: number }>(
      `/vault/tracks?trackId=${encodeURIComponent(trackSpotifyId)}&limit=1`,
    );

    const metadataPromise = apiFetch<{ data: Record<string, TrackMetadata> }>(
      `/vault/metadata?trackIds=${encodeURIComponent(trackSpotifyId)}`,
    );

    Promise.all([trackPromise, metadataPromise])
      .then(([trackRes, metaRes]) => {
        if (trackRes.data.length === 0) {
          setError("Track not found in your listening history");
          return;
        }
        setTrack(trackRes.data[0]);

        const meta = metaRes.data[trackSpotifyId];
        if (meta) {
          setMetadata(meta);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load track data");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [trackSpotifyId]);

  // --- Error state ---
  if (!loading && error) {
    return (
      <div className="animate-page-enter space-y-6">
        <Link
          to="/vault"
          className="text-strata-slate-400 hover:text-strata-amber-300 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Vault
        </Link>

        <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-8 text-center">
          <p className="text-red-400">{error}</p>
          <Link
            to="/vault"
            className="text-strata-amber-300 hover:text-strata-amber-200 mt-4 inline-block text-sm underline"
          >
            Return to The Vault
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-page-enter space-y-8">
      {/* Back link */}
      <Link
        to="/vault"
        className="text-strata-slate-400 hover:text-strata-amber-300 inline-flex items-center gap-1 text-sm transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Vault
      </Link>

      {/* Hero section */}
      {loading ? (
        <HeroSkeleton />
      ) : track ? (
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          {/* Album art */}
          <div className="shrink-0">
            {metadata?.albumArt ? (
              <img
                src={metadata.albumArt}
                alt={`${track.albumName ?? track.trackName} album art`}
                className="h-[300px] w-[300px] rounded-lg object-cover shadow-lg shadow-black/40"
              />
            ) : (
              <div className="bg-strata-border flex h-[300px] w-[300px] items-center justify-center rounded-lg">
                <svg className="text-strata-slate-600 h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
            )}
          </div>

          {/* Track info */}
          <div className="flex-1 space-y-3 pt-1">
            <div>
              <h1 className="text-2xl font-bold text-white sm:text-3xl">{track.trackName}</h1>
              <p className="text-strata-slate-400 mt-1 text-lg">{track.artistName}</p>
              {track.albumName && (
                <p className="text-strata-slate-500 mt-0.5 text-sm">{track.albumName}</p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 pt-2">
              <a
                href={`https://open.spotify.com/track/${trackSpotifyId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="border-strata-border bg-white/[0.03] text-strata-slate-400 hover:border-strata-amber-500/50 inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:text-white"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                </svg>
                Open in Spotify
              </a>
            </div>
          </div>
        </div>
      ) : null}

      {/* Stats grid */}
      <div>
        <h2 className="text-strata-slate-400 mb-3 text-sm font-medium uppercase tracking-wider">
          Listening Stats
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {loading ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : track ? (
            <>
              <StatCard label="Total Plays" value={track.playCount.toLocaleString()} />
              <StatCard label="Total Time" value={formatMs(track.totalMsPlayed)} />
              <StatCard label="First Played" value={formatDate(track.firstPlayedAt)} />
              <StatCard
                label="Last Played"
                value={formatRelativeDate(track.lastPlayedAt)}
                subtitle={formatDate(track.lastPlayedAt)}
              />
              <StatCard
                label="Avg / Session"
                value={formatAvgPerSession(track.totalMsPlayed, track.playCount)}
              />
            </>
          ) : null}
        </div>
      </div>

      {/* Spotify Embed Player */}
      {trackSpotifyId && !loading && track && (
        <div>
          <h2 className="text-strata-slate-400 mb-3 text-sm font-medium uppercase tracking-wider">
            Player
          </h2>
          <div className="border-white/[0.04] overflow-hidden rounded-lg border">
            <iframe
              src={`https://open.spotify.com/embed/track/${trackSpotifyId}?theme=0`}
              width="100%"
              height="152"
              frameBorder={0}
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
              className="block"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function StatCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="glass-card p-4">
      <p className="text-strata-slate-500 text-xs">{label}</p>
      <p className="text-strata-amber-300 mt-1 font-mono text-xl font-bold">{value}</p>
      {subtitle && (
        <p className="text-strata-slate-600 mt-0.5 font-mono text-xs">{subtitle}</p>
      )}
    </div>
  );
}
