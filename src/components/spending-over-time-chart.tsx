import { JSX, useState } from "react";
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Circle, Line, Path, Svg, Text as SvgText } from "react-native-svg";

import { dayNumber, formatAxisDollars, niceTicks } from "@/lib/chart-scale";
import { formatDayLabel, type SpendingPoint } from "@/lib/group-stats";
import { palette } from "@/lib/palette";
import { formatCents } from "@/lib/receipt-form";

type Props = {
  points: readonly SpendingPoint[];
};

/** Height of the drawing area, including tick labels. */
const CHART_HEIGHT = 200;
/** Room for the y tick labels left of the plot. */
const PLOT_LEFT = 44;
/** Room so the last marker and label are not clipped. */
const PLOT_RIGHT = 14;
/** Room above the top grid line. */
const PLOT_TOP = 10;
/** Room for the x tick labels under the plot. */
const PLOT_BOTTOM = 24;
/** Width of the rotated y-axis title column. */
const Y_TITLE_WIDTH = 18;
/** Size of the invisible touch target around each point. */
const HIT_SIZE = 32;
/** Tick label size. */
const TICK_FONT = 11;

/**
 * Chooses which x positions get a date label: first, last, and the middle one
 * when there is room, so labels never collide.
 * @param count Number of points
 * @returns Indices to label
 */
function labeledIndices(count: number): number[] {
  if (count <= 2) return [...Array(count).keys()];
  return [0, Math.floor((count - 1) / 2), count - 1];
}

/**
 * Line graph of money spent per receipt date. The y-axis is labeled
 * "money spent" and the x-axis "receipt date"; tapping a point shows its date
 * and amount above the graph (the latest point is shown at first).
 * @param root0 Chart props
 * @param root0.points Spending per day, oldest first (at least one)
 * @returns JSX element
 */
