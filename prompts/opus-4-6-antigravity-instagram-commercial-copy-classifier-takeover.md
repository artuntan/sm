You are Claude Opus 4.6 inside Antigravity, working on an existing creator benchmark app.

This is a classification-system takeover task.
Do not rebuild the app.
Inspect the current commercial-classification pipeline first, prove the root cause, then implement the correct fix.

Current production bug:
The app still fails to classify obvious product-ad captions as commercial on Instagram.

Primary regression case:
- username: `uberkuloz`
- the latest Reel is currently visible with about `4.4M` views
- the caption is:
  `Sen kendine acılar türetme diye Patos Acı Baharat yanında. Aç bir Patos, eşsiz acının tadını çıkar. #BizBuŞekil`

This Reel is clearly product advertising / branded promotional content.
It must be classified as commercial and excluded from the organic benchmark.

Current bad behavior:
- the system includes this Reel in the organic benchmark
- that means the organic benchmark is contaminated
- this is a benchmark-purity failure, not just a missed disclosure tag

Critical product rule:
This product is not only detecting legally disclosed sponsorships.
It is trying to compute a trustworthy organic benchmark.

So the exclusion system must catch content that is clearly:
- sponsored
- brand-affiliated
- product-promotional
- campaign-driven
- commercial in a high-confidence way

even when the caption does NOT include:
- `#işbirliği`
- `#isbirligi`
- `*reklam`
- `@brand_handle`
- obvious brand-hashtag clustering

You must inspect these files first:
- `app/src/lib/domain/normalize.ts`
- `app/src/lib/domain/selection.ts`
- `app/src/__tests__/normalize.test.ts`
- `app/src/__tests__/dogaozdas-regression.test.ts`
- `app/src/app/page.tsx`

Root-cause hypothesis you must verify:
The current classifier mainly catches:
1. explicit disclosure markers
2. hashtag clusters
3. mention ↔ hashtag correlations
4. official-looking brand handles

But it does NOT have a robust layer for:
- plain-text brand/product promotional copy
- brand/product names written directly in sentence text
- campaign slogans / generic campaign hashtags paired with product-copy language
- imperative or persuasive ad copy paired with a branded product phrase

If that hypothesis is correct, prove it from the code before patching.

Required debugging workflow:
1. Inspect the current layered classifier in `normalize.ts`.
2. Explain exactly why the `Patos Acı Baharat` caption is currently missed.
3. Identify which existing layers fail and why.
4. Show what signal type is missing from the system.

Important:
Do not reduce this to “just add Patos”.
This must be a general solution for plain-text branded product ads.
But also do not hide behind vague generality and leave the bug unfixed.

Required design direction:
Keep the system deterministic, auditable, and maintainable.
No runtime ML classification.
No embeddings.
No LLM judging at runtime.

Add a new high-confidence classification layer for plain-text commercial copy.

Suggested category names if useful:
- `product_promo_copy`
- `brand_product_copy`
- `commercial_copy`

You may choose the exact category name, but it must be explicit and user-comprehensible.

The new layer should detect high-confidence commercial/product-promo signals using combinations, not weak single substrings.

Examples of signal types you should consider:
- plain-text brand/product phrase in the caption body
- paired product noun phrase + promotional language
- imperative or CTA-like copy paired with a branded phrase
- brand/product phrase + campaign slogan hashtag
- brand/product phrase + benefit-oriented advertising copy
- repeated branded product reference in the same caption

For the Patos regression, the classifier should be able to reason about combinations like:
- `Patos Acı Baharat`
- `Aç bir Patos`
- `eşsiz acının tadını çıkar`
- `#BizBuŞekil`

Important nuance:
`#BizBuŞekil` alone should not necessarily trigger exclusion.
The problem is the combination of:
- branded product naming
- explicit promotional copy
- slogan/campaign style structure

That means the system should prefer signal combinations over generic brand dictionaries.

Recommended implementation approach:
1. Preserve existing layers:
   - explicit disclosure
   - hashtag cluster
   - mention/hashtag correlation
   - brand-handle detection
2. Add a new downstream layer for plain-text branded promo copy.
3. Use both:
   - normalized caption
   - raw caption if needed for phrase-shape cues
4. Return structured matched signals.
5. Surface a distinct commercial reason category in UI if low-risk.

Possible implementation shapes:
- phrase lexicon + combination scoring
- branded-phrase candidate extraction + promo-copy co-occurrence
- safe bounded regexes for Turkish ad-copy constructs
- token-window logic for product phrase + promo phrase pairing

You must avoid naive bad solutions such as:
- excluding every capitalized word
- excluding every food/product name
- excluding every generic slogan hashtag
- excluding every sentence with “tadını çıkar”
- excluding every single brand mention with no other commercial context

False-positive discipline matters.

Testing requirements:
Add regression tests for at least:
1. the exact Patos caption:
   `Sen kendine acılar türetme diye Patos Acı Baharat yanında. Aç bir Patos, eşsiz acının tadını çıkar. #BizBuŞekil`
   This must classify as commercial.

2. at least one additional plain-text branded product ad caption without `@mention`

3. at least one branded product ad caption with a slogan-style hashtag but no legal disclosure

4. negative cases that should remain organic:
   - generic lifestyle copy
   - generic food/snack references without branded promo structure
   - slogan-like hashtag alone without strong brand/product signals

5. selection-pipeline regression:
   - the Patos Reel must not remain in the organic bucket
   - if it becomes commercial, benchmark selection must update accordingly

UI / product expectations:
- If easy and low-risk, show a better reason badge than generic `Commercial`
- Example labels:
  - `Promo Copy`
  - `Brand Product Copy`
  - `Campaign`
  - `Disclosure`
- Do not label the Patos case as `Disclosure` if the real reason is product-promo copy

Acceptance criteria:
- you clearly identify why the current system misses the Patos Reel
- the Patos caption is classified as commercial
- the Patos Reel is excluded from the organic benchmark
- the classifier remains deterministic
- the fix generalizes beyond one brand
- regression tests cover the new failure mode

Hard rules:
- do not rebuild the app
- do not special-case only `Patos`
- do not use runtime AI classification
- do not broaden rules carelessly and flood organic content with false positives
- do not stop after adding one keyword if the real failure is a missing classifier layer

When finished, report exactly:
1. the root cause
2. which current layers failed
3. what new commercial-copy layer you added
4. why the Patos caption now classifies correctly
5. what false-positive protections you used
6. what tests were added

Start by inspecting `normalize.ts` and proving why the current classifier fails on:
`Sen kendine acılar türetme diye Patos Acı Baharat yanında. Aç bir Patos, eşsiz acının tadını çıkar. #BizBuŞekil`
