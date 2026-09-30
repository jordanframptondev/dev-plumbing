---
id: security
title: Security & permissions
order: 10
screen: list
emptyMessage: This plan doesn't change roles, permissions or how personal data is handled.
fields: [tags]
answerPresets: []
timeline: false
enabled: true
---

## What to look for
- Who can do what, sensitive data, and how the feature behaves when misused.

## Rules
- Check authentication and authorization separately.
- Name every piece of sensitive data and where it goes, using the repo profile's sensitiveData tags.
- Consider changed IDs, repeated requests and direct API calls.
- Tag items AUTH, PII, PAYMENTS or ABUSE where they fit.

## Done when
- Every new action says who may perform it and where that is enforced.

## Always ask
- What happens if someone calls this directly with someone else's ID?
