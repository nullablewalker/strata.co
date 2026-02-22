/**
 * Fandom Heatmap page — GitHub-contribution-graph-style visualization of
 * daily listening intensity across a calendar year.
 *
 * Renders a D3.js SVG grid where each cell represents one day, colored by
 * play count using a warm-tone palette (beige to deep amber to rust). The
 * chart supports year selection and per-artist filtering, plus a tooltip
 * showing exact play count and listening time on hover.
 *
 * Layout: 7 rows (Sun-Sat) x ~52 columns (weeks), with month and day-of-week
 * labels, matching the familiar GitHub "grass" contribution graph.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { apiFetch } from "../lib/api";

interface HeatmapDay {
  date: string;
  count: number;
  msPlayed: number;
}

interface HeatmapArtist {
  artistName: string;
  totalPlays: number;
}

interface ObsessionMonth {
  month: string;
  playCount: number;
  msPlayed: number;
  trackCount: number;
}

interface ObsessionData {
  artist: string;
  months: ObsessionMonth[];
}

interface HeatmapSummary {
  totalPlays: number;
  activeDays: number;
  longestStreak: number;
  mostActiveDay: { date: string; count: number } | null;
  averageDailyPlays: number;
}

interface SilencePeriod {
  startDate: string;
  endDate: string;
  days: number;
  lastTrackBefore: { trackName: string; artistName: string } | null;
  firstTrackAfter: { trackName: string; artistName: string } | null;
}

interface SilenceData {
  silences: SilencePeriod[];
  totalSilentDays: number;
}

interface DayTrack {
  trackName: string;
  artistName: string;
  albumName: string | null;
  trackSpotifyId: string;
  msPlayed: number;
  playedAt: string;
}

// --- Chart layout constants ---
// Each day is a small square; CELL_STEP includes the gap between cells.
const CELL_SIZE = 12;
const CELL_GAP = 2;
const CELL_STEP = CELL_SIZE + CELL_GAP;
// Extra space around the grid for axis labels.
const MARGIN = { top: 24, right: 16, bottom: 8, left: 32 };
// Only odd-indexed days (Mon, Wed, Fri) get labels to avoid crowding.
const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Warm-tone heat palette — from dark background (no plays) through pale
// beige, amber, to deep rust-brown (highest intensity). Designed to evoke
// geological strata layers, matching the app's visual identity.
const HEAT_COLORS = [
  "#1a1a1a", // heat-0: no plays
  "#fdf8ef", // heat-1
  "#e8c88c", // heat-2
  "#d4a04a", // heat-3
  "#a66b1f", // heat-4
  "#8b3a1f", // heat-5
];

// --- Obsession Curve chart constants ---
const OC_AMBER_300 = "#d4a04a";
const OC_AMBER_200 = "#e8c88c";
const OC_AMBER_500 = "#a66b1f";
const OC_SURFACE = "#1a1a1a";
const OC_BORDER = "#2a2a2a";
const OC_SLATE_400 = "#8b9eac";
const OC_CHART_MARGIN = { top: 20, right: 20, bottom: 40, left: 50 };

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatMinutes(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
}

export default function Heatmap() {
  // Refs for imperative D3 rendering (D3 manages the SVG DOM directly,
  // outside of React's virtual DOM).
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const [year, setYear] = useState(new Date().getUTCFullYear());
  const [artist, setArtist] = useState<string>("");
  const [data, setData] = useState<HeatmapDay[]>([]);
  const [artists, setArtists] = useState<HeatmapArtist[]>([]);
  const [summary, setSummary] = useState<HeatmapSummary | null>(null);
  const [silenceData, setSilenceData] = useState<SilenceData | null>(null);
  const [obsessionData, setObsessionData] = useState<ObsessionData | null>(null);
  const [selectedDay, setSelectedDay] = useState<{ date: string; count: number } | null>(null);
  const [dayTracks, setDayTracks] = useState<DayTrack[]>([]);
  const [dayLoading, setDayLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Generate a descending year list (current year → 2010) for the selector.
  // Most users care about recent years, so the first 5 are shown as buttons
  // and older years are tucked into a "More" dropdown.
  const currentYear = new Date().getUTCFullYear();
  const years = Array.from({ length: currentYear - 2009 }, (_, i) => currentYear - i);

  // Fetch the full artist list once on mount to populate the filter dropdown.
  // This is a lightweight call that returns just names + total plays.
  useEffect(() => {
    apiFetch<{ data: HeatmapArtist[] }>("/heatmap/artists")
      .then((res) => setArtists(res.data))
      .catch(() => {});
  }, []);

  // Fetch day-by-day heatmap data and summary stats whenever the user
  // changes the year or artist filter. Both requests are fired in parallel.
  useEffect(() => {
    setLoading(true);
    setError(null);
    setSelectedDay(null);

    const params = new URLSearchParams({ year: String(year) });
    if (artist) params.set("artist", artist);
    const qs = `?${params.toString()}`;

    // Silence data is only fetched for "All Artists" (no artist filter)
    // since silences are a whole-library concept.
    const silencePromise = artist
      ? Promise.resolve(null)
      : apiFetch<{ data: SilenceData }>(`/heatmap/silences?year=${year}`).catch(() => null);

    Promise.all([
      apiFetch<{ data: HeatmapDay[] }>(`/heatmap/data${qs}`),
      apiFetch<{ data: HeatmapSummary }>(`/heatmap/summary${qs}`),
      silencePromise,
    ])
      .then(([dataRes, summaryRes, silenceRes]) => {
        setData(dataRes.data);
        setSummary(summaryRes.data);
        setSilenceData(silenceRes?.data ?? null);
      })
      .catch(() => setError("Failed to load heatmap data"))
      .finally(() => setLoading(false));
  }, [year, artist]);

  // Fetch Obsession Curve data when an artist is selected.
  // This runs independently of the heatmap data fetch because it spans
  // the artist's entire history (not scoped to a single year).
  useEffect(() => {
    if (!artist) {
      setObsessionData(null);
      return;
    }
    const params = new URLSearchParams({ artist });
    apiFetch<{ data: ObsessionData }>(`/heatmap/obsession?${params.toString()}`)
      .then((res) => setObsessionData(res.data))
      .catch(() => setObsessionData(null));
  }, [artist]);

  // --- D3 heatmap rendering ---
  // This callback imperatively builds the SVG grid. It is called via useEffect
  // whenever the data or year changes. D3 manages the SVG directly because the
  // grid can contain 365+ rect elements, and D3's data-join is more efficient
  // than React's reconciliation for this kind of bulk SVG generation.
  const renderHeatmap = useCallback(() => {
    const svg = d3.select(svgRef.current);
    // Clear previous render before rebuilding (simpler than diffing).
    svg.selectAll("*").remove();

    if (!data || data.length === 0) return;

    // Index API data by date string for O(1) lookups while building the grid.
    const dataMap = new Map(data.map((d) => [d.date, d]));

    // Build a full calendar array for the selected year. For the current year,
    // stop at today rather than showing future empty cells.
    const startDate = new Date(Date.UTC(year, 0, 1));
    const endDate = new Date(Date.UTC(year + 1, 0, 1));
    const now = new Date();
    const lastDate = year === currentYear && now < endDate ? now : new Date(endDate.getTime() - 86400000);

    const allDays: { date: Date; count: number; msPlayed: number }[] = [];
    const d = new Date(startDate);
    while (d <= lastDate) {
      const dateStr = d.toISOString().slice(0, 10);
      const entry = dataMap.get(dateStr);
      allDays.push({
        date: new Date(d),
        count: entry?.count ?? 0,
        msPlayed: entry?.msPlayed ?? 0,
      });
      d.setUTCDate(d.getUTCDate() + 1);
    }

    // Color scale — uses quantile thresholds on non-zero counts so the palette
    // adapts to the user's actual listening range. A user who averages 5 plays/day
    // and one who averages 50 both get a meaningful color spread.
    const nonZeroCounts = allDays.filter((d) => d.count > 0).map((d) => d.count).sort((a, b) => a - b);
    const colorScale =
      nonZeroCounts.length > 0
        ? d3
            .scaleThreshold<number, string>()
            .domain([0.25, 0.5, 0.75, 0.9].map((p) => d3.quantile(nonZeroCounts, p) ?? 1))
            .range(HEAT_COLORS.slice(1))
        : () => HEAT_COLORS[0];

    const getColor = (count: number) => (count === 0 ? HEAT_COLORS[0] : colorScale(count));

    // Grid layout: weeks run left-to-right (columns), days-of-week top-to-bottom
    // (rows). startDay offset ensures Jan 1 lands in the correct row.
    const startDay = startDate.getUTCDay();
    const totalWeeks = Math.ceil((allDays.length + startDay) / 7);

    const width = MARGIN.left + totalWeeks * CELL_STEP + MARGIN.right;
    const height = MARGIN.top + 7 * CELL_STEP + MARGIN.bottom;

    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height);

    const g = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

    // Day-of-week labels along the left edge (only Mon, Wed, Fri to avoid clutter).
    DAY_LABELS.forEach((label, i) => {
      if (label) {
        g.append("text")
          .attr("x", -4)
          .attr("y", i * CELL_STEP + CELL_SIZE * 0.8)
          .attr("text-anchor", "end")
          .attr("font-size", "9px")
          .attr("fill", "#6b7f8d")
          .text(label);
      }
    });

    // Month labels along the top — positioned at the week where each month begins.
    const monthPositions: { month: number; week: number }[] = [];
    let prevMonth = -1;
    allDays.forEach((day, i) => {
      const month = day.date.getUTCMonth();
      if (month !== prevMonth) {
        const weekIndex = Math.floor((i + startDay) / 7);
        monthPositions.push({ month, week: weekIndex });
        prevMonth = month;
      }
    });

    monthPositions.forEach(({ month, week }) => {
      g.append("text")
        .attr("x", week * CELL_STEP)
        .attr("y", -6)
        .attr("font-size", "9px")
        .attr("fill", "#6b7f8d")
        .text(MONTH_LABELS[month]);
    });

    // Day cells — one rect per day, positioned by week (column) and day-of-week (row).
    const tooltip = d3.select(tooltipRef.current);

    g.selectAll("rect.day")
      .data(allDays)
      .enter()
      .append("rect")
      .attr("class", "day")
      .attr("x", (_, i) => Math.floor((i + startDay) / 7) * CELL_STEP)
      .attr("y", (_, i) => ((i + startDay) % 7) * CELL_STEP)
      .attr("width", CELL_SIZE)
      .attr("height", CELL_SIZE)
      .attr("rx", 2)
      .attr("fill", (d) => getColor(d.count))
      .style("cursor", "pointer")
      // Tooltip follows the cursor and shows play count + listening time.
      // Positioned via page coordinates (fixed div) rather than SVG elements
      // to avoid clipping issues inside the scrollable container.
      .on("mouseenter", (event, d) => {
        tooltip
          .style("display", "block")
          .style("left", `${event.pageX + 12}px`)
          .style("top", `${event.pageY - 12}px`);
        const dateStr = formatDate(d.date);
        const countStr = d.count === 0 ? "No plays" : `${d.count} play${d.count > 1 ? "s" : ""}`;
        const timeStr = d.msPlayed > 0 ? ` (${formatMinutes(d.msPlayed)})` : "";
        tooltip.html(`<div class="text-xs font-medium text-white">${countStr}${timeStr}</div><div class="text-xs text-strata-slate-400 mt-0.5">${dateStr}</div>`);
      })
      .on("mousemove", (event) => {
        tooltip
          .style("left", `${event.pageX + 12}px`)
          .style("top", `${event.pageY - 12}px`);
      })
      .on("mouseleave", () => {
        tooltip.style("display", "none");
      })
      .on("click", (_event, d) => {
        if (d.count === 0) return;
        const dateStr = d.date.toISOString().slice(0, 10);
        setSelectedDay({ date: dateStr, count: d.count });
        setDayLoading(true);
        apiFetch<{ data: DayTrack[] }>(`/heatmap/day?date=${dateStr}`)
          .then((res) => setDayTracks(res.data))
          .catch(() => setDayTracks([]))
          .finally(() => setDayLoading(false));
      });
  }, [data, year, currentYear]);

  // Trigger D3 rendering after data finishes loading without errors.
  useEffect(() => {
    if (!loading && !error) {
      renderHeatmap();
    }
  }, [loading, error, renderHeatmap]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Fandom Heatmap</h1>
        <p className="mt-1 text-sm text-strata-slate-400">
          Your listening intensity, layered across time
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Year selector */}
        <div className="flex items-center gap-1 rounded-lg bg-white/[0.05] p-1">
          {years.slice(0, 5).map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                y === year
                  ? "bg-strata-amber-500 text-white"
                  : "text-strata-slate-400 hover:text-white"
              }`}
            >
              {y}
            </button>
          ))}
          {years.length > 5 && (
            <select
              value={years.slice(0, 5).includes(year) ? "" : year}
              onChange={(e) => {
                if (e.target.value) setYear(parseInt(e.target.value, 10));
              }}
              className="rounded-md bg-transparent px-2 py-1.5 text-sm text-strata-slate-400 outline-none"
            >
              <option value="" disabled>
                More
              </option>
              {years.slice(5).map((y) => (
                <option key={y} value={y} className="bg-strata-surface">
                  {y}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Artist filter */}
        <select
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white outline-none"
        >
          <option value="">All Artists</option>
          {artists.map((a) => (
            <option key={a.artistName} value={a.artistName} className="bg-strata-surface">
              {a.artistName}
            </option>
          ))}
        </select>
      </div>

      {/* Summary stats */}
      {!loading && !error && summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <StatCard label="Total Plays" value={summary.totalPlays.toLocaleString()} />
          <StatCard label="Active Days" value={String(summary.activeDays)} />
          <StatCard label="Longest Streak" value={`${summary.longestStreak}d`} />
          <StatCard
            label="Most Active Day"
            value={
              summary.mostActiveDay
                ? `${summary.mostActiveDay.count}`
                : "--"
            }
            sub={
              summary.mostActiveDay
                ? new Date(summary.mostActiveDay.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })
                : undefined
            }
          />
          <StatCard label="Daily Average" value={String(summary.averageDailyPlays)} />
        </div>
      )}

      {/* Heatmap */}
      <div className="glass-card depth-ring p-4">
        {loading ? (
          <HeatmapSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-strata-slate-400">
            <p>{error}</p>
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                const params = new URLSearchParams({ year: String(year) });
                if (artist) params.set("artist", artist);
                const qs = `?${params.toString()}`;
                Promise.all([
                  apiFetch<{ data: HeatmapDay[] }>(`/heatmap/data${qs}`),
                  apiFetch<{ data: HeatmapSummary }>(`/heatmap/summary${qs}`),
                ])
                  .then(([dataRes, summaryRes]) => {
                    setData(dataRes.data);
                    setSummary(summaryRes.data);
                  })
                  .catch(() => setError("Failed to load heatmap data"))
                  .finally(() => setLoading(false));
              }}
              className="mt-3 rounded-md bg-strata-border px-4 py-2 text-sm text-white transition-colors hover:bg-strata-slate-600"
            >
              Retry
            </button>
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-strata-slate-400">
            <p>No listening data for {year}</p>
            <p className="mt-1 text-sm">Import your Spotify streaming history to see your heatmap</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <svg ref={svgRef} />
          </div>
        )}

        {/* Legend */}
        {!loading && !error && data.length > 0 && (
          <div className="mt-4 flex items-center justify-end gap-1.5 text-xs text-strata-slate-400">
            <span>Less</span>
            {HEAT_COLORS.map((color, i) => (
              <div
                key={i}
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: color }}
              />
            ))}
            <span>More</span>
          </div>
        )}
      </div>

      {/* Day drill-down — shown when a heatmap cell is clicked */}
      {selectedDay && (
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-white">
                {formatDate(new Date(selectedDay.date + "T00:00:00Z"))}
              </h3>
              <p className="text-sm text-zinc-400">
                {selectedDay.count} play{selectedDay.count !== 1 ? "s" : ""}
              </p>
            </div>
            <button
              onClick={() => setSelectedDay(null)}
              className="text-zinc-400 hover:text-white transition-colors"
              aria-label="Close drill-down"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          {dayLoading ? (
            <div className="shimmer space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 px-2">
                  <div className="h-4 w-12 rounded bg-strata-border/50" />
                  <div className="flex-1 space-y-1">
                    <div className="h-4 w-48 rounded bg-strata-border/50" />
                    <div className="h-3 w-32 rounded bg-strata-border/50" />
                  </div>
                  <div className="h-4 w-10 rounded bg-strata-border/50" />
                </div>
              ))}
            </div>
          ) : dayTracks.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-400">No tracks found</p>
          ) : (
            <div className="space-y-0.5 max-h-80 overflow-y-auto">
              {dayTracks.map((track, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-strata-border/30 transition-colors"
                >
                  <span className="text-xs font-mono text-zinc-500 w-12 shrink-0">
                    {new Date(track.playedAt).toLocaleTimeString("ja-JP", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "UTC",
                    })}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{track.trackName}</p>
                    <p className="text-xs text-zinc-400 truncate">{track.artistName}</p>
                  </div>
                  <span className="text-xs text-zinc-500 shrink-0">
                    {formatMinutes(track.msPlayed)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Silence Map — periods of 3+ consecutive days with no plays */}
      {!loading && !error && !artist && silenceData && (
        <div className="glass-card p-5">
          <h2 className="text-lg font-semibold text-white">
            沈黙の記録
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Records of Silence
          </p>

          {silenceData.silences.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500 italic">
              この年は途切れることなく音楽と共にありました
            </p>
          ) : (
            <>
              <p className="mt-3 text-sm text-zinc-400">
                この年、合計{silenceData.totalSilentDays}日間の沈黙がありました
              </p>

              <div className="mt-4 space-y-3">
                {silenceData.silences.map((s, i) => (
                  <SilenceCard key={i} silence={s} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Obsession Curve — only shown when an artist is selected */}
      {artist && obsessionData && obsessionData.months.length > 0 && (
        <div className="glass-card p-4">
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-white">Obsession Curve</h2>
            <p className="text-sm text-amber-300">{obsessionData.artist}</p>
          </div>
          <ObsessionCurve data={obsessionData} />
        </div>
      )}

      {/* Tooltip (portal-style, positioned absolutely) */}
      <div
        ref={tooltipRef}
        className="pointer-events-none fixed z-50 hidden rounded-lg border border-strata-border bg-strata-surface px-3 py-2 shadow-lg"
        style={{ display: "none" }}
      />
    </div>
  );
}

/**
 * Obsession Curve — monthly line chart showing a single artist's play count over time.
 * Reveals peaks of obsession, periods of abandonment, and moments of rediscovery.
 * Uses D3 for rendering with ResizeObserver for responsive width.
 */
function ObsessionCurve({ data }: { data: ObsessionData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg || data.months.length === 0) return;

    const width = container.clientWidth;
    const height = 250;
    const m = OC_CHART_MARGIN;
    const innerW = width - m.left - m.right;
    const innerH = height - m.top - m.bottom;

    const maxCount = d3.max(data.months, (d) => d.playCount) ?? 0;
    const peakMonth = data.months.reduce(
      (max, d) => (d.playCount > max.playCount ? d : max),
      data.months[0],
    );

    // X scale — point scale maps each month string to an x position
    const x = d3
      .scalePoint<string>()
      .domain(data.months.map((d) => d.month))
      .range([0, innerW])
      .padding(0.5);

    // Y scale — 15% headroom above max
    const y = d3
      .scaleLinear()
      .domain([0, maxCount * 1.15])
      .nice()
      .range([innerH, 0]);

    const sel = d3.select(svg);
    sel.selectAll("*").remove();
    sel.attr("width", width).attr("height", height);

    // Gradient fill beneath the line
    const defs = sel.append("defs");
    const gradient = defs
      .append("linearGradient")
      .attr("id", "obsession-area-gradient")
      .attr("x1", "0")
      .attr("y1", "0")
      .attr("x2", "0")
      .attr("y2", "1");
    gradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", OC_AMBER_300)
      .attr("stop-opacity", 0.3);
    gradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", OC_AMBER_500)
      .attr("stop-opacity", 0.02);

    const g = sel
      .append("g")
      .attr("transform", `translate(${m.left},${m.top})`);

    // Horizontal gridlines
    g.append("g")
      .attr("class", "grid")
      .call(
        d3
          .axisLeft(y)
          .ticks(5)
          .tickSize(-innerW)
          .tickFormat(() => ""),
      )
      .call((g) => g.select(".domain").remove())
      .call((g) =>
        g.selectAll(".tick line").attr("stroke", OC_BORDER).attr("stroke-opacity", 0.7),
      );

    // Area fill
    const area = d3
      .area<ObsessionMonth>()
      .x((d) => x(d.month)!)
      .y0(innerH)
      .y1((d) => y(d.playCount))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(data.months)
      .attr("d", area)
      .attr("fill", "url(#obsession-area-gradient)");

    // Line
    const line = d3
      .line<ObsessionMonth>()
      .x((d) => x(d.month)!)
      .y((d) => y(d.playCount))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(data.months)
      .attr("d", line)
      .attr("fill", "none")
      .attr("stroke", OC_AMBER_300)
      .attr("stroke-width", 2);

    // Data point dots
    const tooltip = d3.select(tooltipRef.current);

    g.selectAll("circle.data-dot")
      .data(data.months)
      .join("circle")
      .attr("class", "data-dot")
      .attr("cx", (d) => x(d.month)!)
      .attr("cy", (d) => y(d.playCount))
      .attr("r", (d) => (d.month === peakMonth.month ? 6 : 4))
      .attr("fill", OC_AMBER_300)
      .attr("stroke", OC_SURFACE)
      .attr("stroke-width", (d) => (d.month === peakMonth.month ? 2.5 : 1.5))
      .style("cursor", "pointer")
      .on("mouseenter", (event, d) => {
        const minutes = Math.round(d.msPlayed / 60_000);
        const timeStr =
          minutes < 60
            ? `${minutes}m`
            : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
        tooltip
          .style("display", "block")
          .style("left", `${event.pageX + 12}px`)
          .style("top", `${event.pageY - 12}px`)
          .html(
            `<div class="text-xs font-medium text-white">${d.playCount} plays</div>` +
            `<div class="text-xs text-strata-slate-400 mt-0.5">${d.month}</div>` +
            `<div class="text-xs text-strata-slate-500 mt-0.5">${timeStr} · ${d.trackCount} tracks</div>`
          );
      })
      .on("mousemove", (event) => {
        tooltip
          .style("left", `${event.pageX + 12}px`)
          .style("top", `${event.pageY - 12}px`);
      })
      .on("mouseleave", () => {
        tooltip.style("display", "none");
      });

    // Peak month label
    if (peakMonth.playCount > 0) {
      g.append("text")
        .attr("x", x(peakMonth.month)!)
        .attr("y", y(peakMonth.playCount) - 12)
        .attr("text-anchor", "middle")
        .attr("font-size", "10px")
        .attr("fill", OC_AMBER_200)
        .text(`Peak: ${peakMonth.playCount}`);
    }

    // X axis — show a subset of month labels to avoid crowding
    const monthCount = data.months.length;
    const tickInterval = monthCount > 24 ? Math.ceil(monthCount / 12) : monthCount > 12 ? 2 : 1;
    const tickValues = data.months
      .filter((_, i) => i % tickInterval === 0)
      .map((d) => d.month);

    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(
        d3
          .axisBottom(x)
          .tickValues(tickValues)
          .tickFormat((d) => {
            // Show abbreviated format: "Jan '23"
            const [yr, mo] = (d as string).split("-");
            const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
            return `${monthNames[parseInt(mo, 10) - 1]} '${yr.slice(2)}`;
          }),
      )
      .call((g) => g.select(".domain").attr("stroke", OC_BORDER))
      .call((g) => g.selectAll(".tick line").attr("stroke", OC_BORDER))
      .call((g) =>
        g.selectAll(".tick text").attr("fill", OC_SLATE_400).attr("font-size", "10px"),
      );

    // Y axis
    g.append("g")
      .call(d3.axisLeft(y).ticks(5))
      .call((g) => g.select(".domain").remove())
      .call((g) => g.selectAll(".tick line").remove())
      .call((g) =>
        g.selectAll(".tick text").attr("fill", OC_SLATE_400).attr("font-size", "11px"),
      );
  }, [data]);

  // Draw on mount and re-draw on container resize
  useEffect(() => {
    draw();
    const observer = new ResizeObserver(draw);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [draw]);

  if (data.months.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-strata-slate-400">
        No data available for this artist
      </p>
    );
  }

  return (
    <>
      <div ref={containerRef} className="w-full">
        <svg ref={svgRef} className="w-full" />
      </div>
      {/* Tooltip (portal-style, positioned absolutely) */}
      <div
        ref={tooltipRef}
        className="pointer-events-none fixed z-50 rounded-lg border border-strata-border bg-strata-surface px-3 py-2 shadow-lg"
        style={{ display: "none" }}
      />
    </>
  );
}

