/**
 * Provision Reunion's trip-state tables (trips, trip_participants, polls) WITHOUT
 * disturbing any teammate's tables.
 *
 * Butterbase `apply` is a full-schema sync: any table missing from the submitted
 * schema is proposed for DROP. So we fetch the live schema with `schema.get()`,
 * merge our new tables into it (preserving every existing table verbatim — the
 * server's own definitions, not a reconstruction), and apply the union. New
 * tables get created; nothing is dropped.
 *
 *   npm run db:provision            # apply (additive)
 *   npm run db:provision -- --dry-run
 */
import { butterbaseFromEnv } from "./butterbaseClient.js";

const newTables: Record<string, unknown> = {
  trips: {
    columns: {
      id: { type: "text", unique: true },
      group_id: { type: "text" },
      destination: { type: "text" },
      timeframe: { type: "text", nullable: true },
      status: { type: "text" },
      current_summary: { type: "text" },
      created_at: { type: "bigint" },
      updated_at: { type: "bigint" },
    },
    indexes: { trips_group_idx: { columns: ["group_id"] } },
  },
  trip_participants: {
    columns: {
      id: { type: "text", unique: true },
      trip_id: { type: "text" },
      user_id: { type: "text" },
      availability: { type: "text", nullable: true },
      budget_preference: { type: "text", nullable: true },
      dietary_preferences: { type: "text", nullable: true },
      notes: { type: "text", nullable: true },
    },
    indexes: { trip_participants_trip_idx: { columns: ["trip_id"] } },
  },
  polls: {
    columns: {
      id: { type: "text", unique: true },
      trip_id: { type: "text" },
      question: { type: "text" },
      choices: { type: "text" },
      status: { type: "text" },
      votes: { type: "text" },
    },
  },
};

type AdminSchema = {
  get: () => Promise<{ data?: unknown; error?: unknown }>;
  apply: (schema: unknown, opts?: { name?: string }) => Promise<{ data?: unknown; error?: unknown }>;
  dryRun: (schema: unknown) => Promise<{ data?: unknown; error?: unknown }>;
};

/** Pull the live `{ tableName: { columns, indexes } }` map out of get()'s response. */
function extractTables(raw: unknown): Record<string, unknown> {
  const candidates = [raw, (raw as any)?.data, (raw as any)?.schema, (raw as any)?.data?.schema];
  for (const c of candidates) {
    const t = (c as any)?.tables;
    if (t && typeof t === "object") return t as Record<string, unknown>;
  }
  return {};
}

async function main() {
  const bb = butterbaseFromEnv();
  if (!bb) {
    console.error("BUTTERBASE_APP_ID / BUTTERBASE_API_KEY not set — nothing to do.");
    process.exit(1);
  }
  const admin = (bb as unknown as { admin: { schema: AdminSchema } }).admin.schema;
  const dryRun = process.argv.includes("--dry-run");

  const current = await admin.get();
  if (current?.error) {
    console.error("Could not read current schema:", current.error);
    process.exit(1);
  }
  const existing = extractTables(current.data ?? current);
  console.log(`Live tables: ${Object.keys(existing).join(", ") || "(none)"}`);

  // Merge: keep every existing table verbatim; add ours only if absent.
  const tables: Record<string, unknown> = { ...existing };
  const adding: string[] = [];
  for (const [name, def] of Object.entries(newTables)) {
    if (!(name in tables)) {
      tables[name] = def;
      adding.push(name);
    }
  }
  console.log(`Adding: ${adding.join(", ") || "(nothing — already present)"}`);
  if (adding.length === 0 && !dryRun) {
    console.log("Reunion tables already exist. Nothing to do.");
    return;
  }

  const schema = { tables };
  const op = dryRun
    ? await admin.dryRun(schema)
    : await admin.apply(schema, { name: "add_reunion_trip_tables" });

  if (op?.error) {
    console.error("Schema operation failed:", op.error);
    process.exit(1);
  }
  console.log(dryRun ? "Dry-run preview:" : "Migration applied:");
  console.log(JSON.stringify(op?.data ?? op, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
