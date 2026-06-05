# RocketRide pipelines

Export your RocketRide pipelines here (from the VS Code extension's canvas →
"Export" → save the `.json`/`.pipe`). Point `ROCKETRIDE_PIPELINE` at the file and
set `USE_STUBS=false` to swap the heuristic extractor for the real RocketRide step.

## `extract-trip-signal.json` — the extraction step (Pablo + Jossue)

**Input** (`client.send`): the sliding message window rendered as a plain-text
transcript, one line per message:

```
Pablo: We should go to Mexico City in July
Kevin: I'm down, but I can only do weekends
Ethan: same, and I'm vegetarian so keep that in mind
```

**Output:** a JSON object the app coerces into a `TripSignal`
(`src/contracts/index.ts`). Emit it directly, or wrapped as `{ "result": { ... } }`,
or as a JSON string — `coerceTripSignal` accepts all three.

```json
{
  "path": "destination-known",
  "destination": "Mexico City",
  "timeframe": "July",
  "participants": [{ "userId": "u_pablo", "displayName": "Pablo" }],
  "constraints": [{ "userId": "u_kevin", "kind": "availability", "value": "weekends only" }],
  "preferences": [{ "userId": "u_ethan", "kind": "food", "value": "vegetarian" }],
  "openQuestions": ["exact dates"],
  "confidence": 0.8
}
```

### Contract rules (enforced by `coerceTripSignal`)

- **Never hallucinate** (FR2). Omit fields you didn't find — the app defaults them
  (`destination`/`timeframe` → `null`, lists → `[]`). Don't fabricate a destination.
- `path` is one of `destination-known` | `time-known` | `open-ended`. If you omit
  it, the app infers `destination-known` when a destination is present, else
  `open-ended`. V1 only *acts* on `destination-known`.
- `confidence` is `0..1`; omit it and the app uses a sane default.
- Any malformed/empty result → the app **degrades to the heuristic extractor**
  (`src/pipeline/extract.ts`) rather than failing. The demo never dies on a blip.

## How the app uses it

`resolveExtract()` in `src/pipeline/extractRocketRide.ts` picks the implementation:

| `USE_STUBS` | `ROCKETRIDE_URI`/`ROCKETRIDE_APIKEY` | Extractor |
|---|---|---|
| `true` (default) | — | heuristic stub |
| `false` | set | RocketRide engine (falls back to heuristic on error) |

Lifecycle per message window: `connect → use({filepath}) → send(transcript) →
terminate → disconnect`.
