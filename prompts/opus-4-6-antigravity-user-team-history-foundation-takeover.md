You are Claude Opus 4.6 inside Antigravity, working on an existing creator analysis application for marketing teams.

This is the user, team, and history foundation takeover.

The app is no longer just a single-session operator tool.
It now needs to become a real multi-user team product with durable identity, approval workflows, team membership control, and shared history.

Do not treat this as “add login quickly.”
This is the product backbone.

If you get the model wrong now, everything after this becomes harder:

- permissions
- approvals
- team isolation
- history visibility
- admin controls
- future billing / exports / notifications

So do not build a fake auth layer, do not use client-only state for approvals, and do not bolt team history onto the current session-bound batch UI without durable persistence.

## Product Requirements You Must Implement

The user defined the next step very clearly:

### 1. Membership requires admin approval

A person can sign up, but they are not automatically allowed into the system.
After signup, a system-level admin must approve or reject them.

### 2. Team membership also requires approval

After system approval, the user must choose a team and submit a membership request.
Initial teams include:

- `Dimes TR`
- `Dimes Club`
- `Obsesso`

The user is not immediately placed into that team.
The admin of that team must approve the request.

### 3. History is team-scoped and shared

When a team member runs the system and reaches a result, that run must automatically appear in the team’s shared history.
All members of that team should be able to see it.

This is not optional metadata.
This is core collaboration behavior.

## Read These Files First

- `app/package.json`
- `app/src/app/layout.tsx`
- `app/src/app/page.tsx`
- `app/src/app/api/analyze-all/route.ts`
- `app/src/app/api/analyze-single/route.ts`
- `app/src/lib/domain/batch-types.ts`
- `app/src/lib/domain/batch-queue.ts`
- `app/src/lib/domain/batch-engine.ts`
- `app/src/lib/domain/types.ts`
- `app/src/__tests__/page.test.tsx`

You must design from the real codebase, not from generic SaaS assumptions.

## Existing Codebase Reality You Must Respect

From the current repo, you should verify realities like:

- the app is a very lightweight Next.js 16 + React 19 application
- there is currently no auth system
- there is currently no durable database layer
- there is currently no user model, team model, session model, or history persistence
- the current batch workspace is session-bound and React-state driven
- the analysis primitives already exist and work through route handlers
- the current page is already carrying too much responsibility

That means:

- you must introduce durable product state for the first time
- you must avoid cramming all of this into one giant `page.tsx`
- you must add real server-side authorization boundaries

## Hard Product Truths

These are non-negotiable:

### 1. Signup and approval are different states

A created account is not the same thing as an approved app user.

The system must distinguish at least:

- account exists
- pending system approval
- approved for app access
- rejected / disabled

### 2. App approval and team membership are different states

A user may be approved for the platform, but still not belong to a team.

So the system must distinguish:

- approved platform user with no team
- pending team join request
- active team member

### 3. Team history cannot live in local component state

If the user refreshes the page, changes browser, or another teammate logs in, the history must still exist.

So history must be durably stored server-side.

### 4. Authorization must be enforced on the server

Do not rely on hidden buttons or client redirects alone.

The server must enforce:

- only approved users can access the protected app
- only team admins can approve join requests for their team
- only system admins can approve platform access
- only members of a team can view that team’s history

### 5. The current batch flow must become team-aware

History is not a separate product silo.
The batch workspace must know the active user and active team context so completed runs are recorded correctly.

## Architecture Requirement

You must think through the auth + persistence architecture explicitly before choosing.

At minimum, compare options like:

### Option A — self-contained auth library + durable relational storage

Examples:

- Better Auth or equivalent
- DB-backed sessions
- credentials-based login
- custom approval fields and team tables

### Option B — Auth.js / NextAuth style integration + adapter-backed persistence

- mature session handling
- still requires custom approval and team workflow modeling

### Option C — hand-rolled credentials + signed cookies + custom session store

- lowest dependency count
- highest correctness risk
- easy to get subtly wrong

You must choose the best option for this repo after inspecting the real project.

## Strong Bias

Unless the codebase proves otherwise, bias toward:

- one coherent in-repo auth system
- durable relational persistence
- custom approval logic in your own domain tables

Do not introduce a heavy external SaaS auth dependency just to get a login screen.
This product needs custom states and custom approvals anyway.

Also:

- do not use `localStorage` for auth
- do not use a flat JSON file as the primary multi-user database
- do not keep approvals in memory

This is now real application state.

## Persistence Requirement

Because approval workflows, team membership, and shared history are multi-user and durable, the app needs a real persistence layer.

You must choose the best grounded solution for this repo.

If deployment context is unclear, design the data layer so storage can evolve.
But do not avoid persistence just because the repo is currently lightweight.

At this stage, “no database” is the wrong choice.

## Data Model You Must Add

Names can differ, but the system needs equivalents to the following concepts.

### Users

The user model must support:

- id
- email / login identity
- display name
- system role
- app approval status
- approval metadata
- created / updated timestamps

Examples of needed states:

- `pending`
- `approved`
- `rejected`
- `suspended`

### System Roles

You need at least:

- `system_admin`
- `user`

Do not confuse system-level role with team-level role.

### Teams

The team model must support:

- id
- slug
- name
- active state

Seed at least:

- `Dimes TR`
- `Dimes Club`
- `Obsesso`

### Team Memberships

The system needs a durable representation of:

- which approved user belongs to which team
- their team role
- whether membership is active

