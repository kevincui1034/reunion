@AGENTS.md

# CLAUDE.md — Calendar Integration (scoped component)

> Loaded every Claude Code session. Source of truth for THIS component only.
> The rest of the product (Photon/iMessage, RocketRide orchestration, XTrace memory,
> suggestions) is owned by teammates and is OUT OF SCOPE here.

## What this component does

The **calendar integration** for a group-trip agent. Two parts:

1. **OAuth web app** — hosts Google Calendar consent. Routes `/connect` and `/oauth/callback`.
   Builds signed connect links, exchanges auth codes, stores tokens.
2. **Availability engine** — given a list of participant phone numbers + a date window,
   returns each person's busy schedule, their free windows, and the common free windows
   across everyone, as a JSON payload.

## Input / output (the contract — see INTERFACE.md)

- **Input:** a list of participant **phone numbers** + a candidate date window.
- **Output:** a JSON object with per-participant `busy` and `free`, plus `common_free`.

Phone numbers are the only identifier we're handed. Google identifies users by **email**,
not phone — so resolving a phone to a calendar depends on a stored
`phone → participant → google_email → tokens` mapping. See INTERFACE.md.

## Decisions already made (do not revisit without asking)

- **Provider: Google Calendar only.** Apple is out of scope (no OAuth/REST; CalDAV only).
- **Scope: `https://www.googleapis.com/auth/calendar.freebusy` for V1.** Busy/free only —
  no event titles or contents. This keeps the consent screen to "see your availability."
- **OAuth app runs in Testing mode** with a hardcoded test-user email allowlist. No Google
  verification for the hackathon. Build nothing that assumes public launch.
- **Consent happens in the browser, not in iMessage.** We hand out a `/connect` link.
- **Returning users skip the link.** If a valid (or refreshable) token already exists for a
  phone, go straight to freebusy — no link, no user interaction.
- **Plain-text availability fallback** is supported: if a teammate's layer passes us a
  participant's text availability instead of a token, accept it (source = "plaintext").
- **Movability classification (movable lunch vs immovable surgery) is V2, NOT V1.** It
  requires `calendar.readonly` (event titles) and has privacy/consent tradeoffs. See
  SCOPE_NOTES.md. V1 must not assume event contents are available.

## Conventions

- TypeScript. Secrets in env vars (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GOOGLE_REDIRECT_URI`, `STATE_SIGNING_KEY`). Never commit credentials.
- Build and test this component IN ISOLATION — the OAuth loop is provable in a browser with
  no chat involved. Do not block on teammates' services.
- freebusy returns busy intervals only; compute `free` by subtracting busy from the window.
- When unsure about Google's API specifics, check Google's Calendar API docs — don't invent
  method names or response shapes.

## How to work

- Plan mode first. Two milestones: (1) OAuth loop stores a token; (2) availability engine
  emits the JSON for 2–3 connected accounts. Each must be independently testable.
- Treat INTERFACE.md as the frozen contract with teammates. If it changes, change it there
  first, then tell the RocketRide owner.
