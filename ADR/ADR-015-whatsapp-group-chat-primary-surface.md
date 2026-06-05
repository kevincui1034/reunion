# ADR-015: Use WhatsApp group chat as the primary product surface

- **Status:** Accepted
- **Date:** 2026-06-05
- **Reconciliation:** NEW
- **Source:** @Today : release; Agentic Hackathon; Group Travel Planning Agent
- **Notion URL:** https://app.notion.com/p/aba4a71bcee043fc86a733ca11ecdb9e

## Context & Options

The problem happens in group chat. Among iMessage, WhatsApp, Discord, and standalone app options, WhatsApp had strongest fit and lowest implementation risk.

## Decision

Build the prototype as a WhatsApp-first group travel planning agent via Photon / Spectrum, not as standalone app or Discord bot.

## Consequences

Messaging integration becomes core while broad UI scope is avoided.
