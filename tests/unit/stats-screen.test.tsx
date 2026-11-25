/* eslint-disable @typescript-eslint/naming-convention -- mirrors route/auth mock shapes */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import StatsScreen from "@/app/(app)/stats";
import { type GroupListResult, loadGroupList } from "@/lib/group-data";
import {
  type GroupStatsResult,
  loadGroupStats,
  type StatsReceipt,
} from "@/lib/group-stats";

jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return {
    // Run the focus callback once on mount, like a screen gaining focus.
    useFocusEffect: (callback: () => void) => {
      useEffect(callback, [callback]);
    },
  };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock("@/lib/supabase", () => ({ SUPABASE: null, supabase: null }));

jest.mock("@/lib/group-data", () => {
  const actual = jest.requireActual<typeof import("@/lib/group-data")>(
    "@/lib/group-data"
  );
  return { ...actual, loadGroupList: jest.fn() };
});

jest.mock("@/lib/group-stats", () => {
  const actual = jest.requireActual<typeof import("@/lib/group-stats")>(
    "@/lib/group-stats"
  );
  return { ...actual, loadGroupStats: jest.fn() };
});

/** Typed Jest mock for `loadGroupList`. */
const MOCK_LOAD_GROUP_LIST = loadGroupList as jest.MockedFunction<
  typeof loadGroupList
>;
/** Typed Jest mock for `loadGroupStats`. */
const MOCK_LOAD_GROUP_STATS = loadGroupStats as jest.MockedFunction<
  typeof loadGroupStats
>;

/** Two groups, already sorted by name like `loadGroupList` returns them. */
const GROUPS: GroupListResult = {
  status: "ok",
  groups: [
    { id: "g1", name: "Apartment 4B" },
    { id: "g2", name: "Road Trip" },
  ],
};

/**
 * Builds a posted receipt for the stats mock.
 * @param id Receipt id
 * @param createdAt Receipt timestamp (local time)
 * @param totalCents Receipt total
 * @returns The receipt
 */
function receipt(id: string, createdAt: string, totalCents: number): StatsReceipt {
  return {
    id,
    title: "Safeway",
    totalCents,
    taxCents: 0,
    tipCents: 0,
    status: "submitted",
    createdAt,
  };
}

/**
 * Wraps receipts in an ok `loadGroupStats` result.
 * @param receipts Posted receipts
 * @returns The result
 */
function statsOf(receipts: StatsReceipt[]): GroupStatsResult {
  return { status: "ok", stats: { receipts, items: [] } };
}

