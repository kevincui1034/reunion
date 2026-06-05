# ADR-003: Define V1 calendar contract as availability only

- **Status:** Accepted
- **Date:** 2026-06-05
- **Reconciliation:** NEW
- **Source:** Hackathon work session
- **Notion URL:** https://app.notion.com/p/ee067f3ab0aa4edc8089c4965b233dc5

## Context & Options

The team needed a stable handoff from calendar processing to who/when planning flow. Event-priority conflict scoring added too much complexity for V1.

## Decision

Define the V1 calendar contract as date/time availability only and defer event-priority conflict scoring to V2.

## Consequences

Integration is simpler and more privacy-preserving, but V1 cannot rank conflict severity.
