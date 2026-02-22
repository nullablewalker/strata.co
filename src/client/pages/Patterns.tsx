/**
 * Listening Patterns page — reveals time-based habits through three D3.js charts:
 *
 *   1. **Hourly bar chart** — vertical bars for each hour (0-23), highlighting
 *      the peak listening hour. Answers "when during the day do I listen most?"
 *   2. **Weekly horizontal bar chart** — one bar per day-of-week, highlighting
 *      the busiest day. Answers "which weekday do I listen most?"
 *   3. **Monthly area chart** — smoothed line + gradient area showing seasonal
 *      variation. Answers "which months am I most active?"
 *
 * All charts share the same warm amber palette and are responsive via
 * ResizeObserver, re-drawing on container width changes.
 *
 * Filters: year selector and a Swinsian-style 3-column browser (Genre,
 * Artist, Album) allow cascading drill-down. The "listener type" badge
 * (e.g. "Night Owl") provides a fun personality label derived from the data.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";
import { apiFetch } from "../lib/api";
import { Link } from "react-router-dom";
import ColumnBrowser from "../components/ColumnBrowser";

// --- Types ---

interface HourlyData {
  hour: number;
  count: number;
  msPlayed: number;
}

interface WeeklyData {
  day: number;
  dayName: string;
  count: number;
  msPlayed: number;
}

interface MonthlyData {
  month: number;
  monthName: string;
  count: number;
  msPlayed: number;
}

interface OverviewData {
  peakHour: { hour: number; label: string };
  busiestDay: { day: number; dayName: string };
  favoriteSeason: string;
  averageDailyPlays: number;
  listenerType: string;
  availableYears: number[];
}

interface TimeArtistEntry {
  artistName: string;
  playCount: number;
  msPlayed: number;
}

interface TimeArtistPeriod {
  label: string;
  artists: TimeArtistEntry[];
}

type TimeArtistsData = Record<string, TimeArtistPeriod>;

// --- Chart colors ---
// Hardcoded hex values (not CSS vars) because D3 operates outside React's
// style system. These match the Tailwind @theme tokens in index.css.
const AMBER_500 = "#a66b1f";
const AMBER_300 = "#d4a04a";
const AMBER_200 = "#e8c88c";
const SURFACE = "#1a1a1a";
const BORDER = "#2a2a2a";
const SLATE_400 = "#8b9eac";
const SLATE_500 = "#6b7f8d";

// --- Shared chart config ---
// Consistent margins across all three charts for visual alignment.
const CHART_MARGIN = { top: 20, right: 20, bottom: 40, left: 50 };

// --- Overview Cards ---
// Personality summary derived from listening data — the "listener type" badge
// and key stats give users a quick, emotionally engaging snapshot.

function OverviewCards({ data }: { data: OverviewData }) {
  return (
    <div className="space-y-6">
      {/* Listener type - large badge */}
      <div className="flex items-center justify-center rounded-xl bg-strata-surface p-8 border border-strata-border">
        <span className="text-4xl font-bold text-strata-amber-300">
          {data.listenerType}
        </span>
      </div>

      {/* Stat cards grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="ピークタイム"
          value={`${data.peakHour.hour}:00`}
          sub={data.peakHour.label}
        />
        <StatCard
          label="最も聴く曜日"
          value={data.busiestDay.dayName + "曜日"}
        />
        <StatCard label="好きな季節" value={data.favoriteSeason} />
        <StatCard
          label="1日の平均再生"
          value={String(data.averageDailyPlays)}
          sub="tracks/day"
        />
      </div>
    </div>
  );
}

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
    <div className="rounded-lg bg-strata-surface p-4 border border-strata-border">
      <p className="text-xs text-strata-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-strata-amber-300">{value}</p>
      {sub && (
        <p className="mt-0.5 text-xs text-strata-slate-400">{sub}</p>
      )}
    </div>
  );
}

// --- Hourly Bar Chart ---
// Vertical bar chart with 24 bars (0:00 - 23:00). The peak hour is
// highlighted in a brighter amber so it pops visually. X-axis shows
// every 3rd hour label to avoid crowding.

function HourlyChart({ data }: { data: HourlyData[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const draw = useCallback(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg) return;

    // Use container width for responsive sizing; height is fixed.
    const width = container.clientWidth;
    const height = 300;
    const m = CHART_MARGIN;
    const innerW = width - m.left - m.right;
    const innerH = height - m.top - m.bottom;

    const maxCount = d3.max(data, (d) => d.count) ?? 0;
    // Identify the peak hour to give it a distinct highlight color.
    const peakHour = data.reduce(
      (max, d) => (d.count > max.count ? d : max),
      data[0],
    ).hour;

    // Band scale maps each hour to an equal-width column with padding.
    const x = d3
      .scaleBand<number>()
      .domain(data.map((d) => d.hour))
      .range([0, innerW])
      .padding(0.15);

    // Y domain extends 10% above max for breathing room; .nice() rounds to clean ticks.
    const y = d3
      .scaleLinear()
      .domain([0, maxCount * 1.1])
      .nice()
      .range([innerH, 0]);

    const sel = d3.select(svg);
    sel.selectAll("*").remove();
    sel.attr("width", width).attr("height", height);

    const g = sel
      .append("g")
      .attr("transform", `translate(${m.left},${m.top})`);

    // Subtle horizontal gridlines — helps read values without a full axis.
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
        g.selectAll(".tick line").attr("stroke", BORDER).attr("stroke-opacity", 0.7),
      );

    // Bars — peak hour gets AMBER_300 (lighter), others get AMBER_500 (darker).
    g.selectAll("rect")
      .data(data)
      .join("rect")
      .attr("x", (d) => x(d.hour)!)
      .attr("y", (d) => y(d.count))
      .attr("width", x.bandwidth())
      .attr("height", (d) => innerH - y(d.count))
      .attr("rx", 2)
      .attr("fill", (d) => (d.hour === peakHour ? AMBER_300 : AMBER_500));

    // X axis — show every 3rd hour to keep labels readable.
    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(
        d3
          .axisBottom(x)
          .tickValues([0, 3, 6, 9, 12, 15, 18, 21])
          .tickFormat((d) => `${d}:00`),
      )
      .call((g) => g.select(".domain").attr("stroke", BORDER))
      .call((g) => g.selectAll(".tick line").attr("stroke", BORDER))
      .call((g) => g.selectAll(".tick text").attr("fill", SLATE_400).attr("font-size", "11px"));

    // Y axis — labels only, no domain line or tick marks (gridlines suffice).
    g.append("g")
      .call(d3.axisLeft(y).ticks(5))
      .call((g) => g.select(".domain").remove())
      .call((g) => g.selectAll(".tick line").remove())
      .call((g) => g.selectAll(".tick text").attr("fill", SLATE_400).attr("font-size", "11px"));
  }, [data]);

  // Draw on mount and re-draw whenever the container resizes (responsive).
  useEffect(() => {
    draw();
    const observer = new ResizeObserver(draw);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [draw]);

  return (
    <div ref={containerRef} className="w-full">
      <svg ref={svgRef} className="w-full" />
    </div>
  );
}

// --- Weekly Horizontal Bar Chart ---
// Horizontal layout (bars grow left-to-right) works well for 7 short labels
// and makes it easy to compare day-of-week values at a glance. The busiest
// day is highlighted. Count labels sit at the end of each bar for precision.

function WeeklyChart({ data }: { data: WeeklyData[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const draw = useCallback(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg) return;

    const width = container.clientWidth;
    const height = 280;
    // Tighter left margin than the shared CHART_MARGIN because short day
    // abbreviations (Mon, Tue, ...) need less space than numeric y-axis labels.
    const m = { top: 10, right: 20, bottom: 20, left: 30 };
    const innerW = width - m.left - m.right;
    const innerH = height - m.top - m.bottom;

    const maxCount = d3.max(data, (d) => d.count) ?? 0;
    const busiestDay = data.reduce(
      (max, d) => (d.count > max.count ? d : max),
      data[0],
    ).day;

    // Band scale on the Y axis (one band per weekday), linear scale on X.
    const y = d3
      .scaleBand<number>()
      .domain(data.map((d) => d.day))
      .range([0, innerH])
      .padding(0.2);

    const x = d3
      .scaleLinear()
      .domain([0, maxCount * 1.1])
      .nice()
      .range([0, innerW]);

    const sel = d3.select(svg);
    sel.selectAll("*").remove();
    sel.attr("width", width).attr("height", height);

    const g = sel
      .append("g")
      .attr("transform", `translate(${m.left},${m.top})`);

    // Vertical gridlines for the horizontal bar chart.
    g.append("g")
      .attr("class", "grid")
      .call(
        d3
          .axisBottom(x)
          .ticks(5)
          .tickSize(innerH)
          .tickFormat(() => ""),
      )
      .call((g) => g.select(".domain").remove())
      .call((g) =>
        g.selectAll(".tick line").attr("stroke", BORDER).attr("stroke-opacity", 0.7),
      );

    // Horizontal bars — busiest day highlighted in brighter amber.
    g.selectAll("rect")
      .data(data)
      .join("rect")
      .attr("x", 0)
      .attr("y", (d) => y(d.day)!)
      .attr("width", (d) => x(d.count))
      .attr("height", y.bandwidth())
      .attr("rx", 2)
      .attr("fill", (d) => (d.day === busiestDay ? AMBER_300 : AMBER_500));

    // Day name labels to the left of each bar.
    g.selectAll(".day-label")
      .data(data)
      .join("text")
      .attr("class", "day-label")
      .attr("x", -4)
      .attr("y", (d) => y(d.day)! + y.bandwidth() / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", "end")
      .attr("fill", SLATE_400)
      .attr("font-size", "12px")
      .text((d) => d.dayName);

    // Numeric count labels placed just past the end of each bar.
    g.selectAll(".count-label")
      .data(data)
      .join("text")
      .attr("class", "count-label")
      .attr("x", (d) => x(d.count) + 6)
      .attr("y", (d) => y(d.day)! + y.bandwidth() / 2)
      .attr("dy", "0.35em")
      .attr("fill", SLATE_500)
      .attr("font-size", "11px")
      .text((d) => (d.count > 0 ? d.count.toLocaleString() : ""));
  }, [data]);

  // Responsive: re-draw on container resize.
  useEffect(() => {
    draw();
    const observer = new ResizeObserver(draw);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [draw]);

  return (
    <div ref={containerRef} className="w-full">
      <svg ref={svgRef} className="w-full" />
    </div>
  );
}

// --- Monthly Area Chart ---
// Area chart shows seasonal listening trends. The gradient fill fading to
// transparent at the bottom creates a layered "strata" feel. Monotone-X
// curve interpolation prevents overshoot artifacts between data points.

function MonthlyChart({ data }: { data: MonthlyData[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const draw = useCallback(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg) return;

    const width = container.clientWidth;
    const height = 300;
    const m = CHART_MARGIN;
    const innerW = width - m.left - m.right;
    const innerH = height - m.top - m.bottom;

    const maxCount = d3.max(data, (d) => d.count) ?? 0;

    // Point scale (not band) because area/line charts need exact x positions.
    const x = d3
      .scalePoint<number>()
      .domain(data.map((d) => d.month))
      .range([0, innerW])
      .padding(0.5);

    // Extra 15% headroom so peaks don't touch the top edge.
    const y = d3
      .scaleLinear()
      .domain([0, maxCount * 1.15])
      .nice()
      .range([innerH, 0]);

    const sel = d3.select(svg);
    sel.selectAll("*").remove();
    sel.attr("width", width).attr("height", height);

    // Vertical gradient for the area fill — fades from semi-opaque amber at
    // the line to nearly transparent at the baseline, creating depth.
    const defs = sel.append("defs");
    const gradient = defs
      .append("linearGradient")
      .attr("id", "area-gradient")
      .attr("x1", "0")
      .attr("y1", "0")
      .attr("x2", "0")
      .attr("y2", "1");
    gradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", AMBER_300)
      .attr("stop-opacity", 0.4);
    gradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", AMBER_500)
      .attr("stop-opacity", 0.05);

    const g = sel
      .append("g")
      .attr("transform", `translate(${m.left},${m.top})`);

    // Horizontal gridlines.
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
        g.selectAll(".tick line").attr("stroke", BORDER).attr("stroke-opacity", 0.7),
      );

    // Filled area under the line — uses the gradient defined above.
    const area = d3
      .area<MonthlyData>()
      .x((d) => x(d.month)!)
      .y0(innerH)
      .y1((d) => y(d.count))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(data)
      .attr("d", area)
      .attr("fill", "url(#area-gradient)");

    // Trend line on top of the area fill.
    const line = d3
      .line<MonthlyData>()
      .x((d) => x(d.month)!)
      .y((d) => y(d.count))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(data)
      .attr("d", line)
      .attr("fill", "none")
      .attr("stroke", AMBER_300)
      .attr("stroke-width", 2);

    // Data point dots — stroked with surface color to visually separate from
    // the line when closely spaced.
    g.selectAll("circle")
      .data(data)
      .join("circle")
      .attr("cx", (d) => x(d.month)!)
      .attr("cy", (d) => y(d.count))
      .attr("r", 3.5)
      .attr("fill", AMBER_200)
      .attr("stroke", SURFACE)
      .attr("stroke-width", 1.5);

    // X axis with Japanese month labels (1月, 2月, ...).
    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(
        d3
          .axisBottom(x)
          .tickFormat((d) => `${d}月`),
      )
      .call((g) => g.select(".domain").attr("stroke", BORDER))
      .call((g) => g.selectAll(".tick line").attr("stroke", BORDER))
      .call((g) => g.selectAll(".tick text").attr("fill", SLATE_400).attr("font-size", "11px"));

    // Y axis — label-only, same pattern as the hourly chart.
    g.append("g")
      .call(d3.axisLeft(y).ticks(5))
      .call((g) => g.select(".domain").remove())
      .call((g) => g.selectAll(".tick line").remove())
      .call((g) => g.selectAll(".tick text").attr("fill", SLATE_400).attr("font-size", "11px"));
  }, [data]);

  // Responsive: re-draw on container resize.
  useEffect(() => {
    draw();
    const observer = new ResizeObserver(draw);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [draw]);

  return (
    <div ref={containerRef} className="w-full">
      <svg ref={svgRef} className="w-full" />
    </div>
  );
}

// --- Skeleton loading placeholders ---

function ChartSkeleton() {
  return (
    <div className="h-[300px] animate-pulse rounded-lg bg-strata-surface" />
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-xl bg-strata-surface" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-lg bg-strata-surface"
          />
        ))}
      </div>
    </div>
  );
}

// --- Main Page ---

export default function Patterns() {
  // Each dataset is fetched independently but in a single Promise.all batch.
  // Null means "not yet loaded" (distinct from empty array = "loaded, no data").
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [hourly, setHourly] = useState<HourlyData[] | null>(null);
  const [weekly, setWeekly] = useState<WeeklyData[] | null>(null);
  const [monthly, setMonthly] = useState<MonthlyData[] | null>(null);
  const [timeArtists, setTimeArtists] = useState<TimeArtistsData | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>("");

  // Column browser state — cascading filters for Genre > Artist > Album
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);
  const [artists, setArtists] = useState<string[]>([]);
  const [albums, setAlbums] = useState<string[]>([]);
  const [browserLoading, setBrowserLoading] = useState(true);

  // Fetch artist list for the column browser. Re-runs when year changes.
  const fetchArtists = useCallback(async (year: string) => {
    const params = new URLSearchParams();
    if (year) params.set("year", year);
    const qs = params.toString() ? `?${params.toString()}` : "";

    try {
      const res = await apiFetch<{ data: string[] }>(`/patterns/artists${qs}`);
      setArtists(res.data);
    } catch {
      setArtists([]);
    }
  }, []);

  // Fetch album list for the column browser. Re-runs when year or artist changes.
  const fetchAlbums = useCallback(async (year: string, artist: string | null) => {
    const params = new URLSearchParams();
    if (year) params.set("year", year);
    if (artist) params.set("artist", artist);
    const qs = params.toString() ? `?${params.toString()}` : "";

    try {
      const res = await apiFetch<{ data: string[] }>(`/patterns/albums${qs}`);
      setAlbums(res.data);
    } catch {
      setAlbums([]);
    }
  }, []);

  // Fetch browser data on mount and when year changes
  useEffect(() => {
    setBrowserLoading(true);
    Promise.all([
      fetchArtists(selectedYear),
      fetchAlbums(selectedYear, selectedArtist),
    ]).finally(() => setBrowserLoading(false));
  }, [selectedYear, selectedArtist, fetchArtists, fetchAlbums]);

  // Cascading selection handlers
  const handleGenreSelect = useCallback((_genre: string | null) => {
    // Genre is a placeholder for now — no filtering effect yet
    setSelectedGenre(_genre);
    setSelectedArtist(null);
    setSelectedAlbum(null);
  }, []);

  const handleArtistSelect = useCallback((artist: string | null) => {
    setSelectedArtist(artist);
    setSelectedAlbum(null);
  }, []);

  const handleAlbumSelect = useCallback((album: string | null) => {
    setSelectedAlbum(album);
  }, []);

  // Reset column browser when year changes
  const handleYearChange = useCallback((year: string) => {
    setSelectedYear(year);
    setSelectedGenre(null);
    setSelectedArtist(null);
    setSelectedAlbum(null);
  }, []);

  // Fetch all four pattern datasets in parallel. Re-runs when any filter changes.
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (selectedYear) params.set("year", selectedYear);
    if (selectedArtist) params.set("artist", selectedArtist);
    if (selectedAlbum) params.set("album", selectedAlbum);
    const qs = params.toString() ? `?${params.toString()}` : "";

    // time-artists only supports year filter (not artist/album)
    const timeArtistsParams = new URLSearchParams();
    if (selectedYear) timeArtistsParams.set("year", selectedYear);
    const timeArtistsQs = timeArtistsParams.toString()
      ? `?${timeArtistsParams.toString()}`
      : "";

    try {
      const [overviewRes, hourlyRes, weeklyRes, monthlyRes, timeArtistsRes] =
        await Promise.all([
          apiFetch<{ data: OverviewData }>(`/patterns/overview${qs}`),
          apiFetch<{ data: HourlyData[] }>(`/patterns/hourly${qs}`),
          apiFetch<{ data: WeeklyData[] }>(`/patterns/weekly${qs}`),
          apiFetch<{ data: MonthlyData[] }>(`/patterns/monthly${qs}`),
          apiFetch<{ data: TimeArtistsData }>(`/patterns/time-artists${timeArtistsQs}`),
        ]);

      setOverview(overviewRes.data);
      setHourly(hourlyRes.data);
      setWeekly(weeklyRes.data);
      setMonthly(monthlyRes.data);
      setTimeArtists(timeArtistsRes.data);
    } catch {
      setError("データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedArtist, selectedAlbum]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Check if there's any meaningful data to display. An hourly array with
  // all-zero counts means the user has no history for the selected filters.
  const hasData =
    hourly !== null && hourly.some((d) => d.count > 0);

  return (
    <div className="space-y-8">
      {/* Header + Year Filter */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Listening Patterns</h1>
          <p className="mt-1 text-sm text-strata-slate-400">
            あなたのリスニング傾向を時間軸で分析
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs text-strata-slate-500">
            年
          </label>
          <select
            value={selectedYear}
            onChange={(e) => handleYearChange(e.target.value)}
            className="rounded-lg border border-strata-border bg-strata-surface px-3 py-1.5 text-sm text-white focus:border-strata-amber-500 focus:outline-none"
          >
            <option value="">すべて</option>
            {(overview?.availableYears ?? []).map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Column Browser */}
      <ColumnBrowser
        genres={[]}
        artists={artists}
        albums={albums}
        selectedGenre={selectedGenre}
        selectedArtist={selectedArtist}
        selectedAlbum={selectedAlbum}
        onGenreSelect={handleGenreSelect}
        onArtistSelect={handleArtistSelect}
        onAlbumSelect={handleAlbumSelect}
        loading={browserLoading}
      />

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-6 text-center">
          <p className="text-red-400">{error}</p>
          <button
            onClick={fetchData}
            className="mt-3 rounded-lg bg-strata-amber-600 px-4 py-2 text-sm text-white hover:bg-strata-amber-500 transition-colors"
          >
            再試行
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && !error && (
        <div className="space-y-8">
          <OverviewSkeleton />
          <ChartSection title="時間帯別リスニング">
            <ChartSkeleton />
          </ChartSection>
          <ChartSection title="曜日別リスニング">
            <ChartSkeleton />
          </ChartSection>
          <ChartSection title="月別リスニング">
            <ChartSkeleton />
          </ChartSection>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && !hasData && (
        <div className="rounded-lg border border-strata-border bg-strata-surface p-12 text-center">
          <p className="text-lg text-strata-slate-400">
            データがありません
          </p>
          <p className="mt-2 text-sm text-strata-slate-500">
            再生履歴をインポートすると、リスニングパターンが表示されます
          </p>
          <Link
            to="/import"
            className="mt-4 inline-block rounded-lg bg-strata-amber-600 px-4 py-2 text-sm text-white hover:bg-strata-amber-500 transition-colors"
          >
            データをインポート
          </Link>
        </div>
      )}

      {/* Data loaded */}
      {!loading && !error && hasData && (
        <div className="space-y-8">
          {overview && <OverviewCards data={overview} />}

          <ChartSection title="時間帯別リスニング">
            {hourly && <HourlyChart data={hourly} />}
          </ChartSection>

          <ChartSection title="曜日別リスニング">
            {weekly && <WeeklyChart data={weekly} />}
          </ChartSection>

          <ChartSection title="月別リスニング">
            {monthly && <MonthlyChart data={monthly} />}
          </ChartSection>

          {timeArtists && <TimeArtistsSection data={timeArtists} />}
        </div>
      )}
    </div>
  );
}

