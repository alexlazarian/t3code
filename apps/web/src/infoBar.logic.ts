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
  readonly pullRequest: { readonly number: number; readonly state: string | null } | null;
}

export interface InfoBarTarget {
  readonly info?: string | undefined;
  readonly ariaLabel?: string | undefined;
  readonly threadKey?: string | undefined;
}

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
    thread.pullRequest === null
      ? null
      : `PR #${thread.pullRequest.number}${thread.pullRequest.state ? ` ${thread.pullRequest.state}` : ""}.`,
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
  return target.ariaLabel || null;
}
