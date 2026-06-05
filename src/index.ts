import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { IMessageSDK, type Message } from "@photon-ai/imessage-kit";
import { startClassifier, classify, type Verdict } from "./classifier.js";
import { sendIntentEvent, type IntentEvent } from "./backend.js";

// Load .env (Butterbase creds, scope config) before reading any env below.
try {
  process.loadEnvFile();
} catch {
  // no .env present — falls back to process env / dry-run backend
}

// We read at the imessage-kit layer (beneath Spectrum) on purpose: Reunion is an
// ambient observer that must check EVERY message in the group, including the ones
// sent from this Mac's own account. Spectrum's message stream drops self-sent
// messages with no opt-in; imessage-kit's watcher exposes both incoming and
// from-me messages.

// Only watch these chats (by display name, case-insensitive). Override with
// REUNION_CHATS="Dev,Trip squad". Messages in any other chat are ignored.
const ALLOWED_CHATS = (process.env.REUNION_CHATS ?? "Dev")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// Minimum confidence before forwarding a YES to the backend (low-noise gate).
const MIN_CONFIDENCE = Number(process.env.REUNION_MIN_CONFIDENCE ?? "0.5");

// How many recent messages per conversation to feed the classifier. Travel
// intent often emerges across turns ("we should travel" -> "yeah" -> "where").
const WINDOW = 5;

const buffers = new Map<string, string[]>();

function pushWindow(chatId: string, text: string): string {
  const buf = buffers.get(chatId) ?? [];
  buf.push(text);
  while (buf.length > WINDOW) buf.shift();
  buffers.set(chatId, buf);
  return buf.join("\n");
}

// Resolve human-readable chat names (e.g. "Dev") from chat.db so the readout
// shows the group name instead of an opaque id.
function loadChats(): Array<{ identifier: string; name: string }> {
  const out: Array<{ identifier: string; name: string }> = [];
  try {
    const dbPath = join(homedir(), "Library", "Messages", "chat.db");
    const rows = execFileSync(
      "sqlite3",
      [
        "-readonly",
        "-separator",
        "\t",
        dbPath,
        "SELECT chat_identifier, display_name FROM chat WHERE display_name IS NOT NULL AND display_name != '';",
      ],
      { encoding: "utf8" },
    );
    for (const line of rows.split("\n")) {
      if (!line.trim()) continue;
      const [identifier, name] = line.split("\t");
      if (identifier && name) out.push({ identifier, name });
    }
  } catch {
    // best effort
  }
  return out;
}

const DB_PATH = join(homedir(), "Library", "Messages", "chat.db");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ResolvedChat = { name: string; kind: string; identifier: string };

// Look up a message's real chat in chat.db by its store rowId. Returns null when
// the chat_message_join row hasn't flushed yet (WAL race on a just-sent message).
function lookupChatByRowId(rowId: number): ResolvedChat | null {
  if (!Number.isInteger(rowId)) return null;
  try {
    const out = execFileSync(
      "sqlite3",
      [
        "-readonly",
        "-separator",
        "\t",
        DB_PATH,
        `SELECT COALESCE(NULLIF(c.display_name,''),''), c.style, c.chat_identifier
         FROM chat_message_join cmj JOIN chat c ON c.ROWID = cmj.chat_id
         WHERE cmj.message_id = ${rowId} LIMIT 1;`,
      ],
      { encoding: "utf8" },
    ).trim();
    if (!out) return null;
    const [name, style, identifier] = out.split("\t");
    const kind = style === "43" ? "group" : style === "45" ? "dm" : "unknown";
    return { name: name ?? "", kind, identifier: identifier ?? "" };
  } catch {
    return null;
  }
}

// Authoritative chat resolution. The watcher can emit a DM-style chatId for a
// just-sent (from-me) group message during a WAL race, before chat_message_join
// flushes — so we resolve from chat.db by rowId, retrying briefly for the flush.
// This makes the scope filter and chat_id correct regardless of the racey chatId.
async function resolveChat(rowId: number): Promise<ResolvedChat> {
  for (let i = 0; i < 5; i++) {
    const hit = lookupChatByRowId(rowId);
    if (hit) return hit;
    await sleep(700);
  }
  return { name: "", kind: "unknown", identifier: "" };
}

const RULE = "-".repeat(60);

function field(label: string, value: string): string {
  return `${label.padEnd(12)}${value}`;
}

function printReadout(args: {
  chat: string;
  sender: string;
  text: string;
  verdict: Verdict;
  forwarded: boolean;
}): void {
  const { chat, sender, text, verdict, forwarded } = args;
  console.log(
    [
      RULE,
      field("chat:", chat),
      field("from:", sender),
      field("message:", text),
      field("intent:", verdict.isTravelIntent ? "YES" : "NO"),
      field("confidence:", verdict.confidence.toFixed(2)),
      field("location:", verdict.location.trim() || "-"),
      field("forwarded:", forwarded ? "butterbase" : "-"),
      RULE,
    ].join("\n"),
  );
}

async function handleMessage(message: Message): Promise<void> {
  if (message.kind !== "text") return;
  const text = (message.text ?? "").trim();
  if (!text) return;

  // Resolve the real chat from chat.db by rowId (handles the from-me WAL race
  // where the watcher reports a DM-style chatId for a group message).
  const resolved = await resolveChat(message.rowId);
  const name = resolved.name;
  if (!ALLOWED_CHATS.includes(name.toLowerCase())) return; // scope: only watched chats

  const chatId = resolved.identifier || message.chatId || "unknown";
  const kind = resolved.kind !== "unknown" ? resolved.kind : message.chatKind;
  const chat = name ? `${kind} "${name}"` : kind;
  const sender = message.isFromMe ? "(me)" : (message.participant ?? "unknown");

  const window = pushWindow(chatId, text);

  let verdict: Verdict;
  try {
    verdict = await classify(window);
  } catch (err) {
    console.error(`classify error: ${(err as Error).message}`);
    return;
  }

  // Gate: only travel-intent messages (above the confidence floor) leave the
  // device. Everything else stays local (ADR-007/014). Build and forward the
  // upstream intent event to Butterbase.
  let forwarded = false;
  if (verdict.isTravelIntent && verdict.confidence >= MIN_CONFIDENCE) {
    const event: IntentEvent = {
      message_id: message.id,
      channel: "iMessage",
      chat_id: chatId,
      chat_name: name || null,
      chat_kind: kind,
      sender,
      is_from_me: message.isFromMe,
      text,
      context_window: window,
      is_travel_intent: true,
      confidence: verdict.confidence,
      location: verdict.location.trim() || null,
      created_at: new Date().toISOString(),
    };
    await sendIntentEvent(event);
    forwarded = true;
  }

  printReadout({ chat, sender, text, verdict, forwarded });
}

async function main(): Promise<void> {
  console.log("Reunion intent gate");
  console.log("Starting on-device classifier (Foundation Models)...");
  try {
    await startClassifier();
  } catch (err) {
    console.error(`Classifier unavailable: ${(err as Error).message}`);
    process.exit(1);
  }
  console.log("Classifier ready.");

  console.log(`Watching iMessage chats: ${ALLOWED_CHATS.join(", ")} (incoming + your own)...`);
  const sdk = new IMessageSDK();
  await sdk.startWatching({
    onIncomingMessage: handleMessage,
    onFromMeMessage: handleMessage,
    onError: (err) => console.error(`watch error: ${err.message}`),
  });
  console.log("Listening. Send an iMessage to test.");
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