// --- Time-of-Day Artists Section ---
// Shows top 5 artists for each of four time periods (night, morning,
// daytime, evening) in a grid of cards with Japanese labels.

/** Metadata for rendering each time period card. */
const TIME_PERIOD_META: Record<
  string,
  { icon: string; timeRange: string; order: number }
> = {
  night: { icon: "\u{1F319}", timeRange: "22:00 - 3:59", order: 0 },
  morning: { icon: "\u{1F305}", timeRange: "4:00 - 9:59", order: 1 },
  daytime: { icon: "\u{2600}\u{FE0F}", timeRange: "10:00 - 17:59", order: 2 },
  evening: { icon: "\u{1F307}", timeRange: "18:00 - 21:59", order: 3 },
};

function TimeArtistsSection({ data }: { data: TimeArtistsData }) {
  const periods = Object.entries(data).sort(
    ([a], [b]) =>
      (TIME_PERIOD_META[a]?.order ?? 0) - (TIME_PERIOD_META[b]?.order ?? 0),
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">
          時間帯の音楽
        </h2>
        <p className="text-sm text-strata-slate-500">Time of Day Report</p>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {periods.map(([key, period]) => {
          const meta = TIME_PERIOD_META[key];
          return (
            <div
              key={key}
              className="rounded-lg border border-strata-border bg-strata-bg p-4"
            >
              <div className="mb-3">
                <p className="text-sm font-semibold text-white">
                  {meta?.icon} {period.label}
                </p>
                <p className="text-xs text-zinc-500">
                  {meta?.timeRange}
                </p>
              </div>
              {period.artists.length === 0 ? (
                <p className="text-xs text-zinc-500">データなし</p>
              ) : (
                <ol className="space-y-1.5">
                  {period.artists.map((artist, i) => (
                    <li key={artist.artistName} className="flex items-baseline gap-2">
                      <span
                        className={`text-xs font-mono w-4 text-right shrink-0 ${
                          i === 0 ? "text-amber-300" : "text-zinc-500"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span
                        className={`text-sm truncate ${
                          i === 0 ? "text-amber-300 font-medium" : "text-zinc-300"
                        }`}
                      >
                        {artist.artistName}
                      </span>
                      <span className="ml-auto text-xs text-zinc-500 shrink-0">
                        {artist.playCount.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Wrapper card that provides consistent styling and a title for each chart. */
function ChartSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-strata-border bg-strata-surface p-6">
      <h2 className="mb-4 text-lg font-semibold text-strata-slate-400">
        {title}
      </h2>
      {children}
    </div>
  );
}
