You are Claude Opus 4.6 inside Antigravity, working on an existing cross-platform creator benchmark app.

This is a full classifier-and-benchmark-policy takeover task.
Do not hand-wave.
Do not patch one regex and stop.
Inspect the current system end to end, prove the actual failure modes, then implement a durable fix.

There are now two critical product problems:

1. Instagram commercial classification is producing false positives.
2. The benchmark policy is too rigid because averages disappear when a bucket has fewer than 5 items.

You must fix both.

## Product bugs to solve

### Bug A: false-positive commercial classification

Current real-world regression:

- account: `dogaozdas`
- on Instagram, a recent post is being classified as commercial even though it is not an ad
- the user reports the post effectively only contains a generic `#kesfet` style tag
- the system is labeling it as commercial / promo copy

This is unacceptable.

Generic discovery hashtags like:

- `#kesfet`
- `#fyp`
- `#viral`

must NOT be enough to push organic content into the commercial bucket.

The current classifier must be audited from top to bottom for false positives.

### Bug B: benchmark average disappears when fewer than 5 commercial items exist

Current product behavior:

- if fewer than 5 items exist in a bucket, the bucket becomes `insufficient`
- average views becomes `null`
- UI shows a warning instead of a usable benchmark number

New product rule from the user:

- if fewer than 5 commercial items are found, the system must NOT fail
- averages must still be computed
- in practice, every non-empty bucket should produce an average from available items

So the exact-5 rule is no longer the product policy.
You must remove or refactor that behavior everywhere it exists.

## Critical files to inspect first

- `app/src/lib/domain/normalize.ts`
- `app/src/lib/domain/selection.ts`
- `app/src/lib/domain/types.ts`
- `app/src/app/api/analyze/route.ts`
- `app/src/app/page.tsx`
- `app/src/__tests__/normalize.test.ts`
- `app/src/__tests__/selection.test.ts`
- `app/src/__tests__/dogaozdas-regression.test.ts`
- `app/src/__tests__/page.test.tsx`
- `app/src/__tests__/api.test.ts`

Do not patch before reading these files.

## Root-cause hypotheses you must verify from code

You must explicitly verify whether these hypotheses are true.

### Hypothesis 1: plain-text promo-copy detection is too weak and too broad

The likely false-positive source is `normalize.ts` Layer 3.

Suspected problems:

1. the “branded product phrase” detector is too naive
2. it treats generic capitalized or ALL-CAPS sentence fragments like product names
3. it uses weak promo phrases such as `kesfet`
4. the combination of:
   - generic uppercase text
   - generic CTA vocabulary
   - `#kesfet`
   can incorrectly trigger `branded_promo_copy`

You must prove whether this is happening in current code.

### Hypothesis 2: benchmark policy is hardcoded into bucket builders and tests

The likely source is `selection.ts`, where:

- bucket status becomes `insufficient`
- `averageViews` is forced to `null`
- comparison is only computed when both buckets are `complete`

You must prove exactly where this behavior is encoded and remove it cleanly.

## Required debugging workflow

You must perform this workflow before patching:

1. inspect `normalize.ts` and identify every commercial-classification layer
2. explain which layer is causing the dogaozdas false positive
3. identify exactly which signals are too weak or too broad
4. inspect `selection.ts` and identify every place the exact-5 rule is enforced
5. inspect tests and identify which ones encode the obsolete exact-5 policy

Then patch the system.

## Classification redesign requirements

You must keep the classifier:

- deterministic
- auditable
- maintainable

Do NOT add runtime LLM classification.
Do NOT add embeddings.
Do NOT add opaque scoring with no signal trail.

### New classifier quality bar

The system must catch:

- real disclosures
- real brand campaign structures
- real brand/product promo copy

but it must stop classifying generic social captions as ads.

### Hard anti-false-positive rule

These alone must NOT trigger commercial classification:

- `#kesfet`
- `#fyp`
- `#viral`
- generic CTA words like “kesfet”
- generic uppercase captions
- generic humorous copy
- generic benefit language without clear brand/product evidence

### Expected direction for fixing Layer 3

If Layer 3 is the culprit, improve it substantially.

Likely safe directions:

- reject generic ALL-CAPS sentence runs as branded product phrases
- require stronger brand evidence than “2+ capitalized words”
- tighten product-phrase extraction so it prefers true proper-noun/product patterns
- downgrade or remove weak standalone promo triggers like `kesfet`
- require stronger co-occurrence between:
  - actual brand/product phrase
  - stronger promotional language
  - optional supporting slogan/campaign context

