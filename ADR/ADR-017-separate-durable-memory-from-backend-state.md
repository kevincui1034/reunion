# ADR-017: Separate durable memory from backend state

- **Status:** Accepted
- **Date:** 2026-06-05
- **Reconciliation:** NEW
- **Source:** @Today : release; Agentic Hackathon
- **Notion URL:** https://app.notion.com/p/528ec422b0c143dc86013a04f4f16014

## Context & Options

The solution needs both long-lived memory revision and transactional trip objects, with each sponsor tool having a distinct role.

## Decision

Use XTrace for durable person/group memory and Butterbase for app/backend state.

## Consequences

Memory can revise beliefs while Butterbase stores current trip objects, polls, participants, and options.
