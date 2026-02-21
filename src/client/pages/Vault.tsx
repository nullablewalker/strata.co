import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
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

interface VaultArtist {
  artistName: string;
  playCount: number;
  uniqueTracks: number;
  totalMsPlayed: number;
}

interface VaultStats {
  totalTracks: number;
  totalArtists: number;
  totalPlays: number;
  totalMsPlayed: number;
  dateRange: { from: string | null; to: string | null };
  topTrack: { trackName: string; artistName: string; playCount: number } | null;
  topArtist: { artistName: string; playCount: number } | null;
}

type SortOption = "plays" | "time" | "recent" | "name";
type ViewTab = "tracks" | "artists";

// --- Helpers ---

function formatMs(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatHours(ms: number): string {
  const hours = Math.round(ms / 3600000);
  return `${hours.toLocaleString()} hours`;
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

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "plays", label: "Most Played" },
  { value: "time", label: "Most Time" },
  { value: "recent", label: "Recently Played" },
  { value: "name", label: "Name A-Z" },
];

const PAGE_SIZE = 50;

// --- Skeleton Components ---

function StatCardSkeleton() {
  return (
    <div className="rounded-lg border border-strata-border bg-strata-surface p-4">
      <div className="mb-2 h-3 w-20 animate-pulse rounded bg-strata-border" />
      <div className="h-7 w-24 animate-pulse rounded bg-strata-border" />
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-4 border-b border-strata-border/50 px-4 py-3">
      <div className="h-4 w-6 animate-pulse rounded bg-strata-border" />
      <div className="flex-1 space-y-1.5">
        <div className="h-4 w-48 animate-pulse rounded bg-strata-border" />
        <div className="h-3 w-32 animate-pulse rounded bg-strata-border" />
      </div>
      <div className="h-4 w-12 animate-pulse rounded bg-strata-border" />
      <div className="h-4 w-16 animate-pulse rounded bg-strata-border" />
      <div className="h-4 w-16 animate-pulse rounded bg-strata-border" />
    </div>
  );
}

// --- Main Component ---

