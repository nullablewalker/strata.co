import { useRef, useCallback } from "react";

interface ColumnBrowserProps {
  genres: string[];
  artists: string[];
  albums: string[];
  selectedGenre: string | null;
  selectedArtist: string | null;
  selectedAlbum: string | null;
  onGenreSelect: (genre: string | null) => void;
  onArtistSelect: (artist: string | null) => void;
  onAlbumSelect: (album: string | null) => void;
  loading?: boolean;
}

function BrowserColumn({
  title,
  items,
  selected,
  onSelect,
  loading,
}: {
  title: string;
  items: string[];
  selected: string | null;
  onSelect: (item: string | null) => void;
  loading?: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Type-to-jump: find first item starting with typed letter
      if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
        const char = e.key.toLowerCase();
        const match = items.find((item) => item.toLowerCase().startsWith(char));
        if (match && listRef.current) {
          onSelect(match);
          // Scroll to the matched item
          const index = items.indexOf(match);
          const itemEl = listRef.current.children[index + 1] as HTMLElement; // +1 for "All" row
          if (itemEl) {
            itemEl.scrollIntoView({ block: "nearest" });
          }
        }
      }
    },
    [items, onSelect],
  );

  return (
    <div className="border-white/[0.04] bg-white/[0.02] flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border">
      {/* Header */}
      <div className="border-white/[0.04] bg-white/[0.03] border-b px-3 py-2">
        <span className="text-strata-slate-400 text-xs font-medium tracking-wide uppercase">
          {title}
        </span>
      </div>

      {/* Scrollable list */}
      <div
        ref={listRef}
        className="bg-white/[0.02] max-h-[200px] overflow-y-auto"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {loading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-strata-border/50 h-6 shimmer rounded" />
            ))}
          </div>
        ) : (
          <>
            {/* "All" option */}
            <button
              onClick={() => onSelect(null)}
              className={`w-full px-3 py-1.5 text-left text-sm transition-colors ${
                selected === null
                  ? "bg-strata-amber-500/20 text-strata-amber-300 font-medium"
                  : "text-strata-slate-400 hover:bg-strata-border/30 hover:text-white"
              }`}
            >
              All ({items.length})
            </button>

            {items.map((item) => (
              <button
                key={item}
                onClick={() => onSelect(item)}
                className={`w-full truncate px-3 py-1.5 text-left text-sm transition-colors ${
                  selected === item
                    ? "bg-strata-amber-500/20 text-strata-amber-300 font-medium"
                    : "hover:bg-strata-border/30 text-white"
                }`}
                title={item}
              >
                {item}
              </button>
            ))}

            {items.length === 0 && !loading && (
              <div className="text-strata-slate-500 px-3 py-4 text-center text-xs">No items</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function ColumnBrowser({
  genres,
  artists,
  albums,
  selectedGenre,
  selectedArtist,
  selectedAlbum,
  onGenreSelect,
  onArtistSelect,
  onAlbumSelect,
  loading,
}: ColumnBrowserProps) {
  return (
    <div className="flex gap-2">
      <BrowserColumn
        title="Genre"
        items={genres}
        selected={selectedGenre}
        onSelect={onGenreSelect}
        loading={loading}
      />
      <BrowserColumn
        title="Artist"
        items={artists}
        selected={selectedArtist}
        onSelect={onArtistSelect}
      />
      <BrowserColumn
        title="Album"
        items={albums}
        selected={selectedAlbum}
        onSelect={onAlbumSelect}
      />
    </div>
  );
}