/** Summary stat card with an optional subtitle (e.g. a date below the main value). */
function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="glass-card p-4">
      <p className="text-xs text-strata-slate-400">{label}</p>
      <p className="mt-1 font-mono text-xl font-bold text-strata-amber-300 amber-glow">{value}</p>
      {sub && <p className="text-xs text-strata-slate-500">{sub}</p>}
    </div>
  );
}

/** A compact card representing a single silence period with bookend tracks. */
function SilenceCard({ silence }: { silence: SilencePeriod }) {
  const start = new Date(silence.startDate + "T00:00:00Z");
  const end = new Date(silence.endDate + "T00:00:00Z");

  const formatJaDate = (d: Date) =>
    `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;

  return (
    <div className="border border-white/[0.04] bg-white/[0.02] rounded-lg px-4 py-3">
      {/* Date range header */}
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-zinc-400">
          {formatJaDate(start)} — {formatJaDate(end)}
          <span className="ml-2 text-zinc-600">({silence.days}日間)</span>
        </p>
      </div>

      {/* Bookend tracks */}
      {(silence.lastTrackBefore || silence.firstTrackAfter) && (
        <div className="mt-2 flex flex-col gap-1 text-xs text-zinc-600">
          {silence.lastTrackBefore && (
            <p>
              <span className="text-zinc-500">沈黙の前</span>{" "}
              {silence.lastTrackBefore.trackName}{" "}
              <span className="text-zinc-700">— {silence.lastTrackBefore.artistName}</span>
            </p>
          )}
          {silence.firstTrackAfter && (
            <p>
              <span className="text-zinc-500">沈黙の後</span>{" "}
              {silence.firstTrackAfter.trackName}{" "}
              <span className="text-zinc-700">— {silence.firstTrackAfter.artistName}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Placeholder skeleton that mimics the heatmap grid shape during loading. */
function HeatmapSkeleton() {
  return (
    <div className="space-y-2 py-4">
      <div className="flex gap-2">
        {Array.from({ length: 52 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            {Array.from({ length: 7 }).map((_, j) => (
              <div
                key={j}
                className="h-3 w-3 shimmer rounded-sm bg-strata-border/50"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
