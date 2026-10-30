import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";

const layer = it.layer(NodeSqliteClient.layer({ filename: ":memory:" }));

layer("074_DropRelayScopes", (it) => {
  it.effect("removes relay scopes from stored sessions and pairing links only", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 73 });
      const withRelay = JSON.stringify([
        "orchestration:read",
        "relay:read",
        "access:write",
        "relay:write",
      ]);
      const withoutRelay = JSON.stringify(["orchestration:read"]);
      yield* sql`
        INSERT INTO auth_sessions (session_id, subject, scopes, method, issued_at, expires_at)
        VALUES
          ('with-relay', 'client', ${withRelay}, 'bootstrap', '2026-10-01T00:00:00.000Z', '2027-10-01T00:00:00.000Z'),
          ('without-relay', 'client', ${withoutRelay}, 'bootstrap', '2026-10-01T00:00:00.000Z', '2027-10-01T00:00:00.000Z')
      `;
      yield* sql`
        INSERT INTO auth_pairing_links (id, credential, method, scopes, subject, created_at, expires_at)
        VALUES ('link', 'credential', 'bootstrap', ${withRelay}, 'client', '2026-10-01T00:00:00.000Z', '2027-10-01T00:00:00.000Z')
      `;

      yield* runMigrations({ toMigrationInclusive: 74 });

      const sessions = yield* sql<{ readonly session_id: string; readonly scopes: string }>`
        SELECT session_id, scopes FROM auth_sessions ORDER BY session_id
      `;
      assert.deepStrictEqual(
        sessions.map((row) => [row.session_id, JSON.parse(row.scopes)]),
        [
          ["with-relay", ["orchestration:read", "access:write"]],
          ["without-relay", ["orchestration:read"]],
        ],
      );
      const links = yield* sql<{ readonly scopes: string }>`SELECT scopes FROM auth_pairing_links`;
      assert.deepStrictEqual(JSON.parse(links[0]!.scopes), ["orchestration:read", "access:write"]);
    }),
  );
});
