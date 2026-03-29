You are Claude Opus 4.6 inside Antigravity, working on an existing creator analysis app for marketing teams.

This is a UI layout revision on top of the existing implementation.

Do not redesign the whole app.
Do not treat this as a generic styling task.
This is a specific composition fix for the current live Budget + CPM workbench layout.

## The User Feedback You Must Solve

The user wants:

- the `Budget + CPM Workbench` to sit to the **right** of the Instagram `Story Visibility` and `Carousel Visibility` section
- the `Story Visibility` and `Carousel Visibility` section can be widened if needed so the overall composition looks premium and intentional
- the final result must look like the best possible version for this site, not like a squeezed sidebar hack

In short:

- `story + carousel` on the left
- `budget + cpm` on the right
- balanced proportions
- no empty dead space
- clean desktop layout
- sane mobile fallback

## Current Implementation Reality You Must Verify First

Read these files first:

- `app/src/app/page.tsx`
- `app/src/app/globals.css`
- `app/src/__tests__/page.test.tsx`

You must verify the current issue in the actual code:

- the results page currently renders the platform columns first
- then renders `BudgetWorkbench` **below** them as a full-width block
- this creates an orphan panel under the Instagram add-on cards while the right side of the screen is underused

You should specifically inspect the section where:

- `StoryVisibilityPanel`
- `CarouselVisibilityPanel`
- `BudgetWorkbench`

are composed.

Do not guess.
Reason from the current JSX structure.

## Product Goal

Turn the current lower-page layout into a proper two-column analysis composition.

The target visual hierarchy is:

1. top row stays as it is if already working:
   - profile cards
   - benchmark panels

2. lower analysis row becomes a dedicated composition:
   - left: Instagram add-on intelligence stack
     - `Story Visibility`
     - `Carousel Visibility`
   - right: `Budget + CPM Workbench`

This row should feel like one coordinated analysis zone, not three unrelated blocks.

## Required Layout Direction

### Desktop / large screens

You must restructure the page so that:

- `StoryVisibilityPanel` and `CarouselVisibilityPanel` are grouped into a left rail / left stack
- `BudgetWorkbench` is rendered in a right rail beside them

Preferred direction:

- use a dedicated grid or split layout for the lower section only
- keep the left stack vertically ordered
- allow the right workbench to occupy substantial width, not a tiny sidebar

Good examples of proportion:

- `5 / 7`
- `6 / 6`
- `7 / 5`

Pick what looks best in this actual UI.

Important:

- if the workbench needs more room, widen the whole lower section intelligently
- if the story/carousel cards need more room to avoid cramped typography, widen them too
- do not rigidly preserve the current widths if they produce a weak composition

### Mobile / narrow screens

On smaller screens:

- stack vertically
- keep logical order
- avoid horizontal overflow
- avoid unreadable table compression

Desktop quality is the main ask, but mobile must not regress.

## Visual Quality Requirements

This is not just “move box A next to box B”.

The lower layout must feel intentionally designed.

### Required qualities

- no giant empty black area on the right
- no awkward overhang where left cards stop and right card begins at a random vertical point
- no tiny, cramped workbench panel
- no oversized padding that wastes horizontal space
- no accidental visual dominance where one side feels detached

### Strong preferred direction

Treat the lower region as one unified “planning + visibility” section.

That means you should likely:

- align top edges cleanly
- normalize card heights or spacing rhythm where helpful
- make gutter spacing deliberate
- ensure the workbench header aligns well with the left stack’s top card

If beneficial, you may:

- slightly widen `StoryVisibilityPanel`
- slightly widen `CarouselVisibilityPanel`
- slightly adjust internal spacing
- slightly adjust workbench table density

But do not bloat panels just to fill space.

## Component Architecture Rules

Do not duplicate panels.
Do not create a second fake workbench for layout convenience.

Use the existing components:

- `StoryVisibilityPanel`
- `CarouselVisibilityPanel`
- `BudgetWorkbench`

Refactor their composition cleanly in the parent layout.

If needed, create a small wrapper section component for the lower layout, for example:

- `PlanningAndVisibilitySection`

But only if it improves clarity.

## Specific Anti-Patterns To Avoid

- do not keep `BudgetWorkbench` full-width beneath story/carousel
- do not simply float the workbench right while leaving broken document flow
- do not force a very narrow right rail that makes the table hard to scan
- do not shrink typography to make the layout fit
- do not introduce a desktop-only layout that breaks mobile
- do not create a visually heavier right block with no relationship to the left stack

## Testing / Verification Requirements

Update tests if necessary to reflect the new layout composition.

At minimum, ensure:

- the results page still renders story visibility when available
- the results page still renders carousel visibility when available
- the results page still renders the budget workbench
- the layout refactor does not break existing result rendering logic

When done, run from `app/`:

- `npm run test`
- `npm run test:ui`
- `npm run build`

If any command cannot run, say exactly why.

## Hard Rule

The final desktop layout must make a reviewer immediately feel:

- “Yes, the workbench belongs beside story/carousel”

and not:

- “This used to be full-width and got shoved into the right side as an afterthought.”
