/**
 * Provision Reunion's Butterbase tables: trips, trip_participants, polls.
 *
 * Run once against the configured Butterbase app:
 *   npm run db:provision          # apply
 *   npm run db:provision -- --dry-run
 */
import { butterbaseFromEnv } from "./butterbaseClient.js";

export const reunionSchema = {
  tables: {
    // ── Kevin's calendar tables (preserved verbatim from his provision script).
    //    Butterbase `apply` is a full-schema sync — omitting these would DROP them.
    participants: {
      columns: {
        id: { type: "text" },
        phone: { type: "text", unique: true },
        google_email: { type: "text", nullable: true },
        created_at: { type: "text" },
        updated_at: { type: "text" },
      },
      indexes: { participants_phone_idx: { columns: ["phone"], unique: true } },
    },
    oauth_tokens: {
      columns: {
        participant_id: { type: "text", unique: true },
        access_token: { type: "text" },
        refresh_token: { type: "text", nullable: true },
        expires_at: { type: "bigint" },
        scope: { type: "text" },
        updated_at: { type: "text" },
      },
      indexes: { oauth_tokens_pid_idx: { columns: ["participant_id"], unique: true } },
    },
    // ── Reunion trip-state tables (new).
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
  },
};

async function main() {
  const bb = butterbaseFromEnv();
  if (!bb) {
    console.error("BUTTERBASE_APP_ID / BUTTERBASE_API_KEY not set — nothing to do.");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");
  const admin = (bb as unknown as { admin: { schema: { apply: Function; dryRun: Function } } }).admin;

  const op = dryRun
    ? await admin.schema.dryRun(reunionSchema)
    : await admin.schema.apply(reunionSchema, { name: "create_reunion_tables" });

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
