You are Claude Opus 4.6 inside Antigravity, working on an existing multi-user creator analysis application.

This is a super-admin architecture and auth-gate stability takeover.

There are two immediate product failures:

1. The app is throwing a React error because navigation is being triggered during render.
2. The bootstrap admin account `admin@dimes.com` is not behaving like a true super-admin. It is incorrectly being pushed into the normal team-request flow and blocked from system access.

You must fix both issues cleanly and elevate the admin model to a real global control plane.

Do not patch the symptom only.
Do not add hacks.
Do not leave `system_admin` as just "a user with one extra permission."

`admin@dimes.com` must become the true platform owner account.

## User Requirement You Must Implement

The user’s requirement is explicit:

- `admin@dimes.com` must be able to access everything
- it must not be forced to submit a team request
- it must be able to see all teams
- it must be able to see the heads/admins of all teams
- it must be able to manage the people inside teams
- it must be able to create new teams
- it must effectively manage the whole system

In short:

`admin@dimes.com` is not a normal user.
It is the top-level system administrator and must have a global management surface.

## Verified Bug Evidence

### Verified bug 1 — render-time router mutation

There is an actual React runtime error:

> Cannot update a component (`Router`) while rendering a different component (`Home`)

The screenshot points to:

- `src/app/page.tsx`
- render branch around the unauthenticated state
- a direct `router.replace("/login")` call during render

That is a real architectural bug, not a cosmetic warning.
You must remove render-time navigation mutations completely.

### Verified bug 2 — system admin is still team-gated

Current auth gating treats an approved user with no team as:

- `approved-no-team`
- or `team-pending`

The current `/api/auth/me` and `page.tsx` flow still assumes the user needs a team context before meaningful access.
That is wrong for `system_admin`.

A global system admin must not be blocked by team membership requirements.

## Read These Files First

Inspect these files before implementing:

- `app/src/app/page.tsx`
- `app/src/app/api/auth/me/route.ts`
- `app/src/lib/auth/index.ts`
- `app/src/lib/auth/guards.ts`
- `app/src/lib/db/schema.ts`
- `app/src/lib/db/seed.ts`
- `app/src/app/admin/users/page.tsx`
- `app/src/app/api/admin/users/route.ts`
- `app/src/app/admin/team/page.tsx`
- `app/src/app/api/admin/team-requests/route.ts`

Also inspect any other admin, history, or team-management files you need.

## Problem 1 — Fix the React Router Error Properly

You must eliminate all navigation side effects that happen during render.

### Required standard

No code path in `Home` should call:

- `router.replace(...)`
- `router.push(...)`
- or equivalent navigation mutations

from the render body itself.

If redirect behavior is needed, it must happen through a safe mechanism such as:

- a dedicated effect
- a server redirect boundary
- a route-level split
- or a cleaner auth-shell architecture

Choose the best option for this codebase.

### Required outcome

After your fix:

- the React console error must be gone
- unauthenticated users must still end up at login correctly
- the auth gate must remain stable
- there must be no render-time router mutation anywhere in the guarded flow

## Problem 2 — Promote `system_admin` to Real Super-Admin

The current model is too weak.
`system_admin` exists in the DB and guard layer, but product behavior still treats the account too much like a team-bound operator.

That must change.

### Required product rule

A `system_admin` must:

- bypass team-request gating
- bypass the "approved but no team" blocker
- access the system immediately after successful authentication
- have a global administration surface
- be able to inspect and manage all teams and memberships

### Required architecture rule

Do not force `system_admin` to pretend to be a normal team member just to access the product.

If some workflows truly require a team context, design that explicitly.
But do not use missing team membership as a reason to block the global admin account from the system.

## Super-Admin Capabilities You Must Add or Upgrade

The global admin account must be able to manage the organization, not just approve a signup.

At minimum, the super-admin control plane must support:

### 1. Team directory

- list all teams
- see whether each team is active
- see who the team admins / heads are
- see how many members each team has

### 2. Team detail management

For a given team, the super-admin must be able to:

- see all members
- see which members are team admins vs normal members
- inspect pending join requests
- approve or reject requests
- change membership roles if appropriate
- activate / deactivate memberships if appropriate

### 3. Team creation

The super-admin must be able to:

- create a new team
- define at least a name and slug
- optionally assign an initial team admin

### 4. User oversight

The super-admin must be able to:

- continue approving or rejecting platform users
- see which team(s) or active membership(s) each user belongs to
- understand who is currently unassigned, pending, active, rejected, or suspended

## Design Constraint

Do not ship a fake admin panel with shallow data.

If you add a global team management surface, it must use real server-authorized data and real mutations.

## Auth and State Rules You Must Enforce

You must make the user state model explicit.

At a minimum:

- regular approved user with no team => team onboarding flow
- regular approved user with pending team request => pending team state
- active team member => team workspace
- `system_admin` => global admin/system access immediately, without forced team request

This distinction must exist both:

- in server truth
- and in client routing/gating behavior

Do not rely on client-only assumptions.

## Team Model Guidance

Inspect the current schema and decide what minimal additions are required.

If the current schema is too weak to support proper organization management, extend it cleanly.

Examples of acceptable evolution:

- better team listing queries
- stronger membership-management endpoints
- optional metadata for team ownership/admin visibility
- explicit server-side role management for memberships

Do not overbuild unrelated enterprise features.
But do build enough so the super-admin actually has system-wide operational control.

## UX Direction

The system admin should feel like they enter a management workspace, not a blocked user flow.

Possible good outcomes include:

- a global admin landing/dashboard
- clear links to user approvals, teams, memberships, and requests
- the ability to move between system-level management and operational workspace views

Exact routing is up to you, but the experience must be coherent.

## Required Fixes in Existing Logic

You must specifically audit and repair:

### `app/src/app/page.tsx`

- render-time navigation bug
- auth gating branches
- incorrect `system_admin` fallthrough into team request states
- header/admin links that are currently tied only to team context

### `/api/auth/me`

- it must return enough truth for the client to distinguish super-admin vs normal user states cleanly
- it must not imply that lack of team membership blocks a system admin

### Team admin pages / APIs

Current team admin surfaces appear scoped to one `teamId` and are oriented around normal team admins.
You must decide how to evolve this so `system_admin` can operate across all teams without friction.

## Verification Requirements

You are not done without proving this works.

Add or update tests for at least:

- unauthenticated state no longer triggers router mutation during render
- `system_admin` is not routed into the team-request flow
- `system_admin` can access the global admin surface
- super-admin can list all teams
- super-admin can inspect team admins / heads
- super-admin can create a team
- super-admin can manage team membership or requests across teams

If UI tests are too broad, add focused route / auth / domain tests that still prove behavior.

## Final Quality Bar

After your work:

- the React router console error must be gone
- `admin@dimes.com` must enter the system as a true global administrator
- the admin account must not be blocked by missing team membership
- the admin must be able to manage users, teams, team admins, and memberships centrally
- the implementation must be server-authorized, not cosmetic

Do the real fix and turn the admin account into an actual control-plane owner, not a partially privileged user.
