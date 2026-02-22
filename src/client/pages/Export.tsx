/**
 * Export Dossier — Annual listening summary infographic.
 *
 * Renders a beautifully styled card summarising the user's listening year:
 * total plays, hours, unique tracks/artists, top 5 artists & tracks, monthly
 * activity bar chart, and peak listening hour.
 *
 * The card is designed to look good as a screenshot. A "Print / Save" button
 * triggers `window.print()` with print-friendly styling so the user can save
 * the card as a PDF or image via the browser's native print dialog.
 */
import { useEffect, useState, useRef } from "react";
import { apiFetch } from "../lib/api";

interface AnnualSummary {
  year: number;
  stats: {
    totalPlays: number;
    totalMs: number;
    uniqueTracks: number;
    uniqueArtists: number;
  };
  topArtists: { artistName: string; playCount: number; msPlayed: number }[];
  topTracks: { trackName: string; artistName: string; playCount: number }[];
  monthlyPlays: { month: number; playCount: number }[];
  peakHour: { hour: number; playCount: number } | null;
  availableYears: number[];
}

const MONTH_LABELS = [
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

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

export default function Export() {
  const [data, setData] = useState<AnnualSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch<{ data: AnnualSummary }>(`/vault/annual-summary?year=${year}`)
      .then((res) => {
        setData(res.data);
        if (res.data.availableYears.length > 0) {
          setAvailableYears(res.data.availableYears);
        }
      })
      .catch(() => {
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [year]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-strata-amber-300 border-t-transparent" />
      </div>
    );
  }

  if (!data || data.stats.totalPlays === 0) {
    return (
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-2xl font-bold">Export Dossier</h1>
        <p className="mt-4 text-strata-slate-400">
          {year}年のリスニングデータがありません。
        </p>
        {availableYears.length > 0 && (
          <div className="mt-4">
            <p className="text-sm text-strata-slate-500">
              データのある年を選択:
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {availableYears.map((y) => (
                <button
                  key={y}
                  onClick={() => setYear(y)}
                  className="rounded-md border border-strata-border px-3 py-1 text-sm text-strata-slate-400 transition-colors hover:border-strata-amber-500/30 hover:text-white"
                >
                  {y}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const { stats, topArtists, topTracks, monthlyPlays, peakHour } = data;
  const totalHours = Math.floor(stats.totalMs / 3_600_000);
  const maxPlays = Math.max(...monthlyPlays.map((m) => m.playCount), 1);

  return (
    <div className="mx-auto max-w-lg">
      {/* Year selector — outside the printable card */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-bold">Export Dossier</h1>
        {availableYears.length > 1 && (
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-md border border-strata-border bg-strata-surface px-3 py-1.5 text-sm text-white focus:border-strata-amber-500 focus:outline-none"
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Exportable card */}
      <div
        ref={cardRef}
        id="strata-dossier"
        className="mx-auto max-w-md rounded-2xl border border-strata-border bg-strata-surface p-8 space-y-8 print:border-none print:shadow-none"
      >
        {/* Header */}
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-zinc-500">
            Strata Annual Report
          </p>
          <p className="mt-2 font-mono text-5xl font-bold text-amber-300">
            {year}
          </p>
        </div>

        {/* Big stats */}
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="font-mono text-3xl font-bold text-white">
              {stats.totalPlays.toLocaleString()}
            </p>
            <p className="text-xs text-zinc-500">Plays</p>
          </div>
          <div>
            <p className="font-mono text-3xl font-bold text-white">
              {totalHours.toLocaleString()}h
            </p>
            <p className="text-xs text-zinc-500">Hours</p>
          </div>
          <div>
            <p className="font-mono text-3xl font-bold text-white">
              {stats.uniqueTracks.toLocaleString()}
            </p>
            <p className="text-xs text-zinc-500">Unique Tracks</p>
          </div>
          <div>
            <p className="font-mono text-3xl font-bold text-white">
              {stats.uniqueArtists.toLocaleString()}
            </p>
            <p className="text-xs text-zinc-500">Artists</p>
          </div>
        </div>

        {/* Top 5 Artists */}
        {topArtists.length > 0 && (
          <div>
            <p className="mb-3 text-xs uppercase tracking-wider text-zinc-500">
              Top Artists
            </p>
            {topArtists.map((a, i) => (
              <div
                key={a.artistName}
                className="flex items-center gap-3 py-1.5"
              >
                <span className="w-6 font-mono text-lg font-bold text-amber-300">
                  {i + 1}
                </span>
                <span className="flex-1 truncate text-sm text-white">
                  {a.artistName}
                </span>
                <span className="font-mono text-xs text-zinc-500">
                  {a.playCount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Top 5 Tracks */}
        {topTracks.length > 0 && (
          <div>
            <p className="mb-3 text-xs uppercase tracking-wider text-zinc-500">
              Top Tracks
            </p>
            {topTracks.map((t, i) => (
              <div
                key={`${t.trackName}-${t.artistName}`}
                className="flex items-center gap-3 py-1.5"
              >
                <span className="w-6 font-mono text-lg font-bold text-amber-300">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">{t.trackName}</p>
                  <p className="truncate text-xs text-zinc-400">
                    {t.artistName}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Monthly mini bar chart */}
        <div>
          <p className="mb-3 text-xs uppercase tracking-wider text-zinc-500">
            Monthly Activity
          </p>
          <div className="flex h-16 items-end gap-1">
            {monthlyPlays.map((m) => {
              const height =
                maxPlays > 0 ? (m.playCount / maxPlays) * 100 : 0;
              return (
                <div
                  key={m.month}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <div
                    className="w-full rounded-sm bg-amber-500"
                    style={{ height: `${height}%`, minHeight: m.playCount > 0 ? "2px" : "0px" }}
                  />
                  <span className="text-[8px] text-zinc-600">
                    {MONTH_LABELS[m.month - 1]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Peak hour */}
        {peakHour && (
          <div className="text-center">
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              Peak Listening Hour
            </p>
            <p className="mt-1 font-mono text-lg font-bold text-amber-300">
              {formatHour(peakHour.hour)}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-strata-border pt-4 text-center">
          <p className="text-xs text-zinc-600">Generated by Strata</p>
        </div>
      </div>

      {/* Actions — outside the card, hidden in print */}
      <div className="mt-6 space-y-3 text-center print:hidden">
        <button
          onClick={handlePrint}
          className="rounded-lg bg-strata-amber-500 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-strata-amber-400"
        >
          Print / Save as PDF
        </button>
        <p className="text-xs text-strata-slate-500">
          You can also take a screenshot of the card above to save as an image.
        </p>
      </div>
    </div>
  );
}
