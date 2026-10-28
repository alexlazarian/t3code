import { useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  AuthOrchestrationOperateScope,
  type EnvironmentId,
  type ScheduledTask,
} from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { readEnvironmentScope } from "../../state/session";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useAtomCommand } from "../../state/use-atom-command";
import { scheduleLabel } from "../settings/ScheduledTasksSettings";
import { stackedThreadToast, toastManager } from "../ui/toast";
import type { LibraryContext } from "./Library.logic";
import { LibraryItemList } from "./LibraryItemList";
import { moveSettingsIntoLibrary } from "../settings/settingsPlacement";

export function LibraryScheduled(props: { readonly ctx: LibraryContext }) {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const environmentId = props.ctx.environmentId ?? primaryEnvironmentId;
  return environmentId === null ? (
    <LibraryItemList items={[]} empty="No machine is connected." />
  ) : (
    <ScheduledTaskList environmentId={environmentId} />
  );
}

function ScheduledTaskList(props: { readonly environmentId: EnvironmentId }) {
  const { environmentId } = props;
  const tasksQuery = useEnvironmentQuery(
    serverEnvironment.scheduledTasksLive({ environmentId, input: {} }),
  );
  const canOperate = useAtomValue(
    serverEnvironment.runScheduledTaskNow.permissionAtom(environmentId),
  );
  const runTaskNow = useAtomCommand(serverEnvironment.runScheduledTaskNow, {
    label: "library scheduled task run now",
  });
  const navigate = useNavigate();
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const runNow = async (task: ScheduledTask) => {
    if (busyTaskId !== null || !readEnvironmentScope(environmentId, AuthOrchestrationOperateScope))
      return;
    setBusyTaskId(task.id);
    const result = await runTaskNow({ environmentId, input: { id: task.id } });
    setBusyTaskId(null);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not run scheduled task",
          description: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  };
  const openInSettings = (task: ScheduledTask) => {
    moveSettingsIntoLibrary();
    void navigate({
      to: "/settings/scheduled-tasks",
      search: { environmentId, taskId: task.id },
    });
  };

  return (
    <LibraryItemList
      empty={tasksQuery.error ?? (tasksQuery.isPending ? "Loading..." : "No scheduled tasks.")}
      items={(tasksQuery.data?.tasks ?? []).map((task) => {
        const isWebhook = task.schedule.type === "webhook";
        return {
          key: task.id,
          name: task.title,
          meta: task.enabled ? scheduleLabel(task.schedule) : "Paused",
          bad: task.lastRunStatus === "failed",
          detail: isWebhook
            ? "Webhook tasks show deliveries instead of Run now."
            : "Each run starts a new thread in its project.",
          actions: [
            ...(isWebhook
              ? []
              : [
                  {
                    label: "Run now",
                    disabled: !canOperate || busyTaskId !== null,
                    onSelect: () => void runNow(task),
                  },
                ]),
            { label: "Open in Settings", onSelect: () => openInSettings(task) },
          ],
        };
      })}
    />
  );
}
