import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api";
import ColumnBrowser from "../components/ColumnBrowser";

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

interface VaultStats {
  totalTracks: number;
  totalArtists: number;
  totalPlays: number;
  totalMsPlayed: number;
  dateRange: { from: string | null; to: string | null };
  topTrack: {
    trackName: string;
    artistName: string;
    playCount: number;
  } | null;
  topArtist: { artistName: string; playCount: number } | null;
}

interface TrackMetadata {
  albumArt: string;
  albumName: string;
}

type SortOption = "plays" | "time" | "recent" | "name";

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
    <div className="border-strata-border bg-strata-surface rounded-lg border p-4">
      <div className="bg-strata-border mb-2 h-3 w-20 animate-pulse rounded" />
      <div className="bg-strata-border h-7 w-24 animate-pulse rounded" />
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="border-strata-border/50 flex items-center gap-4 border-b px-4 py-3">
      <div className="bg-strata-border h-4 w-6 animate-pulse rounded" />
      <div className="bg-strata-border h-10 w-10 animate-pulse rounded" />
      <div className="flex-1 space-y-1.5">
        <div className="bg-strata-border h-4 w-48 animate-pulse rounded" />
        <div className="bg-strata-border h-3 w-32 animate-pulse rounded" />
      </div>
      <div className="bg-strata-border h-4 w-12 animate-pulse rounded" />
      <div className="bg-strata-border h-4 w-16 animate-pulse rounded" />
      <div className="bg-strata-border h-4 w-16 animate-pulse rounded" />
    </div>
  );
}

// --- Main Component ---

