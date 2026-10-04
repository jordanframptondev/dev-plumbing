# Finalize spec rules

Turn the draft into the final document an implementing AI will build from. Follow this structure and these rules.

## Structure

1. **Title and summary.** One paragraph.
2. **Goals and non-goals.**
3. **Decisions.** Each with the decision, why, and the alternatives rejected. Flag decisions that used a default.
4. **Architecture.** A Mermaid flowchart per diagram (its `{{diagram:…}}` token), and what each component does.
5. **Data model.** The exact schema diff (`{{schema:…}}`) and migration notes (`{{migration:…}}`) per table, then the backfill and rollback.
6. **UI changes.** Per screen: where it lives (app, route, files), what changes, and a link to its mockup HTML in `<name>.assets/` (`{{mockup:…:after}}`, plus `{{mockup:…:before}}` for a screen that exists today).
7. **Flows.** A Mermaid sequence diagram per system flow (`{{sequence:…}}`), and numbered steps per user flow (`{{steps:…}}`).
8. **Interfaces.** APIs, jobs, events and integrations.
9. **Security and permissions.**
10. **Testing.** The strategy, plus acceptance criteria per feature in Given / When / Then form.
11. **Rollout and rollback.**
12. **Phases and milestones.** Each phase with its exit criteria. No tasks.
13. **Notes for the implementer.** Files likely to change, the repo profile's conventions, things not to do, and assumptions made.
14. **Open items.** Non-blocking only, each with the default used.

## Rules

- Use only what's in the draft, the items, the threads and the decisions. Never invent behaviour.
- Every accepted decision appears in the section it affects.
- Use the tokens from the context pack for diagrams, flows, schema diffs, migrations and mockup links; never draw them by hand. The service replaces each token with a block generated from the item's data.
- Write for an AI that hasn't seen any of the discussion: be explicit, and name files and conventions.
- Leave out a section that doesn't apply, with one line saying why.
