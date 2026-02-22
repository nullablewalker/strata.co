/**
 * Listening Autobiography — a narrative page that auto-generates a textual
 * story from the user's entire listening history.
 *
 * The page reads comprehensive stats from /api/vault/autobiography and
 * renders them as a series of styled prose sections that scroll vertically,
 * creating a reading experience reminiscent of a personal essay.
 */
import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

// --- Types ---

interface AutobiographyData {
  overall: {
    totalPlays: number;
    totalMs: number;
    uniqueTracks: number;
    uniqueArtists: number;
    firstPlay: string;
    lastPlay: string;
  };
  topArtists: {
    artistName: string;
    playCount: number;
    msPlayed: number;
  }[];
  topTracks: {
    trackName: string;
    artistName: string;
    playCount: number;
    msPlayed: number;
  }[];
  peakHour: { hour: number; playCount: number } | null;
  peakYear: { year: number; playCount: number; msPlayed: number } | null;
  nightStats: { playCount: number } | null;
  nightArtist: { artistName: string; playCount: number } | null;
}

// --- Helpers ---

/** Format milliseconds into hours (rounded down). */
function msToHours(ms: number): number {
  return Math.floor(ms / 3_600_000);
}

/** Format milliseconds into days (1 decimal). */
function msToDays(ms: number): string {
  return (ms / 86_400_000).toFixed(1);
}

/** Format a date string as YYYY/MM/DD. */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

/** Generate a time metaphor based on total hours. */
function getMetaphor(hours: number): string {
  // ~14h one-way Tokyo to New York
  const flightHours = 14;
  const roundTrips = Math.floor(hours / (flightHours * 2));
  if (roundTrips >= 1) {
    return `東京からニューヨークへの往復フライト${roundTrips}回分`;
  }
  // ~2h for a feature film
  const movies = Math.floor(hours / 2);
  if (movies >= 1) {
    return `映画${movies}本分`;
  }
  return `数え切れない瞬間の集積`;
}

/** Classify the listener type based on peak hour. */
function getListenerType(hour: number): string {
  if (hour >= 22 || hour <= 4) return "Night Owl";
  if (hour >= 5 && hour <= 9) return "Early Bird";
  if (hour >= 10 && hour <= 17) return "Daytime Listener";
  return "Evening Listener";
}

/** Format hour number as readable string. */
function formatHour(hour: number): string {
  if (hour === 0) return "0:00";
  if (hour < 10) return `${hour}:00`;
  return `${hour}:00`;
}

// --- Hooks ---

/** Animated count-up with ease-out cubic easing. */
function useCountUp(target: number, duration = 1200): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start = performance.now();
    let raf: number;
    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(eased * target));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

// --- Components ---

