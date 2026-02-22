/**
 * Era Map (Strata Depth View) — D3.js streamgraph visualizing artist listening
 * intensity stacked over time, creating a "geological strata" effect.
 *
 * Each artist forms a distinct colored layer whose thickness represents
 * listening volume (ms_played) for that month. The streamgraph uses
 * d3.stackOffsetWiggle for organic, river-like shapes and curveBasis
 * for smooth curves that evoke sedimentary rock layers.
 *
 * Features:
 *   - Top 15 artists by total listening time
 *   - Tooltip on hover showing artist name + listening time for that month
 *   - Legend with color swatches, clickable to highlight individual layers
 *   - Responsive via ResizeObserver
 */
import { useCallback, useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { apiFetch } from "../lib/api";
import { Link } from "react-router-dom";

// --- Types ---

interface EraMonth {
  month: string;
  values: Record<string, number>;
}

interface EraData {
  artists: string[];
  months: EraMonth[];
}

// --- Color palette ---
// Warm earth tones matching Strata's design identity: ambers, rusts, beiges,
// greens, and slates that evoke geological strata layers.
const ERA_COLORS = [
  "#d4a04a", "#a66b1f", "#8b3a1f", "#c4872e", "#8b5518",
  "#e8c88c", "#6b7f8d", "#4a7c59", "#dfd3b8", "#8b9eac",
  "#b87333", "#9e6b4a", "#c9a96e", "#7a5c3e", "#a0522d",
];

// Chart colors (matching Patterns.tsx conventions)
const BORDER = "#2a2a2a";
const SLATE_400 = "#8b9eac";

// Chart margins
const CHART_MARGIN = { top: 20, right: 20, bottom: 40, left: 50 };

function formatMinutes(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
}

function formatMonthLabel(yyyyMm: string): string {
  const [year, month] = yyyyMm.split("-");
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${monthNames[parseInt(month, 10) - 1]} '${year.slice(2)}`;
}

export default function EraMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<EraData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [highlightedArtist, setHighlightedArtist] = useState<string | null>(null);

  // Fetch era data on mount
  useEffect(() => {
    setLoading(true);
    setError(null);

    apiFetch<{ data: EraData }>("/strata/eras")
      .then((res) => setData(res.data))
      .catch(() => setError("Failed to load era map data"))
      .finally(() => setLoading(false));
  }, []);

  // --- D3 streamgraph rendering ---
  const draw = useCallback(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg || !data || data.months.length === 0) return;

    const width = container.clientWidth;
    const height = 500;
    const m = CHART_MARGIN;
    const innerW = width - m.left - m.right;
    const innerH = height - m.top - m.bottom;

    const { artists, months } = data;

    // Build a flat data array for d3.stack: one object per month with a key
    // per artist containing ms_played (defaulting to 0 for missing entries).
    const stackData = months.map((m) => {
      const row: Record<string, number | string> = { month: m.month };
      for (const artist of artists) {
        row[artist] = m.values[artist] ?? 0;
      }
      return row;
    });

    // Color scale mapping artist index to the earth-tone palette
    const color = d3
      .scaleOrdinal<string>()
      .domain(artists)
      .range(ERA_COLORS);

    // d3.stack with wiggle offset creates the organic streamgraph shape.
    // stackOrderInsideOut places higher-volume artists toward the center
    // for a balanced, aesthetically pleasing silhouette.
    const stack = d3
      .stack<Record<string, number | string>>()
      .keys(artists)
      .value((d, key) => (d[key] as number) ?? 0)
      .offset(d3.stackOffsetWiggle)
      .order(d3.stackOrderInsideOut);

    const series = stack(stackData);

    // X scale: one point per month
    const x = d3
      .scalePoint<string>()
      .domain(months.map((m) => m.month))
      .range([0, innerW])
      .padding(0.05);

    // Y scale: computed from the stacked extent (wiggle offset produces
    // negative values, so we need d3.min across all series)
    const yMin = d3.min(series, (s) => d3.min(s, (d) => d[0])) ?? 0;
    const yMax = d3.max(series, (s) => d3.max(s, (d) => d[1])) ?? 0;

    const y = d3
      .scaleLinear()
      .domain([yMin, yMax])
      .range([innerH, 0]);

    // Area generator with smooth curves for organic geological feel
    const area = d3
      .area<d3.SeriesPoint<Record<string, number | string>>>()
      .x((d) => x(d.data.month as string)!)
      .y0((d) => y(d[0]))
      .y1((d) => y(d[1]))
      .curve(d3.curveBasis);

    const sel = d3.select(svg);
    sel.selectAll("*").remove();
    sel.attr("width", width).attr("height", height);

    const g = sel
      .append("g")
      .attr("transform", `translate(${m.left},${m.top})`);

    const tooltip = d3.select(tooltipRef.current);

    // Render stacked area layers — one path per artist
    g.selectAll("path.layer")
      .data(series)
      .join("path")
      .attr("class", "layer")
      .attr("d", area)
      .attr("fill", (d) => color(d.key))
      .attr("stroke", "none")
      .style("opacity", (d) =>
        highlightedArtist === null || highlightedArtist === d.key ? 0.85 : 0.15,
      )
      .style("cursor", "pointer")
      .style("transition", "opacity 0.2s ease")
      .on("mouseenter", (event, d) => {
        // Find the closest month index based on mouse x position
        const [mx] = d3.pointer(event, g.node());
        const monthIndex = findClosestMonthIndex(mx, x, months);
        const monthData = months[monthIndex];
        const msPlayed = monthData?.values[d.key] ?? 0;

        tooltip
          .style("display", "block")
          .style("left", `${event.pageX + 12}px`)
          .style("top", `${event.pageY - 12}px`);
        tooltip.html(
          `<div class="text-xs font-medium text-white">${d.key}</div>` +
          `<div class="text-xs text-strata-slate-400 mt-0.5">${formatMonthLabel(monthData.month)}: ${formatMinutes(msPlayed)}</div>`,
        );
      })
      .on("mousemove", (event, d) => {
        const [mx] = d3.pointer(event, g.node());
        const monthIndex = findClosestMonthIndex(mx, x, months);
        const monthData = months[monthIndex];
        const msPlayed = monthData?.values[d.key] ?? 0;

        tooltip
          .style("left", `${event.pageX + 12}px`)
          .style("top", `${event.pageY - 12}px`);
        tooltip.html(
          `<div class="text-xs font-medium text-white">${d.key}</div>` +
          `<div class="text-xs text-strata-slate-400 mt-0.5">${formatMonthLabel(monthData.month)}: ${formatMinutes(msPlayed)}</div>`,
        );
      })
      .on("mouseleave", () => {
        tooltip.style("display", "none");
      });

    // X axis — show a subset of month labels to avoid crowding
    const tickValues = selectTickValues(months.map((m) => m.month));
    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(
        d3
          .axisBottom(x)
          .tickValues(tickValues)
          .tickFormat((d) => formatMonthLabel(d as string)),
      )
      .call((g) => g.select(".domain").attr("stroke", BORDER))
      .call((g) => g.selectAll(".tick line").attr("stroke", BORDER))
      .call((g) =>
        g
          .selectAll(".tick text")
          .attr("fill", SLATE_400)
          .attr("font-size", "10px")
          .attr("transform", "rotate(-45)")
          .attr("text-anchor", "end")
          .attr("dx", "-0.5em")
          .attr("dy", "0.25em"),
      );
  }, [data, highlightedArtist]);

  // Draw on mount and re-draw on container resize
  useEffect(() => {
    if (!loading && !error && data && data.months.length > 0) {
      draw();
      const observer = new ResizeObserver(draw);
      if (containerRef.current) observer.observe(containerRef.current);
      return () => observer.disconnect();
    }
  }, [loading, error, data, draw]);

  const hasData = data !== null && data.months.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Era Map</h1>
        <p className="mt-1 text-sm text-strata-slate-400">
          あなたの音楽地層
        </p>
      </div>

      {/* Loading state */}
      {loading && <StreamgraphSkeleton />}

      {/* Error state */}
      {!loading && error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-6 text-center">
          <p className="text-red-400">{error}</p>
          <button
            onClick={() => {
              setLoading(true);
              setError(null);
              apiFetch<{ data: EraData }>("/strata/eras")
                .then((res) => setData(res.data))
                .catch(() => setError("Failed to load era map data"))
                .finally(() => setLoading(false));
            }}
            className="mt-3 rounded-lg bg-strata-amber-600 px-4 py-2 text-sm text-white transition-colors hover:bg-strata-amber-500"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && !hasData && (
        <div className="rounded-lg border border-strata-border bg-strata-surface p-12 text-center">
          <p className="text-lg text-strata-slate-400">
            データがありません
          </p>
          <p className="mt-2 text-sm text-strata-slate-500">
            再生履歴をインポートすると、音楽地層が表示されます
          </p>
          <Link
            to="/import"
            className="mt-4 inline-block rounded-lg bg-strata-amber-600 px-4 py-2 text-sm text-white transition-colors hover:bg-strata-amber-500"
          >
            データをインポート
          </Link>
        </div>
      )}

      {/* Streamgraph */}
      {!loading && !error && hasData && (
        <>
          <div className="rounded-xl border border-strata-border bg-strata-surface p-4">
            <div ref={containerRef} className="w-full overflow-x-auto">
              <svg ref={svgRef} className="w-full" />
            </div>
          </div>

          {/* Legend */}
          <div className="rounded-xl border border-strata-border bg-strata-surface p-4">
            <h2 className="mb-3 text-sm font-medium text-strata-slate-400">
              Artists
            </h2>
            <div className="flex flex-wrap gap-3">
              {data!.artists.map((artist, i) => (
                <button
                  key={artist}
                  onClick={() =>
                    setHighlightedArtist(
                      highlightedArtist === artist ? null : artist,
                    )
                  }
                  className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-all ${
                    highlightedArtist === null || highlightedArtist === artist
                      ? "text-white"
                      : "text-strata-slate-500"
                  } hover:bg-strata-border/50`}
                >
                  <span
                    className="inline-block h-3 w-3 rounded-sm"
                    style={{
                      backgroundColor: ERA_COLORS[i % ERA_COLORS.length],
                      opacity:
                        highlightedArtist === null ||
                        highlightedArtist === artist
                          ? 1
                          : 0.3,
                    }}
                  />
                  {artist}
                </button>
              ))}
            </div>
            {highlightedArtist && (
              <button
                onClick={() => setHighlightedArtist(null)}
                className="mt-3 text-xs text-strata-slate-500 transition-colors hover:text-white"
              >
                Show all
              </button>
            )}
          </div>
        </>
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
 * Find the closest month index given an x pixel position in the chart.
 * Uses the point scale's domain to find the nearest month.
 */
function findClosestMonthIndex(
  mx: number,
  x: d3.ScalePoint<string>,
  months: EraMonth[],
): number {
  const domain = x.domain();
  let closestIdx = 0;
  let closestDist = Infinity;
  for (let i = 0; i < domain.length; i++) {
    const pos = x(domain[i])!;
    const dist = Math.abs(pos - mx);
    if (dist < closestDist) {
      closestDist = dist;
      closestIdx = i;
    }
  }
  return Math.min(closestIdx, months.length - 1);
}

/**
 * Select a subset of month strings to use as x-axis tick labels.
 * Shows approximately one label per 3-4 months to avoid crowding.
 */
function selectTickValues(months: string[]): string[] {
  if (months.length <= 12) return months;
  // Show every Nth month, always including first and last
  const step = Math.ceil(months.length / 12);
  const ticks: string[] = [];
  for (let i = 0; i < months.length; i += step) {
    ticks.push(months[i]);
  }
  // Ensure the last month is included
  if (ticks[ticks.length - 1] !== months[months.length - 1]) {
    ticks.push(months[months.length - 1]);
  }
  return ticks;
}

/** Loading skeleton mimicking the streamgraph layout. */
function StreamgraphSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-strata-border bg-strata-surface p-4">
        <div className="h-[500px] animate-pulse rounded-lg bg-strata-border/30" />
      </div>
      <div className="rounded-xl border border-strata-border bg-strata-surface p-4">
        <div className="h-6 w-16 animate-pulse rounded bg-strata-border/30" />
        <div className="mt-3 flex flex-wrap gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-7 w-24 animate-pulse rounded-md bg-strata-border/30"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
