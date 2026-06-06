/**
 * Channel adapter.  [Owner: Ethan]
 *
 * Keeps the pipeline platform-agnostic: it only ever sees IncomingMessage /
 * OutgoingMove. The real adapter wraps the Spectrum iMessage (local mode) loop:
 *
 *   for await (const [space, message] of app.messages) {
 *     if (message.platform !== "iMessage") continue;
 *     const incoming = normalizeIncoming(space, message);
 *     // ── gate runs here; `continue` skips non-travel chatter ──
 *     const move = await handle(incoming);
 *     if (move) await space.responding(() => message.reply(render(move)));
 *   }
 *
 * `ConsoleChannel` is the demo stub — "sends" by printing. Swap for SpectrumChannel.
 */
import type { OutgoingMove } from "../contracts/index.js";

export interface ChannelAdapter {
  send(move: OutgoingMove): Promise<void>;
}

export class ConsoleChannel implements ChannelAdapter {
  async send(move: OutgoingMove): Promise<void> {
    console.log("\n📲 → chat:");
    console.log(indent(move.text));
    if (move.poll) {
      console.log(indent(`📊 ${move.poll.question}`));
      for (const c of move.poll.choices) console.log(indent(`   • ${c.label}`));
    }
    if (move.cardUrl) console.log(indent(`🔗 ${move.cardUrl}`));
  }
}

function indent(s: string): string {
  return s.split("\n").map((l) => `   ${l}`).join("\n");
}
