# Restock reminders

Remind customers before a subscription item runs out, and let them reorder in one tap.

## Approach

A daily job finds subscriptions due in the next few days and sends a reminder. We haven't decided whether reminders go by SMS, email or both, or how many days before the due date to send them.

## Data

Log reminders in a table.

## Open points

- Should customers be able to snooze a reminder?
- What happens if the daily job runs twice on the same day?
