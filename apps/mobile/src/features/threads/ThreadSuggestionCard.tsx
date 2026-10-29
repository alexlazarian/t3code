import { useAtomValue } from "@effect/atom-react";
import { CommandId, type EnvironmentId, type OrchestrationV2TurnItem } from "@t3tools/contracts";
import { isAtomCommandInterrupted } from "@t3tools/client-runtime/state/runtime";
import { useRef, useState } from "react";
import { orchestrationEnvironment } from "../../state/orchestration";
import { useAtomCommand } from "../../state/use-atom-command";
import { uuidv4 as randomUUID } from "../../lib/uuid";
import { StackActions, useNavigation } from "@react-navigation/native";
import { View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";

type Suggestion = Extract<OrchestrationV2TurnItem, { type: "thread_suggestion" }>;

export function ThreadSuggestionCard(props: {
  readonly environmentId: EnvironmentId;
  readonly item: Suggestion;
}) {
  const { item, environmentId } = props;
  const navigation = useNavigation();
  const resolve = useAtomCommand(orchestrationEnvironment.v2.dispatchCommand, {
    label: "resolve thread suggestion",
  });
  const canResolve = useAtomValue(
    orchestrationEnvironment.v2.dispatchCommand.permissionAtom(environmentId),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const send = async (action: "drafts" | "start" | "dismiss") => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await resolve({
        environmentId,
        input: {
          type: "thread.suggestions.resolve",
          commandId: CommandId.make(randomUUID()),
          threadId: item.threadId,
          turnItemId: item.id,
          action,
        },
      });
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        setError("Could not resolve this suggestion. Try again.");
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <View className="mb-3 gap-3 rounded-[20px] border border-border bg-card-alt p-4">
      <Text className="font-t3-bold text-base text-foreground">Suggested threads</Text>
      <Text className="font-sans text-sm text-foreground-muted">{item.reason}</Text>
      {item.threads.map((thread) => (
        <View key={thread.threadId} className="gap-1">
          {item.suggestionStatus === "accepted" ? (
            <Button
              tone="text"
              label={thread.title}
              onPress={() =>
                navigation.dispatch(
                  StackActions.push("Thread", { environmentId, threadId: thread.threadId }),
                )
              }
            />
          ) : (
            <Text className="font-t3-bold text-sm text-foreground">{thread.title}</Text>
          )}
          <Text className="font-sans text-sm text-foreground-muted">{thread.prompt}</Text>
          {thread.skill ? (
            <Text className="font-sans text-xs text-foreground-muted">Skill: {thread.skill}</Text>
          ) : null}
          <Text className="font-sans text-xs text-foreground-muted">
            Model: {thread.modelSelection.model}
          </Text>
        </View>
      ))}
      {item.suggestionStatus === "pending" ? (
        <View className="gap-2">
          <Button
            label="Create drafts"
            tone="primary"
            disabled={busy || !canResolve}
            onPress={() => void send("drafts")}
          />
          <Button
            label="Create and start"
            disabled={busy || !canResolve}
            onPress={() => void send("start")}
          />
          <Button
            label="Dismiss"
            tone="text"
            disabled={busy || !canResolve}
            onPress={() => void send("dismiss")}
          />
        </View>
      ) : (
        <Text className="font-sans text-xs text-foreground-muted">
          {item.suggestionStatus === "dismissed"
            ? "Dismissed"
            : item.resolution === "drafts"
              ? "Drafts created. Open a thread to review and send its prompt."
              : "Threads started"}
        </Text>
      )}
      {error ? (
        <Text accessibilityRole="alert" className="font-sans text-sm text-danger-foreground">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
