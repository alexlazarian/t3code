import {
  CommandId,
  EventId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationV2DomainEvent,
} from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";

import * as EventStore from "../../orchestration-v2/EventStore.ts";
import * as ProjectionMaintenance from "../../orchestration-v2/ProjectionMaintenance.ts";
import * as ProjectionStore from "../../orchestration-v2/ProjectionStore.ts";
import { runMigrations } from "../Migrations.ts";

const layer = it.layer(
  ProjectionMaintenance.layer.pipe(
    Layer.provideMerge(
      Layer.mergeAll(EventStore.layer, ProjectionStore.layer).pipe(
        Layer.provideMerge(NodeSqliteClient.layer({ filename: ":memory:" })),
      ),
    ),
  ),
);

const providerInstanceId = ProviderInstanceId.make("codex");
const occurredAt = DateTime.makeUnsafe("2026-10-01T00:00:00.000Z");
const pinnedAt = "2026-10-02T00:00:00.000Z";
const guestShare = JSON.stringify({
  id: "guest-share-1",
  host: "example.t3.codes",
  createdAt: pinnedAt,
  expiresAt: "2026-10-03T00:00:00.000Z",
  guestName: "Sam",
  messages: [{ id: "guest-message-1", text: "Why?", status: "pending", submittedAt: pinnedAt }],
});

const threadCreated = (id: string): OrchestrationV2DomainEvent => {
  const threadId = ThreadId.make(id);
  return {
    id: EventId.make(`event-${id}-created`),
    type: "thread.created",
    threadId,
    providerInstanceId,
    occurredAt,
    payload: {
      id: threadId,
      projectId: ProjectId.make("project-1"),
      title: id,
      providerInstanceId,
      modelSelection: { instanceId: providerInstanceId, model: "gpt-5.4" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      activeProviderThreadId: null,
      lineage: { rootThreadId: threadId, parentThreadId: null, relationshipToParent: null },
      forkedFrom: null,
      createdBy: "user",
      creationSource: "web",
      createdAt: occurredAt,
      updatedAt: occurredAt,
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      lastVisitedAt: null,
      deletedAt: null,
    },
  };
};

layer("073_RetireGuestShares", (it) => {
  it.effect("keeps the state guest-share events carry and drops the share", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const events = yield* EventStore.EventStoreV2;
      const maintenance = yield* ProjectionMaintenance.ProjectionMaintenanceV2;
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      yield* runMigrations({ toMigrationInclusive: 72 });

      yield* events.append({
        commandId: CommandId.make("command-create"),
        events: [threadCreated("thread-plain"), threadCreated("thread-shared")],
      });
      assert.isTrue((yield* maintenance.rebuild).valid);

      // Compaction may leave the guest-share event as the thread's latest whole-thread state.
      yield* sql`
        INSERT INTO orchestration_events (
          event_id, aggregate_kind, stream_id, stream_version, event_type, occurred_at,
          command_id, actor_kind, payload_json, metadata_json, application_event_version
        )
        SELECT 'event-guest-share', 'thread', stream_id, stream_version + 1,
          'thread.guest-share-updated', occurred_at, 'command-guest-share', 'server',
          json_set(payload_json, '$.title', 'Pinned', '$.pinnedAt', ${pinnedAt},
            '$.guestShare', json(${guestShare})),
          metadata_json, 2
        FROM orchestration_events
        WHERE event_id = 'event-thread-shared-created'
      `;
      yield* sql`
        UPDATE orchestration_v2_projection_threads
        SET payload_json = json_set(payload_json, '$.guestShare', json(${guestShare}))
        WHERE thread_id = 'thread-shared'
      `;

      yield* runMigrations({ toMigrationInclusive: 73 });

      assert.deepEqual(
        yield* sql`
          SELECT event_type, json_extract(payload_json, '$.title') AS title,
            json_type(payload_json, '$.guestShare') AS guest_share
          FROM orchestration_events
          WHERE event_id = 'event-guest-share'
        `,
        [{ event_type: "thread.metadata-updated", title: "Pinned", guest_share: null }],
      );
      assert.deepEqual(
        yield* sql`
          SELECT thread_id FROM orchestration_v2_projection_threads
          WHERE json_type(payload_json, '$.guestShare') IS NOT NULL
        `,
        [],
      );

      const stored = yield* events.read().pipe(Stream.runCollect);
      assert.deepEqual(
        Array.from(stored, ({ event }) => [event.threadId, event.type]),
        [
          ["thread-plain", "thread.created"],
          ["thread-shared", "thread.created"],
          ["thread-shared", "thread.metadata-updated"],
        ],
      );

      assert.isTrue((yield* maintenance.rebuild).valid);
      const shared = yield* projections.getThread(ThreadId.make("thread-shared"));
      assert.strictEqual(shared.title, "Pinned");
      assert.strictEqual(
        shared.pinnedAt === null || shared.pinnedAt === undefined
          ? null
          : DateTime.formatIso(shared.pinnedAt),
        pinnedAt,
      );
      const plain = yield* projections.getThread(ThreadId.make("thread-plain"));
      assert.strictEqual(plain.title, "thread-plain");
    }),
  );
});
