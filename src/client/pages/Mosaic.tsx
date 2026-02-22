/**
 * Album Art Mosaic Timeline — a visual collage of album artwork arranged by
 * month, where more-listened albums appear larger and more prominent.
 *
 * Data flow:
 *   1. Fetch /api/vault/mosaic  -> monthly top albums with a representative trackSpotifyId
 *   2. Collect all unique trackSpotifyIds
 *   3. Batch-fetch album art via /api/vault/metadata?trackIds=...  (batches of 50)
 *   4. Render the timeline
 */

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api";

// --- Types ---

interface MosaicAlbum {
  month: string;
  albumName: string | null;
  artistName: string;
  playCount: number;
  msPlayed: number;
  trackSpotifyId: string;
}

interface MosaicMonth {
  month: string;
  albums: MosaicAlbum[];
}

interface TrackMetadata {
  albumArt: string;
  albumName: string;
}

// --- Helpers ---

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatMonth(yyyyMm: string): string {
  const [year, month] = yyyyMm.split("-");
  const idx = Number(month) - 1;
  return `${MONTH_NAMES[idx]} ${year}`;
}

// --- Skeleton ---

function RowSkeleton() {
  return (
    <div className="border-strata-border/50 flex items-start gap-4 border-b py-4">
      <div className="bg-strata-border h-4 w-20 shrink-0 animate-pulse rounded pt-2" />
      <div className="flex flex-wrap gap-3">
        <div className="bg-strata-border h-24 w-24 animate-pulse rounded-md" />
        <div className="bg-strata-border h-20 w-20 animate-pulse rounded-md" />
        <div className="bg-strata-border h-16 w-16 animate-pulse rounded-md" />
        <div className="bg-strata-border h-16 w-16 animate-pulse rounded-md" />
      </div>
    </div>
  );
}

// --- Main Component ---

export default function Mosaic() {
  const [months, setMonths] = useState<MosaicMonth[]>([]);
  const [metadata, setMetadata] = useState<Record<string, TrackMetadata>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchedMetadataRef = useRef<Set<string>>(new Set());

  // 1. Fetch mosaic data
  useEffect(() => {
    setLoading(true);
    apiFetch<{ data: MosaicMonth[] }>("/vault/mosaic")
      .then((res) => {
        setMonths(res.data);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load data"))
      .finally(() => setLoading(false));
  }, []);

  // 2. Batch-fetch album art when months data arrives
  useEffect(() => {
    if (months.length === 0) return;

    const allTrackIds = months.flatMap((m) =>
      m.albums.map((a) => a.trackSpotifyId).filter(Boolean),
    );
    const newIds = allTrackIds.filter((id) => !fetchedMetadataRef.current.has(id));
    // Deduplicate
    const uniqueIds = [...new Set(newIds)];

    if (uniqueIds.length === 0) return;

    // Mark as fetched
    for (const id of uniqueIds) {
      fetchedMetadataRef.current.add(id);
    }

    // Fetch in batches of 50
    const batches: string[][] = [];
    for (let i = 0; i < uniqueIds.length; i += 50) {
      batches.push(uniqueIds.slice(i, i + 50));
    }

    for (const batch of batches) {
      apiFetch<{ data: Record<string, TrackMetadata> }>(
        `/vault/metadata?trackIds=${batch.join(",")}`,
      )
        .then((res) => {
          setMetadata((prev) => ({ ...prev, ...res.data }));
        })
        .catch(() => {
          // Allow retry on next render
          for (const id of batch) {
            fetchedMetadataRef.current.delete(id);
          }
        });
    }
  }, [months]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Album Art Timeline</h1>
        <p className="text-strata-slate-400 mt-1 text-sm">
          Your listening history as a mosaic of album artwork
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-400">
          {error}
          <button
            onClick={() => window.location.reload()}
            className="ml-3 underline hover:text-red-300"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && months.length === 0 && (
        <div className="px-6 py-16 text-center">
          <p className="text-strata-slate-400">No listening history yet</p>
          <Link
            to="/import"
            className="text-strata-amber-300 hover:text-strata-amber-200 mt-3 inline-block text-sm underline"
          >
            Import your streaming history
          </Link>
        </div>
      )}

      {/* Timeline */}
      {!loading && months.length > 0 && (
        <div>
          {months.map((monthData) => (
            <MonthRow key={monthData.month} monthData={monthData} metadata={metadata} />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Month Row ---

function MonthRow({
  monthData,
  metadata,
}: {
  monthData: MosaicMonth;
  metadata: Record<string, TrackMetadata>;
}) {
  return (
    <div className="border-strata-border flex items-start gap-4 border-b py-4">
      <div className="text-strata-slate-500 w-20 shrink-0 pt-2 font-mono text-sm">
        {formatMonth(monthData.month)}
      </div>
      <div className="flex flex-wrap gap-3">
        {monthData.albums.map((album, i) => {
          const size = i === 0 ? 96 : i === 1 ? 80 : 64;
          const meta = metadata[album.trackSpotifyId];

          return (
            <AlbumTile
              key={`${album.trackSpotifyId}-${album.albumName}`}
              album={album}
              size={size}
              albumArt={meta?.albumArt}
            />
          );
        })}
      </div>
    </div>
  );
}

// --- Album Tile ---

function AlbumTile({
  album,
  size,
  albumArt,
}: {
  album: MosaicAlbum;
  size: number;
  albumArt?: string;
}) {
  return (
    <Link
      to={`/vault?artist=${encodeURIComponent(album.artistName)}${album.albumName ? `&album=${encodeURIComponent(album.albumName)}` : ""}`}
      className="group relative"
    >
      {albumArt ? (
        <img
          src={albumArt}
          alt={album.albumName ?? ""}
          width={size}
          height={size}
          className="rounded-md shadow-md transition-transform group-hover:scale-105"
          loading="lazy"
          style={{ width: size, height: size, objectFit: "cover" }}
        />
      ) : (
        <div
          className="bg-strata-border rounded-md"
          style={{ width: size, height: size }}
        />
      )}
      {/* Tooltip */}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden min-w-40 -translate-x-1/2 rounded-lg bg-zinc-900 px-3 py-2 text-center shadow-lg group-hover:block">
        <p className="truncate text-xs font-medium text-white">
          {album.albumName ?? "Unknown Album"}
        </p>
        <p className="text-strata-slate-400 truncate text-xs">{album.artistName}</p>
        <p className="text-strata-amber-300 mt-1 font-mono text-xs">
          {album.playCount} plays
        </p>
      </div>
    </Link>
  );
}