At minimum team roles should include:

- `team_admin`
- `member`

### Team Join Requests

Do not overload memberships for pending requests.
Use a proper request / approval concept.

A join request should capture:

- requesting user
- requested team
- status
- reviewed by
- reviewed at
- optional rejection reason

This status machine should be explicit, not implied.

### Analysis Run History

The app needs a durable history record for completed team work.

Each run should capture at least:

- run id
- team id
- initiated by user id
- started at
- completed at
- run status
- input summary
- result summary
- enough persisted result data to make history useful

Do not persist nothing but a timestamp.
History needs to be product-meaningful.

## History Design Requirement

Team history should not be a shallow audit log if that makes the feature useless.

A good history system should let a teammate see:

- who ran it
- when they ran it
- what was analyzed
- what the outcome was

You must decide how much result data to persist, but the default should be:

- enough to render a meaningful past run view
- without storing wasteful raw provider payloads if they are not needed

Strong direction:

- persist the derived, product-facing analysis snapshot
- not every internal/raw provider artifact

That means history should be able to power:

- a team history list
- a history detail view that reuses current batch-result UI patterns where appropriate

## Product Flow You Must Implement

The full flow should look like this:

### Phase 1 — unauthenticated

User can:

- sign up
- sign in

### Phase 2 — awaiting system approval

After signup, if not yet approved by a system admin:

- the user can authenticate
- but cannot access the full app
- they should see a clear pending approval state

### Phase 3 — approved, no team yet

Once approved by system admin:

- the user can enter the protected product shell
- but cannot run analysis until they belong to a team
- they must choose a team and request access

### Phase 4 — awaiting team approval

After submitting team request:

- the user sees pending team status
- they still cannot fully operate as a team member

### Phase 5 — active team member

Once approved by the team admin:

- the user can access the batch workspace
- their runs are recorded under that team
- they can view team history

## Team Scope Recommendation

For this phase, keep the product model simple:

- one active team membership per user

Do not overbuild multi-team switching unless the existing product truly requires it right now.

However, model the data so future multi-team expansion is still possible.

## Admin Surfaces You Must Add

You need two different admin control surfaces.

### 1. System Admin approval surface

This is where system admins can:

- review pending signups
- approve or reject users
- optionally disable users later

### 2. Team Admin approval surface

This is where team admins can:

- see pending join requests for their own team only
- approve or reject them

Do not combine these into one vague approval table unless the UX is still very clear.
These are different authority levels.

## Bootstrap Problem You Must Solve

Do not forget the bootstrap issue.

If the system requires admin approval, you must define how the first system admin exists.
If team approval exists, you must define how the initial team admins exist.

You need a deliberate bootstrap path such as:

- seeded admins
- env-configured bootstrap email(s)
- a safe one-time initialization flow

Do not leave the app in a state where no one can approve anyone.

Also seed the initial teams:

- `Dimes TR`
- `Dimes Club`
- `Obsesso`

## Protected App Structure

Do not keep piling more conditional product logic into the current monolithic page.

You should strongly consider a real protected-app structure, for example:

- auth entry routes
- protected app shell
- approval waiting states
- team request screen
- admin screens
- history list / detail screens

Exact route names can differ, but the architecture must become easier to reason about than the current single-page sprawl.

## Batch Workspace Integration Requirement

The current batch workspace is session-local.
You must integrate it into the new identity model without destroying what already works.

Key rules:

- only approved team members can run analysis
- when a run starts, it must be associated with the active team and user
- when a run completes, it must create or update a durable history record
- history persistence must be truthful for complete / partial / error states

Do not fake a history write only after “perfect success.”
Partial and failed runs are also part of operational history when product-relevant.

## API / Server Boundary Requirements

Do not bury this logic only in client state.

Introduce clear server-side boundaries for:

- auth/session lookup
- current user / current team resolution
- admin approval actions
- team join request actions
- history listing
- history detail retrieval
- history write on completed batch execution

Authorization must be checked in server routes or server actions, not merely hidden in the UI.

## History Visibility Rules

The following must be true:

- a user can see history only for their team
- a team admin cannot see another team’s requests or history unless they also have rights there
- a system admin is not automatically a member of every team history view unless you deliberately choose that behavior and justify it

Be explicit and consistent.

## Reuse Requirement

Do not throw away the current batch/result modules.

History detail should reuse as much of the existing derived-analysis UI and domain structures as is reasonable.

This product already has meaningful result surfaces.
History should extend them, not replace them with a shallow text log.

## Testing Expectations

This feature set is too important for weak coverage.

Add tests for at least:

- signup / approval state gating
- pending users being blocked from protected app access
- approved users with no team being routed into team-request flow
- team admin approval behavior
- non-admin users being forbidden from approval endpoints
- team history being visible only to correct team members
- history records being created from completed runs
- no cross-team data leakage

If current UI tests become too broad, add focused server/domain tests rather than letting correctness rely only on page rendering.

## Implementation Quality Bar

When you implement, you must:

1. explain why session-only state is no longer enough
2. explain the auth/persistence architecture you chose
3. explain how the approval state machine works
4. explain how team-scoped history is persisted and authorized
5. solve bootstrap cleanly

Do not ship:

- fake auth
- UI-only approval
- no bootstrap path
- team history stored only in browser state
- one huge `page.tsx` that tries to do everything

The final result should feel like the product has evolved from a single-session benchmark tool into a real team workspace with durable identity, controlled access, and shared operational memory.
