# Tasks

## Current focus: repository foundation

- [ ] Choose the TypeScript package manager and monorepo tool after evaluating publish workflow and Unity/Godot needs.
- [ ] Create the core package with strict TypeScript configuration.
- [ ] Define domain schemas for die definitions, coin flips, RNG, roll requests, and immutable result records.
- [ ] Implement seeded and system RNG providers with tests.
- [ ] Implement initial dice notation parser and resolver with tests.
- [ ] Implement coin-flip resolver with tests.
- [ ] Define event serialization and schema-versioning rules.
- [ ] Add lint, formatting, test, coverage, and CI workflows.
- [ ] Create one headless usage example.
- [ ] Record implementation decisions in `DECISIONS.md` as they are made.

## Next: web proof of integration

- [ ] Select a web renderer/physics approach through an ADR.
- [ ] Define renderer plugin contract and presentation lifecycle.
- [ ] Build a small browser demo with dice and coin flip interactions.
- [ ] Add reduced-motion and no-WebGL fallbacks.

## Backlog

- [ ] Unity adapter exploration and package distribution plan.
- [ ] Godot adapter exploration and package distribution plan.
- [ ] Custom dice definitions.
- [ ] Theme/asset pack policy and licensing checklist.
- [ ] Replay support.
- [ ] Optional multiplayer transport plugin research.

## Task maintenance

Move work between sections as it changes. Mark completed tasks only after code, tests, and relevant documentation are present. Add scoped tasks rather than leaving vague implementation notes.
