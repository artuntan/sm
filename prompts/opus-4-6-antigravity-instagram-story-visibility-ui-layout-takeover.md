You are Claude Opus 4.6 inside Antigravity, working on an existing creator benchmark application with a deliberate dark, technical, mono-accent visual language.

This is a UI/UX correction takeover for the Instagram Story Visibility surface.

The product owner feedback is explicit:

- the current Story Visibility data does not look good
- it feels like it is visually bleeding into the section above
- it must be adjusted so it fits the site design naturally

## Current implementation problem you must fix

Inspect `app/src/app/page.tsx`.

Right now:

- the profile cards render in a two-column grid
- the benchmark panels render in a two-column grid
- then `StoryVisibilityPanel` renders **after** that grid as a standalone full-width block

This causes a bad desktop composition:

- the Story Visibility panel reads like an orphaned add-on
- it does not feel attached to the Instagram column
- it has weak separation from the panels above
- visually it can feel like it is inserted into or leaking out of the benchmark section instead of belonging to a clean layout rhythm

Inside `StoryVisibilityPanel`, the information hierarchy is also weak:

- both bars render as full-width decorative fills, so they do not encode meaningful quantitative structure
- the value ranges are pushed to the far right without enough visual framing
- the confidence row and model version feel like implementation residue, not polished product UI
- the limitations block is too verbose and heavy for the card

## Your mission

Redesign and integrate the Instagram Story Visibility UI so it feels native to the site, not bolted on.

You are not changing the truth model.
You are fixing layout, hierarchy, spacing, readability, and aesthetic fit.

## Design intent you must preserve

Preserve the existing visual language:

- dark benchmark dashboard aesthetic
- precise mono labels
- restrained accent usage
- subtle borders and glow
- no generic SaaS card sludge
- no bright redesign that breaks the current product identity

This should feel like the same product, just corrected by a stronger designer.

## Required layout direction

### 1. Fix the section architecture

The Story Visibility surface must become part of the Instagram information architecture.

Preferred direction:

- on desktop, place it within the Instagram column flow rather than as a detached full-width block beneath both columns
- on mobile, it can stack naturally under the Instagram benchmark

If you determine a full-width treatment is better, it must look intentional:

- explicit section separation
- stronger top spacing
- its own section framing
- no “accidentally attached to the row above” feel

But do not keep the current orphan-block composition.

### 2. Improve vertical rhythm and spacing

There must be clear breathing room between:

- benchmark content
- story visibility content
- explanatory limitations / provenance content

Use spacing consistent with the rest of the page.
Do not solve this with random oversized gaps.

### 3. Make the estimated data feel productized

For estimated mode, the UI should prioritize:

- a primary story viewers estimate
- a secondary story reach estimate
- source/provenance
- confidence

Possible good patterns:

- compact metric cards
- a two-metric split layout
- a range visualization that actually represents low-to-high spread
- a subtle provenance row

Avoid:

- meaningless 100%-width progress bars
- noisy visual chrome
- too many tiny rows competing equally

If you keep a bar, it must encode something real:

- low/high range band
- midpoint emphasis
- or relative estimate context

Otherwise remove it.

### 4. Reduce explanatory clutter without hiding truth

The panel must remain honest:

- estimated data must still say it is estimated
- confidence must still be visible
- limitations must still be available

But the current limitations copy should not dominate the card.

Refactor toward something cleaner, for example:

- concise inline explanation
- compact footnote block
- disclosure / expandable detail
- muted supporting copy instead of a long stack of warnings

Do not remove critical truthfulness.
Do remove visual drag.

### 5. Improve alignment and hierarchy

Ensure:

- labels align cleanly
- value blocks have a clear anchor
- chips/badges feel deliberate
- the badge for `Estimated` does not overpower the section title
- the section title and icon feel integrated with the existing benchmark card system

The panel should scan in this order:

1. what this section is
2. whether it is exact / observed / estimated
3. the main number or range
4. supporting metric
5. compact confidence/provenance
6. optional caveats

## Functional constraints

Do not break:

- capability-gated truth states
- source mode labeling
- existing Instagram/TikTok benchmark cards
- responsive behavior
- existing dark theme variables

Do not rewrite the estimation logic.
This is a UI composition and presentation correction.

## Implementation expectations

You should be willing to:

- refactor the parent page layout around `BenchmarkPanel` and `StoryVisibilityPanel`
- move Story Visibility into a more appropriate Instagram column structure
- revise the panel component structure itself
- remove or redesign the current fake-progress-bar treatment
- tighten the explanatory copy rendering
- improve responsive behavior for narrow screens

If useful, create a small wrapper or Instagram column stack component instead of leaving the page as loose siblings.

## Quality bar

When you are done, the result should feel like:

- the Story Visibility module was always meant to be there
- the page composition is calmer
- the Instagram column has a coherent narrative
- the estimate feels sophisticated, not hacked in

## Verification

After implementation:

- run the relevant test/build commands from `app/`
- verify there are no layout regressions
- ensure estimated/source/confidence truthfulness still renders correctly

Do not stop at superficial spacing tweaks.
Fix the information architecture and polish the component to match the site.
