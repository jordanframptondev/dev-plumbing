# Whiteboard Defense

## Purpose

Whiteboard Defense is an engineering review framework for code written or assisted by AI.

The core principle is simple:

> **If you ship it, you should be able to explain it.**

AI can generate implementation details, but the engineer releasing the code still owns the system. The goal of Whiteboard Defense is not to require memorization of every line of code. It is to verify that the engineer understands the system well enough to explain how it works, why it works that way, what can go wrong, and how to recover when it does.

This skill should analyze a code change, feature, pull request, implementation plan, architecture, or repository context and produce a clear **Whiteboard Defense** that a developer can use to review and defend the system before release.

---

# Core Philosophy

Whiteboard Defense is based on several principles.

## 1. Ownership matters more than authorship

An engineer does not need to personally type every line of code.

They do need to understand the system they are releasing.

AI may write the code.

The engineer still owns:

- the architecture
- the business behavior
- the data model
- the security model
- the failure modes
- the operational consequences
- the release decision

---

## 2. Understanding is more important than memorization

Whiteboard Defense should not test whether a developer remembers:

- exact function names
- exact line numbers
- every class or file
- implementation trivia
- syntax

Instead, it should test whether the developer can explain:

- how the system works
- what components are involved
- how data moves
- what the important decisions are
- where the system can fail
- what assumptions were made

The ideal standard is:

> Could the developer explain the feature on a whiteboard without opening the code?

---

## 3. AI lowers the cost of implementation, not the cost of responsibility

AI can rapidly generate large amounts of code.

That makes engineering judgment more important, not less important.

When implementation becomes cheap, developers must be especially strong at:

- system design
- identifying unnecessary complexity
- verifying assumptions
- finding security risks
- understanding data ownership
- reviewing failure paths
- evaluating tradeoffs
- debugging
- operating software in production

---

# When to Use Whiteboard Defense

Whiteboard Defense is useful for:

- AI-generated features
- large AI-assisted pull requests
- new APIs
- database changes
- authentication and authorization work
- payment flows
- healthcare or sensitive-data workflows
- integrations with external services
- background jobs
- queues
- state machines
- infrastructure changes
- major refactors
- unfamiliar code
- code written by agents
- high-risk production changes

It should not become mandatory paperwork for trivial changes.

Examples of changes that usually do **not** require a full Whiteboard Defense:

- copy changes
- simple styling changes
- small isolated bug fixes
- minor configuration changes
- obvious low-risk refactors

Use judgment.

The higher the blast radius, complexity, or uncertainty, the deeper the Whiteboard Defense should be.

---

# Review Depth

The skill should classify the change into one of three review levels.

## Level 1 — Lightweight

Use for low-risk or small changes.

The output should focus on:

- purpose
- basic flow
- important data
- obvious risks
- testing
- rollback

---

## Level 2 — Standard

Use for normal production features.

The output should cover the full Whiteboard Defense framework.

---

## Level 3 — High Risk

Use when the change touches areas such as:

- authentication
- authorization
- payments
- healthcare
- prescriptions
- PII
- PHI
- financial data
- destructive operations
- data migrations
- external side effects
- infrastructure
- distributed systems
- multi-tenant isolation
- security boundaries

The output should deeply inspect:

- security
- tenant isolation
- failure handling
- concurrency
- idempotency
- external side effects
- recovery
- observability
- blast radius

---

# Inputs

The skill may receive any combination of:

- source code
- git diff
- pull request
- implementation plan
- architecture document
- feature description
- issue or ticket
- repository context
- database schema
- API contract
- test suite
- screenshots
- user flow
- external integration documentation

The skill should work with whatever context is available.

If information is missing, do not invent it.

Clearly identify:

- what is known
- what is inferred
- what is unknown
- what should be verified

---

# Whiteboard Defense Framework

The generated defense should evaluate the following areas.

---

# 1. Purpose

Explain the feature in plain language.

Answer:

- What problem does this solve?
- Who uses it?
- What outcome is expected?
- What are the important business rules?
- What is explicitly out of scope?
- What assumptions does the implementation depend on?

The explanation should be understandable without reading the code.

A developer should ideally be able to explain the feature in roughly one minute.

---

# 2. System Flow

Describe how a request, event, or operation moves through the system.

Show the major path.

Example:

```text
User
  ↓
Application
  ↓
API / Server Action
  ↓
Authentication
  ↓
Authorization
  ↓
Business Logic
  ↓
Database
  ↓
Queue
  ↓
External API
  ↓
State Update
```

Explain:

- where the operation begins
- what components are involved
- what happens synchronously
- what happens asynchronously
- where data is persisted
- where external systems are called
- where the final result is stored

Avoid focusing on file names unless they are important to understanding the architecture.

---

# 3. Architecture

Identify the major components involved.

Examples:

