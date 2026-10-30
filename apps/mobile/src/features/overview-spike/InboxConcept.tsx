import { View } from "react-native";

import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { cn } from "../../lib/cn";
import { relativeTime } from "../../lib/time";
import { buildInbox, toneFor, type OverviewThread } from "./overview-model";
import {
  PressableCard,
  ProjectIcon,
  SectionTitle,
  StatusGlyph,
  SwipeCard,
  useOpenOverviewThread,
} from "./overview-shared";

export interface InboxActions {
  readonly settle: (item: OverviewThread) => void;
  readonly markRead: (item: OverviewThread) => void;
  readonly snooze: (item: OverviewThread) => void;
}

function InboxCard(props: { readonly item: OverviewThread; readonly actions: InboxActions }) {
  const { item, actions } = props;
  const open = useOpenOverviewThread();
  const tone = toneFor(item);
  const finished = item.state === "done";
  return (
    <View className="px-4 pb-3">
      <SwipeCard
        leading={
          finished
            ? {
                label: "Mark read",
                icon: "checkmark.circle",
                className: "bg-adaptive-sky-600-400",
                onTrigger: () => actions.markRead(item),
              }
            : {
                label: "Settle",
                icon: "checkmark",
                className: "bg-adaptive-emerald-600-400",
                onTrigger: () => actions.settle(item),
              }
        }
        trailing={{
          label: "Snooze",
          icon: "clock",
          className: "bg-adaptive-indigo-600-300",
          onTrigger: () => actions.snooze(item),
        }}
      >
        <PressableCard
          accessibilityLabel={`${item.thread.title}. ${item.reason}`}
          onPress={() => open(item)}
          className="rounded-[22px] border border-border-subtle bg-card px-4 py-3.5"
        >
          <View className="flex-row items-center gap-2">
            <ProjectIcon item={item} size={16} />
            <Text
              textRole="label"
              className="flex-1 font-t3-semibold text-foreground-muted"
              numberOfLines={1}
            >
              {item.projectTitle}
            </Text>
            <Text textRole="caption" className="tabular-nums text-foreground-tertiary">
              {relativeTime(item.at)}
            </Text>
          </View>
          <Text textRole="headline" className="mt-2 font-t3-semibold" numberOfLines={2}>
            {item.thread.title}
          </Text>
          <View className="mt-2 flex-row items-center gap-2">
            <StatusGlyph tone={tone} size={22} />
            <Text
              textRole="footnote"
              className={cn("flex-1 font-t3-semibold", tone.text)}
              numberOfLines={1}
            >
              {item.reason}
            </Text>
          </View>
          {item.detail ? (
            <Text
              textRole="footnote"
              className="mt-1.5 leading-snug text-foreground-muted"
              numberOfLines={2}
            >
              {item.detail}
            </Text>
          ) : null}
        </PressableCard>
      </SwipeCard>
    </View>
  );
}

function AllClear(props: { readonly working: number; readonly doneToday: number }) {
  return (
    <View className="items-center px-10 pb-10 pt-16">
      <View className="h-20 w-20 items-center justify-center rounded-full bg-adaptive-emerald-500-a12-a16">
        <SymbolView
          name="checkmark.circle"
          size={40}
          tintColorClassName="accent-adaptive-emerald-700-300"
          weight="semibold"
        />
      </View>
      <Text textRole="title" className="mt-5 font-t3-bold">
        All clear
      </Text>
      <Text textRole="body" className="mt-2 text-center text-foreground-muted">
        Nothing needs you right now.
      </Text>
      <View className="mt-6 flex-row gap-3">
        <View className="items-center rounded-2xl bg-card px-5 py-3">
          <Text textRole="title" className="font-t3-bold tabular-nums text-adaptive-sky-600-400">
            {props.working}
          </Text>
          <Text textRole="caption" className="text-foreground-muted">
            working
          </Text>
        </View>
        <View className="items-center rounded-2xl bg-card px-5 py-3">
          <Text
            textRole="title"
            className="font-t3-bold tabular-nums text-adaptive-emerald-700-300"
          >
            {props.doneToday}
          </Text>
          <Text textRole="caption" className="text-foreground-muted">
            done today
          </Text>
        </View>
      </View>
    </View>
  );
}

export function InboxConcept(props: {
  readonly items: ReadonlyArray<OverviewThread>;
  readonly doneToday: number;
  readonly actions: InboxActions;
}) {
  const inbox = buildInbox(props.items);
  if (inbox.total === 0) return <AllClear working={inbox.working} doneToday={props.doneToday} />;
  return (
    <View>
      {inbox.sections.map((section) => (
        <View key={section.key}>
          <SectionTitle
            title={section.title}
            trailing={
              <Text textRole="caption" className="tabular-nums text-foreground-tertiary">
                {section.items.length}
              </Text>
            }
          />
          {section.items.map((item) => (
            <InboxCard key={item.key} item={item} actions={props.actions} />
          ))}
        </View>
      ))}
      <View className="flex-row items-center justify-center gap-2 px-8 pb-6 pt-4">
        <SymbolView
          name="circle.dashed"
          size={13}
          tintColorClassName="accent-foreground-tertiary"
          type="monochrome"
        />
        <Text textRole="label" className="text-center text-foreground-tertiary">
          {inbox.working === 0
            ? "No agents working"
            : `${inbox.working} ${inbox.working === 1 ? "agent" : "agents"} working, nothing else needs you`}
          {inbox.snoozed > 0 ? ` - ${inbox.snoozed} snoozed` : ""}
        </Text>
      </View>
    </View>
  );
}
