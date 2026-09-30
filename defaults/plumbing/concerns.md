---
id: concerns
title: Concerns
order: 6
screen: list
emptyMessage: No concerns were found in this plan.
fields: [severity, likelihood]
answerPresets: ["Accept Claude's fix", "Accept the risk"]
timeline: false
enabled: true
---

## What to look for
- Risks, weak spots and things that could go wrong in production.

## Rules
- One concern per item, with a severity (low, medium or high) and a likelihood (unlikely, possible or likely).
- Propose a concrete fix for each concern.
- Don't invent concerns to fill the list.

## Done when
- Each concern is fixed in the plan or accepted as a known risk.

## Always ask
- How would we notice this in production?