- frontend
- API
- server actions
- services
- repositories
- database
- cache
- queue
- background workers
- event bus
- external APIs
- third-party services

Explain the responsibilities of each important component.

Also identify suspicious or unnecessary layering.

Ask:

> Does every major abstraction have a reason to exist?

---

# 4. Data Model

Identify the important data involved.

Explain:

- what entities exist
- how they relate
- what gets created
- what gets updated
- what gets deleted
- what is immutable
- what values are derived
- what values are persisted

Example:

```text
Practice
   │
   ├── Providers
   │
   └── Patients
          │
          └── Orders
                │
                └── Prescription
```

---

# 5. Source of Truth

For every important piece of state, identify the authoritative owner.

Example:

```text
Order status        → Application database
Payment status      → Stripe
Authentication      → Identity provider
Shipment tracking   → Carrier / fulfillment provider
Feature flag state  → Feature flag service
```

Ask:

- What happens if two systems disagree?
- Which system wins?
- How is state reconciled?

---

# 6. Invariants

Identify rules that must always remain true.

Examples:

```text
An order belongs to exactly one patient.

A user can only access resources belonging to their tenant.

A payment cannot be captured twice for the same order.

A pharmacy order must reference an internal order.

A completed transaction cannot return to a pre-payment state.
```

Invariants are especially important for AI-generated code because implementation may appear correct while violating implicit system assumptions.

---

# 7. State and Lifecycle

Identify important states and allowed transitions.

Example:

```text
DRAFT
  ↓
SUBMITTED
  ↓
REQUIRES_REVIEW
  ↓
APPROVED
  ↓
SENT
  ↓
FULFILLED
```

Explain:

- valid transitions
- invalid transitions
- who can trigger each transition
- whether transitions are reversible
- whether transitions are idempotent
- what happens during partial failure

---

# 8. Authentication

Answer:

- Who is making the request?
- How is identity established?
- Where is authentication enforced?
- What happens when authentication expires or fails?
- Are machine-to-machine calls authenticated?

Do not confuse authentication with authorization.

Authentication answers:

> Who are you?

---

# 9. Authorization

Answer:

- What is this actor allowed to do?
- Where are permissions enforced?
- Are permissions checked server-side?
- Can a user access another tenant's resources?
- Can IDs be manipulated?
- Does the system trust client-provided ownership information?
- Are administrative paths protected separately?

Authorization answers:

> Are you allowed to do this?

For multi-tenant systems, explicitly evaluate tenant isolation.

---

# 10. Security

Consider how the feature behaves when the caller is malicious.

Ask what happens if someone:

- changes request values
- sends arbitrary IDs
- modifies tenant IDs
- bypasses the UI
- calls the API directly
- sends malformed input
- sends extremely large input
- repeats requests
- replays requests
- attempts enumeration
- injects unexpected values
- manipulates client-side state

Evaluate relevant risks such as:

- SQL injection
- XSS
- CSRF
- SSRF
- authorization bypass
- IDOR
- secret leakage
- PII leakage
- PHI leakage
- insecure logging
- unsafe redirects
- missing rate limiting
- insecure file uploads

Not every category applies to every feature.

Only include relevant risks.

---

# 11. Failure Modes

Ask:

> Where can this fail?

Identify realistic failure scenarios.

Examples:

- database unavailable
- external API timeout
- external API returns an error
- queue worker crashes
- webhook arrives late
- duplicate webhook
- malformed response
- user submits twice
- deployment happens during processing
- network request times out
- internal operation succeeds but external operation fails
- external operation succeeds but internal persistence fails

For each meaningful failure mode, explain:

- what happens
- what state remains
- whether retry is safe
- whether reconciliation exists
- whether manual recovery is possible

---

# 12. Idempotency

Ask:

> What happens if this operation executes twice?

Pay special attention to:

- payments
- orders
- prescriptions
- emails
- webhooks
- account creation
- external API calls
- queue jobs
- fulfillment
- data imports

Explain how duplicates are prevented or tolerated.

Possible mechanisms include:

- idempotency keys
- unique constraints
- deduplication tables
- state checks
- transactional guards
- external provider idempotency support

---

# 13. Concurrency

Ask:

> What happens if two operations happen at the same time?

Examples:

- two users update the same resource
- two workers process the same job
- two providers approve something
- a webhook arrives during an edit
- two requests attempt the same payment
- two deployments run migrations

Consider:

- race conditions
- lost updates
- optimistic locking
- pessimistic locking
- transactions
- unique constraints
- distributed locks
- ordering assumptions

Only include concurrency concerns that actually matter to the feature.

---

# 14. Dependencies

Identify important dependencies.

Examples:

- database
- identity provider
- payment provider
- cloud infrastructure
- email provider
- pharmacy API
- analytics service
- feature flag service
- queue service

For each major dependency, answer:

