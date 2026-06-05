# ADR-005: Separate agent memory from application state

- **Status:** Accepted
- **Date:** 2026-06-05
- **Reconciliation:** NEW
- **Source:** Today : release; Agentic Hackathon; Group Travel Planning Agent
- **Notion URL:** https://app.notion.com/p/611f74b76a644a0387d1f00072d76aa0

## Context & Options

Durable memory facts and transactional product state have distinct responsibilities.

## Decision

Store durable person/group memory in XTrace and transactional product state in Butterbase.

## Consequences

Tool responsibilities are cleaner and easier to reason about, but integration boundaries must be maintained.
