You are Claude Opus 4.6 inside Antigravity, working on an existing creator analysis application for marketing teams.

This is a batch intake UI/UX redesign revision.

The batch workspace is functionally promising, but this intake page still does not feel premium, intentional, or professionally productized.
It currently reads more like a rough internal tool than a high-trust operator workspace.

Do not treat this as minor polish.
This is a composition, hierarchy, and product-feel problem.

The user feedback is blunt:

- “This page’s UI/UX does not look good”
- “It does not feel professional”
- “Opus needs to think and make it the best version”

That means the current screen is failing the first impression test.

## Read These Files First

- `app/src/app/page.tsx`
- `app/src/app/globals.css`
- `app/src/__tests__/page.test.tsx`

Focus especially on the current `BatchIntakePanel` implementation in `page.tsx`.

## What You Must Verify Before Changing Anything

After reading the code, verify the likely causes of the weak result:

### 1. The screen feels too empty and too flat

The page has a lot of unstructured dark space, but not enough intentional visual rhythm.
Dark minimalism is not enough by itself.
If there is too little hierarchy, the screen just feels unfinished.

### 2. The textarea dominates the page without enough compositional support

The paste box is large, but it is not framed as part of a richer operator workflow.
It currently feels like:

- one big raw field
- a detached help card
- two weak buttons underneath

That is functionally understandable, but visually underdesigned.

### 3. The right-side guidance card feels disconnected

If the “how to format” surface looks like an isolated side note instead of part of one cohesive intake system, the page loses unity.

### 4. The call-to-action structure is weak

If `Preview` and `Start Analysis` do not feel clearly prioritized and intentionally placed, the page will feel low-confidence.

### 5. The page lacks a premium operator-console feeling

This is not a consumer landing page.
It should feel like a high-value workflow surface for a marketing operator:

- deliberate
- fast to scan
- high trust
- premium but restrained
- clearly built for serious work

## The Product Job Of This Screen

This page is the gateway into the batch workflow.

Its job is not only:

- accept text input

It must also:

- explain the mental model quickly
- reduce formatting errors
- make bulk analysis feel powerful
- build operator confidence before running a potentially expensive batch

If this page feels like a rough utility, the whole batch feature feels less credible.

## Design Goal

Transform this screen from:

- a textarea plus helper card

into:

- a premium batch-intake command surface

It should feel like the beginning of a serious analysis workflow, not a temporary staging screen.

## Required UX Outcomes

By the time the redesign is done, the page should feel:

- more professional
- more visually balanced
- more intentionally composed
- easier to scan
- more trustworthy
- more “product” and less “tooling panel”

The operator should immediately understand:

- what this page does
- how to paste data
- what the accepted structure is
- what happens next

## Problems You Must Solve In The UI

### 1. Weak visual hierarchy

The main title, explanatory copy, input area, format guidance, preview state, and actions need a clearer top-to-bottom reading order.

### 2. Poor grouping

Input, guidance, and action zones should feel like one composed system, not unrelated blocks.

### 3. Weak proportions

The current layout likely over-allocates visual weight to the raw textarea while under-designing the surrounding context.

### 4. Low CTA confidence

Primary and secondary actions need stronger presentation and better placement relative to the input and preview states.

### 5. Lack of premium surface treatment

The current page is dark, but darkness alone is not design.
Use stronger shell composition, spacing discipline, surface contrast, and intentional accents.

## Hard Visual Direction

Keep the Antigravity visual language:

- dark
- restrained
- precision-oriented
- mono-assisted
- premium operator tooling

But upgrade it substantially.

This should not become:

- a generic SaaS dashboard
- a bloated “AI slop” bento grid
- a glossy marketing hero
- a bright consumer upload form

It should feel like:

- a high-end analysis workstation
- designed for marketing operators handling serious creator datasets

## Redesign Requirements

### 1. Recompose the top section

