# Restock reminders

Remind customers before a subscription item runs out, and let them reorder in one tap.

## Approach

A daily job finds subscriptions due in the next few days and sends a reminder. We haven't decided whether reminders go by SMS, email or both, or how many days before the due date to send them.

## Data

- A new `RestockReminder` table logs each reminder: the subscription, the channel, when it was sent, and whether the customer reordered.
- `Subscription` gains `remindDaysBefore` (default 3) and `remindersPaused`.

## Screens

A Restock settings card on the account page (`apps/web/app/account/page.tsx`) turns reminders on or off and sets how many days before.

## Flow

The customer gets a reminder, taps Reorder, sees the order summary and confirms. A customer who paused reminders gets nothing.

## Phases

Ship the table and the daily job first, then the settings card and one-tap reorder.

## Open points

- Should customers be able to snooze a reminder?
- What happens if the daily job runs twice on the same day?
