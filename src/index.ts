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

// Display name for messages sent from this Mac's own account.
const OWNER_NAME = process.env.REUNION_OWNER_NAME ?? "Pablo";

// Dev-group roster: phone (last 10 digits) -> display name. Unknown numbers fall
// back to the raw handle. Self-sent messages use OWNER_NAME instead.
const CONTACTS: Record<string, string> = {
  "9732745136": "Jossue",
  "5126944844": "Ethan",
  "4086671882": "Kevin",
};

function contactName(handle: string): string {
  const digits = handle.replace(/\D/g, "").slice(-10);
  return CONTACTS[digits] ?? handle ?? "unknown";
}

// Each message is classified atomically (no sliding window): the destination
// comes only from the message itself, so a stale destination can't leak in.

const DB_PATH = join(homedir(), "Library", "Messages", "chat.db");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ResolvedChat = {
  name: string;
  kind: string;
  identifier: string;
  senderHandle: string; // sender's phone/email; "" for self-sent
  isFromMe: boolean;
};

// Look up a message's real chat + sender in chat.db by its store rowId. Returns
// null when the chat_message_join row hasn't flushed yet (WAL race on a just-sent
// message). Resolving from chat.db fixes both the racey chatId AND the racey/null
// participant the watcher reports for fresh messages.
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
        `SELECT COALESCE(NULLIF(c.display_name,''),''), c.style, c.chat_identifier,
                m.is_from_me, COALESCE(h.id,'')
         FROM message m
         JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
         JOIN chat c ON c.ROWID = cmj.chat_id
         LEFT JOIN handle h ON h.ROWID = m.handle_id
         WHERE m.ROWID = ${rowId} LIMIT 1;`,
      ],
      { encoding: "utf8" },
    ).trim();
    if (!out) return null;
    const [name, style, identifier, isFromMe, handle] = out.split("\t");
    const kind = style === "43" ? "group" : style === "45" ? "dm" : "unknown";
    return {
      name: name ?? "",
      kind,
      identifier: identifier ?? "",
      senderHandle: handle ?? "",
      isFromMe: isFromMe === "1",
    };
  } catch {
    return null;
  }
}

// Authoritative resolution. The watcher can emit a DM-style chatId and a null
// participant for a just-sent (from-me) group message during a WAL race, before
// chat_message_join flushes — so we resolve from chat.db by rowId, retrying
// briefly for the flush. Makes the scope filter, chat_id, and sender all correct.
async function resolveChat(rowId: number): Promise<ResolvedChat | null> {
  for (let i = 0; i < 5; i++) {
    const hit = lookupChatByRowId(rowId);
    if (hit) return hit;
    await sleep(700);
  }
  return null;
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
  location: string;
  forwarded: boolean;
}): void {
  const { chat, sender, text, verdict, location, forwarded } = args;
  console.log(
    [
      RULE,
      field("chat:", chat),
      field("from:", sender),
      field("message:", text),
      field("intent:", verdict.isTravelIntent ? "YES" : "NO"),
      field("confidence:", verdict.confidence.toFixed(2)),
      field("location:", location || "-"),
      field("forwarded:", forwarded ? "butterbase" : "-"),
      RULE,
    ].join("\n"),
  );
}

// Hallucination guard: only keep a destination that literally appears in the
// message (the LLM sometimes invents a place when a message mentions "trip" with
// no named location). Strict substring match — drops guesses, may drop expansions
// like "NYC" -> "New York City" (acceptable; precision over recall here).
function guardLocation(raw: string, text: string): string {
  const loc = raw.trim();
  if (!loc) return "";
  return text.toLowerCase().includes(loc.toLowerCase()) ? loc : "";
}

async function handleMessage(message: Message): Promise<void> {
  if (message.kind !== "text") return;
  const text = (message.text ?? "").trim();
  if (!text) return;

  // Resolve the real chat + sender from chat.db by rowId (handles the from-me WAL
  // race where the watcher reports a DM-style chatId and a null participant).
  const resolved = await resolveChat(message.rowId);
  const name = resolved?.name ?? "";
  if (!ALLOWED_CHATS.includes(name.toLowerCase())) return; // scope: only watched chats

  const chatId = resolved?.identifier || message.chatId || "unknown";
  const kind = resolved && resolved.kind !== "unknown" ? resolved.kind : message.chatKind;
  const chat = name ? `${kind} "${name}"` : kind;
  const isFromMe = resolved?.isFromMe ?? message.isFromMe;
  const senderHandle = resolved?.senderHandle || message.participant || "";
  const sender = isFromMe ? OWNER_NAME : contactName(senderHandle);

  // Classify the message atomically — no sliding window — so the destination
  // comes only from this message and a stale one can't leak in.
  let verdict: Verdict;
  try {
    verdict = await classify(text);
  } catch (err) {
    console.error(`classify error: ${(err as Error).message}`);
    return;
  }

  const location = guardLocation(verdict.location, text);

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
      is_from_me: isFromMe,
      text,
      context_window: text,
      is_travel_intent: true,
      confidence: verdict.confidence,
      location: location || null,
      created_at: new Date().toISOString(),
    };
    await sendIntentEvent(event);
    forwarded = true;
  }

  printReadout({ chat, sender, text, verdict, location, forwarded });
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