Do not leave the screen as a plain title followed by a textarea block.

The intake page needs a stronger opening composition.
Possible directions include:

- a structured intro band with title, supporting explanation, and compact capability cues
- a clearer “step 1 / intake” framing
- subtle badges or operational metadata that make the page feel more tool-grade

You do not need to follow those exact solutions, but the top of the page must feel designed, not merely filled.

### 2. Turn the input area into a deliberate primary panel

The paste area should feel like the main work surface.
That means:

- stronger framing
- better internal spacing
- clearer label + helper hierarchy
- a more intentional placeholder treatment
- a more premium field container

Do not leave it as a bare textarea dropped onto the page.

### 3. Upgrade the format guidance into an active companion panel

The right-side surface should not feel like passive documentation.
It should feel like part of the intake workflow.

It should help with:

- understanding structure
- reducing input mistakes
- reinforcing confidence

It can still contain formatting guidance, but it should feel more productized and visually integrated.

### 4. Make actions feel more decisive

The action row must communicate:

- preview first if needed
- start analysis when ready

The primary action should feel meaningfully primary.
The secondary action should still feel useful, not dead weight.

Placement matters.
Do not leave the buttons looking lost under a large empty field.

### 5. Integrate preview more elegantly

If preview appears, it should feel like a natural extension of the intake flow.

It should not read like a debug box that happened to render underneath.
It should feel like:

- intake feedback
- validation confidence
- readiness confirmation

### 6. Improve page density without making it noisy

The current page likely has too much dead space and too little meaningful structure.

Fix that with:

- better spacing rhythm
- stronger panel composition
- tighter relationships between related information
- smarter allocation of width and height

Do not solve it by just adding more text.

## Layout Guidance

You are allowed to materially change the layout of the intake area.
Do not stay trapped inside the current “large left textarea + small right card” composition if it still looks mediocre.

You may:

- redesign the column balance
- introduce a stronger outer shell
- regroup title, input, guidance, actions, and preview
- make the whole intake area feel like one premium composed system

But stay within the existing product language and preserve responsiveness.

Desktop and mobile both need to work cleanly.

## Typography And Surface Expectations

Pay attention to:

- better contrast hierarchy between title, helper copy, labels, and metadata
- more disciplined spacing
- stronger visual distinction between page background and functional surfaces
- more confident use of accent color
- cleaner line lengths

The current `globals.css` token system is probably usable, but likely under-leveraged.
If necessary, refine or extend the design tokens and utility classes to make this page feel more premium.

## Specific Things That Should Feel Better After The Redesign

These are the kinds of perceptions the user should have after your pass:

- “This looks like a serious premium tool”
- “I immediately understand where to start”
- “The page feels balanced”
- “The formatting instructions feel built-in, not bolted-on”
- “The buttons feel trustworthy and intentional”
- “This is a much more professional first screen”

## What Not To Do

Do not:

- only rewrite text and call that a redesign
- leave the current composition mostly intact if it still feels weak
- add random decorative elements with no structural benefit
- overcomplicate the screen with too many modules
- break the dark Antigravity identity
- redesign unrelated result views or queue logic

## Scope

This is an intake-screen redesign pass.

Focus on:

- the batch intake page composition
- the input panel
- guidance panel
- preview presentation
- CTA presentation
- supporting styles in `globals.css`

Do not turn this into a broader app-wide redesign unless a tiny shared style improvement is necessary.

## Testing Expectations

Update tests where needed.

At minimum:

- keep the page test suite aligned with any deliberate text changes
- preserve confidence around the batch intake rendering
- update assertions if labels, headings, or preview wording change

## Delivery Standard

When you implement:

1. explain what felt unprofessional before
2. explain the compositional decisions you made
3. explain how the new layout improves trust and scanability
4. keep the result clean, premium, and product-grade

Do not stop at “looks nicer.”
Make the page feel like a serious batch analysis entry point.