- Why is it needed?
- What does the system rely on it for?
- What happens if it is unavailable?
- Is failure immediate or recoverable?
- Is there a fallback?
- Does it introduce vendor-specific behavior?

Do not list every package in the dependency tree.

Focus on operationally important dependencies.

---

# 15. Tradeoffs

Identify major implementation decisions.

Ask:

> Why did we choose X instead of Y?

Examples:

- synchronous vs asynchronous
- polling vs WebSockets
- relational database vs document database
- one table vs multiple tables
- event-driven vs request-driven
- compute vs storage
- cache vs direct query
- build vs buy
- server action vs API route
- normalized vs denormalized data

The goal is not to prove the chosen option is objectively perfect.

The goal is to show that the engineer understands the decision and its consequences.

---

# 16. Complexity

Evaluate whether the implementation is more complicated than necessary.

AI-generated code often introduces unnecessary:

- abstractions
- interfaces
- factories
- wrappers
- adapters
- services
- managers
- repositories
- configuration layers
- generic frameworks

Ask:

- What complexity is essential?
- What complexity is accidental?
- Could the feature be implemented more simply?
- Are abstractions solving real problems?
- Are abstractions preparing for hypothetical future requirements?

Prefer understandable systems over clever systems.

---

# 17. Observability

Ask:

> How would we know this is broken?

Evaluate:

- logs
- metrics
- traces
- error reporting
- alerts
- dashboards
- audit logs
- request IDs
- correlation IDs
- external provider IDs

A production system should provide enough information to reconstruct what happened.

Important questions include:

- Can support identify the failed operation?
- Can engineers trace it across services?
- Can internal state be compared with external provider state?
- Are failures visible before customers report them?

---

# 18. Debugging

Ask:

> If this breaks in production, where would an engineer start?

Provide a practical debugging path.

Example:

```text
1. Find the affected record.
2. Inspect current state.
3. Check audit history.
4. Find the request or correlation ID.
5. Inspect relevant application logs.
6. Inspect background-job execution.
7. Compare internal state with the external provider.
8. Determine whether retry or reconciliation is safe.
```

The engineer should understand the debugging path even if they do not remember exact commands.

---

# 19. Testing

Explain what the test suite actually proves.

Identify:

- unit tests
- integration tests
- end-to-end tests
- contract tests
- security tests
- migration tests

Ask:

- What behavior is tested?
- What is mocked?
- What is not mocked?
- What important edge cases are covered?
- What important edge cases are missing?
- Are failure paths tested?
- Are authorization boundaries tested?
- Are duplicate requests tested?
- Are concurrency-sensitive paths tested?

Be especially skeptical of tests generated by the same AI that wrote the implementation.

A green test suite does not prove the requirements are correct.

Possible failure pattern:

```text
Incorrect implementation
+
tests validating the same incorrect assumption
=
green CI
```

---

# 20. Deployment

Explain how the change reaches production.

Example:

```text
Pull Request
   ↓
CI
   ↓
Preview Environment
   ↓
Review
   ↓
Merge
   ↓
Production Deployment
```

Identify deployment-sensitive behavior such as:

- environment variables
- schema changes
- feature flags
- build-time configuration
- background workers
- scheduled tasks
- external credentials

---

# 21. Rollback and Recovery

Ask:

> What happens if we need to undo this?

Evaluate:

- code rollback
- feature flag disablement
- schema rollback
- migration compatibility
- data repair
- queue shutdown
- external side effects
- compensating actions

Remember:

A code rollback does not automatically undo:

- database migrations
- data migrations
- payments
- prescriptions
- emails
- external API calls
- destructive operations

Where rollback is impossible, describe the recovery strategy.

---

# 22. Blast Radius

Ask:

> If this is wrong, what can it affect?

Possible answers:

- one request
- one user
- one tenant
- one organization
- all users
- all tenants
- payments
- authentication
- sensitive data
- historical data
- external systems
- infrastructure

Use blast radius to determine review depth.

A change with a large blast radius deserves more scrutiny even if the implementation looks simple.

---

# 23. Unknowns and Assumptions

The skill must explicitly identify uncertainty.

Separate findings into:

## Known

Directly supported by the provided code or documentation.

## Inferred

Reasonable conclusions based on available evidence.

## Unknown

Important questions that cannot be answered from the available context.

## Verify Before Release

Items that should be manually confirmed before shipping.

Never invent missing architecture or system behavior.

---

# Output Format

The skill should produce a structured response with the following sections.

---

## Whiteboard Defense

### 1. Executive Summary

A short plain-language description of:

- what was built
- how it works
- overall risk level
- the most important things an engineer should understand

---

### 2. Whiteboard Diagram

Provide a simple text diagram of the main flow.

Example:

