/** Print the live Butterbase schema for the trip tables. Read-only. */
import { butterbaseFromEnv } from "./butterbaseClient.js";

const bb = butterbaseFromEnv();
if (!bb) {
  console.error("BUTTERBASE_* not set.");
  process.exit(1);
}
const admin = (bb as unknown as { admin: { schema: { get: () => Promise<any> } } }).admin.schema;
const res = await admin.get();
const tables = res?.data?.schema?.tables ?? {};
for (const name of ["trips", "trip_participants", "polls", "poll_votes", "chat_groups"]) {
  const t = tables[name];
  if (!t) {
    console.log(`\n=== ${name}: (absent) ===`);
    continue;
  }
  console.log(`\n=== ${name} ===`);
  for (const [col, def] of Object.entries<any>(t.columns ?? {})) {
    const flags = [def.nullable === false ? "NOT NULL" : "", def.unique ? "unique" : "", def.default ? `default ${def.default}` : ""].filter(Boolean).join(", ");
    console.log(`  ${col}: ${def.type}${flags ? "  (" + flags + ")" : ""}`);
  }
}
