/**
 * Dashboard page — the first screen users see after login.
 *
 * Adapts its content based on whether the user has imported any listening data:
 *   - With data: shows Time Capsule (tracks from this day in past years),
 *     summary stats (tracks, artists, hours), quick-nav cards linking to
 *     Vault, Heatmap, and Patterns, Dormant Artists, and the Drift Report.
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

interface TimeCapsuleTrack {
  trackName: string;
  artistName: string;
  albumName: string | null;
  trackSpotifyId: string;
  msPlayed: number;
  playedAt: string;
}

interface TimeCapsuleYear {
  yearsAgo: number;
  date: string;
  tracks: TimeCapsuleTrack[];
}

interface DormantArtist {
  artistName: string;
  totalMsPlayed: number;
  playCount: number;
  lastPlayed: string;
}

interface DriftArtist {
  artistName: string;
  playCount: number;
  msPlayed: number;
}

interface DriftMonthStats {
  totalPlays: number;
  totalMs: number;
  uniqueArtists: number;
  uniqueTracks: number;
}

interface DriftReport {
  currentMonth: string;
  prevMonth: string;
  current: { artists: DriftArtist[]; stats: DriftMonthStats };
  previous: { artists: DriftArtist[]; stats: DriftMonthStats };
  rising: DriftArtist[];
  fading: DriftArtist[];
}

/**
 * Format a YYYY-MM string into Japanese locale month display.
 * e.g. "2026-02" -> "2026年2月"
 */
function formatMonthJa(ym: string): string {
  const [year, month] = ym.split("-");
  return `${year}年${Number(month)}月`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [drift, setDrift] = useState<DriftReport | null>(null);
  // null = unknown (loading), true/false = resolved.
  // This three-state approach prevents flashing the wrong UI during fetch.
  const [hasHistory, setHasHistory] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [capsules, setCapsules] = useState<TimeCapsuleYear[]>([]);
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

    // Fetch time capsule data independently
    apiFetch<ApiResponse<TimeCapsuleYear[]>>("/vault/time-capsule")
      .then((res) => {
        setCapsules(res.data);
      })
      .catch(() => {
        // Silently ignore — capsule is optional
      });
  }, []);

  // Fetch drift report only when we know the user has data
  useEffect(() => {
    if (hasHistory) {
      apiFetch<ApiResponse<DriftReport>>("/vault/drift-report")
        .then((res) => setDrift(res.data))
        .catch(() => {
          // Non-critical — silently ignore drift report failures
        });
    }
  }, [hasHistory]);

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
          {/* Time Capsule */}
          {capsules.length > 0 && <TimeCapsule capsules={capsules} />}

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

          {/* Drift Report */}
          {drift && <DriftReportCard drift={drift} />}
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const YEAR_LABELS: Record<number, string> = {
  1: "1年前の今日",
  2: "2年前の今日",
  3: "3年前の今日",
  4: "4年前の今日",
  5: "5年前の今日",
};

/** Max tracks to display per year before showing "+N more" */
const DISPLAY_LIMIT = 5;

/** "What you were listening to on this day" section. */
function TimeCapsule({ capsules }: { capsules: TimeCapsuleYear[] }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-white">
        あの日のあなた
      </h2>
      <p className="mt-1 text-sm text-strata-slate-500">
        What you were listening to on this day
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {capsules.map((capsule) => (
          <TimeCapsuleCard key={capsule.yearsAgo} capsule={capsule} />
        ))}
      </div>
    </section>
  );
}

