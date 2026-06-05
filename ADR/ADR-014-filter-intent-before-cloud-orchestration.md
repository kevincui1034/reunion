# ADR-014: Filter travel intent before cloud orchestration

- **Status:** Accepted
- **Date:** 2026-06-05
- **Reconciliation:** NEW
- **Source:** @Today : release; Agentic Hackathon
- **Notion URL:** https://app.notion.com/p/f814eedc1c9544bfb074ce2206948c44

## Context & Options

The agent should not send every group message to cloud AI or respond to casual place mentions.

## Decision

Use a first-pass travel-intent classifier before invoking RocketRide/cloud workflows. For demo it may be lightweight or simulated; longer-term direction is local and privacy-preserving.

## Consequences

Privacy and noise boundaries improve, but false positive/negative handling becomes important.
