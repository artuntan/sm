/**
 * Username normalization, caption normalization, and commercial content
 * exclusion classifier for organic benchmark computation.
 *
 * Two-layer exclusion system:
 *
 * Layer 1 — Explicit disclosure signals:
 *   Detects explicit Turkish/English ad-disclosure markers like #işbirliği,
 *   reklam, sponsorlu, sponsored, paid partnership.
 *
 * Layer 2 — Brand-campaign affiliation signals:
 *   Detects structural brand-promotional patterns without requiring explicit
 *   disclosure wording. Uses hashtag-root clustering (e.g. #cerave +
 *   #cerawardsturkiye share root "cerave"), brand-mention + hashtag
 *   correlation, and campaign-suffix heuristics.
 *
 * Normalization pipeline:
 *   lowercase → NFKC → strip invisible chars → fold Turkish chars →
 *   strip diacritics → produce tokenized / compact / hashtag / mention views
 */

// ---------------------------------------------------------------------------
// Turkish character folding
// ---------------------------------------------------------------------------
const TURKISH_FOLD: Record<string, string> = {
  ı: "i",
  İ: "i",
  ş: "s",
  Ş: "s",
  ğ: "g",
  Ğ: "g",
  ç: "c",
  Ç: "c",
  ö: "o",
  Ö: "o",
  ü: "u",
  Ü: "u",
};

// ---------------------------------------------------------------------------
// Username normalization
// ---------------------------------------------------------------------------

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

// ---------------------------------------------------------------------------
// Caption normalization pipeline
// ---------------------------------------------------------------------------

const INVISIBLE_RE =
  /[\u200B\u200C\u200D\u200E\u200F\uFEFF\u00AD\u2060\u2061\u2062\u2063\u2064\u2066\u2067\u2068\u2069\u206A-\u206F]/g;

/**
 * Core normalization:
 * lowercase → NFKC → strip invisible → fold Turkish → strip diacritics
 */
export function normalizeCaption(text: string): string {
  let result = text.toLowerCase();
  result = result.normalize("NFKC");
  result = result.replace(INVISIBLE_RE, "");
  result = result
    .split("")
    .map((ch) => TURKISH_FOLD[ch] ?? ch)
    .join("");
  result = result.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return result;
}

/**
 * Tokenized view: punctuation/symbols → spaces → word list.
 * "*reklam #kesfet" → "reklam kesfet"
 */
