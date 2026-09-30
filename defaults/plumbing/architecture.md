---
id: architecture
title: Architecture
order: 1
screen: diagram
emptyMessage: This plan doesn't change how the system is put together.
fields: []
answerPresets: []
timeline: false
enabled: true
---

## What to look for
- Apps, packages, services, jobs and external systems the plan adds, changes or relies on.
- How requests and data move between them.

## Rules
- Describe diagrams as data: nodes, groups and edges. Never draw.
- Tie every node to a real file, folder or symbol when one exists, and mark its status: new, changed, unchanged or external.
- Group nodes by app or package.
- Start with a system view. Add a data-flow view only when data moves in an interesting way.
- Don't invent components the plan doesn't need.

## Done when
- Every part of the system the plan touches appears in a diagram with its status.
- Every node that exists in the code has a checked code reference.

## Always ask
- Is there a simpler shape that does the same job?