export default function Vault() {
  // Column browser state
  const [genres, setGenres] = useState<string[]>([]);
  const [browserArtists, setBrowserArtists] = useState<string[]>([]);
  const [browserAlbums, setBrowserAlbums] = useState<string[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);
  const [genresLoading, setGenresLoading] = useState(true);

  // Track list state
  const [sort, setSort] = useState<SortOption>("plays");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [stats, setStats] = useState<VaultStats | null>(null);
  const [tracks, setTracks] = useState<VaultTrack[]>([]);
  const [totalTracks, setTotalTracks] = useState(0);
  const [offset, setOffset] = useState(0);

  const [statsLoading, setStatsLoading] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Album art metadata
  const [metadata, setMetadata] = useState<Record<string, TrackMetadata>>({});
  const fetchedMetadataRef = useRef<Set<string>>(new Set());

  // Player state
  const [nowPlaying, setNowPlaying] = useState<VaultTrack | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0);
    setTracks([]);
  }, [sort, debouncedSearch, selectedArtist, selectedAlbum]);

  // Fetch stats
  useEffect(() => {
    setStatsLoading(true);
    apiFetch<{ data: VaultStats }>("/vault/stats")
      .then((res) => setStats(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setStatsLoading(false));
  }, []);

  // Fetch genres on mount
  useEffect(() => {
    setGenresLoading(true);
    apiFetch<{ data: string[] }>("/vault/genres")
      .then((res) => setGenres(res.data))
      .catch(() => setGenres([]))
      .finally(() => setGenresLoading(false));
  }, []);

  // Fetch browser artists (all artist names from the artists endpoint)
  useEffect(() => {
    const params = new URLSearchParams({
      sort: "plays",
      order: "desc",
      limit: "500",
      offset: "0",
    });

    apiFetch<{ data: Array<{ artistName: string }>; total: number }>(`/vault/artists?${params}`)
      .then((res) => {
        setBrowserArtists(res.data.map((a) => a.artistName));
      })
      .catch(() => setBrowserArtists([]));
  }, []);

  // Fetch browser albums when artist changes
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedArtist) params.set("artist", selectedArtist);

    apiFetch<{ data: string[] }>(`/vault/albums?${params}`)
      .then((res) => setBrowserAlbums(res.data))
      .catch(() => setBrowserAlbums([]));
  }, [selectedArtist]);

  // Column browser selection handlers
  function handleGenreSelect(genre: string | null) {
    setSelectedGenre(genre);
    setSelectedArtist(null);
    setSelectedAlbum(null);
    // Genre filtering is informational -- we don't have genre-to-artist mapping in DB
    // so we just update the UI selection state for visual feedback
  }

  function handleArtistSelect(artist: string | null) {
    setSelectedArtist(artist);
    setSelectedAlbum(null);
  }

  function handleAlbumSelect(album: string | null) {
    setSelectedAlbum(album);
  }

  // Fetch track list data
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
        if (selectedArtist) params.set("artist", selectedArtist);
        if (selectedAlbum) params.set("album", selectedAlbum);

        const res = await apiFetch<{ data: VaultTrack[]; total: number }>(
          `/vault/tracks?${params}`,
        );
        setTracks((prev) => (append ? [...prev, ...res.data] : res.data));
        setTotalTracks(res.total);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setListLoading(false);
        setLoadingMore(false);
      }
    },
    [sort, debouncedSearch, selectedArtist, selectedAlbum],
  );

  useEffect(() => {
    fetchList(0, false);
  }, [fetchList]);

  // Fetch album art metadata for visible tracks
  useEffect(() => {
    if (tracks.length === 0) return;

    const newIds = tracks
      .map((t) => t.trackSpotifyId)
      .filter((id) => !fetchedMetadataRef.current.has(id));

    if (newIds.length === 0) return;

    // Mark as fetched to prevent duplicate requests
    for (const id of newIds) {
      fetchedMetadataRef.current.add(id);
    }

    // Fetch in batches of 50
    const batches: string[][] = [];
    for (let i = 0; i < newIds.length; i += 50) {
      batches.push(newIds.slice(i, i + 50));
    }

    for (const batch of batches) {
      apiFetch<{ data: Record<string, TrackMetadata> }>(
        `/vault/metadata?trackIds=${batch.join(",")}`,
      )
        .then((res) => {
          setMetadata((prev) => ({ ...prev, ...res.data }));
        })
        .catch(() => {
          // Remove from fetched set so they can be retried
          for (const id of batch) {
            fetchedMetadataRef.current.delete(id);
          }
        });
    }
  }, [tracks]);

  function handleLoadMore() {
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    fetchList(newOffset, true);
  }

  const hasMore = tracks.length < totalTracks;

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">The Vault</h1>
        <p className="text-strata-slate-400 mt-1 text-sm">Your complete listening archive</p>
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
            <StatCard label="Listening Time" value={formatHours(stats.totalMsPlayed)} />
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

      {/* Column Browser */}
      <ColumnBrowser
        genres={genres}
        artists={browserArtists}
        albums={browserAlbums}
        selectedGenre={selectedGenre}
        selectedArtist={selectedArtist}
        selectedAlbum={selectedAlbum}
        onGenreSelect={handleGenreSelect}
        onArtistSelect={handleArtistSelect}
        onAlbumSelect={handleAlbumSelect}
        loading={genresLoading}
      />

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          {/* Search */}
          <input
            type="text"
            placeholder="Search tracks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-strata-border bg-strata-surface placeholder-strata-slate-500 focus:border-strata-amber-500/50 w-full rounded-lg border px-3 py-1.5 text-sm text-white transition-colors outline-none sm:w-56"
          />

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="border-strata-border bg-strata-surface text-strata-slate-400 focus:border-strata-amber-500/50 rounded-lg border px-3 py-1.5 text-sm transition-colors outline-none"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Track count */}
        <p className="text-strata-slate-500 font-mono text-xs">
          {tracks.length > 0 ? `${tracks.length} of ${totalTracks.toLocaleString()} tracks` : ""}
        </p>
      </div>

      {/* Active filters indicator */}
      {(selectedArtist || selectedAlbum) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-strata-slate-500 text-xs">Filtering by:</span>
          {selectedArtist && (
            <span className="bg-strata-amber-500/10 text-strata-amber-300 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs">
              {selectedArtist}
              <button
                onClick={() => {
                  setSelectedArtist(null);
                  setSelectedAlbum(null);
                }}
                className="text-strata-amber-300/60 hover:text-strata-amber-300 ml-1"
              >
                x
              </button>
            </span>
          )}
          {selectedAlbum && (
            <span className="bg-strata-amber-500/10 text-strata-amber-300 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs">
              {selectedAlbum}
              <button
                onClick={() => setSelectedAlbum(null)}
                className="text-strata-amber-300/60 hover:text-strata-amber-300 ml-1"
              >
                x
              </button>
            </span>
          )}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-400">
          {error}
          <button onClick={() => fetchList(0, false)} className="ml-3 underline hover:text-red-300">
            Retry
          </button>
        </div>
      )}

      {/* Track List */}
      <div className="border-strata-border overflow-hidden rounded-lg border">
        {listLoading ? (
          <div>
            {Array.from({ length: 8 }).map((_, i) => (
              <RowSkeleton key={i} />
            ))}
          </div>
        ) : tracks.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-strata-slate-400">
              {debouncedSearch || selectedArtist || selectedAlbum
                ? "No results found"
                : "No listening history yet"}
            </p>
            {!debouncedSearch && !selectedArtist && !selectedAlbum && (
              <Link
                to="/import"
                className="text-strata-amber-300 hover:text-strata-amber-200 mt-3 inline-block text-sm underline"
              >
                Import your streaming history
              </Link>
            )}
          </div>
        ) : (
          <TrackList
            tracks={tracks}
            metadata={metadata}
            nowPlaying={nowPlaying}
            onTrackClick={setNowPlaying}
          />
        )}
      </div>

      {/* Pagination */}
      {tracks.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-strata-slate-500 font-mono text-xs">
            {tracks.length} of {totalTracks.toLocaleString()} tracks
          </p>
          {hasMore && (
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="border-strata-border bg-strata-surface text-strata-slate-400 hover:border-strata-amber-500/50 rounded-lg border px-4 py-2 text-sm transition-colors hover:text-white disabled:opacity-50"
            >
              {loadingMore ? "Loading..." : "Load More"}
            </button>
          )}
        </div>
      )}

      {/* Spotify Player Bar */}
      {nowPlaying && (
        <PlayerBar
          track={nowPlaying}
          albumArt={metadata[nowPlaying.trackSpotifyId]?.albumArt}
          onClose={() => setNowPlaying(null)}
        />
      )}
    </div>
  );
}