Important:
Do not destroy the Patos fix.
The system must still correctly classify genuinely commercial plain-text product ads.

So you need to improve precision without losing important recall.

### Required positive coverage to preserve

These kinds of cases must still classify as commercial:

- explicit `*reklam`
- `#işbirliği`
- paid partnership language
- real brand-campaign hashtag clusters
- strong plain-text product ads like:
  - branded product phrase
  - promo CTA / benefit language
  - campaign/slogan context

The Patos regression must remain fixed.

## Benchmark policy redesign requirements

The user has changed the product requirement:

Old policy:

- average only when bucket has 5 valid items

New policy:

- compute average whenever a bucket has at least 1 valid item with numeric views
- still show sample size
- still show warning / confidence context if sample is small
- but do NOT null out the average merely because sample size is below 5

### New benchmark behavior

For each bucket:

- `0` valid items → no average
- `1+` valid items → compute average

The UI must remain transparent:

- show sample size clearly
- show that a bucket is partial / thin / low-confidence if needed
- but still show the number

### Comparison behavior

You must audit and choose the strongest truthful comparison rule.

Expected direction:

- if both organic and commercial have averages, compute comparison
- even if one or both buckets have fewer than 5 items
- if one bucket is empty, comparison stays unavailable

Do not keep the old “complete-only” comparison rule unless you can defend it against the new product requirement.

## API / type / UI implications

This change is cross-cutting.

You will likely need to patch:

- benchmark status semantics
- bucket-building logic
- comparison eligibility logic
- API response expectations
- UI labels and warning copy
- tests that currently expect `averageViews: null`

The UI should no longer communicate:

- “benchmark average cannot be computed” for 1-4 items

Instead it should communicate something like:

- sample size
- partial benchmark / thin sample
- low confidence if applicable

but still surface the average.

## Required regression tests

Add or update tests for all of the following.

### False-positive tests

1. organic caption with only generic hashtag:
   - example shape: `Yeni saç modelim nasıl olmuş? #sacmodeli #kesfet`
   - must remain organic

2. generic ALL-CAPS humorous caption + `#kesfet`
   - must remain organic

3. generic uppercase sentence fragments must NOT be mistaken for branded product phrases

4. `#kesfet` alone must NOT act as a commercial trigger

### True-positive preservation tests

5. Patos promo-copy regression must still classify as commercial

6. explicit disclosure cases must still classify as commercial

7. real brand mention / campaign cases must still classify as commercial

### Benchmark policy tests

8. bucket with 3 commercial items must still compute `averageViews`

9. bucket with 1 commercial item must still compute `averageViews`

10. comparison should exist whenever both buckets have averages

11. only empty bucket should return no average

12. page/UI tests must stop expecting “insufficient means null average”

## Design / product integrity

Do not regress the recent cross-platform workbench structure.
Do not regress follower counts.
Do not regress the `skills.name` design system direction.

This task is about:

- classification precision
- benchmark usefulness
- product truthfulness

not about reverting the new architecture.

## Hard rules

- do not special-case only one exact caption and stop
- do not leave weak `#kesfet`-driven commercial logic in place
- do not keep exact-5 null-average behavior
- do not hide low sample size; show it transparently
- do not remove signal explainability
- do not use runtime AI classification

## Acceptance criteria

Your work is only complete if all of these are true:

1. the dogaozdas false-positive commercial case is fixed
2. `#kesfet` alone no longer causes commercial classification
3. generic uppercase organic captions are not misclassified as promo copy
4. true commercial cases like Patos still classify correctly
5. averages are computed for any non-empty bucket
6. the UI no longer blocks averages just because sample size is under 5
7. comparison logic reflects the new benchmark policy
8. tests are updated to encode the new policy and the false-positive protections

## Final report format

When finished, report exactly:

1. what caused the dogaozdas false positive
2. which classifier layer was at fault
3. what precision safeguards you added
4. how you preserved real commercial detections like Patos
5. where the old exact-5 rule existed
6. how the new averaging policy works
7. which tests were added or changed
8. which verification commands passed

Start by auditing:

- `app/src/lib/domain/normalize.ts`
- `app/src/lib/domain/selection.ts`
- `app/src/__tests__/dogaozdas-regression.test.ts`

Then patch the classifier and benchmark policy end to end.
