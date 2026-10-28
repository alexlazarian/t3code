export interface InfoBarThread {
  readonly title: string;
  readonly status: string | null;
  readonly project: string | null;
  readonly machine: string | null;
  readonly offline: boolean;
  readonly branch: string | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly access: string | null;
  readonly pullRequest: { readonly number: number } | null;
}

export interface InfoBarTarget {
  readonly info?: string | undefined;
  readonly ariaLabel?: string | undefined;
  readonly threadKey?: string | undefined;
  /** The element's role attribute, or its tag name when it has none. */
  readonly role?: string | undefined;
}

const CONTAINER_ROLES = new Set([
  "nav",
  "navigation",
  "region",
  "main",
  "aside",
  "grid",
  "rowgroup",
  "list",
]);

function formatInfoBarThread(thread: InfoBarThread): string {
  const place = [
    thread.project,
    thread.machine === null ? null : `${thread.machine}${thread.offline ? " (offline)" : ""}`,
  ]
    .filter((part) => part !== null)
    .join(" on ");
  const where = [place || null, thread.branch].filter((part) => part !== null).join(", ");
  const model = [thread.provider, thread.model].filter((part) => part !== null).join(" ");
  const agent = [model || null, thread.access].filter((part) => part !== null).join(", ");
  const sentences = [
    `${thread.title}: ${thread.status ?? "Done"}.`,
    where ? `${where}.` : null,
    agent ? `${agent}.` : null,
    thread.pullRequest === null ? null : `PR #${thread.pullRequest.number}.`,
  ];
  return sentences.filter((part) => part !== null).join(" ");
}

export function resolveInfoBarText(
  target: InfoBarTarget,
  lookup: (threadKey: string) => InfoBarThread | null,
): string | null {
  if (target.info) return target.info;
  if (target.threadKey) {
    const thread = lookup(target.threadKey);
    if (thread) return formatInfoBarThread(thread);
  }
  if (target.role !== undefined && CONTAINER_ROLES.has(target.role)) return null;
  return target.ariaLabel || null;
}
