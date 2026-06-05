# ADR-016: Use synthetic preloaded context for demo onboarding

- **Status:** Accepted
- **Date:** 2026-06-05
- **Reconciliation:** NEW
- **Source:** @Today : release; Agentic Hackathon
- **Notion URL:** https://app.notion.com/p/72fca601a22547ebb42a003c5a5f4fd3

## Context & Options

The agent benefits from prior context, but real onboarding and multi-user OAuth flows are risky within hackathon constraints.

## Decision

Use synthetic preloaded group context and mocked calendar data for the hackathon demo; defer real onboarding and multi-user authorization.

## Consequences

The team can demonstrate memory and planning behavior while acknowledging scaffolding.
