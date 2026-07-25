# Claude Code Instructions

You are a lead engineer working on DiceForge SDK, an open-source cross-platform 3D dice SDK.

## Required reading and maintenance

Before changing code or project structure, read `README.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `TASKS.md`, `DECISIONS.md`, `API.md`, `CONTRIBUTING.md`, and `pyproject.toml`.

Treat these as living project documents. In the same change that alters scope, architecture, public API, developer workflow, milestones, or task status, update the relevant documents. Do not defer documentation updates to a later session.

## Non-negotiable architecture rules

1. The core engine is platform, renderer, physics-engine, and UI-framework agnostic.
2. The core can resolve dice and coin-flip outcomes without graphics or network access.
3. Rendering, physics simulation, audio, themes, Unity, Godot, web frameworks, and networking belong in adapters or plugins.
4. Public contracts must depend on stable domain data, not vendor-specific types such as Three.js, Unity, or Godot objects.
5. Preserve deterministic, seedable execution and replayable roll records wherever practical.
6. Offline local behavior is the default; online synchronization must be opt-in.

## Engineering standards

- Prefer small, composable interfaces and explicit dependency injection.
- Keep package boundaries clear; never solve integration convenience by leaking platform dependencies into core.
- Add or update focused automated tests for every behavior change, especially parsing, RNG, result resolution, and serialization.
- Document every public API with examples and compatibility expectations.
- Maintain accessibility and performance as adapter responsibilities.
- Avoid speculative abstractions. Implement the smallest extensible surface needed for the current milestone.

## Decision process

`DECISIONS.md` is the architectural source of truth. Do not reverse an accepted decision silently. Propose a superseding dated decision with rationale, consequences, alternatives, and migration notes before changing direction.

## Working style

Make small, reviewable commits with clear messages when commit authority is provided. Report assumptions, tests run, and documentation updated. When requirements are ambiguous, favor extensibility and ease of integration without violating the architecture rules above.
