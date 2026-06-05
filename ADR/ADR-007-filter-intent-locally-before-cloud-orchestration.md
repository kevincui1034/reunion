# ADR-007: Filter travel intent locally before cloud orchestration

- **Status:** Proposed
- **Date:** 2026-06-05
- **Reconciliation:** NEW
- **Source:** Today : release; Hackathon Planning Discussion
- **Notion URL:** https://app.notion.com/p/b024765b2c3e46cbb72c58e3d0e575d8

## Context & Options

Sending every group message to a cloud model is noisy and privacy-hostile. Keyword-only triggers are brittle.

## Decision

Use a lightweight local/on-device travel-intent classifier before running deeper RocketRide cloud orchestration.

## Consequences

Privacy and noise handling improve, but classifier implementation quality becomes a key risk.
