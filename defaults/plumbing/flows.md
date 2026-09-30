---
id: flows
title: Flows
order: 4
screen: flows
emptyMessage: This plan doesn't add or change any user or system flows.
fields: []
answerPresets: []
timeline: false
enabled: true
---

## What to look for
- Journeys a person takes through the product.
- Sequences of calls between parts of the system, including jobs and external services.

## Rules
- Tag each flow user, system or both.
- User flows are steps with the screen shown at each step. Reuse the UI mockups.
- System flows are steps between lanes that map to real code parts.
- Number the steps so both views of a flow line up.
- Include the failure path when a step can fail.

## Done when
- Every flow in the plan is described step by step.
- Each step that touches the system says what the system does.

## Always ask
- What happens if this step fails halfway?
