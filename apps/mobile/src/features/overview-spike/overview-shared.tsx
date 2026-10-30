import * as Haptics from "expo-haptics";
import { useRef, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import type { SharedValue } from "react-native-reanimated";

import { ProjectFavicon } from "../../components/ProjectFavicon";
import { SymbolView, type AppSymbolName } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { cn } from "../../lib/cn";
import { relativeTime } from "../../lib/time";
import { useSelectWorkspaceDetail } from "../workspace/useSelectWorkspaceDetail";
import { toneFor, type OverviewThread, type StateTone } from "./overview-model";

export function useOpenOverviewThread() {
  const selectDetail = useSelectWorkspaceDetail();
  return (item: OverviewThread) => {
    void Haptics.selectionAsync();
    selectDetail({
      name: "Thread",
      params: {
        environmentId: String(item.thread.environmentId),
        threadId: String(item.thread.id),
      },
    });
  };
}

export function ProjectIcon(props: { readonly item: OverviewThread; readonly size?: number }) {
  const { item } = props;
  return (
    <ProjectFavicon
      environmentId={item.thread.environmentId}
      faviconPath={item.project?.faviconPath}
      projectIcon={item.project?.projectIcon}
      projectTitle={item.projectTitle}
      size={props.size ?? 18}
      workspaceRoot={item.project?.workspaceRoot}
    />
  );
}

export function StatusGlyph(props: {
  readonly tone: StateTone;
  readonly size?: number;
  readonly muted?: boolean;
}) {
  const size = props.size ?? 28;
  return (
    <View
      className={cn("items-center justify-center rounded-full", props.tone.wash)}
      style={{ width: size, height: size, opacity: props.muted ? 0.6 : 1 }}
    >
      <SymbolView
        name={props.tone.icon}
        size={Math.round(size * 0.52)}
        tintColorClassName={props.tone.tint}
        type="monochrome"
        weight="semibold"
      />
    </View>
  );
}

export function SectionTitle(props: { readonly title: string; readonly trailing?: ReactNode }) {
  return (
    <View className="flex-row items-baseline justify-between px-5 pb-2 pt-5">
      <Text textRole="label" className="font-t3-bold uppercase tracking-wide text-foreground-muted">
        {props.title}
      </Text>
      {props.trailing}
    </View>
  );
}

interface SwipeSide {
  readonly label: string;
  readonly icon: AppSymbolName;
  readonly className: string;
  readonly onTrigger: () => void;
}

function SwipePane(props: { readonly side: SwipeSide; readonly align: "left" | "right" }) {
  return (
    <View
      className={cn(
        "flex-1 flex-row items-center gap-2 rounded-[22px] px-6",
        props.align === "left" ? "justify-start" : "justify-end",
        props.side.className,
      )}
    >
      <SymbolView
        name={props.side.icon}
        size={18}
        tintColor="#ffffff"
        type="monochrome"
        weight="semibold"
      />
      <Text textRole="footnote" className="font-t3-bold text-white">
        {props.side.label}
      </Text>
    </View>
  );
}

/** Mail-style row: past the threshold either side fires its action and springs back. */
export function SwipeCard(props: {
  readonly leading: SwipeSide;
  readonly trailing: SwipeSide;
  readonly children: ReactNode;
}) {
  const ref = useRef<SwipeableMethods>(null);
  const translation = useRef<SharedValue<number> | null>(null);
  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={1.6}
      leftThreshold={96}
      rightThreshold={96}
      overshootLeft={false}
      overshootRight={false}
      onSwipeableWillOpen={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }}
      onSwipeableOpen={() => {
        const opened = (translation.current?.value ?? 0) > 0 ? props.leading : props.trailing;
        opened.onTrigger();
        ref.current?.close();
      }}
      renderLeftActions={(_progress, value) => {
        translation.current = value;
        return (
          <View style={{ width: 160 }} className="flex-row">
            <SwipePane side={props.leading} align="left" />
          </View>
        );
      }}
      renderRightActions={(_progress, value) => {
        translation.current = value;
        return (
          <View style={{ width: 160 }} className="flex-row">
            <SwipePane side={props.trailing} align="right" />
          </View>
        );
      }}
    >
      {props.children}
    </ReanimatedSwipeable>
  );
}

export function PressableCard(props: {
  readonly onPress: () => void;
  readonly className?: string;
  readonly accessibilityLabel: string;
  readonly children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      onPress={props.onPress}
      className={props.className}
      style={({ pressed }) => ({
        opacity: pressed ? 0.75 : 1,
        transform: [{ scale: pressed ? 0.99 : 1 }],
      })}
    >
      {props.children}
    </Pressable>
  );
}

export function UnreadDot(props: { readonly visible: boolean; readonly className?: string }) {
  return (
    <View
      className={cn(
        "h-2 w-2 rounded-full",
        props.visible ? "bg-primary" : "bg-transparent",
        props.className,
      )}
    />
  );
}

/** A dense row for lists inside Pulse: glyph, title, reason, time. */
export function CompactThreadRow(props: {
  readonly item: OverviewThread;
  readonly showProject?: boolean;
}) {
  const { item } = props;
  const open = useOpenOverviewThread();
  const tone = toneFor(item);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.thread.title}. ${item.reason}`}
      onPress={() => open(item)}
      className="flex-row items-center gap-3 px-4 py-2.5"
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <StatusGlyph tone={tone} size={26} muted={item.state === "done" && !item.unread} />
      <View className="min-w-0 flex-1">
        <Text
          textRole="footnote"
          className={cn(
            item.unread || item.state === "needs" ? "font-t3-bold" : "font-t3-medium",
            "text-foreground",
          )}
          numberOfLines={1}
        >
          {item.thread.title}
        </Text>
        <Text textRole="label" className={cn("mt-0.5", tone.text)} numberOfLines={1}>
          {props.showProject ? `${item.projectTitle} - ${item.reason}` : item.reason}
        </Text>
      </View>
      <View className="items-end gap-1">
        <Text textRole="caption" className="tabular-nums text-foreground-tertiary">
          {relativeTime(item.at)}
        </Text>
        <UnreadDot visible={item.unread} />
      </View>
    </Pressable>
  );
}