/** Highlighted name (artist, track). */
function Name({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-strata-amber-300">{children}</span>;
}

/** Highlighted number inline. */
function Num({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-white font-mono">{children}</span>
  );
}

/** Loading skeleton with glass-card wrappers and shimmer effect. */
function Skeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div>
        <div className="h-7 w-56 rounded bg-strata-border/50 shimmer" />
        <div className="mt-2 h-4 w-36 rounded bg-strata-border/30 shimmer" />
      </div>
      {/* Opening card skeleton with stat grid */}
      <div className="glass-card p-6">
        <div className="grid grid-cols-2 gap-4 mb-6">
          {[0, 1].map((i) => (
            <div key={i}>
              <div className="h-3 w-16 rounded bg-strata-border/40 shimmer" />
              <div className="mt-2 h-8 w-24 rounded bg-strata-border/50 shimmer" style={{ animationDelay: `${i * 0.15}s` }} />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <div className="h-4 w-3/4 rounded bg-strata-border/40 shimmer" />
          <div className="h-4 w-2/3 rounded bg-strata-border/30 shimmer" style={{ animationDelay: "0.1s" }} />
        </div>
      </div>
      {/* Generic section skeletons */}
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="glass-card p-6">
          <div className="h-3 w-32 rounded bg-strata-border/40 shimmer" />
          <div className="mt-4 space-y-3">
            <div className="h-4 w-4/5 rounded bg-strata-border/40 shimmer" style={{ animationDelay: `${i * 0.1}s` }} />
            <div className="h-4 w-2/3 rounded bg-strata-border/30 shimmer" style={{ animationDelay: `${i * 0.1 + 0.1}s` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Main Component ---

export default function Autobiography() {
  const [data, setData] = useState<AutobiographyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ data: AutobiographyData }>("/vault/autobiography")
      .then((res) => setData(res.data))
      .catch(() => setError("Failed to load autobiography data."))
      .finally(() => setLoading(false));
  }, []);

  // Always call hooks (pass 0 when no data)
  const animatedTracks = useCountUp(data?.overall.uniqueTracks ?? 0);
  const animatedArtists = useCountUp(data?.overall.uniqueArtists ?? 0);
  const animatedHours = useCountUp(data ? Math.floor(data.overall.totalMs / 3_600_000) : 0);

  if (loading) return <Skeleton />;

  if (error || !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Listening Autobiography</h1>
          <p className="mt-1 text-sm text-strata-slate-400">あなたの音楽的自伝</p>
        </div>
        <div className="glass-card p-12 text-center">
          <p className="text-strata-slate-400">{error ?? "No data available."}</p>
        </div>
      </div>
    );
  }

  const { overall, topArtists, topTracks, peakHour, peakYear, nightStats, nightArtist } = data;
  const totalHours = msToHours(overall.totalMs);
  const totalDays = msToDays(overall.totalMs);
  const nightPercentage =
    overall.totalPlays > 0 && nightStats
      ? ((nightStats.playCount / overall.totalPlays) * 100).toFixed(1)
      : "0";

  return (
    <div className="space-y-6 pb-8">
      {/* Header — matches Dashboard/Heatmap/Patterns pattern */}
      <div>
        <h1 className="text-2xl font-bold text-white">Listening Autobiography</h1>
        <p className="mt-1 text-sm text-strata-slate-400">あなたの音楽的自伝</p>
      </div>

      {/* Section 1: Opening — glass-card depth-ring, stat grid + date prose */}
      <div className="glass-card depth-ring p-6">
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <p className="text-sm text-strata-slate-400">楽曲</p>
            <p className="mt-1 font-mono text-3xl font-bold text-strata-amber-300 amber-glow">
              {animatedTracks.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-strata-slate-400">アーティスト</p>
            <p className="mt-1 font-mono text-3xl font-bold text-strata-amber-300 amber-glow">
              {animatedArtists.toLocaleString()}
            </p>
          </div>
        </div>
        <p className="text-lg text-zinc-300 leading-relaxed">
          あなたの記録には、これだけの音楽が刻まれています。
        </p>
        <p className="mt-4 text-lg text-zinc-300 leading-relaxed">
          最初の記録は<Num>{formatDate(overall.firstPlay)}</Num>。
          最後は<Num>{formatDate(overall.lastPlay)}</Num>。
        </p>
      </div>

      {/* Section 2: Time spent — hero stat centered */}
      <div className="glass-card p-6">
        <div className="text-center mb-6">
          <p className="text-sm text-strata-slate-400">音楽と過ごした時間</p>
          <p className="mt-2 font-mono text-5xl font-bold text-strata-amber-300 amber-glow">
            {animatedHours.toLocaleString()}
          </p>
          <p className="mt-1 text-sm text-strata-slate-500">時間</p>
        </div>
        <p className="text-lg text-zinc-300 leading-relaxed">
          それは約<Num>{totalDays}</Num>日分。
          <Name>{getMetaphor(totalHours)}</Name>に匹敵する時間です。
        </p>
      </div>

      {/* Section 3: Your companion — top artists */}
      {topArtists.length > 0 && (
        <div className="glass-card depth-ring p-6">
          <p className="text-sm text-strata-slate-400 mb-4">最も長い時間をともに過ごしたアーティスト</p>
          <p className="text-2xl font-bold text-strata-amber-300 amber-glow">
            {topArtists[0].artistName}
          </p>
          <p className="mt-2 text-lg text-zinc-300 leading-relaxed">
            <Num>{msToHours(topArtists[0].msPlayed).toLocaleString()}</Num>時間、
            <Num>{topArtists[0].playCount.toLocaleString()}</Num>回の再生。
          </p>
          {topArtists.length >= 3 && (
            <p className="mt-4 text-lg text-zinc-300 leading-relaxed">
              二番手の<Name>{topArtists[1].artistName}</Name>、
              三番手の<Name>{topArtists[2].artistName}</Name>が続きます。
            </p>
          )}
          {topArtists.length === 2 && (
            <p className="mt-4 text-lg text-zinc-300 leading-relaxed">
              二番手に<Name>{topArtists[1].artistName}</Name>が続きます。
            </p>
          )}
        </div>
      )}

      {/* Section 4: Your anthem — top track */}
      {topTracks.length > 0 && (
        <div className="glass-card p-6">
          <p className="text-sm text-strata-slate-400 mb-4">最も繰り返し聴いた曲</p>
          <p className="text-lg text-zinc-300 leading-relaxed">
            <Name>{topTracks[0].trackName}</Name>
            <span className="text-strata-slate-500"> by </span>
            <Name>{topTracks[0].artistName}</Name>
          </p>
          <p className="mt-3 font-mono text-2xl font-bold text-white">
            {topTracks[0].playCount.toLocaleString()}
            <span className="text-sm font-normal text-strata-slate-500 ml-2">回再生</span>
          </p>
          <p className="mt-3 text-lg text-zinc-300 leading-relaxed">
            何度聴いても飽きない一曲。
          </p>
        </div>
      )}

      {/* Section 5: Peak year */}
      {peakYear && (
        <div className="glass-card p-6">
          <p className="text-sm text-strata-slate-400 mb-2">最も濃密な年</p>
          <p className="font-mono text-4xl font-bold text-strata-amber-300 amber-glow">
            {peakYear.year}
          </p>
          <p className="mt-4 text-lg text-zinc-300 leading-relaxed">
            <Num>{peakYear.playCount.toLocaleString()}</Num>回の再生、
            <Num>{msToHours(peakYear.msPlayed).toLocaleString()}</Num>時間の没入。
          </p>
        </div>
      )}

      {/* Section 6: Night — with mini stat grid */}
      {nightArtist && peakHour && (
        <div className="glass-card p-6">
          <p className="text-sm text-strata-slate-400 mb-4">真夜中の音楽</p>
          <p className="text-lg text-zinc-300 leading-relaxed">
            夜の相棒は<Name>{nightArtist.artistName}</Name>でした。
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] px-4 py-3">
              <p className="text-xs text-strata-slate-500">深夜再生率</p>
              <p className="mt-1 font-mono text-xl font-bold text-white">{nightPercentage}%</p>
            </div>
            <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] px-4 py-3">
              <p className="text-xs text-strata-slate-500">ピークタイム</p>
              <p className="mt-1 font-mono text-xl font-bold text-white">{formatHour(peakHour.hour)}</p>
            </div>
          </div>
          <p className="mt-4 text-lg text-zinc-300 leading-relaxed">
            <Name>{getListenerType(peakHour.hour)}</Name>なあなた。
          </p>
        </div>
      )}

      {/* Section 7: Closing — plain centered text, geological signature */}
      <div className="py-8 text-center">
        <p className="text-lg text-zinc-300 leading-relaxed">
          これがあなたの音楽の地層です。
        </p>
        <p className="mt-4 text-lg text-zinc-300 leading-relaxed">
          日々の選曲が、静かに積み重なっていく。
        </p>
        <p className="mt-8 text-xs tracking-wider text-strata-slate-500/50">
          ── あなたの音楽の地層 ──
        </p>
      </div>
    </div>
  );
}
