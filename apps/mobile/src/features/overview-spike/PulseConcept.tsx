import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { ENVIRONMENT_MACHINE_SYMBOLS } from "../../components/EnvironmentMachineSymbol";
import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { cn } from "../../lib/cn";
import { ConnectionStatusDot } from "../connection/ConnectionStatusDot";
import {
  STATE_TONES,
  matchesPulseFilter,
  sortByImportance,
  type OverviewState,
  type OverviewThread,
  type PulseFilter,
  type PulseMachine,
  type PulseProject,
  type StateTone,
} from "./overview-model";
import { CompactThreadRow, ProjectIcon, SectionTitle } from "./overview-shared";

const FILTERS: ReadonlyArray<{
  readonly key: PulseFilter;
  readonly label: string;
  readonly tone: StateTone;
}> = [
  { key: "needs", label: "Needs you", tone: STATE_TONES.needs },
  { key: "working", label: "Working", tone: STATE_TONES.working },
  { key: "doneToday", label: "Done today", tone: STATE_TONES.done },
  { key: "failed", label: "Failed", tone: STATE_TONES.failed },
];

function CountTile(props: {
  readonly label: string;
  readonly count: number;
  readonly tone: StateTone;
  readonly selected: boolean;
  readonly dimmed: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected }}
      accessibilityLabel={`${props.count} ${props.label}`}
      onPress={props.onPress}
      className={cn(
        "flex-1 rounded-[20px] border px-3.5 pb-3 pt-2.5",
        props.selected ? cn(props.tone.wash, "border-transparent") : "border-border-subtle bg-card",
      )}
      style={({ pressed }) => ({
        opacity: pressed ? 0.7 : props.dimmed ? 0.45 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <View className="flex-row items-center justify-between">
        <SymbolView
          name={props.tone.icon}
          size={15}
          tintColorClassName={props.count > 0 ? props.tone.tint : "accent-foreground-tertiary"}
          type="monochrome"
          weight="semibold"
        />
        {props.selected ? (
          <SymbolView
            name="xmark.circle.fill"
            size={14}
            tintColorClassName={props.tone.tint}
            type="monochrome"
          />
        ) : null}
      </View>
      <Text
        className={cn(
          "mt-1.5 font-t3-bold tabular-nums",
          props.count > 0 ? props.tone.text : "text-foreground-tertiary",
        )}
        style={{ fontSize: 34, lineHeight: 38 }}
      >
        {props.count}
      </Text>
      <Text textRole="label" className="font-t3-medium text-foreground-muted" numberOfLines={1}>
        {props.label}
      </Text>
    </Pressable>
  );
}

const CONNECTION_LABELS: Record<PulseMachine["connectionState"], string> = {
  connected: "Online",
  connecting: "Connecting",
  reconnecting: "Reconnecting",
  available: "Not connected",
  offline: "Offline",
  error: "Error",
  unsupported: "Unsupported",
};

const BAR_ORDER: ReadonlyArray<OverviewState> = ["needs", "failed", "working", "done", "idle"];

function StateBar(props: { readonly counts: Record<OverviewState, number> }) {
  const total = BAR_ORDER.reduce((sum, state) => sum + props.counts[state], 0);
  if (total === 0) return null;
  // Few threads read better as dots; many as a proportional bar.
  if (total <= 6) {
    return (
      <View className="flex-row gap-1">
        {BAR_ORDER.flatMap((state) =>
          Array.from({ length: props.counts[state] }, (_, index) => (
            <View
              key={`${state}:${index}`}
              className={cn("h-2 w-2 rounded-full", STATE_TONES[state].fill)}
              style={{ opacity: state === "idle" ? 0.5 : 1 }}
            />
          )),
        )}
      </View>
    );
  }
  return (
    <View className="h-2 w-16 flex-row overflow-hidden rounded-full bg-subtle">
      {BAR_ORDER.map((state) =>
        props.counts[state] > 0 ? (
          <View
            key={state}
            className={STATE_TONES[state].fill}
            style={{ flex: props.counts[state], opacity: state === "idle" ? 0.5 : 1 }}
          />
        ) : null,
      )}
    </View>
  );
}

function ProjectRow(props: {
  readonly project: PulseProject;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly last: boolean;
}) {
  const { project } = props;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: props.expanded }}
        accessibilityLabel={`${project.item.projectTitle}. ${project.headline.label}: ${project.headline.title}`}
        onPress={props.onToggle}
        className="flex-row items-center gap-3 px-4 py-3"
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        <ProjectIcon item={project.item} size={22} />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            <Text
              textRole="body"
              className="min-w-0 flex-shrink font-t3-semibold text-foreground"
              numberOfLines={1}
            >
              {project.item.projectTitle}
            </Text>
            <StateBar counts={project.counts} />
          </View>
          <Text textRole="footnote" className="mt-0.5 text-foreground-muted" numberOfLines={1}>
            <Text
              textRole="footnote"
              className={cn("font-t3-semibold", project.headline.tone.text)}
            >
              {project.headline.label}:
            </Text>{" "}
            {project.headline.title}
          </Text>
        </View>
        <SymbolView
          name={props.expanded ? "chevron.down" : "chevron.right"}
          size={12}
          tintColorClassName="accent-foreground-tertiary"
          type="monochrome"
          weight="semibold"
        />
      </Pressable>
      {props.expanded ? (
        <View className="pb-1.5">
          {project.items.slice(0, 12).map((item) => (
            <View key={item.key} className="pl-6">
              <CompactThreadRow item={item} />
            </View>
          ))}
          {project.items.length > 12 ? (
            <Text textRole="label" className="px-4 pb-2 pl-[70px] text-foreground-tertiary">
              {project.items.length - 12} more in Chats
            </Text>
          ) : null}
        </View>
      ) : null}
      {props.last ? null : <View className="ml-[54px] h-px bg-border-subtle" />}
    </View>
  );
}

