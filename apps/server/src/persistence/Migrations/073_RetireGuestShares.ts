import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

// Compaction can leave a guest-share event as a thread's only whole-thread event, so deleting
// it would lose archive, pin, and title state. The projection treats both types identically.
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    UPDATE orchestration_events
    SET event_type = 'thread.metadata-updated'
    WHERE event_type = 'thread.guest-share-updated'
      AND aggregate_kind = 'thread'
      AND application_event_version = 2
  `;
  yield* sql`
    UPDATE orchestration_events
    SET payload_json = json_remove(payload_json, '$.guestShare')
    WHERE aggregate_kind = 'thread'
      AND application_event_version = 2
      AND event_type LIKE 'thread.%'
      AND json_type(payload_json, '$.guestShare') IS NOT NULL
  `;
  yield* sql`
    UPDATE orchestration_v2_projection_threads
    SET payload_json = json_remove(payload_json, '$.guestShare')
    WHERE json_type(payload_json, '$.guestShare') IS NOT NULL
  `;
});