```text
User
 ↓
Frontend
 ↓
Server Action
 ↓
Authorization
 ↓
Order Service
 ↓
Postgres
 ↓
Queue
 ↓
Pharmacy API
```

---

### 3. System Walkthrough

Explain the feature from beginning to end.

Focus on architecture and behavior rather than source-code trivia.

---

### 4. Data and State

Cover:

- entities
- relationships
- source of truth
- invariants
- state transitions

---

### 5. Security Model

Cover:

- authentication
- authorization
- tenant isolation
- relevant attack surface
- sensitive-data concerns

---

### 6. Failure Analysis

Cover:

- failure modes
- retry behavior
- idempotency
- concurrency
- partial failure
- reconciliation

---

### 7. Dependencies and Tradeoffs

Explain:

- important dependencies
- why they exist
- major architecture decisions
- relevant tradeoffs

---

### 8. Complexity Review

Identify:

- unnecessary abstractions
- overengineering
- hidden coupling
- places where the design could be simpler

---

### 9. Production Readiness

Cover:

- observability
- logging
- debugging
- tests
- deployment
- rollback
- recovery
- blast radius

---

### 10. Questions the Engineer Should Be Able to Answer

Generate concise questions that could be used in an actual Whiteboard Defense conversation.

Examples:

- Where does this operation enter the system?
- What is the source of truth for this state?
- What happens if this request runs twice?
- What happens if the external API succeeds but our database write fails?
- Who is authorized to perform this operation?
- What prevents another tenant from accessing this resource?
- How would you know this is broken in production?
- How would you debug it?
- Why did you choose this architecture instead of a simpler alternative?
- How would you safely undo this change?

---

### 11. Release Concerns

List issues that should be addressed before release.

Use severity labels:

- **Critical** — should block release
- **High** — likely should block release
- **Medium** — should be reviewed or addressed soon
- **Low** — improvement or cleanup
- **Informational** — useful context

Do not invent concerns just to populate this section.

If there are no meaningful concerns, say so.

---

### 12. Unknowns

Clearly list information that could not be determined.

---

### 13. Whiteboard Defense Checklist

Finish with a concise checklist:

```text
[ ] I can explain the purpose.
[ ] I can draw the system flow.
[ ] I understand the important data.
[ ] I know the source of truth for important state.
[ ] I understand the state transitions.
[ ] I know who can perform each operation.
[ ] I understand the relevant security risks.
[ ] I know the major failure modes.
[ ] I know what happens if operations run twice.
[ ] I understand relevant concurrency risks.
[ ] I know the important dependencies.
[ ] I understand the major tradeoffs.
[ ] I can explain why the architecture is not unnecessarily complex.
[ ] I know what the tests prove.
[ ] I know how we would detect a production failure.
[ ] I know how I would debug it.
[ ] I understand deployment risks.
[ ] I know how to recover or roll back.
[ ] I understand the blast radius.
[ ] I know what assumptions still need to be verified.
```

---

# Behavioral Rules for the AI

## Be skeptical

Do not assume the implementation is correct because:

- tests pass
- code compiles
- an AI generated it
- the architecture looks sophisticated
- the pull request description says it works

Review the system independently.

---

## Prefer systems thinking over code trivia

Focus on:

- boundaries
- state
- data
- trust
- failure
- dependencies
- tradeoffs
- operations

Do not turn Whiteboard Defense into a line-by-line code review.

---

## Distinguish fact from inference

Use language such as:

- "The code shows..."
- "This appears to..."
- "This likely means..."
- "I could not verify..."
- "This should be confirmed..."

Never present guesses as facts.

---

## Avoid unnecessary criticism

The goal is not to find faults for the sake of finding faults.

If the system is simple and well designed, say so.

If a category is irrelevant, omit it or mark it not applicable.

---

## Avoid overengineering

Do not recommend:

- queues
- microservices
- event buses
- caches
- distributed locks
- complex abstractions

unless the problem actually requires them.

Simplicity is a feature.

---

## Think like the production owner

Evaluate the system from the perspective of the engineer who will be responsible when it breaks at 2 AM.

The final defense should answer:

> Do I understand this system well enough to own it in production?

---

# Whiteboard Defense Standard

A feature passes Whiteboard Defense when the responsible engineer can explain:

1. what the system does
2. how the system works
3. what data it owns
4. what assumptions it depends on
5. who can access it
6. where it can fail
7. what happens when operations repeat
8. what happens under concurrency
9. what external systems it depends on
10. why important design choices were made
11. how failures are detected
12. how failures are debugged
13. what the tests actually prove
14. how the change is deployed
15. how the system can be recovered
16. what the blast radius is

The goal is not perfect knowledge.

The goal is responsible ownership.

---

# Guiding Principle

> **AI may write code you did not write. It should not ship a system you do not understand.**

Whiteboard Defense exists to preserve engineering understanding, judgment, and ownership in an AI-native development workflow.