export function SpendingOverTimeChart({ points }: Props): JSX.Element {
  const [width, setWidth] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const activeIndex =
    selectedIndex !== null && selectedIndex < points.length
      ? selectedIndex
      : points.length - 1;
  const active = points[activeIndex];

  const ticks = niceTicks(Math.max(...points.map((p) => p.totalCents)));
  const yMax = ticks[ticks.length - 1];

  const plotWidth = Math.max(width - PLOT_LEFT - PLOT_RIGHT, 1);
  const plotHeight = CHART_HEIGHT - PLOT_TOP - PLOT_BOTTOM;
  const firstDay = dayNumber(points[0].date);
  const daySpan = dayNumber(points[points.length - 1].date) - firstDay;

  const xOf = (point: SpendingPoint): number =>
    daySpan === 0
      ? PLOT_LEFT + plotWidth / 2
      : PLOT_LEFT + ((dayNumber(point.date) - firstDay) / daySpan) * plotWidth;
  const yOf = (cents: number): number =>
    PLOT_TOP + plotHeight - (cents / yMax) * plotHeight;

  const coords = points.map((p) => ({ x: xOf(p), y: yOf(p.totalCents) }));
  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");

  const handleLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  return (
    <View style={STYLES.wrapper}>
      <Text style={STYLES.readout} testID="spending-readout">
        <Text style={STYLES.readoutDate}>{formatDayLabel(active.date)}</Text>
        {"  "}
        <Text style={STYLES.readoutAmount}>{formatCents(active.totalCents)}</Text>
      </Text>

      <View style={STYLES.row}>
        <View style={STYLES.yTitleColumn}>
          <Text style={STYLES.yTitle} numberOfLines={1}>
            money spent
          </Text>
        </View>

        <View
          style={STYLES.plot}
          onLayout={handleLayout}
          testID="spending-over-time-chart"
          accessibilityLabel={`Money spent by receipt date: ${points
            .map((p) => `${formatDayLabel(p.date)} ${formatCents(p.totalCents)}`)
            .join(", ")}`}
        >
          {width > 0 ? (
            <>
              <Svg width={width} height={CHART_HEIGHT}>
                {ticks.map((tick) => (
                  <Line
                    key={`grid-${tick}`}
                    x1={PLOT_LEFT}
                    x2={width - PLOT_RIGHT}
                    y1={yOf(tick)}
                    y2={yOf(tick)}
                    stroke={palette.border}
                    strokeWidth={1}
                  />
                ))}
                {ticks.map((tick) => (
                  <SvgText
                    key={`ytick-${tick}`}
                    x={PLOT_LEFT - 6}
                    y={yOf(tick) + 4}
                    fontSize={TICK_FONT}
                    fill={palette.muted}
                    textAnchor="end"
                  >
                    {formatAxisDollars(tick)}
                  </SvgText>
                ))}
                {labeledIndices(points.length).map((i) => (
                  <SvgText
                    key={`xtick-${points[i].date}`}
                    x={coords[i].x}
                    y={CHART_HEIGHT - 6}
                    fontSize={TICK_FONT}
                    fill={palette.muted}
                    textAnchor={
                      points.length === 1
                        ? "middle"
                        : i === 0
                          ? "start"
                          : i === points.length - 1
                            ? "end"
                            : "middle"
                    }
                  >
                    {formatDayLabel(points[i].date)}
                  </SvgText>
                ))}

                <Line
                  x1={coords[activeIndex].x}
                  x2={coords[activeIndex].x}
                  y1={PLOT_TOP}
                  y2={PLOT_TOP + plotHeight}
                  stroke={palette.muted}
                  strokeWidth={1}
                  strokeDasharray="3,3"
                />
                {points.length > 1 ? (
                  <Path
                    d={linePath}
                    stroke={palette.accent}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    fill="none"
                  />
                ) : null}
                {coords.map((c, i) => (
                  <Circle
                    key={`dot-${points[i].date}`}
                    cx={c.x}
                    cy={c.y}
                    r={i === activeIndex ? 6 : 4}
                    fill={palette.accent}
                    stroke={palette.card}
                    strokeWidth={2}
                  />
                ))}
              </Svg>

              {coords.map((c, i) => (
                <Pressable
                  key={`hit-${points[i].date}`}
                  testID={`spending-point-${points[i].date}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatDayLabel(points[i].date)}: ${formatCents(points[i].totalCents)}`}
                  onPress={() => setSelectedIndex(i)}
                  hitSlop={4}
                  style={[
                    STYLES.hit,
                    { left: c.x - HIT_SIZE / 2, top: c.y - HIT_SIZE / 2 },
                  ]}
                />
              ))}
            </>
          ) : null}
        </View>
      </View>

      <Text style={STYLES.xTitle}>receipt date</Text>
    </View>
  );
}

/**
 * Styles for the spending-over-time chart.
 */
const STYLES = StyleSheet.create({
  wrapper: { gap: 6 },
  readout: { fontSize: 14, color: palette.muted },
  readoutDate: { color: palette.muted, fontWeight: "600" },
  readoutAmount: { color: palette.text, fontWeight: "700" },
  row: { flexDirection: "row" },
  yTitleColumn: {
    width: Y_TITLE_WIDTH,
    height: CHART_HEIGHT - PLOT_BOTTOM,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  yTitle: {
    width: CHART_HEIGHT - PLOT_BOTTOM,
    textAlign: "center",
    fontSize: 12,
    color: palette.muted,
    transform: [{ rotate: "-90deg" }],
  },
  plot: { flex: 1, height: CHART_HEIGHT },
  hit: {
    position: "absolute",
    width: HIT_SIZE,
    height: HIT_SIZE,
    borderRadius: HIT_SIZE / 2,
  },
  xTitle: {
    fontSize: 12,
    color: palette.muted,
    textAlign: "center",
    marginLeft: Y_TITLE_WIDTH + PLOT_LEFT,
  },
});
