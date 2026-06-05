# PRD — Group Travel Planning Agent

## 1) Product name

**Group Travel Planning Agent**

## 2) One-line pitch

A messaging-native travel planning agent that detects trip intent in group chat, remembers each person's constraints, and turns vague travel chatter into concrete options, polls, and next actions.

## 3) Problem

Friend groups plan trips in chat, but planning state gets scattered across messages, jokes, links, constraints, and half-commitments.

Most existing travel tools assume an individual search session. The core problem here is group coordination.

## 4) Target users

- **Primary user:** friend groups planning casual travel through iMessage.
- **Initial persona:** friends in their 20s/30s living in different cities who want low-friction planning help.
- **Adopter:** any group member tired of coordinating dates, preferences, and options manually.

## 5) User need

Users need a way to preserve momentum when travel intent appears in chat, without switching to a separate planning app.

## 6) Product thesis

Group travel is primarily a **coordination-memory problem**.

The agent should remember who wants what, detect when a plan is forming, and propose the next useful coordination action.

## 7) Goals

1. Detect travel intent inside group chat.
2. Extract planning context (destination, dates, people, constraints, preferences, open questions).
3. Persist person-level and group-level memory.
4. Propose a useful next step in chat.
5. Store trip state in backend systems.
6. Demonstrate required hackathon technologies in one visible loop.

## 8) Non-goals (hackathon prototype)

1. Full booking flow
2. Payments
3. Complete live inventory integrations
4. Native mobile app
5. Full production onboarding/auth polish

## 9) Core user story

As a friend in a travel group chat, I want the agent to notice when we are starting to plan a trip, remember everyone's constraints, and propose the next best planning step, so we can turn casual intent into an actual plan without leaving chat.

## 10) Demo scenario

1. Group mentions a destination and timeframe.
2. Participants add constraints (availability, dietary, etc.).
3. Agent detects planning intent and summarizes known facts.
4. Agent asks to create a trip plan.
5. Agent proposes coordination artifacts (date poll, options, summary).
6. Memory and backend state are persisted for follow-up messages.

## 11) MVP scope

### Must have

1. Message ingestion from iMessage via Photon / Spectrum.
2. Travel intent detection.
3. Context extraction (destination, dates, people, constraints, preferences).
4. Memory read/write in XTrace.
5. Trip and planning state in Butterbase.
6. RocketRide orchestration for core workflow.
7. Short, useful response back into chat.
8. End-to-end demo artifact.

### Should have

1. Date poll generation
2. Preference summary
3. "What do we know so far?" and "What's next?" prompts

### Could have

1. Link/TikTok destination extraction
2. Calendar conflict checks
3. Mock travel recommendations

## 12) Functional requirements

- **FR1 — Detect intent:** classify messages by travel planning signal strength.
- **FR2 — Extract entities:** destination, timeframe, participants, constraints, preferences, open questions, confidence.
- **FR3 — Persist memory:** person/group facts and superseding updates in XTrace.
- **FR4 — Persist state:** trips, participants, options, polls, summaries in Butterbase.
- **FR5 — Generate next action:** one concrete coordination step per response.
- **FR6 — Message delivery:** responses are posted back in iMessage.

## 13) Non-functional requirements

1. Low friction (stay in chat)
2. Low noise (avoid over-triggering)
3. Explainable responses
4. Privacy-aware persistence
5. Fast enough for demo loop
6. Recoverable on partial failures
7. Observable enough for judges

## 14) Architecture

### Core loop

1. Message arrives via Photon / Spectrum.
2. RocketRide classifies intent and extracts entities.
3. XTrace memory is read.
4. Planning decision is made from message + memory.
5. Butterbase state is created/updated.
6. XTrace writes durable fact updates.
7. Next useful coordination action is sent back to chat.

### Sponsor mapping

- **Photon / Spectrum:** messaging interface layer.
- **RocketRide:** visible orchestration pipeline.
- **XTrace:** durable person/group memory and belief revision.
- **Butterbase:** transactional app state and plan artifacts.

## 15) Suggested data model

- `User`
- `Group`
- `Trip`
- `TripParticipant`
- `MessageEvent`
- `PlanningOption`
- `Poll`

## 16) Memory model

- **Person memory:** preferences, availability, dietary, budget posture, destination interest.
- **Group memory:** active destination/timeframe, known constraints, unresolved decision.
- **Contradictions:** newer facts supersede stale facts.

## 17) Commands

- `plan this`
- `what do we know so far?`
- `what's next?`
- `make a poll`
- `summarize the trip`

## 18) UX principles

1. Stay in chat.
2. Ask before becoming highly active.
3. Summarize before deciding.
4. Preserve uncertainty.
5. Turn memory into action.
6. Keep responses short.

## 19) Success metrics

### Hackathon success

1. End-to-end demo works.
2. All four technologies are visibly integrated.
3. Demo clearly shows chat -> memory/backend -> next action.

### Product success

1. Travel-intent threads converted into plans.
2. Number of remembered constraints per group.
3. Number of decisions made through the agent.
4. Reduction in manual coordination burden.

## 20) Risks and mitigations

### Key risks

1. Messaging integration delays
2. Agent chat noise
3. Shallow memory integration
4. Scope creep into broad travel search

### Mitigations

1. Keep a narrow demo path.
2. Default to ask-before-act behavior.
3. Use synthetic seeded context if needed.
4. Focus on coordination artifacts over booking depth.

## 21) Open questions

1. Final messaging platform path details in Photon / Spectrum
2. Fastest production handoff between Butterbase and XTrace boundaries
3. Level of real travel search needed vs mocked options
4. Passive vs proactive trigger threshold defaults

## 22) Build plan

### Phase 1 — Core plumbing

Butterbase schema, Photon endpoint, RocketRide pipeline skeleton, XTrace read/write.

### Phase 2 — Minimal intelligence

Intent detection, extraction, memory writes, trip-state creation.

### Phase 3 — Demo behavior

Summary generation, next-action generation, chat response loop.

### Phase 4 — Pitch polish

Narrative around coordination-memory thesis and visible multi-tool integration.

## 23) Product narrative

The Group Travel Planning Agent behaves like the friend who remembers everything without dominating the conversation. It notices when a trip is forming, keeps track of preferences and constraints, and turns social momentum into concrete planning steps.

The core insight: **the plan is already in the conversation; the agent's job is to remember it, structure it, and move it forward.**

---

Source: synced from the Notion PRD page linked by the project page on 2026-06-05.
