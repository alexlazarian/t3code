import { parseTimestampDate } from "../../timestampFormat";
import type { SidebarThreadStatus } from "../Sidebar.logic";

export type SidebarStatusLabel = {
  readonly label: string;
  readonly icon:
    | "working"
    | "waiting"
    | "approval"
    | "input"
    | "request"
    | "failed"
    | "woke"
    | "done";
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

export function resolveSidebarStatusLabel(input: {
  readonly status: SidebarThreadStatus;
  readonly goalActive: boolean;
  readonly isWoke: boolean;
  readonly isUnread: boolean;
}): SidebarStatusLabel | null {
  switch (input.status) {
    case "working":
      return {
        label: input.goalActive ? "Goal" : "Working",
        icon: "working",
        className: "text-info-foreground",
      };
    case "waiting":
      return { label: "Waiting", icon: "waiting", className: "text-muted-foreground" };
    case "approval":
      return { label: "Approval", icon: "approval", className: "text-warning-foreground" };
    case "input":
      return {
        label: "Input",
        icon: "input",
        className: "text-indigo-600 dark:text-indigo-300",
      };
    case "request":
      return { label: "Request", icon: "request", className: "text-guest-foreground" };
    case "limited":
      return { label: "Limited", icon: "failed", className: "text-warning-foreground" };
    case "failed":
      return { label: "Failed", icon: "failed", className: "text-error-foreground" };
  }
  if (input.isWoke) return { label: "Woke", icon: "woke", className: "text-warning-foreground" };
  if (input.isUnread) return { label: "Done", icon: "done", className: "text-success-foreground" };
  return null;
}
