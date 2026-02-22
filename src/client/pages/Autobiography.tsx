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

// --- Components ---

/** A single narrative section with spacing and optional divider. */
function Section({
  children,
  showDivider = true,
}: {
  children: React.ReactNode;
  showDivider?: boolean;
}) {
  return (
    <section className="py-12">
      {children}
      {showDivider && (
        <div className="mt-12 border-b border-strata-border" />
      )}
    </section>
  );
}

/** Highlighted stat value. */
function Stat({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-3xl font-bold text-strata-amber-300 font-mono">
      {children}
    </span>
  );
}

/** Highlighted name (artist, track). */
function Name({ children }: { children: React.ReactNode }) {
  return <span className="text-strata-amber-300">{children}</span>;
}

/** Highlighted number inline. */
function Num({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-white font-mono">{children}</span>
  );
}

/** Loading skeleton lines. */
function Skeleton() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 space-y-8">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <div className="h-4 w-3/4 animate-pulse rounded bg-strata-border" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-strata-border" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-strata-border" />
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

  if (loading) return <Skeleton />;

  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-strata-slate-400">
          {error ?? "No data available."}
        </p>
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
    <div className="mx-auto max-w-2xl px-6 py-8">
      {/* Page header */}
      <header className="pb-8 border-b border-strata-border">
        <h1 className="text-3xl font-bold text-white">
          Listening Autobiography
        </h1>
        <p className="mt-2 text-lg text-strata-slate-400">
          あなたの音楽的自伝
        </p>
      </header>

      {/* Section 1: Opening */}
      <Section>
        <p className="text-lg text-zinc-300 leading-relaxed">
          あなたの記録には<Stat>{overall.uniqueTracks.toLocaleString()}</Stat>曲、
          <Stat>{overall.uniqueArtists.toLocaleString()}</Stat>人のアーティストが刻まれています。
        </p>
        <p className="mt-6 text-lg text-zinc-300 leading-relaxed">
          最初の記録は<Num>{formatDate(overall.firstPlay)}</Num>。
          最後は<Num>{formatDate(overall.lastPlay)}</Num>。
        </p>
      </Section>

      {/* Section 2: Time spent */}
      <Section>
        <p className="text-lg text-zinc-300 leading-relaxed">
          あなたは音楽と共に、合計<Stat>{totalHours.toLocaleString()}</Stat>時間を過ごしました。
        </p>
        <p className="mt-6 text-lg text-zinc-300 leading-relaxed">
          それは約<Num>{totalDays}</Num>日分。
          <Name>{getMetaphor(totalHours)}</Name>に匹敵する時間です。
        </p>
      </Section>

      {/* Section 3: Your companion */}
      {topArtists.length > 0 && (
        <Section>
          <p className="text-lg text-zinc-300 leading-relaxed">
            最も長い時間をともに過ごしたのは<Name>{topArtists[0].artistName}</Name>。
          </p>
          <p className="mt-6 text-lg text-zinc-300 leading-relaxed">
            <Num>{msToHours(topArtists[0].msPlayed).toLocaleString()}</Num>時間、
            <Num>{topArtists[0].playCount.toLocaleString()}</Num>回の再生。
          </p>
          {topArtists.length >= 3 && (
            <p className="mt-6 text-lg text-zinc-300 leading-relaxed">
              二番手の<Name>{topArtists[1].artistName}</Name>、
              三番手の<Name>{topArtists[2].artistName}</Name>が続きます。
            </p>
          )}
          {topArtists.length === 2 && (
            <p className="mt-6 text-lg text-zinc-300 leading-relaxed">
              二番手に<Name>{topArtists[1].artistName}</Name>が続きます。
            </p>
          )}
        </Section>
      )}

      {/* Section 4: Your anthem */}
      {topTracks.length > 0 && (
        <Section>
          <p className="text-lg text-zinc-300 leading-relaxed">
            最も繰り返し聴いた曲は
            <Name>{topTracks[0].trackName}</Name> by <Name>{topTracks[0].artistName}</Name>。
          </p>
          <p className="mt-6 text-lg text-zinc-300 leading-relaxed">
            <Num>{topTracks[0].playCount.toLocaleString()}</Num>回。何度聴いても飽きない一曲。
          </p>
        </Section>
      )}

      {/* Section 5: Your peak */}
      {peakYear && (
        <Section>
          <p className="text-lg text-zinc-300 leading-relaxed">
            <Stat>{peakYear.year}</Stat>年はあなたにとって最も濃密な年でした。
          </p>
          <p className="mt-6 text-lg text-zinc-300 leading-relaxed">
            <Num>{peakYear.playCount.toLocaleString()}</Num>回の再生、
            <Num>{msToHours(peakYear.msPlayed).toLocaleString()}</Num>時間の没入。
          </p>
        </Section>
      )}

      {/* Section 6: Night */}
      {nightArtist && peakHour && (
        <Section>
          <p className="text-lg text-zinc-300 leading-relaxed">
            真夜中の音楽はいつも<Name>{nightArtist.artistName}</Name>でした。
          </p>
          <p className="mt-6 text-lg text-zinc-300 leading-relaxed">
            深夜の再生は全体の<Num>{nightPercentage}%</Num>。
          </p>
          <p className="mt-6 text-lg text-zinc-300 leading-relaxed">
            <Name>{getListenerType(peakHour.hour)}</Name>なあなたのピークタイムは
            <Num>{formatHour(peakHour.hour)}</Num>。
          </p>
        </Section>
      )}

      {/* Section 7: Closing */}
      <section className="py-12">
        <p className="text-lg text-zinc-300 leading-relaxed">
          これがあなたの音楽の地層です。
        </p>
        <p className="mt-6 text-lg text-zinc-300 leading-relaxed">
          日々の選曲が、静かに積み重なっていく。
        </p>
      </section>
    </div>
  );
}
