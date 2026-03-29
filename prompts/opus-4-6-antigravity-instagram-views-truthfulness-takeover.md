You are Claude Opus 4.6 inside Antigravity, working on an existing creator benchmark app.

This is a provider-truthfulness takeover task.
Do not rebuild the app.
Inspect the existing implementation first, prove the real source of the Instagram views mismatch, then move the app to the most truthful Instagram provider path.

Current production complaint:
- Instagram view counts are still wrong on live accounts.
- Concrete regression case: `uberkuloz`
- User claim: the latest Instagram Reel should be about `4.4M` views
- Current app output: about `1.9M`

This is not a minor formatting issue.
If the app is underreporting obvious Instagram Reel views, the benchmark is not trustworthy.

Primary product rule:
Truthful view counts matter more than broad coverage.
If the current Instagram Apify path cannot reliably produce correct Reel views, do not keep it as the default live benchmark provider just because it has wider account coverage.

Your mission:
1. prove the exact cause of the current Instagram view mismatch
2. compare the current Instagram live provider against better options
3. choose the most truthful production path
4. implement that decision
5. verify it with real evidence

Do not guess.
Do not defend the current provider.
Do not stop at one regex or one UI patch.

Current local code facts you must inspect first:
- `app/src/lib/providers/instagram-apify-provider.ts`
- `app/src/lib/providers/meta-provider.ts`
- `app/src/lib/providers/factory.ts`
- `app/src/lib/domain/selection.ts`
- `app/src/app/api/analyze/route.ts`
- `app/src/app/page.tsx`
- `app/src/__tests__/instagram-apify-mapping.test.ts`
- `app/src/__tests__/instagram-pipeline-regression.test.ts`

Important starting context from the codebase:
- Instagram is currently Apify-first in `factory.ts`
- The current Instagram Apify actor is `automation-lab~instagram-scraper`
- The old likes-as-views bug has already been fixed
- There is already deduplication and stricter benchmark completeness logic in the local code
- So the remaining problem is likely provider data quality, actor choice, actor field mapping, or stale/partial raw data

That means:
You must treat this as a provider-accuracy problem first, not a frontend bug first.

Required investigation path:

Phase 1: Audit the current provider truthfulness
1. Inspect how the current `automation-lab~instagram-scraper` actor is called.
2. Audit the raw payload returned for recent `uberkuloz` content.
3. Build a raw-field audit table for recent posts/Reels including:
   - raw id
   - shortCode
   - permalink/url
   - timestamp
   - mediaType
   - productType
   - caption excerpt
   - likesCount
   - commentsCount
   - videoViewCount
   - any other raw view/play metric available
   - canonical mapped `views`
4. Specifically identify the latest `uberkuloz` Reel and prove which raw field caused the app to show `1.9M`.
5. Determine whether the actor itself is returning the wrong number, a stale number, the wrong item, or an incomplete item.

Phase 2: Compare alternative Instagram live paths
You must compare at least these three options:

Option A: Current actor
- `automation-lab~instagram-scraper`

Option B: Official Apify Instagram Profile Scraper
- `apify/instagram-profile-scraper`
- URL: https://apify.com/apify/instagram-profile-scraper

Option C: Official Apify Instagram API Scraper
- `apify/instagram-api-scraper`
- URL: https://apify.com/apify/instagram-api-scraper

Also compare against:

Option D: Official Meta provider already in the repo
- `MetaBusinessDiscoveryProvider`
- only for public professional accounts

For each option, evaluate whether it can truthfully support this product’s Instagram benchmark requirements:
- public username input
- enough recent media depth
- reliable Reel detection
- caption
- timestamp
- permalink
- real Reel view count
- stable mapping into the existing benchmark pipeline

You must prefer primary/vendor documentation and raw runtime evidence.
Do not rely on vague assumptions about actor quality.

Decision rule:
- If an Apify actor can be proven to return correct recent Instagram Reel view counts for regression cases like `uberkuloz`, keep Instagram on Apify but switch to the best actor.
- If Apify cannot be proven trustworthy for true Instagram Reel view counts, revert Instagram views benchmarking to Meta as the default live path.
- If Meta is chosen, be honest about its scope limitation: public professional accounts only.
- Do not keep the current actor as default if it systematically underreports obvious Reel views.

Implementation expectations:
1. Patch the provider selection logic in `factory.ts` according to the evidence.
2. If switching Apify actors:
   - implement the new provider or adapt the current provider cleanly
   - map only true view fields
   - preserve existing benchmark pipeline contracts
3. If reverting to Meta default:
   - make Meta the default Instagram live path
   - keep Apify as optional fallback only if clearly labeled and justified
4. Update limitation/source messaging in the API and UI so it matches reality.
5. Remove any overly strong copy such as “View counts are real video views” unless you can actually prove that statement for the chosen provider.

Benchmark truthfulness rules that must hold after your fix:
- A views benchmark must only use true Instagram view data
- Do not silently substitute likes, impressions, or weak proxies
- Do not present uncertain data as authoritative views
- If provider quality is uncertain, surface that honestly

Required verification:
1. Verify the chosen provider path with a real live request.
2. Re-test the `uberkuloz` regression case.
3. If possible, verify at least one additional public account.
4. Report whether the latest Reel now matches the expected magnitude more closely.
5. If exact parity still cannot be achieved, explain why with raw evidence.

Testing requirements:
- update or add mapping tests for the chosen Instagram provider
- update provider-selection tests if behavior changes
- add regression protection for actor/provider mismatch cases if practical
- keep existing benchmark integrity tests passing

Communication rules while working:
- be brief
- show exact evidence
- do not give generic platform theory lectures
- do not declare success without raw-payload proof

Hard rules:
- do not rebuild the app
- do not keep a provider just because it is convenient
- do not claim “real views” without evidence
- do not treat coverage as more important than truthfulness
- do not stop after changing UI copy if the underlying provider is still wrong

Completion standard:
Do not say the task is done until you report:
1. the exact root cause of the `uberkuloz` mismatch
2. whether the current actor was wrong, stale, or mis-mapped
3. which Instagram provider path you chose and why
4. what changed in `factory.ts`
5. what changed in the provider implementation
6. whether Instagram is now Apify-first or Meta-first
7. what live verification succeeded
8. what residual limitations remain

Start by auditing the current `automation-lab~instagram-scraper` raw payload for `uberkuloz` and proving why the app currently shows about `1.9M` instead of the expected `4.4M`.