// --- Sub-components ---

function StatCard({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="border-strata-border bg-strata-surface rounded-lg border p-4">
      <p className="text-strata-slate-500 text-xs">{label}</p>
      <p
        className={`text-strata-amber-300 mt-1 font-mono font-bold ${small ? "text-sm" : "text-xl"}`}
      >
        {value}
      </p>
    </div>
  );
}

function TrackList({
  tracks,
  metadata,
  nowPlaying,
  onTrackClick,
}: {
  tracks: VaultTrack[];
  metadata: Record<string, TrackMetadata>;
  nowPlaying: VaultTrack | null;
  onTrackClick: (track: VaultTrack) => void;
}) {
  return (
    <div>
      {/* Header row */}
      <div className="border-strata-border bg-strata-surface/50 text-strata-slate-500 hidden border-b px-4 py-2 text-xs font-medium sm:flex">
        <span className="w-10 text-center">#</span>
        <span className="w-12" /> {/* Album art column */}
        <span className="flex-1">Track</span>
        <span className="w-20 text-right">Plays</span>
        <span className="w-20 text-right">Time</span>
        <span className="w-24 text-right">Last Played</span>
      </div>

      {tracks.map((track, i) => {
        const meta = metadata[track.trackSpotifyId];
        const isPlaying = nowPlaying?.trackSpotifyId === track.trackSpotifyId;

        return (
          <button
            key={`${track.trackSpotifyId}-${i}`}
            onClick={() => onTrackClick(track)}
            className={`border-strata-border/30 hover:bg-strata-surface/50 flex w-full items-center border-b px-4 py-3 text-left transition-colors ${
              isPlaying ? "bg-strata-amber-500/10" : ""
            }`}
          >
            <span className="text-strata-slate-500 w-10 text-center font-mono text-xs">
              {i + 1}
            </span>

            {/* Album art */}
            <span className="mr-3 w-10 shrink-0">
              {meta?.albumArt ? (
                <img
                  src={meta.albumArt}
                  alt=""
                  className="h-10 w-10 rounded object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="bg-strata-border block h-10 w-10 rounded" />
              )}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">
                {track.trackName}
              </span>
              <span className="text-strata-slate-400 block truncate text-xs">
                {track.artistName}
                {track.albumName && (
                  <span className="text-strata-slate-500"> &middot; {track.albumName}</span>
                )}
              </span>
            </span>

            <span className="text-strata-amber-300 w-20 text-right font-mono text-sm font-bold">
              {track.playCount.toLocaleString()}
            </span>
            <span className="text-strata-slate-400 hidden w-20 text-right font-mono text-xs sm:block">
              {formatMs(track.totalMsPlayed)}
            </span>
            <span className="text-strata-slate-500 hidden w-24 text-right text-xs sm:block">
              {formatRelativeDate(track.lastPlayedAt)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PlayerBar({
  track,
  albumArt,
  onClose,
}: {
  track: VaultTrack;
  albumArt?: string;
  onClose: () => void;
}) {
  const [showEmbed, setShowEmbed] = useState(false);

  return (
    <div className="border-strata-border bg-strata-surface fixed inset-x-0 bottom-0 z-50 border-t">
      {/* Spotify embed player */}
      {showEmbed && (
        <div className="border-strata-border border-b">
          <iframe
            src={`https://open.spotify.com/embed/track/${track.trackSpotifyId}?theme=0`}
            width="100%"
            height="80"
            frameBorder={0}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            className="block"
          />
        </div>
      )}

      {/* Player controls */}
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        {/* Album art */}
        {albumArt ? (
          <img src={albumArt} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
        ) : (
          <span className="bg-strata-border block h-12 w-12 shrink-0 rounded" />
        )}

        {/* Track info */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{track.trackName}</p>
          <p className="text-strata-slate-400 truncate text-xs">{track.artistName}</p>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setShowEmbed(!showEmbed)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              showEmbed
                ? "border-strata-amber-500/50 bg-strata-amber-500/20 text-strata-amber-300"
                : "border-strata-border text-strata-slate-400 hover:border-strata-amber-500/50 hover:text-white"
            }`}
          >
            {showEmbed ? "Hide Player" : "Preview"}
          </button>

          <a
            href={`https://open.spotify.com/track/${track.trackSpotifyId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="border-strata-border text-strata-slate-400 hover:border-strata-amber-500/50 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:text-white"
          >
            Open in Spotify
          </a>

          <button
            onClick={onClose}
            className="text-strata-slate-500 rounded-lg px-2 py-1.5 transition-colors hover:text-white"
            aria-label="Close player"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
