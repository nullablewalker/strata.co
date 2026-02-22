/**
 * Artist Rankings (Bump Chart) — a weekly artist ranking chart showing
 * position changes over time, like a personal music chart.
 *
 * Renders a D3.js bump chart where each line represents one of the user's
 * top 10 artists, with Y-axis position showing that artist's rank in a given
 * week. Lines use curveBumpX interpolation for the characteristic "bump"
 * appearance. On hover, one artist's line is highlighted while others dim,
 * and a tooltip shows rank + play count details.
 *
 * The chart is responsive via ResizeObserver and adapts x-axis label density
 * when the number of weeks exceeds 52.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { apiFetch } from "../lib/api";
import { Link } from "react-router-dom";

// --- Types ---

interface WeekRanking {
  week: string;
  rankings: Record<string, { rank: number; plays: number }>;
}

interface RankingsData {
  artists: string[];
  weeks: WeekRanking[];
}

// --- Chart constants ---

/** Warm earth-tone palette — 10 distinct colors for the top 10 artists. */
const ARTIST_COLORS = [
  "#d4a04a", // amber-300
  "#e8c88c", // amber-200
  "#a66b1f", // amber-500
  "#8b3a1f", // rust
  "#6b7f8d", // slate
  "#7fb069", // sage green
  "#c17f59", // terracotta
  "#b8a9c9", // lavender
  "#d4836d", // coral
  "#89a7b1", // steel blue
];

const CHART_MARGIN = { top: 30, right: 140, bottom: 40, left: 50 };
const SURFACE = "#1a1a1a";
const BORDER = "#2a2a2a";
const SLATE_400 = "#8b9eac";
const SLATE_500 = "#6b7f8d";
const DIM_OPACITY = 0.12;
const LINE_WIDTH = 2.5;
const DOT_RADIUS = 4;

