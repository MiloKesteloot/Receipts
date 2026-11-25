import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Platform,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BOTTOM_TAB_CLEARANCE } from "@/components/bottom-tab-bar";
import { CreateGroupForm } from "@/components/create-group-form";
import { EmptyState } from "@/components/empty-state";
import {
  HomeBalanceCard,
  HomeGroupCard,
} from "@/components/home-overview-cards";
import { JoinGroupModal } from "@/components/join-group-modal";
import { UsersIcon } from "@/components/icons";
import { NewGroupButton } from "@/components/NewGroupButton";
import { ScalePressable } from "@/components/scale-pressable";
import { SkeletonScreen } from "@/components/skeleton";
import { Toast, ToastType } from "@/components/toast";
import { useAuth } from "@/lib/auth-provider";
import { type CreatedGroup } from "@/lib/create-group";
import {
  type HomeOverview,
  loadHomeOverview,
  resolveDisplayName,
} from "@/lib/home-overview";
import { createThemedStyles } from "@/lib/theme";

type GroupSummary = { id: string; name: string };

/**
 * Today's date as a short eyebrow label, e.g. "Tuesday, Nov 24".
 * @returns Formatted date
 */
function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

/**
 * Main Home overview screen displaying personalized greeting, user balances,
 * and group summary cards.
 * @returns JSX element
 */
