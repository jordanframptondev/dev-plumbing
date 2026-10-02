---
id: database
title: Database
order: 2
screen: database
emptyMessage: This plan doesn't change the database.
fields: []
answerPresets: []
timeline: false
enabled: true
---

## What to look for
- New, changed or removed tables, fields, indexes, enums and relations.
- Data that must be backfilled or migrated.

## Rules
- Compare every change with the schema file in the repo profile.
- New names follow the repo profile's conventions.
- Every backfill, destructive change and data-consent risk goes in the migration panel.
- Say how to roll back in a rollback entry in the migration panel.
- One item per table touched.

## Done when
- Every touched table has a diff card with an exact schema diff.
- The migration panel says how to roll back.

## Always ask
- Can this change be undone without losing data?
