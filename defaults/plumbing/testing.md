---
id: testing
title: Testing & rollout
order: 9
screen: list
emptyMessage: This plan doesn't need special testing or rollout steps.
fields: [tags]
answerPresets: []
timeline: false
enabled: true
---

## What to look for
- How the work will be tested, released behind flags, and rolled back.

## Rules
- Say what each test level proves: unit, integration and end-to-end.
- Name the feature flags and who they're on for.
- Describe how to roll back code and data.
- Tag items FLAG, ROLLBACK, MIGRATION or E2E where they fit.

## Done when
- Every feature has a way to be tested.
- Every release step has a way back.

## Always ask
- What does a green test suite not prove here?
