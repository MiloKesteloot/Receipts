import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BOTTOM_TAB_CLEARANCE } from "@/components/bottom-tab-bar";
import { CreateGroupForm } from "@/components/create-group-form";
import {
  HomeBalanceCard,
  HomeGroupCard,
} from "@/components/home-overview-cards";
import { JoinGroupModal } from "@/components/join-group-modal";
import { NewGroupButton } from "@/components/NewGroupButton";
import { Toast, ToastType } from "@/components/toast";
import { useAuth } from "@/lib/auth-provider";
import { type CreatedGroup } from "@/lib/create-group";
import {
  type HomeOverview,
  loadHomeOverview,
  resolveDisplayName,
} from "@/lib/home-overview";
import { palette } from "@/lib/palette";

type GroupSummary = { id: string; name: string };

/**
 * Main Home overview screen displaying personalized greeting, user balances,
 * and group summary cards.
 * @returns JSX element
 */
export default function Index(): JSX.Element {
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
    return (
      <View style={STYLES.center}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  if (error && !overview) {
    return (
      <View style={STYLES.center}>
        <Text style={STYLES.error}>{error}</Text>
        <Pressable onPress={() => load("initial")} style={STYLES.button}>
          <Text style={STYLES.buttonText}>Try again</Text>
        </Pressable>
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
    <View style={STYLES.container}>
      <FlatList
        style={STYLES.screen}
        contentContainerStyle={[STYLES.list, { paddingTop: topPadding }]}
        data={groups}
        keyExtractor={(g) => g.id}
        onRefresh={() => load("refresh")}
        refreshing={refreshing}
        ListHeaderComponent={
          <View style={STYLES.header}>
            <Text style={STYLES.title}>{`Hi, ${greetingName}`}</Text>
            <View style={STYLES.subtitleRow}>
              <Text style={STYLES.subtitle}>
                Here&apos;s where your groups and balances stand.
              </Text>
              <NewGroupButton onPress={handleOpenModal} />
            </View>
            <HomeBalanceCard
              owedToMeCents={balances.owedToMeCents}
              iOweCents={balances.iOweCents}
            />
            {error ? <Text style={STYLES.inlineError}>{error}</Text> : null}
            <Text style={STYLES.sectionTitle}>Your groups</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={STYLES.emptyCard}>
            <Text style={STYLES.emptyText}>You&apos;re not in any groups yet.</Text>
          </View>
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
const STYLES = StyleSheet.create({
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
  list: { padding: 24, paddingBottom: BOTTOM_TAB_CLEARANCE, gap: 12 },
  header: { marginBottom: 4, gap: 10 },
  title: { fontSize: 30, fontWeight: "800", color: palette.text },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 4,
  },
  subtitle: { flex: 1, fontSize: 15, color: palette.muted },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: palette.text,
    marginTop: 4,
  },
  inlineError: { fontSize: 13, color: palette.error },
  emptyCard: {
    padding: 24,
    alignItems: "center",
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
  },
  emptyText: { color: palette.muted, fontSize: 15 },
  button: {
    backgroundColor: palette.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: { color: "white", fontSize: 16, fontWeight: "700" },
  error: { color: palette.error, textAlign: "center" },
});