export default function Index(): JSX.Element {
  const styles = useStyles();
  const { session } = useAuth();
  const [overview, setOverview] = useState<HomeOverview | null>(null);
  const [loading, setLoading] = useState(true); // first load only
  const [refreshing, setRefreshing] = useState(false); // pull-to-refresh
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  // True while a group is being created or its share sheet is open (US 1.2).
  const createBusyRef = useRef(false);
  const [toastState, setToastState] = useState<{
    message: string;
    type: ToastType;
  } | null>(null);

  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 80 : insets.top + 24;

  const activeUser = useMemo(() => {
    const user = session?.user;
    if (!user) return undefined;
    return {
      id: user.id,
      email: user.email,
      fullName: user.user_metadata?.full_name as string | undefined,
      name: user.user_metadata?.name as string | undefined,
    };
  }, [session]);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      setError(null);

      const result = await loadHomeOverview({ user: activeUser });
      if (result.status === "ok") {
        setOverview(result.overview);
      } else {
        setError(result.message);
      }
      setLoading(false);
      setRefreshing(false);
    },
    [activeUser]
  );

  useEffect(() => {
    load("initial");
  }, [load]);

  // The group screen sends a toast here after leaving or deleting a group
  // (US 2.4). toastKey changes on every send, so repeats still show. The
  // list itself is refreshed by the focus effect below when we land here.
  const { toastMessage, toastType, toastKey, removedGroupId } =
    useLocalSearchParams<{
      toastMessage?: string;
      toastType?: string;
      toastKey?: string;
      removedGroupId?: string;
    }>();
  useEffect(() => {
    // Hide the left/deleted group at once, before the refresh returns.
    if (removedGroupId) {
      setOverview((prev) =>
        prev
          ? {
              ...prev,
              groups: prev.groups.filter((g) => g.id !== removedGroupId),
            }
          : prev
      );
    }
    if (!toastMessage) return;
    setToastState({
      message: toastMessage,
      type: (toastType as ToastType) || "info",
    });
  }, [toastMessage, toastType, toastKey, removedGroupId]);

  useFocusEffect(
    useCallback(() => {
      load("refresh");
    }, [load])
  );

  const handleOpenModal = () => {
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    // Closing under the iOS share sheet can freeze the app (US 1.2).
    if (createBusyRef.current) return;
    setModalVisible(false);
  };

  const handleGroupCreated = (group: CreatedGroup) => {
    setModalVisible(false);
    load("refresh");
    router.push({
      pathname: "/groups/[id]",
      params: {
        id: group.id,
        toastMessage: `Successfully created group ${group.name}`,
        toastType: "success",
        toastKey: String(Date.now()),
      },
    });
  };

  const handleGroupJoined = (
    _group: GroupSummary,
    status: "JOINED" | "ALREADY_MEMBER",
    message: string
  ) => {
    setModalVisible(false);
    load("refresh");
    setToastState({
      message,
      type: status === "ALREADY_MEMBER" ? "info" : "success",
    });
  };

  if (loading && !overview) {
    return <SkeletonScreen paddingTop={topPadding} />;
  }

  if (error && !overview) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <ScalePressable onPress={() => load("initial")} style={styles.button}>
          <Text style={styles.buttonText}>Try again</Text>
        </ScalePressable>
      </View>
    );
  }

  const greetingName =
    overview?.displayName ??
    resolveDisplayName({
      fullName: activeUser?.fullName,
      name: activeUser?.name,
      email: activeUser?.email,
    });
  const balances = overview?.balances ?? { owedToMeCents: 0, iOweCents: 0 };
  const groups = overview?.groups ?? [];

  return (
    <View style={styles.container}>
      <FlatList
        style={styles.screen}
        contentContainerStyle={[styles.list, { paddingTop: topPadding }]}
        data={groups}
        keyExtractor={(g) => g.id}
        onRefresh={() => load("refresh")}
        refreshing={refreshing}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.eyebrow}>{todayLabel()}</Text>
            <Text style={styles.title}>{`Hi, ${greetingName}`}</Text>
            <View style={styles.subtitleRow}>
              <Text style={styles.subtitle}>
                Here&apos;s where your groups and balances stand.
              </Text>
              <NewGroupButton onPress={handleOpenModal} />
            </View>
            <HomeBalanceCard
              owedToMeCents={balances.owedToMeCents}
              iOweCents={balances.iOweCents}
            />
            {error ? <Text style={styles.inlineError}>{error}</Text> : null}
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Your groups</Text>
              {groups.length > 0 ? (
                <Text style={styles.sectionCount}>{groups.length}</Text>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon={UsersIcon}
            title="You're not in any groups yet."
            message="Create a group for your next dinner or trip, or join one with an invite code."
            actionLabel="Get started"
            onAction={handleOpenModal}
          />
        }
        renderItem={({ item, index }) => (
          <HomeGroupCard
            group={item}
            index={index}
            onPress={() =>
              router.push({
                pathname: "/groups/[id]",
                params: { id: item.id },
              })
            }
          />
        )}
      />
      <JoinGroupModal
        visible={modalVisible}
        userId={session?.user.id}
        onClose={handleCloseModal}
        onSuccess={handleGroupJoined}
        renderCreateSection={() => (
          <CreateGroupForm
            onCreated={handleGroupCreated}
            onBusyChange={(busy) => {
              createBusyRef.current = busy;
            }}
          />
        )}
      />
      {toastState ? (
        <Toast
          visible={Boolean(toastState)}
          message={toastState.message}
          type={toastState.type}
          onDismiss={() => setToastState(null)}
        />
      ) : null}
    </View>
  );
}

/**
 * Styles for the Index screen.
 */
const useStyles = createThemedStyles((palette) => ({
  container: { flex: 1, backgroundColor: palette.bg },
  screen: { backgroundColor: palette.bg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 24,
    backgroundColor: palette.bg,
  },
  list: { padding: 20, paddingBottom: BOTTOM_TAB_CLEARANCE, gap: 12 },
  header: { marginBottom: 2, gap: 8 },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: palette.accent,
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    color: palette.text,
    letterSpacing: -0.8,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },
  subtitle: { flex: 1, fontSize: 15, lineHeight: 21, color: palette.muted },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: palette.text,
    letterSpacing: -0.3,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.muted,
    backgroundColor: palette.surface,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: "hidden",
  },
  inlineError: { fontSize: 13, color: palette.error },
  button: {
    backgroundColor: palette.accent,
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 999,
  },
  buttonText: { color: palette.onAccent, fontSize: 16, fontWeight: "700" },
  error: { color: palette.error, textAlign: "center" },
}));
