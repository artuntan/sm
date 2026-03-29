You are Claude Opus 4.6 inside Antigravity, working on an existing creator analysis application for marketing teams.

This is a batch intake clarity revision.

The bulk workspace is functionally stronger now, but the operator-facing intake copy is still too ambiguous.
Users are not clearly understanding the mental model:

- one row = one influencer
- Instagram and TikTok for that same influencer belong on the same row
- if only one platform is known, the other column can be left blank

That misunderstanding is dangerous because the whole batch workspace depends on correct row structure.

Do not treat this as minor copy polish.
This is input-model clarity, and it directly affects product correctness.

## The User Feedback You Must Resolve

The user says:

- “Paste creator data” is not understood well enough
- it should be much clearer that each row must represent one influencer
- accepted format should reflect that structure much better

That means the current intake surface is failing to teach the operator how the tool thinks.

## Read These Files First

- `app/src/app/page.tsx`
- `app/src/lib/domain/batch-parser.ts`
- `app/src/lib/domain/batch-types.ts`
- `app/src/__tests__/page.test.tsx`
- `app/src/__tests__/batch-parser.test.ts`

Focus especially on the current `BatchIntakePanel` implementation in `page.tsx`.

## Current Problem You Must Verify

The current intake likely has several ambiguity sources:

### 1. The subheadline is too generic

Text like:

- “Paste up to 200+ creator handles...”

does not clearly say:

- each row is one influencer record
- Instagram and TikTok for the same influencer belong together

### 2. The placeholder is not explicit enough

If the placeholder only shows a CSV snippet without teaching the row mental model, many users will still paste incorrectly.

### 3. The accepted formats card is under-explaining the most important rule

The accepted formats area should not just list format types.
It must teach the canonical structure.

### 4. “Simple list / one handle per line” may be confusing in this workflow

If the UI strongly supports paired influencer rows, but also advertises “one handle per line” without context, that creates cognitive conflict.

If the parser still supports fallback cases, fine.
But the default teaching surface should emphasize the canonical paired-row format.

## Core Product Rule You Must Teach in the UI

The UI should make this unmistakable:

### Canonical model

- one row = one influencer
- column 1 = Instagram handle
- column 2 = TikTok handle
- optional columns after that = label / notes

### Incomplete data is allowed

If the operator only knows one platform for a creator:

- keep the row
- leave the other platform column blank

That is much clearer than implying users should paste standalone mixed handles without row pairing.

## Revision Goal

Make the intake experience self-explanatory even for a first-time user who never read documentation.

A good operator should understand the format in under 5 seconds.

## UI / Copy Requirements

### 1. Rewrite the primary helper text

The subheadline below the batch title should explicitly communicate the row model.

It should say the equivalent of:

- each row is one creator
- put Instagram and TikTok for the same creator on the same row
- leave one side blank if unavailable

Do not leave this implicit.

### 2. Rewrite the textarea label or add helper microcopy near it

“PASTE CREATOR DATA” alone is too vague.

Make the area itself teach the operator what to paste.

Good direction:

- `PASTE CREATOR ROWS`
- or keep the label and add a clear one-line helper directly under it

### 3. Rewrite the placeholder to teach by example

The placeholder must show canonical good examples, not just a loose CSV token sample.

It should visually communicate:

- header row
- row 1 = creator 1
- row 2 = creator 2
- blank second column allowed

For example, directionally:

```text
instagram,tiktok,label
uberkuloz,uberkuloz,beauty
dogaozdas,dogaozdas,lifestyle
berkcan,,youtube-first
```

The exact examples can differ, but they must reinforce the correct mental model.

### 4. Make the accepted format panel teach structure, not just syntax

The accepted format card should explicitly include a line like:

- `Each row = 1 influencer`

and should explain:

- `instagram` and `tiktok` columns refer to the same creator
- use one row per creator
- leave the missing side empty if only one platform is available

### 5. Consider removing or demoting confusing format guidance

If “simple list / one handle per line” is currently displayed prominently, reconsider it.

If the parser supports it for fallback reasons, it can remain supported technically.
But the primary UI should not teach an input mode that fights the paired-row mental model.

### 6. Improve preview language

If the preview currently says only:

- `3 rows`

consider more explicit language like:

- `3 creator rows detected`

The preview should reinforce the row model after paste, not just count generic rows.

## UX Direction

This should feel clearer without becoming busy.

Good outcomes:

- less ambiguity
- faster operator comprehension
- fewer malformed pastes
- stronger alignment between what the UI teaches and what the parser expects

Bad outcomes:

- adding lots of text but still not clarifying the row model
- keeping contradictory examples
- preserving “flexibility” at the cost of operator understanding

## Implementation Scope

This is primarily a product communication and intake-clarity pass.

Do not over-expand into unrelated queue, batch, or results redesign work.
Touch only what materially improves understanding of the input structure.

Good targets include:

- intake heading / helper text
- textarea label / helper line
- placeholder examples
- accepted format card
- preview summary wording
- minor layout tweaks if they help scanability

## Test Expectations

Update or add tests where appropriate so the intake guidance remains stable.

At minimum, verify the UI reflects the new explicit guidance, including text that makes clear:

- one row = one influencer
- Instagram + TikTok belong on the same row

If placeholder assertions are practical in the current test setup, add them.

## Delivery Standard

When you implement:

1. explain exactly what was ambiguous before
2. explain how the new copy teaches the row model
3. keep the experience clean and premium
4. do not stop at superficial wording changes if the structure is still unclear

The final intake should make the format obvious at a glance.