/** A single year's capsule card. */
function TimeCapsuleCard({ capsule }: { capsule: TimeCapsuleYear }) {
  const { yearsAgo, date, tracks } = capsule;
  const displayTracks = tracks.slice(0, DISPLAY_LIMIT);
  const remaining = tracks.length - DISPLAY_LIMIT;

  return (
    <div className="rounded-lg border border-strata-border bg-strata-surface p-5">
      {/* Header */}
      <div className="mb-3 flex items-baseline justify-between">
        <span className="font-mono text-sm text-amber-300">
          {YEAR_LABELS[yearsAgo] ?? `${yearsAgo}年前の今日`}
        </span>
        <span className="font-mono text-xs text-strata-slate-500">{date}</span>
      </div>

      {/* Track list */}
      <ul className="space-y-1.5">
        {displayTracks.map((t, i) => (
          <li key={`${t.trackSpotifyId}-${i}`} className="leading-tight">
            <span className="text-sm text-white">{t.trackName}</span>
            <span className="ml-1.5 text-xs text-zinc-400">
              {t.artistName}
            </span>
          </li>
        ))}
      </ul>

      {remaining > 0 && (
        <p className="mt-2 text-xs text-strata-slate-500">
          他{remaining}曲
        </p>
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

/**
 * Inline change indicator showing an up/down arrow with the delta value.
 * Positive changes render in green, negative in red, zero in muted grey.
 */
function ChangeIndicator({
  current,
  previous,
  formatter,
}: {
  current: number;
  previous: number;
  formatter?: (v: number) => string;
}) {
  const diff = current - previous;
  const fmt = formatter ?? ((v: number) => Math.abs(v).toLocaleString());

  if (diff === 0 || (previous === 0 && current === 0)) {
    return <span className="text-xs text-zinc-500">--</span>;
  }

  if (diff > 0) {
    return (
      <span className="text-xs text-green-400">
        {"▲ "}{fmt(diff)}
      </span>
    );
  }

  return (
    <span className="text-xs text-red-400">
      {"▼ "}{fmt(diff)}
    </span>
  );
}

/**
 * Drift Report card — monthly narrative showing how the user's musical
 * gravity shifted between the previous and current month.
 */
function DriftReportCard({ drift }: { drift: DriftReport }) {
  const { current, previous, rising, fading, currentMonth, prevMonth } = drift;
  const cs = current.stats;
  const ps = previous.stats;

  const hasCurrentData = Number(cs.totalPlays) > 0;
  const hasPrevData = Number(ps.totalPlays) > 0;

  return (
    <div className="mt-8 rounded-lg border border-strata-border bg-strata-surface p-6">
      {/* Header */}
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-strata-amber-300">
          今月のドリフト
        </h2>
        <p className="mt-0.5 text-sm text-strata-slate-500">
          {formatMonthJa(prevMonth)} → {formatMonthJa(currentMonth)}
        </p>
      </div>

      {!hasCurrentData && !hasPrevData ? (
        <p className="text-sm text-strata-slate-500">
          直近2ヶ月のデータがまだありません。再生履歴がたまるとドリフトレポートが表示されます。
        </p>
      ) : !hasCurrentData ? (
        <p className="text-sm text-strata-slate-500">
          今月の再生データがまだありません。音楽を聴くとレポートが更新されます。
        </p>
      ) : (
        <>
          {/* Stats comparison grid */}
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <DriftStat
              label="再生回数"
              current={Number(cs.totalPlays)}
              previous={Number(ps.totalPlays)}
            />
            <DriftStat
              label="時間"
              current={Number(cs.totalMs)}
              previous={Number(ps.totalMs)}
              formatter={(v) =>
                `${Math.abs(Math.floor(v / 3_600_000))}h`
              }
              displayValue={`${Math.floor(Number(cs.totalMs) / 3_600_000)}h`}
            />
            <DriftStat
              label="アーティスト数"
              current={Number(cs.uniqueArtists)}
              previous={Number(ps.uniqueArtists)}
            />
            <DriftStat
              label="楽曲数"
              current={Number(cs.uniqueTracks)}
              previous={Number(ps.uniqueTracks)}
            />
          </div>

          {/* Rising & Fading artists */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Rising */}
            <div>
              <h3 className="mb-2 text-sm font-medium text-strata-amber-300">
                浮上中
              </h3>
              {rising.length === 0 ? (
                <p className="text-xs text-strata-slate-500">
                  新たに浮上したアーティストはありません
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {rising.map((a) => (
                    <li
                      key={a.artistName}
                      className="flex items-center justify-between rounded bg-amber-950/20 px-3 py-1.5"
                    >
                      <span className="text-sm text-white">
                        {a.artistName}
                      </span>
                      <span className="text-xs text-strata-amber-300">
                        {Number(a.playCount)} plays
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Fading */}
            <div>
              <h3 className="mb-2 text-sm font-medium text-zinc-400">
                沈降中
              </h3>
              {fading.length === 0 ? (
                <p className="text-xs text-strata-slate-500">
                  沈降したアーティストはありません
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {fading.map((a) => (
                    <li
                      key={a.artistName}
                      className="flex items-center justify-between rounded bg-zinc-800/30 px-3 py-1.5"
                    >
                      <span className="text-sm text-zinc-400">
                        {a.artistName}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {Number(a.playCount)} plays
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** A single stat cell inside the Drift Report comparison grid. */
function DriftStat({
  label,
  current,
  previous,
  formatter,
  displayValue,
}: {
  label: string;
  current: number;
  previous: number;
  formatter?: (v: number) => string;
  displayValue?: string;
}) {
  return (
    <div className="rounded border border-strata-border bg-strata-bg/50 px-3 py-2.5">
      <p className="text-xs text-strata-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-white">
        {displayValue ?? current.toLocaleString()}
      </p>
      <ChangeIndicator
        current={current}
        previous={previous}
        formatter={formatter}
      />
    </div>
  );
}
