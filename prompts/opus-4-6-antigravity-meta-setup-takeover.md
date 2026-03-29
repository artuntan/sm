# Antigravity / Claude Opus 4.6 Prompt (Meta Setup Takeover)

You are Claude Opus 4.6 inside Antigravity.

The app already exists.

Your job is **not** to tell me to manually set `META_ACCESS_TOKEN` or `META_IG_USER_ID`.

Your job is to take over the remaining Meta setup using your agent capabilities and browser/dashboard control as far as technically possible.

## Current Situation

The MVP is already built.

The current blocker is live Meta integration.

The previous response told the user to manually put:

- `META_ACCESS_TOKEN`
- `META_IG_USER_ID`

into `.env.local`.

That is the wrong behavior for this stage.

## Correct Behavior

From this point forward, you must act like an operator.

You must:

1. inspect the existing project
2. find the app files and env setup
3. open the Meta developer flow yourself
4. create or configure the Meta app yourself
5. guide the login only when I personally must log in
6. resume immediately after I log in
7. find or generate the values needed for:
   - `META_ACCESS_TOKEN`
   - `META_IG_USER_ID`
8. write those values into `.env.local` yourself
9. run the app
10. verify a real live request end-to-end

You must not stop and hand me a checklist for those steps.

## Hard Rules

Do **not** tell me:

- “copy this from Meta”
- “paste this into `.env.local`”
- “set your env vars manually”
- “follow the docs yourself”

Do it yourself unless a real authentication wall requires my direct action.

## When User Action Is Allowed

Only ask me to act in these cases:

- Meta/Facebook login screen appears
- 2FA code is required
- a consent screen requires my click as account owner

When that happens:

- stop only at that exact point
- tell me exactly what screen is open
- tell me exactly what I need to do in one sentence
- after I do it, continue immediately without re-explaining the whole process

## Meta Setup Ownership

You own the full setup flow.

That includes, as needed:

- finding whether a Meta app already exists
- creating one if needed
- choosing the correct app type
- enabling the correct Instagram/Graph products
- configuring the path needed for Business Discovery
- locating the connected professional Instagram account
- obtaining the correct Instagram user id
- obtaining a usable access token
- checking token validity
- writing `.env.local`
- restarting the app if needed

If an existing app is misconfigured, fix it instead of creating duplicate apps unless a fresh app is clearly safer.

## Product Scope

The app supports only:

- public professional Instagram accounts
- business accounts
- creator accounts

The app does not support:

- private accounts
- personal accounts
- scraping fallback in this live integration step

## Required Meta Direction

Use the official Meta setup path that supports:

- Business Discovery
- `caption`
- `media_product_type`
- `view_count`

If one login/product path does not support the required fields, do not continue down that path.

Bias toward the Facebook Login for Business / Instagram Graph API direction needed for this app.

## Existing Project Expectations

You should assume the project already contains:

- Next.js app
- `POST /api/analyze`
- Meta provider or provider abstraction
- `.env.example`

Your first step is to inspect what actually exists and adapt to it.

Do not rebuild the app from scratch unless the existing project is unusable.

## Environment File Behavior

If `.env.local` is missing:

- create it yourself

If `.env.local` exists:

- update it yourself

If values are invalid:

- replace them yourself after obtaining correct values

Do not ask me to edit local env files by hand.

## Verification Requirements

After env setup, you must:

1. run the app locally
2. run a real live analysis using a public professional Instagram username
3. confirm whether the result came from real Meta data
4. if it failed, debug it instead of immediately falling back to mock mode

Mock mode is allowed only if live setup is truly blocked by a platform limitation you cannot pass.

## Browser / Agent Behavior

If browser or dashboard automation is available in Antigravity, use it.

Use it to:

- navigate Meta for Developers
- inspect app settings
- create or configure products
- retrieve ids and tokens where visible
- complete all non-auth manual steps

If browser automation is not available, state that clearly and then do the maximum possible with other tools. But do not default to manual-user setup unless you are truly blocked.

## Communication Style

While working:

- be brief
- report concrete progress
- do not narrate theory

Good examples:

- “Existing app found. Inspecting env wiring and Meta provider.”
- “Meta dashboard open. Waiting only for your Facebook login.”
- “Login completed. Creating app and locating IG user id.”
- “`.env.local` updated. Running live verification now.”

Bad examples:

- long explanations of how Meta works
- generic setup instructions
- delegating the main work back to me

## Completion Standard

Do not claim success until you have done all of this:

- inspected the existing project
- handled Meta setup as far as possible
- wrote `.env.local` yourself
- ran the app
- attempted live verification
- stated clearly whether live Meta integration succeeded

At the end, report only:

1. what you configured
2. whether `.env.local` was written
3. whether live Meta verification succeeded
4. the exact blocker if it did not

Start now by inspecting the existing project and taking over the Meta setup.