export function toTokenizedView(normalized: string): string {
  return normalized
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Compact view: strip all non-alphanumeric except spaces.
 */
export function toCompactView(normalized: string): string {
  return normalized
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract hashtags from normalized caption (without # prefix).
 * Returns lowercased tags after Turkish folding.
 */
export function extractHashtags(normalized: string): string[] {
  const matches = normalized.match(/#([a-z0-9]+)/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1)); // strip #
}

/**
 * Extract @mentions from normalized caption (without @ prefix).
 */
export function extractMentions(normalized: string): string[] {
  const matches = normalized.match(/@([a-z0-9._]+)/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1)); // strip @
}

/**
 * Extract "at-less mentions" — handle-like words that appear as plain text
 * without the @ prefix.
 *
 * The Meta Business Discovery API strips @ from mentions in caption text.
 * For example, what the user posted as "@lorealparis" arrives as "lorealparis"
 * and "@nyxcosmetics_turkiye" arrives as "nyxcosmetics_turkiye".
 *
 * Detection criteria (a word is a likely handle if):
 * 1. It contains _ or . (handle separators, e.g. "nyxcosmetics_turkiye")
 * 2. OR it ends with a known brand-account suffix (e.g. "lorealparis")
 *
 * Safety:
 * - Words already captured by @ extraction are excluded
 * - Words shorter than 5 chars are excluded
 * - Common non-handle words with _ are excluded
 * - Only words from the tokenized view (no hashtags/punctuation) are checked
 */
export function extractAtlessMentions(
  normalized: string,
  existingMentions: string[]
): string[] {
  const existing = new Set(existingMentions);
  const candidates: string[] = [];

  // Get words from the normalized caption (strip # and @ prefixed items)
  const words = normalized
    .split(/\s+/)
    .map((w) => w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
    .filter((w) => w.length >= 5 && !existing.has(w));

  for (const word of words) {
    // Skip if it's a hashtag value (would be caught by # extraction)
    if (normalized.includes(`#${word}`)) continue;

    // Criterion 1: Contains _ or . (handle-like structure)
    if (/[_.]/.test(word) && word.length >= 6) {
      candidates.push(word);
      continue;
    }

    // Criterion 2: Ends with a known brand-account suffix
    for (const suffix of BRAND_ACCOUNT_SUFFIXES) {
      if (
        suffix.length >= 4 &&
        word.endsWith(suffix) &&
        word.length > suffix.length + 2
      ) {
        candidates.push(word);
        break;
      }
    }
  }

  return [...new Set(candidates)];
}

// ---------------------------------------------------------------------------
// Parsed caption structure
// ---------------------------------------------------------------------------

export type ParsedCaption = {
  normalized: string;
  tokenized: string;
  compact: string;
  tokens: string[];
  hashtags: string[];
  mentions: string[];
};

export function parseCaption(caption: string): ParsedCaption {
  const normalized = normalizeCaption(caption);
  const tokenized = toTokenizedView(normalized);
  const compact = toCompactView(normalized);
  const tokens = tokenized.split(" ").filter(Boolean);
  const hashtags = extractHashtags(normalized);
  const atMentions = extractMentions(normalized);
  const atlessMentions = extractAtlessMentions(normalized, atMentions);
  const mentions = [...atMentions, ...atlessMentions];
  return { normalized, tokenized, compact, tokens, hashtags, mentions };
}

// ---------------------------------------------------------------------------
// Layer 1: Explicit disclosure detection
// ---------------------------------------------------------------------------

const EXACT_TOKEN_SIGNALS: ReadonlySet<string> = new Set([
  "reklam",
  "sponsorlu",
  "sponsored",
]);

const PREFIX_SIGNALS: readonly string[] = [
  "reklam",    // reklamda, reklamdir, etc.
  "sponsorlu", // sponsorluk, etc.
];

const PHRASE_SIGNALS: readonly string[] = [
  "isbirligi",
  "is birligi",
  "paid partnership",
];

function detectExplicitDisclosure(parsed: ParsedCaption): string[] {
  const signals: string[] = [];

  // Exact token
  for (const token of parsed.tokens) {
    if (EXACT_TOKEN_SIGNALS.has(token)) {
      signals.push(`exact:${token}`);
    }
  }

  // Prefix (suffixed Turkish forms)
  for (const token of parsed.tokens) {
    for (const prefix of PREFIX_SIGNALS) {
      if (
        token.length > prefix.length &&
        token.startsWith(prefix) &&
        !EXACT_TOKEN_SIGNALS.has(token)
      ) {
        signals.push(`prefix:${prefix}→${token}`);
      }
    }
  }

  // Phrase / collapsed
  for (const phrase of PHRASE_SIGNALS) {
    if (parsed.compact.includes(phrase)) {
      signals.push(`phrase:${phrase}`);
    }
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Layer 2: Brand-campaign affiliation detection
// ---------------------------------------------------------------------------

/**
 * Common campaign/event/geography suffixes found in brand accounts and
 * campaign hashtags. Used for clustering and mention-suffix detection.
 */
const CAMPAIGN_SUFFIXES: readonly string[] = [
  "turkiye", "turkey", "tr",
  "awards", "award",
  "campaign", "kampanya",
  "challenge", "event", "etkinlik",
  "launch", "lansman",
  "fest", "festival",
  "day", "week", "gunu", "haftasi",
  "collab", "partner",
  "official", "resmi",
  "squad", "team", "takim",
  "ambassador", "elci",
  "review", "inceleme",
  "try", "deneme", "test",
  "summer", "yaz", "winter", "kis",
  "spring", "ilkbahar", "fall", "sonbahar",
  "2024", "2025", "2026", "2027",
];

/**
 * Brand-account suffixes commonly used in official Instagram handles.
 * These suffixes, when found at the end of a @mention (after _ or .),
 * strongly indicate an official brand/regional account.
 *
 * Pattern: @brandname_turkiye, @brand.official, @brand_tr
 */
const BRAND_ACCOUNT_SUFFIXES: readonly string[] = [
  "turkiye", "turkey", "tuerkiye",
  "tr", "de", "fr", "uk", "us", "eu", "global",
  "official", "resmi",
  "cosmetics", "beauty", "skin", "skincare", "makeup",
  "paris", "london", "istanbul", "newyork", "berlin",
];

/**
 * Minimum shared root length for hashtag-to-hashtag clustering.
 */
const MIN_BRAND_ROOT_LEN = 4;

/**
 * Minimum shared root length for cross-channel (mention ↔ hashtag) correlation.
 * Lower than hashtag-only because cross-channel correlation is stronger evidence.
 * 3 chars is sufficient when both a @mention and a #hashtag share a root.
 */
const MIN_CROSS_CHANNEL_ROOT_LEN = 3;

function longestCommonPrefix(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return a.slice(0, i);
}

/**
 * Split a mention handle by _ and . separators into segments.
 * @nyxcosmetics_turkiye → ["nyxcosmetics", "turkiye"]
 * @loreal.paris → ["loreal", "paris"]
 */
function splitMentionSegments(mention: string): string[] {
  return mention.split(/[._]/).filter(Boolean);
}

// Layer 2a: Brand-campaign hashtag clustering (unchanged)
function detectBrandCampaign(parsed: ParsedCaption): string[] {
  const signals: string[] = [];
  const { hashtags, mentions } = parsed;

  if (hashtags.length < 2) return signals;

  for (let i = 0; i < hashtags.length; i++) {
    for (let j = i + 1; j < hashtags.length; j++) {
      const a = hashtags[i];
      const b = hashtags[j];
      const lcp = longestCommonPrefix(a, b);

      if (lcp.length < MIN_BRAND_ROOT_LEN) continue;

      const longer = a.length >= b.length ? a : b;
      const shorter = a.length < b.length ? a : b;
      const tail = longer.slice(lcp.length);

      const hasCampaignSuffix = CAMPAIGN_SUFFIXES.some(
        (cs) => tail.includes(cs) || longer.includes(cs)
      );

      const hasMentionCorrelation = mentions.some(
        (m) =>
          m.includes(lcp) ||
          lcp.includes(m.replace(/[._]/g, ""))
      );

      if (hasCampaignSuffix) {
        signals.push(
          `brand_campaign:hashtag_cluster:#${shorter}+#${longer}(root:${lcp})`
        );
      } else if (hasMentionCorrelation) {
        signals.push(
          `brand_affiliation:hashtag+mention:#${shorter}+#${longer}(root:${lcp})`
        );
      } else if (longer.startsWith(shorter) && longer.length - shorter.length >= 3) {
        signals.push(
          `brand_campaign:root_derivative:#${shorter}+#${longer}`
        );
      }
    }
  }

  return [...new Set(signals)];
}

/**
 * Layer 2b: Cross-channel mention ↔ hashtag LCP correlation.
 *
 * Uses LCP matching (threshold 3 chars) between the cleaned mention
 * and each hashtag, and vice versa. Also checks if any mention segment
 * (split by _ or .) matches a hashtag prefix.
 *
 * Examples:
 * - @nyxcosmetics_turkiye + #nyxprofessionalmakeup → LCP "nyx" (3 chars) → match
 * - @ceraveturkiye + #cerave → mention starts with "cerave" → match
 */
function detectMentionHashtagCorrelation(parsed: ParsedCaption): string[] {
  const signals: string[] = [];
  const { hashtags, mentions } = parsed;

  if (hashtags.length === 0 || mentions.length === 0) return signals;

  for (const mention of mentions) {
    const mentionClean = mention.replace(/[._]/g, "");
    const segments = splitMentionSegments(mention);
    // The first segment is typically the brand root
    const primarySegment = segments[0] || mentionClean;

    for (const tag of hashtags) {
      // Skip very short or generic hashtags
      if (tag.length < MIN_CROSS_CHANNEL_ROOT_LEN) continue;

      // Check 1: Direct LCP between cleaned mention and hashtag
      const lcp = longestCommonPrefix(mentionClean, tag);
      if (lcp.length >= MIN_CROSS_CHANNEL_ROOT_LEN) {
        signals.push(
          `brand_affiliation:mention_hashtag_lcp:@${mention}+#${tag}(root:${lcp})`
        );
        continue;
      }

      // Check 2: LCP between primary mention segment and hashtag
      if (primarySegment !== mentionClean) {
        const segLcp = longestCommonPrefix(primarySegment, tag);
        if (segLcp.length >= MIN_CROSS_CHANNEL_ROOT_LEN) {
          signals.push(
            `brand_affiliation:mention_segment_hashtag:@${mention}[${primarySegment}]+#${tag}(root:${segLcp})`
          );
          continue;
        }
      }

      // Check 3: Original startsWith (mention starts with full hashtag)
      if (
        tag.length >= MIN_BRAND_ROOT_LEN &&
        mentionClean.startsWith(tag) &&
        mentionClean.length > tag.length
      ) {
        signals.push(
          `brand_affiliation:mention_hashtag:@${mention}+#${tag}`
        );
      }
    }
  }

  return [...new Set(signals)];
}

/**
 * Layer 2c: Standalone brand-mention detection.
 *
 * Detects @mentions that structurally look like official brand accounts,
 * even without correlated hashtags. A @mention is classified as a brand
 * mention if its handle contains a recognized brand-account suffix
 * (separated by _ or .).
 *
 * Examples:
 * - @nyxcosmetics_turkiye → suffix "turkiye" → brand_mention
 * - @lorealparis → contains geo "paris" → brand_mention
 * - @brand.official → suffix "official" → brand_mention
 *
 * Safety:
 * - Only matches on recognized suffix vocabulary, not arbitrary words
 * - The suffix must be ≥2 chars and the non-suffix part must be ≥3 chars
 *   (to avoid matching handles like @a_tr)
 */
function detectBrandMention(parsed: ParsedCaption): string[] {
  const signals: string[] = [];
  const { mentions } = parsed;

  if (mentions.length === 0) return signals;

  for (const mention of mentions) {
    const segments = splitMentionSegments(mention);

    // Check for brand-account suffixes in segmented handle
    // e.g., nyxcosmetics_turkiye → segments ["nyxcosmetics", "turkiye"]
    if (segments.length >= 2) {
      for (let i = 1; i < segments.length; i++) {
        const seg = segments[i];
        if (
          BRAND_ACCOUNT_SUFFIXES.includes(seg) &&
          segments[0].length >= 3
        ) {
          signals.push(
            `brand_mention:account_suffix:@${mention}(suffix:${seg})`
          );
          break; // one signal per mention is enough
        }
      }
    }

    // Check for embedded geo/industry terms in unsegmented handles
    // e.g., lorealparis → contains "paris"
    const mentionClean = mention.replace(/[._]/g, "");
    if (segments.length < 2 || !signals.some((s) => s.includes(`@${mention}`))) {
      for (const suffix of BRAND_ACCOUNT_SUFFIXES) {
        if (
          suffix.length >= 4 && // Only match longer suffixes for embedded check
          mentionClean.endsWith(suffix) &&
          mentionClean.length > suffix.length + 2 // brand part must be ≥3 chars
        ) {
          signals.push(
            `brand_mention:embedded_geo:@${mention}(suffix:${suffix})`
          );
          break;
        }
      }
    }
  }

  return [...new Set(signals)];
}

// ---------------------------------------------------------------------------
// Layer 3: Branded promo-copy detection (plain-text, no @mentions needed)
// ---------------------------------------------------------------------------

/**
 * Promotional action / CTA phrases in Turkish and English.
 * These alone do NOT trigger exclusion — they require co-occurrence with
 * a branded product phrase (multi-word capitalized name).
 *
 * Matched against normalized (folded) caption text.
 */
const PROMO_ACTION_PHRASES: readonly string[] = [
  // Turkish CTAs and benefit language
  "tadini cikar",       // "enjoy the taste" — ad-copy staple
  "simdi dene",         // "try it now"
  "hemen dene",         // "try it right away"
  "hemen al",           // "get it now"
  "simdi al",           // "get it now"
  "kacirma",            // "don't miss out"
  "firsati yakala",     // "seize the opportunity"
  "firsati kacirma",   // "don't miss the deal"
  "sen de dene",        // "you try it too"
  "sen de yakala",      // "you catch it too"
  "sen de kesfet",      // "you discover it too" (only with brand)
  "ritmi yakala",       // "catch the rhythm" (campaign CTA)
  // English CTAs
  "try now",
  "get yours",
  "shop now",
  "buy now",
  "order now",
  "grab yours",
  "don't miss",
  "limited edition",
  "available now",
  "link in bio",
];

/**
 * Detect branded product phrases in the RAW (pre-normalization) caption.
 *
 * A branded product phrase is a sequence of 2+ capitalized words that
 * represents a product name, e.g., "Patos Acı Baharat", "Samsung Galaxy",
 * "OMO Ultra Power Kapsül".
 *
 * Strategy: find runs of ≥2 consecutive words where each starts with
 * an uppercase letter and is ≥2 chars. Filter out common sentence-start
 * patterns and Turkish capitalized connectors.
 */
const SENTENCE_STARTERS = new Set([
  "Bu", "Ve", "Ya", "De", "Da", "Ki", "Ne", "Bi", "Bir", "Her",
  "Sen", "Ben", "Biz", "Siz", "Ama", "Ile", "The", "And", "But",
  "For", "Not", "You", "All", "Can", "Had", "Her", "Was", "One",
  "Our", "Out", "Are", "Has", "His", "How", "Its", "May", "New",
]);

function extractBrandedProductPhrases(rawCaption: string): string[] {
  // Split on sentence boundaries and process each sentence
  const sentences = rawCaption.split(/[.!?\n]+/);
  const phrases: string[] = [];

  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/);
    let run: string[] = [];

    for (let i = 0; i < words.length; i++) {
      const word = words[i].replace(/[^\p{L}\p{N}]/gu, "");
      if (word.length < 2) {
        if (run.length >= 2) phrases.push(run.join(" "));
        run = [];
        continue;
      }

      const isCapitalized = word[0] === word[0].toUpperCase() &&
                           word[0] !== word[0].toLowerCase();
      // Reject ALL-CAPS words — Turkish exclamatory style, not brand names
      const isAllCaps = word === word.toUpperCase() && word.length > 1;

      if (isCapitalized && !isAllCaps) {
        // Skip sentence starters at position 0 of a run
        if (run.length === 0 && i === 0 && SENTENCE_STARTERS.has(word)) {
          continue;
        }
        run.push(word);
      } else {
        if (run.length >= 2) phrases.push(run.join(" "));
        run = [];
      }
    }
    if (run.length >= 2) phrases.push(run.join(" "));
  }

  return phrases;
}

/**
 * Layer 3: Plain-text branded promo-copy detection.
 *
 * Detects commercial content that uses branded product names in
 * plain-text promotional copy without @mentions or explicit disclosures.
 *
 * Trigger condition (co-occurrence required):
 *   1. Caption contains ≥1 branded product phrase (2+ capitalized words)
 *   2. Caption contains ≥1 promotional action phrase
 *
 * Neither alone triggers exclusion. Both must co-occur for high confidence.
 *
 * Additionally:
 *   3. Caption contains ≥2 branded product phrases → branded product
 *      is mentioned repeatedly, strong commercial signal even without CTA.
 *
 * Examples caught:
 *   "Patos Acı Baharat yanında. Aç bir Patos, eşsiz acının tadını çıkar."
 *    → branded: "Patos Acı Baharat" + promo: "tadini cikar", "essiz"
 *
 * Examples NOT caught (by design):
 *   "Bugün Patos yedim" → single brand mention, no promo action
 *   "Acının tadını çıkar" → promo action but no branded phrase
 */
function detectBrandedPromoCopy(
  rawCaption: string,
  parsed: ParsedCaption
): string[] {
  const signals: string[] = [];

  // Extract branded product phrases from raw caption
  const brandPhrases = extractBrandedProductPhrases(rawCaption);
  if (brandPhrases.length === 0) return signals;

  // Check for promotional action phrases in normalized text
  const matchedPromo: string[] = [];
  for (const promo of PROMO_ACTION_PHRASES) {
    if (parsed.tokenized.includes(promo) || parsed.compact.includes(promo)) {
      matchedPromo.push(promo);
    }
  }

  // Co-occurrence: brand phrase + promo phrase
  if (brandPhrases.length >= 1 && matchedPromo.length >= 1) {
    signals.push(
      `branded_promo_copy:product+cta:"${brandPhrases[0]}"` +
      `+promo:"${matchedPromo[0]}"`
    );
  }

  // Multiple brand phrases = repeated product placement
  if (brandPhrases.length >= 2 && signals.length === 0) {
    signals.push(
      `branded_promo_copy:repeated_product:"${brandPhrases[0]}"` +
      `+"${brandPhrases[1]}"`
    );
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Unified exclusion classifier
// ---------------------------------------------------------------------------

export type ExclusionCategory =
  | "explicit_disclosure"
  | "brand_campaign"
  | "brand_affiliation"
  | "brand_mention"
  | "branded_hashtag"
  | "branded_promo_copy"
  | "paid_partnership_tag"
  | null;

export type ExclusionResult = {
  shouldExclude: boolean;
  exclusionCategory: ExclusionCategory;
  matchedSignals: string[];
  normalizedCaption: string;
};

/**
 * Classify whether a caption should be excluded from the organic benchmark.
 *
 * Layer 1: Explicit disclosure (hard exclude)
 * Layer 2: Brand-campaign affiliation (exclude with structural evidence)
 *
 * Returns structured result with signals for debugging/transparency.
 */
export function classifyBenchmarkExclusion(
  caption: string | null
): ExclusionResult {
  if (!caption) {
    return {
      shouldExclude: false,
      exclusionCategory: null,
      matchedSignals: [],
      normalizedCaption: "",
    };
  }

  const parsed = parseCaption(caption);
  const allSignals: string[] = [];
  let category: ExclusionCategory = null;

  // Layer 1: Explicit disclosure — hard exclude
  const disclosureSignals = detectExplicitDisclosure(parsed);
  if (disclosureSignals.length > 0) {
    return {
      shouldExclude: true,
      exclusionCategory: "explicit_disclosure",
      matchedSignals: disclosureSignals,
      normalizedCaption: parsed.normalized,
    };
  }

  // Layer 2a: Brand-campaign hashtag clustering
  const brandCampaignSignals = detectBrandCampaign(parsed);
  if (brandCampaignSignals.length > 0) {
    allSignals.push(...brandCampaignSignals);
    category = brandCampaignSignals.some((s) => s.startsWith("brand_campaign"))
      ? "brand_campaign"
      : "brand_affiliation";
  }

  // Layer 2b: Cross-channel mention ↔ hashtag correlation
  const mentionSignals = detectMentionHashtagCorrelation(parsed);
  if (mentionSignals.length > 0) {
    allSignals.push(...mentionSignals);
    if (!category) category = "brand_affiliation";
  }

  // Layer 2c: Standalone brand-mention detection
  const brandMentionSignals = detectBrandMention(parsed);
  if (brandMentionSignals.length > 0) {
    allSignals.push(...brandMentionSignals);
    if (!category) category = "brand_mention";
  }

  // Layer 3: Branded promo-copy detection (plain-text, no @mentions needed)
  const promoCopySignals = detectBrandedPromoCopy(caption, parsed);
  if (promoCopySignals.length > 0) {
    allSignals.push(...promoCopySignals);
    if (!category) category = "branded_promo_copy";
  }

  return {
    shouldExclude: allSignals.length > 0,
    exclusionCategory: allSignals.length > 0 ? category : null,
    matchedSignals: allSignals,
    normalizedCaption: parsed.normalized,
  };
}

// ---------------------------------------------------------------------------
// Backward-compatible wrappers
// ---------------------------------------------------------------------------

/**
 * Legacy wrapper — used by selection.ts.
 * Now delegates to the full exclusion classifier.
 */
export function isSponsoredCaption(caption: string | null): boolean {
  return classifyBenchmarkExclusion(caption).shouldExclude;
}

/**
 * Legacy structured result — kept for backward compatibility with tests.
 */
export type SponsoredDetectionResult = {
  isSponsored: boolean;
  matchedSignals: string[];
  normalizedCaption: string;
};

export function detectSponsoredDisclosure(
  caption: string | null
): SponsoredDetectionResult {
  const result = classifyBenchmarkExclusion(caption);
  return {
    isSponsored: result.shouldExclude,
    matchedSignals: result.matchedSignals,
    normalizedCaption: result.normalizedCaption,
  };
}

// ---------------------------------------------------------------------------
// Benchmark eligibility checker
// ---------------------------------------------------------------------------

import type { IneligibilityCategory, BenchmarkEligibility } from "./types";

/**
 * Explicit test/draft markers — high-confidence phrases that indicate
 * the Reel was not intended for benchmark inclusion.
 *
 * Format: [pattern, category, signal_name]
 *
 * IMPORTANT: These are phrase-level matches only. Single words like
 * "test" or "deneme" are NOT matched because real creator content
 * legitimately contains "test ettim", "denedim", "denemek istedim".
 */
const TEST_REEL_PHRASES: Array<
  [RegExp, IneligibilityCategory, string]
> = [
  // Layer 1: Explicit test/draft markers (Turkish + English)
  [/\btest\s+reel/i, "test_reel", "test_reel_explicit"],
  [/\btest\s+video/i, "test_reel", "test_video_explicit"],
  [/\btest\s+post/i, "test_reel", "test_post_explicit"],
  [/\bdeneme\s+reel/i, "test_reel", "deneme_reel"],
  [/\bdeneme\s+video/i, "test_reel", "deneme_video"],
  [/\bdeneme\s+post/i, "test_reel", "deneme_post"],
  [/\btaslak\b/, "draft_content", "taslak"],
  [/\bdraft\b/, "draft_content", "draft"],

  // Layer 2: Internal QA patterns
  [/\bbu\s+bir\s+test\b/, "internal_qa", "bu_bir_test"],
  [/\bbu\s+test\b/, "internal_qa", "bu_test"],
  [/\bbunu\s+sil\b/, "internal_qa", "bunu_sil"],
  [/\btest\s+123\b/, "internal_qa", "test_123"],
  [/\btest\s+test\b/, "internal_qa", "test_test"],
  [/\b1\s*2\s*3\s+test\b/, "internal_qa", "123_test"],
  [/\bplaceholder\b/, "internal_qa", "placeholder"],
  [/\blorem\s+ipsum\b/, "internal_qa", "lorem_ipsum"],
  [/\bses\s+test/i, "test_reel", "ses_testi"],
  [/\bsound\s+test/i, "test_reel", "sound_test"],
  [/\bkamera\s+test/i, "test_reel", "kamera_testi"],

  // Layer 3: Accidental post signals
  [/\byanlis\s+yukle/, "accidental_post", "yanlis_yukleme"],
  [/\byanlis\s+paylast/, "accidental_post", "yanlis_paylasim"],
  [/\bsilmeyi\s+unutma/, "accidental_post", "silmeyi_unutma"],
  [/\bsil\s+bunu\b/, "accidental_post", "sil_bunu"],
  [/\bduzeltilecek\b/, "accidental_post", "duzeltilecek"],
  [/\bgecici\s+post/, "accidental_post", "gecici_post"],
  [/\bgecici\s+video/, "accidental_post", "gecici_video"],
];

/**
 * Check whether a Reel is eligible for benchmark calculation.
 *
 * Returns structured result:
 * - `isEligible: true` → Reel can be considered for organic/commercial benchmark
 * - `isEligible: false` → Reel is test/draft/internal and must be excluded
 *
 * Uses layered, phrase-level detection to avoid false positives on
 * real creator content that contains words like "denedim" or "test ettim".
 */
export function checkBenchmarkEligibility(
  caption: string | null
): BenchmarkEligibility {
  if (!caption) {
    // Null caption is allowed — some real Reels have no caption
    return {
      isEligible: true,
      ineligibilityCategory: null,
      matchedSignals: [],
    };
  }

  const normalized = normalizeCaption(caption);
  const signals: string[] = [];
  let category: IneligibilityCategory | null = null;

  for (const [pattern, cat, signalName] of TEST_REEL_PHRASES) {
    if (pattern.test(normalized)) {
      signals.push(`benchmark_ineligible:${cat}:${signalName}`);
      if (!category) category = cat;
    }
  }

  return {
    isEligible: signals.length === 0,
    ineligibilityCategory: category,
    matchedSignals: signals,
  };
}
