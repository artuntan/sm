You are Claude Opus 4.6 inside Antigravity, working on an existing creator analysis app for marketing teams.

This is a second-pass UI composition revision.

The previous revision already moved the `Budget + CPM Workbench` to the right of the Instagram visibility cards.
That solved the literal placement request, but it did NOT solve the actual design problem.

The lower section still feels visually unbalanced.

Do not stop at “it is technically on the right now”.
You must fix the composition so it feels deliberate, premium, and proportionally correct.

## What Went Wrong In The Current Revision

You must verify the current implementation in `app/src/app/page.tsx`.

The current lower section already uses a two-column split similar to:

- left rail = story + carousel
- right rail = budget + cpm workbench

But the result still reads as:

- a left stack of two detached support cards
- a right workbench that was simply placed beside them
- mismatched visual weight
- awkward height / density balance
- an overall “still not quite right” feeling

This is the exact problem you must solve.

## Read These Files First

- `app/src/app/page.tsx`
- `app/src/app/globals.css`
- `app/src/__tests__/page.test.tsx`

Reason from the real current JSX and spacing system.
Do not guess.
Do not treat this like a fresh mockup.

## Product Goal

Make the lower section feel like one intentional analysis composition.

The lower section should no longer read as:

- left: two random cards
- right: one unrelated table

It should read as:

- one coherent planning surface
- with a dominant workbench area
- and a well-proportioned supporting visibility area

## Required Design Outcome

The user should look at the result and feel:

- “Yes, this lower section is composed”

not:

- “The workbench is on the right, but the layout is still awkward”

## Strong Direction You Should Follow

Stop thinking only in raw column spans like `5/7`.
Think in visual systems.

You should strongly consider one of these composition upgrades:

### Option A — Unified visibility column

Wrap Story + Carousel into a single grouped left-side intelligence module, with:

- shared outer container
- shared vertical rhythm
- internal segmented sub-sections
- more compact card anatomy

This often produces a much stronger composition than two isolated cards stacked beside one large table.

### Option B — Height-balanced two-panel board

Make the lower section behave like a two-panel board:

- left panel = visibility intelligence
- right panel = planning workbench

with intentionally balanced heights, spacing, and top alignment.

If needed:

- let the right panel stretch to fill available height
- reduce wasted vertical space in the left side
- make the left side denser and more support-like

### Option C — Dominant-right composition

Treat the workbench as the primary module and the visibility surfaces as a secondary intelligence rail.

That means:

- the workbench should visually dominate
- the left side should feel like a compact, elegant support system
- the lower section should not feel left-heavy

Pick the best solution for this codebase and this visual language.

## What You Must Improve

### 1. Visual balance

You must fix:

- mismatched perceived weight between left and right
- too much empty or low-information space
- awkward differences in density
- the “two small cards next to one unrelated big table” effect

### 2. Height logic

The section currently feels height-awkward.

You should improve one or more of:

- align top edges more intentionally
- align bottom edges more intentionally
- make right panel height feel earned
- compress left content so it behaves like a real support rail
- allow internal scroll or overflow handling if needed instead of weird external proportions

Do not blindly force identical heights if it harms readability.
But do fix the current imbalance.

### 3. Card anatomy

The left-side panels are currently too close to being full standalone cards of equal importance.

You should consider:

- reducing header height
- tightening inner spacing
- reducing repeated chrome
- grouping shared metadata more intelligently
- making the visibility area look like a supporting module, not two competing primary panels

### 4. Workbench presence

The workbench must not feel like a floating slab.

It should feel architecturally anchored to the same lower section as story/carousel.

This may require:

- better width choice
- better vertical alignment
- slightly different outer container treatment
- a clearer sectional relationship

## Hard Constraints

- keep `BudgetWorkbench` on the right of the Instagram visibility area on desktop
- keep mobile sane and stacked
- do not redesign unrelated top sections
- do not introduce flashy gimmicks
- do not solve this with random extra filler UI
- do not just tweak the grid from `5/7` to `4/8` and stop

## Preferred Implementation Style

Small, high-leverage structural refactor.

Good candidates:

- introduce a dedicated lower-section wrapper component
- introduce a unified left visibility container
- refactor spacing tokens / wrappers in the lower section only

Avoid broad churn elsewhere.

## Verification Requirements

Update tests if needed and run from `app/`:

- `npm run test`
- `npm run test:ui`
- `npm run build`

If any command fails, say exactly why.

## Final Standard

The next revision must solve the aesthetic problem, not only the positional problem.

The lower section should feel:

- balanced
- composed
- premium
- intentional

and clearly better than the current “technically correct, visually still off” state.
