import { useState, useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";
import { apiFetch } from "../lib/api";
import { Link } from "react-router-dom";

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

// --- Chart colors ---
const AMBER_500 = "#a66b1f";
const AMBER_300 = "#d4a04a";
const AMBER_200 = "#e8c88c";
const SURFACE = "#1a1a1a";
const BORDER = "#2a2a2a";
const SLATE_400 = "#8b9eac";
const SLATE_500 = "#6b7f8d";

// --- Shared chart config ---
const CHART_MARGIN = { top: 20, right: 20, bottom: 40, left: 50 };

// --- Overview Cards ---

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

function HourlyChart({ data }: { data: HourlyData[] }) {
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
    const peakHour = data.reduce(
      (max, d) => (d.count > max.count ? d : max),
      data[0],
    ).hour;

    const x = d3
      .scaleBand<number>()
      .domain(data.map((d) => d.hour))
      .range([0, innerW])
      .padding(0.15);

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

    // Gridlines
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

    // Bars
    g.selectAll("rect")
      .data(data)
      .join("rect")
      .attr("x", (d) => x(d.hour)!)
      .attr("y", (d) => y(d.count))
      .attr("width", x.bandwidth())
      .attr("height", (d) => innerH - y(d.count))
      .attr("rx", 2)
      .attr("fill", (d) => (d.hour === peakHour ? AMBER_300 : AMBER_500));

    // X axis
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

    // Y axis
    g.append("g")
      .call(d3.axisLeft(y).ticks(5))
      .call((g) => g.select(".domain").remove())
      .call((g) => g.selectAll(".tick line").remove())
      .call((g) => g.selectAll(".tick text").attr("fill", SLATE_400).attr("font-size", "11px"));
  }, [data]);

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

function WeeklyChart({ data }: { data: WeeklyData[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const draw = useCallback(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg) return;

    const width = container.clientWidth;
    const height = 280;
    const m = { top: 10, right: 20, bottom: 20, left: 30 };
    const innerW = width - m.left - m.right;
    const innerH = height - m.top - m.bottom;

    const maxCount = d3.max(data, (d) => d.count) ?? 0;
    const busiestDay = data.reduce(
      (max, d) => (d.count > max.count ? d : max),
      data[0],
    ).day;

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

    // Gridlines
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

    // Bars
    g.selectAll("rect")
      .data(data)
      .join("rect")
      .attr("x", 0)
      .attr("y", (d) => y(d.day)!)
      .attr("width", (d) => x(d.count))
      .attr("height", y.bandwidth())
      .attr("rx", 2)
      .attr("fill", (d) => (d.day === busiestDay ? AMBER_300 : AMBER_500));

    // Day labels
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

    // Count labels on bars
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

    const x = d3
      .scalePoint<number>()
      .domain(data.map((d) => d.month))
      .range([0, innerW])
      .padding(0.5);

    const y = d3
      .scaleLinear()
      .domain([0, maxCount * 1.15])
      .nice()
      .range([innerH, 0]);

    const sel = d3.select(svg);
    sel.selectAll("*").remove();
    sel.attr("width", width).attr("height", height);

    // Gradient definition
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

    // Gridlines
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

    // Area
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

    // Line
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

    // Dots
    g.selectAll("circle")
      .data(data)
      .join("circle")
      .attr("cx", (d) => x(d.month)!)
      .attr("cy", (d) => y(d.count))
      .attr("r", 3.5)
      .attr("fill", AMBER_200)
      .attr("stroke", SURFACE)
      .attr("stroke-width", 1.5);

    // X axis
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

    // Y axis
    g.append("g")
      .call(d3.axisLeft(y).ticks(5))
      .call((g) => g.select(".domain").remove())
      .call((g) => g.selectAll(".tick line").remove())
      .call((g) => g.selectAll(".tick text").attr("fill", SLATE_400).attr("font-size", "11px"));
  }, [data]);

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

// --- Skeleton ---

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
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [hourly, setHourly] = useState<HourlyData[] | null>(null);
  const [weekly, setWeekly] = useState<WeeklyData[] | null>(null);
  const [monthly, setMonthly] = useState<MonthlyData[] | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [artistFilter, setArtistFilter] = useState("");
  const [appliedArtist, setAppliedArtist] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (selectedYear) params.set("year", selectedYear);
    if (appliedArtist) params.set("artist", appliedArtist);
    const qs = params.toString() ? `?${params.toString()}` : "";

    try {
      const [overviewRes, hourlyRes, weeklyRes, monthlyRes] =
        await Promise.all([
          apiFetch<{ data: OverviewData }>(`/patterns/overview${qs}`),
          apiFetch<{ data: HourlyData[] }>(`/patterns/hourly${qs}`),
          apiFetch<{ data: WeeklyData[] }>(`/patterns/weekly${qs}`),
          apiFetch<{ data: MonthlyData[] }>(`/patterns/monthly${qs}`),
        ]);

      setOverview(overviewRes.data);
      setHourly(hourlyRes.data);
      setWeekly(weeklyRes.data);
      setMonthly(monthlyRes.data);
    } catch {
      setError("データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [selectedYear, appliedArtist]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const hasData =
    hourly !== null && hourly.some((d) => d.count > 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Listening Patterns</h1>
        <p className="mt-1 text-sm text-strata-slate-400">
          あなたのリスニング傾向を時間軸で分析
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-xs text-strata-slate-500">
            年
          </label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
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
        <div>
          <label className="mb-1 block text-xs text-strata-slate-500">
            アーティスト
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={artistFilter}
              onChange={(e) => setArtistFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setAppliedArtist(artistFilter);
              }}
              placeholder="アーティスト名..."
              className="rounded-lg border border-strata-border bg-strata-surface px-3 py-1.5 text-sm text-white placeholder:text-strata-slate-600 focus:border-strata-amber-500 focus:outline-none"
            />
            <button
              onClick={() => setAppliedArtist(artistFilter)}
              className="rounded-lg bg-strata-amber-600 px-3 py-1.5 text-sm text-white hover:bg-strata-amber-500 transition-colors"
            >
              適用
            </button>
            {appliedArtist && (
              <button
                onClick={() => {
                  setArtistFilter("");
                  setAppliedArtist("");
                }}
                className="rounded-lg border border-strata-border px-3 py-1.5 text-sm text-strata-slate-400 hover:text-white transition-colors"
              >
                クリア
              </button>
            )}
          </div>
        </div>
      </div>

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
        </div>
      )}
    </div>
  );
}

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
