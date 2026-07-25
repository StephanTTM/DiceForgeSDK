# Architecture Decision Records

This log records decisions that materially affect architecture, public contracts, compatibility, or contributor workflow. New records use the next sequential identifier. Do not edit accepted historical context; supersede it with a new record when direction changes.

## ADR-0001: Renderer-agnostic, headless core

- **Date:** 2026-07-25
- **Status:** Accepted
- **Decision:** The core resolves dice rolls and coin flips without importing rendering, physics, game-engine, UI, or networking dependencies.
- **Rationale:** A headless core enables web, server, Unity, Godot, test, and simulation use cases while keeping integration lightweight.
- **Consequences:** Visual adapters must consume core event records rather than decide outcomes. Additional contracts are needed between core and presentation layers.
- **Alternatives considered:** A browser-first Three.js implementation; separate implementations per platform.

## ADR-0002: Offline-first with optional transport

- **Date:** 2026-07-25
- **Status:** Accepted
- **Decision:** Local functionality requires no account, service, or network connection. Multiplayer/synchronization is an optional plugin category.
- **Rationale:** This keeps the SDK useful in games, prototypes, private tools, and disconnected environments.
- **Consequences:** Networked features must be additive and cannot be part of core correctness.
- **Alternatives considered:** A hosted synchronized dice service as a required backend.

## ADR-0003: Dice and coin flips are the initial scope

- **Date:** 2026-07-25
- **Status:** Accepted
- **Decision:** The initial SDK supports dice and coin flips only. Other tabletop interaction types are out of scope unless separately adopted.
- **Rationale:** A focused domain gives the project a coherent first release and protects integration quality.
- **Consequences:** Plugin architecture remains general, but no speculative support for cards, tiles, or spinners is built initially.
- **Alternatives considered:** A broad tabletop interaction engine from the outset.

## ADR template

```md
## ADR-XXXX: Short title

- **Date:** YYYY-MM-DD
- **Status:** Proposed | Accepted | Superseded
- **Decision:**
- **Rationale:**
- **Consequences:**
- **Alternatives considered:**
```
