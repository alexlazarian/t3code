import { useAtomValue } from "@effect/atom-react";
import { canSnooze, resolveSnoozePresets } from "@t3tools/client-runtime/state/thread-settled";
import { useState } from "react";
import { View } from "react-native";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Toast } from "../../components/ui/Toast";
import { useProjects } from "../../state/entities";
import { threadListEnvironmentsAtom } from "../../state/server";
import { environmentThreadShells, threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { useWorkspaceEnvironments } from "../../state/workspace";
import { useAtomValueWhileVisible, useHomeRouteVisible } from "../home/home-route-visibility";
import { ThreadUndoNotice } from "../home/ThreadUndoNotice";
import { useThreadListActions } from "../home/useThreadListActions";
import { useThreadListNow } from "../threads/use-thread-list-now";
import { useWorkspaceTabs } from "../workspace/WorkspaceTabsContext";
import { FeedConcept } from "./FeedConcept";
import { InboxConcept, type InboxActions } from "./InboxConcept";
import { buildOverviewThreads, buildPulse, isToday, type OverviewThread } from "./overview-model";
import { PulseConcept } from "./PulseConcept";

type Concept = "inbox" | "pulse" | "feed";

const CONCEPTS = [
  { value: "inbox", label: "Inbox" },
  { value: "pulse", label: "Pulse" },
  { value: "feed", label: "Feed" },
] as const satisfies ReadonlyArray<{ value: Concept; label: string }>;

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function OverviewScreen() {
  const insets = useSafeAreaInsets();
  const workspace = useWorkspaceTabs();
  const [concept, setConcept] = useState<Concept>("inbox");
  const [toast, setToast] = useState<{ readonly message: string; readonly key: number } | null>(
    null,
  );
  // The tab stays mounted under a pushed thread and while other tabs show; stop streaming then.
  const routeVisible = useHomeRouteVisible();
  const visible = routeVisible && (workspace?.state.selectedTab ?? "overview") === "overview";
  const threads = useAtomValueWhileVisible(
    environmentThreadShells.navigationThreadShellsAtom,
    visible,
  );
  const projects = useProjects();
  const environments = useWorkspaceEnvironments();
  const { machineByEnvironmentId, snoozePresetsByEnvironmentId } = useAtomValue(
    threadListEnvironmentsAtom,
  );
  const now = useThreadListNow(threads);
  const { settleThread, snoozeThread } = useThreadListActions();
  const visitThread = useAtomCommand(threadEnvironment.visit, { reportFailure: false });

  const items = buildOverviewThreads({ threads, projects, now });
  const doneToday = items.filter((item) => item.state === "done" && isToday(item.at, now)).length;

  const showToast = (message: string) => {
    clearTimeout(toastTimer);
    setToast({ message, key: Date.now() });
    toastTimer = setTimeout(() => setToast(null), 2_400);
  };

  const actions: InboxActions = {
    settle: (item: OverviewThread) => {
      void settleThread(item.thread);
    },
    markRead: (item: OverviewThread) => {
      void visitThread({
        environmentId: item.thread.environmentId,
        input: { threadId: item.thread.id, visitedAt: new Date().toISOString() },
      }).then((result) => {
        if (result._tag === "Success") showToast("Marked as read");
        else showToast("Could not mark as read");
      });
    },
    snooze: (item: OverviewThread) => {
      if (!canSnooze(item.thread, { now: new Date().toISOString() })) {
        showToast(
          item.state === "needs"
            ? "Can't snooze while it's waiting on you"
            : "This thread can't be snoozed right now",
        );
        return;
      }
      const presets = resolveSnoozePresets(new Date(), {
        presets: snoozePresetsByEnvironmentId.get(item.thread.environmentId),
      });
      const preset = presets[0];
      if (!preset) {
        showToast("No snooze options available");
        return;
      }
      void snoozeThread(item.thread, preset.snoozedUntil).then((ok) => {
        if (ok) showToast(`Snoozed until ${preset.whenLabel}`);
      });
    },
  };

  const environmentSummaries = environments
    .filter((environment) => environment.isEnabled)
    .map((environment) => ({
      environmentId: environment.environmentId,
      label: environment.environmentLabel,
      connectionState: environment.connectionState,
    }));

  return (
    <View className="flex-1 bg-screen">
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1 bg-screen"
        contentContainerStyle={{
          paddingBottom: Math.max(workspace?.bottomClearance ?? 0, insets.bottom) + 24,
        }}
      >
        <View className="px-4 pt-3">
          <SegmentedControl
            options={CONCEPTS}
            selected={concept}
            onSelect={setConcept}
            role="tab"
          />
        </View>
        <Animated.View
          key={concept}
          entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)}
        >
          {concept === "inbox" ? (
            <InboxConcept items={items} doneToday={doneToday} actions={actions} />
          ) : concept === "pulse" ? (
            <PulseConcept
              items={items}
              now={now}
              machines={buildPulse({
                items,
                environments: environmentSummaries,
                machineByEnvironmentId,
                now,
              })}
            />
          ) : (
            <FeedConcept items={items} now={now} />
          )}
        </Animated.View>
      </ScrollView>
      <ThreadUndoNotice visible={visible} />
      {toast ? (
        <View
          key={toast.key}
          pointerEvents="box-none"
          className="absolute z-[100]"
          style={{
            left: 20,
            right: 20,
            bottom: Math.max(insets.bottom, (workspace?.bottomClearance ?? 0) - 32) + 8,
          }}
        >
          <Toast message={toast.message} dismissMode="swipe" onDismiss={() => setToast(null)} />
        </View>
      ) : null}
    </View>
  );
}