export default function BumpChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<RankingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch rankings data on mount
  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<{ data: RankingsData }>("/strata/rankings")
      .then((res) => setData(res.data))
      .catch(() => setError("Failed to load rankings data"))
      .finally(() => setLoading(false));
  }, []);

  // --- D3 bump chart rendering ---
  const draw = useCallback(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg || !data || data.weeks.length === 0) return;

    const width = container.clientWidth;
    const height = 420;
    const m = CHART_MARGIN;
    const innerW = width - m.left - m.right;
    const innerH = height - m.top - m.bottom;

    const sel = d3.select(svg);
    sel.selectAll("*").remove();
    sel.attr("width", width).attr("height", height);

    const { artists, weeks } = data;

    // X scale — one point per week
    const weekLabels = weeks.map((w) => w.week);
    const x = d3
      .scalePoint<string>()
      .domain(weekLabels)
      .range([0, innerW])
      .padding(0.3);

    // Y scale — rank 1 at top, 10 at bottom (inverted)
    const maxRank = 10;
    const y = d3
      .scaleLinear()
      .domain([1, maxRank])
      .range([0, innerH]);

    // Color scale
    const color = (i: number) => ARTIST_COLORS[i % ARTIST_COLORS.length];

    const g = sel
      .append("g")
      .attr("transform", `translate(${m.left},${m.top})`);

    // Horizontal gridlines for each rank position
    g.append("g")
      .attr("class", "grid")
      .selectAll("line")
      .data(d3.range(1, maxRank + 1))
      .join("line")
      .attr("x1", 0)
      .attr("x2", innerW)
      .attr("y1", (d) => y(d))
      .attr("y2", (d) => y(d))
      .attr("stroke", BORDER)
      .attr("stroke-opacity", 0.7);

    // Build line data for each artist: array of {week, rank, plays} points
    // where the artist actually appeared in that week's top rankings.
    const artistLines = artists.map((artist, ai) => {
      const points: { week: string; rank: number; plays: number }[] = [];
      for (const w of weeks) {
        const entry = w.rankings[artist];
        if (entry && entry.rank <= maxRank) {
          points.push({ week: w.week, rank: entry.rank, plays: entry.plays });
        }
      }
      return { artist, index: ai, points };
    });

    // Line generator with bump interpolation
    const lineGen = d3
      .line<{ week: string; rank: number }>()
      .x((d) => x(d.week)!)
      .y((d) => y(d.rank))
      .curve(d3.curveBumpX);

    // Tooltip reference
    const tooltip = d3.select(tooltipRef.current);

    // Groups for lines and dots per artist
    const artistGroups = g
      .selectAll("g.artist-line")
      .data(artistLines)
      .join("g")
      .attr("class", "artist-line");

    // Draw the line paths
    artistGroups
      .append("path")
      .attr("d", (d) => lineGen(d.points))
      .attr("fill", "none")
      .attr("stroke", (d) => color(d.index))
      .attr("stroke-width", LINE_WIDTH)
      .attr("stroke-opacity", 0.8)
      .attr("class", "bump-line");

    // Draw dots at each data point
    artistGroups.each(function (artistData) {
      d3.select(this)
        .selectAll("circle")
        .data(artistData.points)
        .join("circle")
        .attr("cx", (d) => x(d.week)!)
        .attr("cy", (d) => y(d.rank))
        .attr("r", DOT_RADIUS)
        .attr("fill", color(artistData.index))
        .attr("stroke", SURFACE)
        .attr("stroke-width", 1.5)
        .attr("class", "bump-dot");
    });

    // Hover interaction: highlight one artist, dim others
    // Use an invisible wider stroke for easier hover targeting
    artistGroups
      .append("path")
      .attr("d", (d) => lineGen(d.points))
      .attr("fill", "none")
      .attr("stroke", "transparent")
      .attr("stroke-width", 16)
      .style("cursor", "pointer")
      .on("mouseenter", (_event, d) => {
        // Dim all lines/dots except the hovered one
        artistGroups.selectAll(".bump-line").attr("stroke-opacity", (ad) =>
          (ad as typeof d).artist === d.artist ? 1 : DIM_OPACITY
        );
        artistGroups.selectAll(".bump-dot").attr("opacity", (ad) =>
          (ad as { week: string }).week !== undefined
            ? 1
            : DIM_OPACITY
        );
        // Dim entire groups that aren't this artist
        artistGroups.attr("opacity", (ad) =>
          (ad as typeof d).artist === d.artist ? 1 : DIM_OPACITY
        );
      })
      .on("mouseleave", () => {
        artistGroups.selectAll(".bump-line").attr("stroke-opacity", 0.8);
        artistGroups.selectAll(".bump-dot").attr("opacity", 1);
        artistGroups.attr("opacity", 1);
        tooltip.style("display", "none");
      })
      .on("mousemove", (event, d) => {
        // Find closest week to mouse position
        const [mx] = d3.pointer(event, g.node()!);
        let closestPoint = d.points[0];
        let closestDist = Infinity;
        for (const p of d.points) {
          const px = x(p.week)!;
          const dist = Math.abs(mx - px);
          if (dist < closestDist) {
            closestDist = dist;
            closestPoint = p;
          }
        }

        if (closestPoint) {
          const weekDate = new Date(closestPoint.week);
          const weekStr = weekDate.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          tooltip
            .style("display", "block")
            .style("left", `${event.pageX + 14}px`)
            .style("top", `${event.pageY - 14}px`)
            .html(
              `<div class="text-xs font-semibold" style="color:${color(d.index)}">${d.artist}</div>` +
              `<div class="text-xs text-white mt-0.5">#${closestPoint.rank} &middot; ${closestPoint.plays} plays</div>` +
              `<div class="text-xs text-strata-slate-500 mt-0.5">Week of ${weekStr}</div>`
            );
        }
      });

    // X axis — sample labels if > 52 weeks
    const totalWeeks = weekLabels.length;
    const tickInterval =
      totalWeeks > 52 ? Math.ceil(totalWeeks / 26) : totalWeeks > 26 ? 2 : 1;
    const tickValues = weekLabels.filter((_, i) => i % tickInterval === 0);

    g.append("g")
      .attr("transform", `translate(0,${innerH + 8})`)
      .call(
        d3
          .axisBottom(x)
          .tickValues(tickValues)
          .tickSize(0)
          .tickFormat((d) => {
            const date = new Date(d as string);
            const months = [
              "Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
            ];
            return `${months[date.getUTCMonth()]} '${String(date.getUTCFullYear()).slice(2)}`;
          })
      )
      .call((g) => g.select(".domain").remove())
      .call((g) =>
        g
          .selectAll(".tick text")
          .attr("fill", SLATE_400)
          .attr("font-size", "10px")
          .attr("text-anchor", "middle")
      );

    // Y axis — rank labels (1-10) on the left
    g.append("g")
      .call(
        d3
          .axisLeft(y)
          .tickValues(d3.range(1, maxRank + 1))
          .tickSize(0)
          .tickFormat((d) => `#${d}`)
      )
      .call((g) => g.select(".domain").remove())
      .call((g) =>
        g
          .selectAll(".tick text")
          .attr("fill", SLATE_400)
          .attr("font-size", "11px")
      );

    // Artist legend on the right side
    const legend = sel
      .append("g")
      .attr("transform", `translate(${m.left + innerW + 16},${m.top})`);

    artists.forEach((artist, i) => {
      const row = legend.append("g").attr("transform", `translate(0,${i * 22})`);

      row
        .append("circle")
        .attr("cx", 6)
        .attr("cy", 6)
        .attr("r", 5)
        .attr("fill", color(i));

      row
        .append("text")
        .attr("x", 16)
        .attr("y", 6)
        .attr("dy", "0.35em")
        .attr("fill", SLATE_500)
        .attr("font-size", "11px")
        .text(artist.length > 14 ? artist.slice(0, 13) + "\u2026" : artist);
    });
  }, [data]);

  // Draw on mount and re-draw on container resize
  useEffect(() => {
    if (!loading && !error && data) {
      draw();
    }
    const observer = new ResizeObserver(() => {
      if (!loading && !error && data) draw();
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [draw, loading, error, data]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Artist Rankings</h1>
        <p className="mt-1 text-sm text-strata-slate-400">
          週次マイチャート
        </p>
      </div>

      <div className="rounded-xl border border-strata-border bg-strata-surface p-4">
        {loading ? (
          <BumpChartSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-strata-slate-400">
            <p>{error}</p>
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                apiFetch<{ data: RankingsData }>("/strata/rankings")
                  .then((res) => setData(res.data))
                  .catch(() => setError("Failed to load rankings data"))
                  .finally(() => setLoading(false));
              }}
              className="mt-3 rounded-md bg-strata-border px-4 py-2 text-sm text-white transition-colors hover:bg-strata-slate-600"
            >
              Retry
            </button>
          </div>
        ) : !data || data.weeks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-strata-slate-400">
            <p>No ranking data available</p>
            <p className="mt-1 text-sm">
              Import your Spotify streaming history to see your personal music chart
            </p>
            <Link
              to="/import"
              className="mt-4 inline-block rounded-lg bg-strata-amber-600 px-4 py-2 text-sm text-white transition-colors hover:bg-strata-amber-500"
            >
              Import Data
            </Link>
          </div>
        ) : (
          <div ref={containerRef} className="w-full overflow-x-auto">
            <svg ref={svgRef} className="w-full" />
          </div>
        )}
      </div>

      {/* Tooltip (portal-style, positioned absolutely) */}
      <div
        ref={tooltipRef}
        className="pointer-events-none fixed z-50 rounded-lg border border-strata-border bg-strata-surface px-3 py-2 shadow-lg"
        style={{ display: "none" }}
      />
    </div>
  );
}

/** Placeholder skeleton mimicking the bump chart during loading. */
function BumpChartSkeleton() {
  return (
    <div className="space-y-3 py-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-3 animate-pulse rounded bg-strata-border"
          style={{ width: `${70 + Math.random() * 30}%` }}
        />
      ))}
      <div className="mt-4 h-[300px] animate-pulse rounded-lg bg-strata-border/50" />
    </div>
  );
}