export default function Vault() {
  const [view, setView] = useState<ViewTab>("tracks");
  const [sort, setSort] = useState<SortOption>("plays");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [stats, setStats] = useState<VaultStats | null>(null);
  const [tracks, setTracks] = useState<VaultTrack[]>([]);
  const [artists, setArtists] = useState<VaultArtist[]>([]);
  const [totalTracks, setTotalTracks] = useState(0);
  const [totalArtists, setTotalArtists] = useState(0);
  const [offset, setOffset] = useState(0);

  const [statsLoading, setStatsLoading] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0);
    setTracks([]);
    setArtists([]);
  }, [view, sort, debouncedSearch]);

  // Fetch stats
  useEffect(() => {
    setStatsLoading(true);
    apiFetch<{ data: VaultStats }>("/vault/stats")
      .then((res) => setStats(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setStatsLoading(false));
  }, []);

  // Fetch list data
  const fetchList = useCallback(
    async (currentOffset: number, append: boolean) => {
      if (!append) setListLoading(true);
      else setLoadingMore(true);

      try {
        const order = sort === "name" ? "asc" : "desc";
        const params = new URLSearchParams({
          sort,
          order,
          limit: String(PAGE_SIZE),
          offset: String(currentOffset),
        });
        if (debouncedSearch) params.set("search", debouncedSearch);

        if (view === "tracks") {
          const res = await apiFetch<{ data: VaultTrack[]; total: number }>(
            `/vault/tracks?${params}`,
          );
          setTracks((prev) => (append ? [...prev, ...res.data] : res.data));
          setTotalTracks(res.total);
        } else {
          const res = await apiFetch<{ data: VaultArtist[]; total: number }>(
            `/vault/artists?${params}`,
          );
          setArtists((prev) => (append ? [...prev, ...res.data] : res.data));
          setTotalArtists(res.total);
        }
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setListLoading(false);
        setLoadingMore(false);
      }
    },
    [view, sort, debouncedSearch],
  );

  useEffect(() => {
    fetchList(0, false);
  }, [fetchList]);

  function handleLoadMore() {
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    fetchList(newOffset, true);
  }

  const currentItems = view === "tracks" ? tracks : artists;
  const currentTotal = view === "tracks" ? totalTracks : totalArtists;
  const hasMore = currentItems.length < currentTotal;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">The Vault</h1>
        <p className="mt-1 text-sm text-strata-slate-400">
          Your complete listening archive
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statsLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : stats ? (
          <>
            <StatCard label="Unique Tracks" value={stats.totalTracks.toLocaleString()} />
            <StatCard label="Artists" value={stats.totalArtists.toLocaleString()} />
            <StatCard
              label="Listening Time"
              value={formatHours(stats.totalMsPlayed)}
            />
            <StatCard
              label="Date Range"
              value={
                stats.dateRange.from && stats.dateRange.to
                  ? `${formatDate(stats.dateRange.from)} — ${formatDate(stats.dateRange.to)}`
                  : "—"
              }
              small
            />
          </>
        ) : null}
      </div>

      {/* Top Track & Artist */}
      {stats && (stats.topTrack || stats.topArtist) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {stats.topTrack && (
            <div className="rounded-lg border border-strata-border bg-strata-surface p-4">
              <p className="text-xs text-strata-slate-500">Top Track</p>
              <p className="mt-1 font-medium text-white">
                {stats.topTrack.trackName}
              </p>
              <p className="text-sm text-strata-slate-400">
                {stats.topTrack.artistName}
              </p>
              <p className="mt-1 font-mono text-sm font-bold text-strata-amber-300">
                {stats.topTrack.playCount.toLocaleString()} plays
              </p>
            </div>
          )}
          {stats.topArtist && (
            <div className="rounded-lg border border-strata-border bg-strata-surface p-4">
              <p className="text-xs text-strata-slate-500">Top Artist</p>
              <p className="mt-1 font-medium text-white">
                {stats.topArtist.artistName}
              </p>
              <p className="mt-1 font-mono text-sm font-bold text-strata-amber-300">
                {stats.topArtist.playCount.toLocaleString()} plays
              </p>
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Tabs */}
        <div className="flex rounded-lg border border-strata-border bg-strata-surface p-0.5">
          <button
            onClick={() => setView("tracks")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              view === "tracks"
                ? "bg-strata-amber-500/20 text-strata-amber-300"
                : "text-strata-slate-400 hover:text-white"
            }`}
          >
            Tracks
          </button>
          <button
            onClick={() => setView("artists")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              view === "artists"
                ? "bg-strata-amber-500/20 text-strata-amber-300"
                : "text-strata-slate-400 hover:text-white"
            }`}
          >
            Artists
          </button>
        </div>

        <div className="flex gap-2">
          {/* Search */}
          <input
            type="text"
            placeholder={`Search ${view}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-strata-border bg-strata-surface px-3 py-1.5 text-sm text-white placeholder-strata-slate-500 outline-none transition-colors focus:border-strata-amber-500/50 sm:w-56"
          />

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="rounded-lg border border-strata-border bg-strata-surface px-3 py-1.5 text-sm text-strata-slate-400 outline-none transition-colors focus:border-strata-amber-500/50"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-400">
          {error}
          <button
            onClick={() => fetchList(0, false)}
            className="ml-3 underline hover:text-red-300"
          >
            Retry
          </button>
        </div>
      )}

      {/* List */}
      <div className="overflow-hidden rounded-lg border border-strata-border">
        {listLoading ? (
          <div>
            {Array.from({ length: 8 }).map((_, i) => (
              <RowSkeleton key={i} />
            ))}
          </div>
        ) : currentItems.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-strata-slate-400">
              {debouncedSearch
                ? "No results found"
                : "No listening history yet"}
            </p>
            {!debouncedSearch && (
              <Link
                to="/import"
                className="mt-3 inline-block text-sm text-strata-amber-300 underline hover:text-strata-amber-200"
              >
                Import your streaming history
              </Link>
            )}
          </div>
        ) : view === "tracks" ? (
          <TrackList tracks={tracks} />
        ) : (
          <ArtistList artists={artists} />
        )}
      </div>

      {/* Pagination */}
      {currentItems.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs text-strata-slate-500">
            {currentItems.length} of {currentTotal.toLocaleString()}{" "}
            {view}
          </p>
          {hasMore && (
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="rounded-lg border border-strata-border bg-strata-surface px-4 py-2 text-sm text-strata-slate-400 transition-colors hover:border-strata-amber-500/50 hover:text-white disabled:opacity-50"
            >
              {loadingMore ? "Loading..." : "Load More"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function StatCard({
  label,
  value,
  small,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-lg border border-strata-border bg-strata-surface p-4">
      <p className="text-xs text-strata-slate-500">{label}</p>
      <p
        className={`mt-1 font-mono font-bold text-strata-amber-300 ${small ? "text-sm" : "text-xl"}`}
      >
        {value}
      </p>
    </div>
  );
}

function TrackList({ tracks }: { tracks: VaultTrack[] }) {
  return (
    <div>
      {/* Header row */}
      <div className="hidden border-b border-strata-border bg-strata-surface/50 px-4 py-2 text-xs font-medium text-strata-slate-500 sm:flex">
        <span className="w-10 text-center">#</span>
        <span className="flex-1">Track</span>
        <span className="w-20 text-right">Plays</span>
        <span className="w-20 text-right">Time</span>
        <span className="w-24 text-right">Last Played</span>
      </div>

      {tracks.map((track, i) => (
        <div
          key={`${track.trackSpotifyId}-${i}`}
          className="flex items-center border-b border-strata-border/30 px-4 py-3 transition-colors hover:bg-strata-surface/50"
        >
          <span className="w-10 text-center font-mono text-xs text-strata-slate-500">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">
              {track.trackName}
            </p>
            <p className="truncate text-xs text-strata-slate-400">
              {track.artistName}
              {track.albumName && (
                <span className="text-strata-slate-500">
                  {" "}
                  &middot; {track.albumName}
                </span>
              )}
            </p>
          </div>
          <span className="w-20 text-right font-mono text-sm font-bold text-strata-amber-300">
            {track.playCount.toLocaleString()}
          </span>
          <span className="hidden w-20 text-right font-mono text-xs text-strata-slate-400 sm:block">
            {formatMs(track.totalMsPlayed)}
          </span>
          <span className="hidden w-24 text-right text-xs text-strata-slate-500 sm:block">
            {formatRelativeDate(track.lastPlayedAt)}
          </span>
        </div>
      ))}
    </div>
  );
}

function ArtistList({ artists }: { artists: VaultArtist[] }) {
  return (
    <div>
      {/* Header row */}
      <div className="hidden border-b border-strata-border bg-strata-surface/50 px-4 py-2 text-xs font-medium text-strata-slate-500 sm:flex">
        <span className="w-10 text-center">#</span>
        <span className="flex-1">Artist</span>
        <span className="w-20 text-right">Plays</span>
        <span className="w-24 text-right">Unique Tracks</span>
        <span className="w-20 text-right">Time</span>
      </div>

      {artists.map((artist, i) => (
        <div
          key={`${artist.artistName}-${i}`}
          className="flex items-center border-b border-strata-border/30 px-4 py-3 transition-colors hover:bg-strata-surface/50"
        >
          <span className="w-10 text-center font-mono text-xs text-strata-slate-500">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">
              {artist.artistName}
            </p>
          </div>
          <span className="w-20 text-right font-mono text-sm font-bold text-strata-amber-300">
            {artist.playCount.toLocaleString()}
          </span>
          <span className="hidden w-24 text-right font-mono text-xs text-strata-slate-400 sm:block">
            {artist.uniqueTracks.toLocaleString()}
          </span>
          <span className="hidden w-20 text-right font-mono text-xs text-strata-slate-400 sm:block">
            {formatMs(artist.totalMsPlayed)}
          </span>
        </div>
      ))}
    </div>
  );
}
