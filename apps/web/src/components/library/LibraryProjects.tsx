import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { useNavigate } from "@tanstack/react-router";

import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useProjectAccentColor } from "../../hooks/useProjectAccentColor";
import { useSidebarProjectGroups } from "../../hooks/useSidebarProjectGroups";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import { LibraryItemList } from "./LibraryItemList";

export function LibraryProjects() {
  const groups = useSidebarProjectGroups();
  const handleNewThread = useNewThreadHandler();
  const navigate = useNavigate();
  return (
    <LibraryItemList
      empty="No projects yet."
      items={groups
        .filter((group) => !group.isScratch)
        .map((group) => ({
          key: group.projectKey,
          name: group.displayName,
          meta: group.remoteEnvironmentLabels.join(", ") || undefined,
          swatch: <ProjectSwatch project={group} />,
          detail: group.workspaceRoot,
          actions: [
            {
              label: "New thread",
              onSelect: () => void handleNewThread(scopeProjectRef(group.environmentId, group.id)),
            },
            {
              label: "Settings",
              onSelect: () =>
                void navigate({
                  to: "/projects/$projectKey",
                  params: { projectKey: group.projectKey },
                }),
            },
          ],
        }))}
    />
  );
}

function ProjectSwatch(props: { readonly project: SidebarProjectSnapshot }) {
  const color = useProjectAccentColor(props.project);
  return (
    <span
      className="size-1.5 shrink-0 bg-sidebar-muted-foreground"
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}