describe("User Story 4.1 Task 1: Stats tab", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("US-4.1-T-1: lists the user's groups as chips with the first one selected and loads its stats", async () => {
    MOCK_LOAD_GROUP_LIST.mockResolvedValue(GROUPS);
    MOCK_LOAD_GROUP_STATS.mockResolvedValue(statsOf([]));

    const screen = await render(<StatsScreen />);

    expect(await screen.findByText("Apartment 4B")).toBeTruthy();
    expect(screen.getByText("Road Trip")).toBeTruthy();
    expect(
      screen.getByTestId("stats-group-g1").props.accessibilityState
    ).toEqual({ selected: true });
    expect(
      screen.getByTestId("stats-group-g2").props.accessibilityState
    ).toEqual({ selected: false });
    expect(MOCK_LOAD_GROUP_STATS).toHaveBeenCalledWith("g1");
  });

  it("US-4.1-T-1: selecting another group loads and shows that group's stats", async () => {
    MOCK_LOAD_GROUP_LIST.mockResolvedValue(GROUPS);
    MOCK_LOAD_GROUP_STATS.mockImplementation(async (groupId) =>
      groupId === "g1"
        ? statsOf([receipt("r1", "2026-11-02T12:00:00", 1000)])
        : statsOf([receipt("r2", "2026-11-04T12:00:00", 7525)])
    );

    const screen = await render(<StatsScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("stats-total-spent").props.children).toBe(
        "$10.00"
      )
    );

    await fireEvent.press(screen.getByTestId("stats-group-g2"));

    await waitFor(() =>
      expect(screen.getByTestId("stats-total-spent").props.children).toBe(
        "$75.25"
      )
    );
    expect(MOCK_LOAD_GROUP_STATS).toHaveBeenLastCalledWith("g2");
    expect(
      screen.getByTestId("stats-group-g2").props.accessibilityState
    ).toEqual({ selected: true });
  });

  it("US-4.1-T-1: a user with no groups sees the empty message", async () => {
    MOCK_LOAD_GROUP_LIST.mockResolvedValue({ status: "ok", groups: [] });

    const screen = await render(<StatsScreen />);

    expect(
      await screen.findByText("Join or create a group to see its stats.")
    ).toBeTruthy();
    expect(MOCK_LOAD_GROUP_STATS).not.toHaveBeenCalled();
  });

  it("US-4.1-T-1: shows the error and a retry button when the group's stats fail to load", async () => {
    MOCK_LOAD_GROUP_LIST.mockResolvedValue(GROUPS);
    MOCK_LOAD_GROUP_STATS.mockResolvedValueOnce({
      status: "error",
      message: "Network down",
    }).mockResolvedValueOnce(statsOf([]));

    const screen = await render(<StatsScreen />);
    expect(await screen.findByText("Network down")).toBeTruthy();

    await fireEvent.press(screen.getByText("Try again"));

    expect(await screen.findByText("No receipts yet.")).toBeTruthy();
    expect(MOCK_LOAD_GROUP_STATS).toHaveBeenCalledTimes(2);
  });

  it("US-4.1-T-1: the spending-over-time card shows the total and a graph labeled money spent by receipt date", async () => {
    MOCK_LOAD_GROUP_LIST.mockResolvedValue(GROUPS);
    MOCK_LOAD_GROUP_STATS.mockResolvedValue(
      statsOf([
        receipt("r1", "2026-11-02T12:00:00", 2500),
        receipt("r2", "2026-11-05T09:00:00", 1000),
        receipt("r3", "2026-11-05T19:00:00", 425),
      ])
    );

    const screen = await render(<StatsScreen />);

    expect(await screen.findByText("Spending over time")).toBeTruthy();
    expect(screen.getByTestId("stats-total-spent").props.children).toBe(
      "$39.25"
    );
    expect(screen.getByText("money spent")).toBeTruthy();
    expect(screen.getByText("receipt date")).toBeTruthy();

    const chart = screen.getByTestId("spending-over-time-chart");
    expect(chart.props.accessibilityLabel).toBe(
      "Money spent by receipt date: Nov 2 $25.00, Nov 5 $14.25"
    );

    // Points are drawn once the chart knows its width.
    await fireEvent(chart, "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 200 } },
    });
    await waitFor(() =>
      expect(screen.getByTestId("spending-point-2026-11-02")).toBeTruthy()
    );
    expect(screen.getByTestId("spending-point-2026-11-05")).toBeTruthy();

    // The latest point is shown first; tapping another point shows it instead.
    expect(screen.getByTestId("spending-readout")).toHaveTextContent(
      "Nov 5  $14.25"
    );
    await fireEvent.press(screen.getByTestId("spending-point-2026-11-02"));
    expect(screen.getByTestId("spending-readout")).toHaveTextContent(
      "Nov 2  $25.00"
    );
  });

  it("US-4.1-T-1: a group with no receipts shows No receipts yet instead of a graph", async () => {
    MOCK_LOAD_GROUP_LIST.mockResolvedValue(GROUPS);
    MOCK_LOAD_GROUP_STATS.mockResolvedValue(statsOf([]));

    const screen = await render(<StatsScreen />);

    expect(await screen.findByText("No receipts yet.")).toBeTruthy();
    expect(screen.getByTestId("stats-total-spent").props.children).toBe(
      "$0.00"
    );
    expect(screen.queryByTestId("spending-over-time-chart")).toBeNull();
  });
});
