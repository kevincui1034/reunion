/**
 * Provision `trips` and `trip_participants` tables in Butterbase.
 *
 * Owned semantically by Jossue (trip state), provisioned here because his
 * branch hasn't landed in production Butterbase yet and this component writes
 * the calendar result into `trip_participants.availability`.
 *
 * Column names mirror Jossue's contract types from
 * `src/contracts/index.ts` on `feature/trip-state-planning`, transcoded from
 * camelCase to snake_case to match the existing Butterbase convention.
 *
 * Usage:
 *   pnpm tsx --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/provision-trip-tables.mts
 *
 * Add --dry-run to preview without applying.
 */
import { createPatchedClient } from '../lib/butterbase';

const required = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
};

const bb = createPatchedClient({
  appId: required('BUTTERBASE_APP_ID'),
  apiUrl: process.env.BUTTERBASE_BASE_URL ?? 'https://api.butterbase.ai',
  apiKey: required('BUTTERBASE_API_KEY'),
});

const schema = {
  tables: {
    trips: {
      columns: {
        id: { type: 'text', unique: true },
        group_id: { type: 'text' },
        destination: { type: 'text' },
        timeframe: { type: 'text', nullable: true },
        status: { type: 'text' },
        current_summary: { type: 'text' },
        created_at: { type: 'bigint' },
        updated_at: { type: 'bigint' },
      },
      indexes: {
        trips_id_idx: { columns: ['id'], unique: true },
      },
    },
    trip_participants: {
      columns: {
        trip_id: { type: 'text' },
        user_id: { type: 'text' },
        availability: { type: 'text', nullable: true },
        budget_preference: { type: 'text', nullable: true },
        dietary_preferences: { type: 'text', nullable: true },
        notes: { type: 'text', nullable: true },
      },
      indexes: {
        trip_participants_pk_idx: { columns: ['trip_id', 'user_id'], unique: true },
      },
    },
  },
};

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const op = dryRun
    ? await bb.admin.schema.dryRun(schema)
    : await bb.admin.schema.apply(schema, { name: 'create_trips_and_trip_participants' });

  if (op.error) {
    console.error('Schema operation failed:', op.error);
    process.exit(1);
  }

  console.log(dryRun ? 'Dry-run preview:' : 'Migration applied:');
  console.log(JSON.stringify(op.data, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
