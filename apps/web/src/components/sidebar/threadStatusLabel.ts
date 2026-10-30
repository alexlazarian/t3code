import { parseTimestampDate } from "../../timestampFormat";
import type { SidebarThreadStatus } from "../Sidebar.logic";

export type SidebarStatusLabel = {
  readonly label: string;
  readonly icon: "working" | "waiting" | "approval" | "input" | "failed" | "plan" | "woke" | "done";
  readonly className: string;
};

export function isSidebarThreadWoke(input: {
  readonly wokeAt: string | null;
  readonly lastVisitedAt: string | undefined;
  readonly settledOverride: "settled" | "active" | null;
}): boolean {
  const wokeAt = input.wokeAt === null ? null : parseTimestampDate(input.wokeAt);
  const lastVisitedAt =
    input.lastVisitedAt === undefined ? null : parseTimestampDate(input.lastVisitedAt);
  return (
    wokeAt !== null &&
    (lastVisitedAt === null || lastVisitedAt < wokeAt) &&
    input.settledOverride !== "settled"
  );
}

/** A finished, unsettled thread reads Done; settled ones show a time instead. */
export function isSidebarThreadCompleted(thread: {
  readonly latestRun?: { readonly completedAt: unknown } | null;
  readonly settledOverride: "settled" | "active" | null;
}): boolean {
  return thread.latestRun?.completedAt != null && thread.settledOverride !== "settled";
}

export function resolveSidebarStatusLabel(input: {
  readonly status: SidebarThreadStatus;
  readonly goalActive: boolean;
  readonly hasActionableProposedPlan: boolean;
  readonly isWoke: boolean;
  readonly isUnread: boolean;
  readonly isCompleted: boolean;
}): SidebarStatusLabel | null {
  switch (input.status) {
    case "working":
      return {
        label: input.goalActive ? "Goal" : "Working",
        icon: "working",
        className: "text-status-working",
      };
    case "waiting":
      return { label: "Waiting", icon: "waiting", className: "text-muted-foreground" };
    case "approval":
      return { label: "Approval", icon: "approval", className: "text-status-needs-you" };
    case "input":
      return { label: "Input", icon: "input", className: "text-status-needs-you" };
    case "limited":
      return { label: "Limited", icon: "failed", className: "text-status-failed" };
    case "failed":
      return { label: "Failed", icon: "failed", className: "text-status-failed" };
  }
  if (input.status === "ready" && input.hasActionableProposedPlan) {
    return { label: "Plan ready", icon: "plan", className: "text-status-needs-you" };
  }
  if (input.isWoke) return { label: "Woke", icon: "woke", className: "text-warning-foreground" };
  if (input.isUnread || input.isCompleted) {
    return { label: "Done", icon: "done", className: "text-foreground" };
  }
  return null;
}