function MachineSection(props: {
  readonly machine: PulseMachine;
  readonly expanded: ReadonlySet<string>;
  readonly onToggle: (key: string) => void;
}) {
  const { machine } = props;
  const [showQuiet, setShowQuiet] = useState(false);
  const projects = showQuiet ? [...machine.projects, ...machine.quietProjects] : machine.projects;
  return (
    <View className="px-4 pb-2">
      <View className="flex-row items-center gap-2 px-1 pb-2 pt-5">
        <ConnectionStatusDot state={machine.connectionState} pulse={false} size={8} />
        {machine.machineKind ? (
          <SymbolView
            name={ENVIRONMENT_MACHINE_SYMBOLS[machine.machineKind]}
            size={14}
            tintColorClassName="accent-foreground-muted"
            type="monochrome"
          />
        ) : null}
        <Text
          textRole="footnote"
          className="flex-1 font-t3-bold uppercase tracking-wide text-foreground-muted"
          numberOfLines={1}
        >
          {machine.label}
        </Text>
        <Text textRole="caption" className="text-foreground-tertiary">
          {CONNECTION_LABELS[machine.connectionState]}
        </Text>
      </View>
      <View className="overflow-hidden rounded-[22px] border border-border-subtle bg-card">
        {projects.length === 0 ? (
          <Text textRole="footnote" className="px-4 py-3.5 text-foreground-tertiary">
            Nothing active in the last few days
          </Text>
        ) : (
          projects.map((project, index) => (
            <ProjectRow
              key={project.key}
              project={project}
              expanded={props.expanded.has(project.key)}
              onToggle={() => props.onToggle(project.key)}
              last={index === projects.length - 1 && machine.quietProjects.length === 0}
            />
          ))
        )}
        {machine.quietProjects.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowQuiet((value) => !value)}
            className="flex-row items-center gap-2 border-t border-border-subtle px-4 py-3"
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text textRole="footnote" className="flex-1 text-foreground-tertiary">
              {showQuiet
                ? "Hide quiet projects"
                : `${machine.quietProjects.length} quiet ${machine.quietProjects.length === 1 ? "project" : "projects"}`}
            </Text>
            <SymbolView
              name={showQuiet ? "chevron.up" : "chevron.down"}
              size={11}
              tintColorClassName="accent-foreground-tertiary"
              type="monochrome"
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function PulseConcept(props: {
  readonly items: ReadonlyArray<OverviewThread>;
  readonly machines: ReadonlyArray<PulseMachine>;
  readonly now: string;
}) {
  const [filter, setFilter] = useState<PulseFilter | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const counts = Object.fromEntries(
    FILTERS.map((entry) => [
      entry.key,
      props.items.filter((item) => matchesPulseFilter(item, entry.key, props.now)).length,
    ]),
  ) as Record<PulseFilter, number>;
  const filtered = filter
    ? sortByImportance(props.items.filter((item) => matchesPulseFilter(item, filter, props.now)))
    : [];
  const activeFilter = FILTERS.find((entry) => entry.key === filter);
  return (
    <View>
      <View className="gap-2.5 px-4 pt-4">
        <View className="flex-row gap-2.5">
          {FILTERS.slice(0, 2).map((entry) => (
            <CountTile
              key={entry.key}
              label={entry.label}
              count={counts[entry.key]}
              tone={entry.tone}
              selected={filter === entry.key}
              dimmed={filter !== null && filter !== entry.key}
              onPress={() => {
                void Haptics.selectionAsync();
                setFilter(filter === entry.key ? null : entry.key);
              }}
            />
          ))}
        </View>
        <View className="flex-row gap-2.5">
          {FILTERS.slice(2).map((entry) => (
            <CountTile
              key={entry.key}
              label={entry.label}
              count={counts[entry.key]}
              tone={entry.tone}
              selected={filter === entry.key}
              dimmed={filter !== null && filter !== entry.key}
              onPress={() => {
                void Haptics.selectionAsync();
                setFilter(filter === entry.key ? null : entry.key);
              }}
            />
          ))}
        </View>
      </View>
      {activeFilter ? (
        <View>
          <SectionTitle
            title={activeFilter.label}
            trailing={
              <Pressable accessibilityRole="button" onPress={() => setFilter(null)} hitSlop={8}>
                <Text textRole="label" className="font-t3-semibold text-primary">
                  Show all
                </Text>
              </Pressable>
            }
          />
          <View className="mx-4 overflow-hidden rounded-[22px] border border-border-subtle bg-card py-1">
            {filtered.length === 0 ? (
              <Text textRole="footnote" className="px-4 py-3 text-foreground-tertiary">
                Nothing here right now
              </Text>
            ) : (
              filtered.map((item) => <CompactThreadRow key={item.key} item={item} showProject />)
            )}
          </View>
        </View>
      ) : (
        props.machines.map((machine) => (
          <MachineSection
            key={machine.environmentId}
            machine={machine}
            expanded={expanded}
            onToggle={(key) => {
              void Haptics.selectionAsync();
              const next = new Set(expanded);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              setExpanded(next);
            }}
          />
        ))
      )}
      <Text textRole="caption" className="px-8 pb-4 pt-4 text-center text-foreground-tertiary">
        {props.items.length} threads across {props.machines.length}{" "}
        {props.machines.length === 1 ? "machine" : "machines"}
      </Text>
    </View>
  );
}
