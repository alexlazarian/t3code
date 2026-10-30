import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

// Stored grants must decode against the current scope list, which no longer has the relay scopes.
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  for (const table of ["auth_sessions", "auth_pairing_links"] as const) {
    yield* sql`
      UPDATE ${sql(table)}
      SET scopes = (
        SELECT json_group_array(value)
        FROM json_each(${sql(table)}.scopes)
        WHERE value NOT IN ('relay:read', 'relay:write')
      )
      WHERE EXISTS (
        SELECT 1 FROM json_each(${sql(table)}.scopes)
        WHERE value IN ('relay:read', 'relay:write')
      )
    `;
  }
});
