import { useState } from "react";
import { Pressable, View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { cn } from "../../lib/cn";
import {
  FEED_TONES,
  buildFeed,
  clockLabel,
  dayLabel,
  type FeedEvent,
  type OverviewThread,
} from "./overview-model";
import { ProjectIcon, StatusGlyph, UnreadDot, useOpenOverviewThread } from "./overview-shared";

const PAGE = 80;

function FeedRow(props: { readonly event: FeedEvent; readonly last: boolean }) {
  const { event } = props;
  const open = useOpenOverviewThread();
  const tone = FEED_TONES[event.kind];
  const quiet = !event.unread;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${event.item.thread.title} ${event.phrase}`}
      onPress={() => open(event.item)}
      className="flex-row gap-3 px-5"
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <View className="items-center">
        <View className="pt-2.5">
          <StatusGlyph tone={tone} size={30} muted={quiet && event.kind === "started"} />
        </View>
        {props.last ? null : <View className="mt-1 w-px flex-1 bg-border-subtle" />}
      </View>
      <View className="min-w-0 flex-1 pb-4 pt-2.5">
        <Text
          textRole="footnote"
          className={cn("leading-snug", quiet ? "text-foreground-secondary" : "text-foreground")}
          numberOfLines={3}
        >
          <Text
            textRole="footnote"
            className={cn(quiet ? "font-t3-semibold" : "font-t3-bold", "text-foreground")}
          >
            {event.item.thread.title}
          </Text>{" "}
          <Text textRole="footnote" className={cn(quiet ? undefined : "font-t3-medium", tone.text)}>
            {event.phrase}
          </Text>
        </Text>
        <View className="mt-1 flex-row items-center gap-1.5">
          <ProjectIcon item={event.item} size={12} />
          <Text textRole="label" className="flex-shrink text-foreground-tertiary" numberOfLines={1}>
            {`${event.item.projectTitle} \u00b7 ${clockLabel(event.at)}`}
          </Text>
        </View>
      </View>
      <View className="pt-4">
        <UnreadDot visible={event.unread} />
      </View>
    </Pressable>
  );
}

export function FeedConcept(props: {
  readonly items: ReadonlyArray<OverviewThread>;
  readonly now: string;
}) {
  const [limit, setLimit] = useState(PAGE);
  const events = buildFeed(props.items, props.now);
  const shown = events.slice(0, limit);
  const days: Array<{ label: string; events: FeedEvent[] }> = [];
  for (const event of shown) {
    const label = dayLabel(event.at, props.now);
    const current = days[days.length - 1];
    if (current?.label === label) current.events.push(event);
    else days.push({ label, events: [event] });
  }
  const unread = events.filter((event) => event.unread).length;
  if (events.length === 0) {
    return (
      <View className="items-center px-10 pt-20">
        <Text textRole="title" className="font-t3-bold">
          Nothing yet
        </Text>
        <Text textRole="body" className="mt-2 text-center text-foreground-muted">
          Agent activity from the last two weeks shows up here.
        </Text>
      </View>
    );
  }
  return (
    <View>
      {unread > 0 ? (
        <Text textRole="footnote" className="px-5 pt-4 text-foreground-muted">
          {unread} new since you last looked
        </Text>
      ) : null}
      {days.map((day) => (
        <View key={day.label}>
          <View className="flex-row items-baseline gap-2 px-5 pb-1 pt-5">
            <Text textRole="headline" className="font-t3-bold text-foreground">
              {day.label}
            </Text>
            <Text textRole="caption" className="tabular-nums text-foreground-tertiary">
              {day.events.length}
            </Text>
          </View>
          {day.events.map((event, index) => (
            <FeedRow key={event.key} event={event} last={index === day.events.length - 1} />
          ))}
        </View>
      ))}
      {events.length > limit ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setLimit(limit + PAGE)}
          className="mx-5 mb-4 mt-2 items-center rounded-2xl bg-card py-3"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text textRole="footnote" className="font-t3-semibold text-primary">
            Show {Math.min(PAGE, events.length - limit)} more
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
