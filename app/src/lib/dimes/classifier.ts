/**
 * Dimes Content Coverage — Content Classifier
 *
 * Classifies social media posts as recipe/taste content, special-day content,
 * brand promotion, or other. Uses Turkish-language keyword analysis with
 * the existing normalization pipeline.
 *
 * Classification hierarchy:
 * 1. Check for special-day markers first (excluded from gap analysis)
 * 2. Check for recipe indicators (full recipe with ingredients/steps)
 * 3. Check for taste/food indicators (taste-led content without full recipe)
 * 4. Check for brand promo indicators
 * 5. Default to "other"
 */

import {
  normalizeCaption,
  toTokenizedView,
  extractHashtags,
} from "../domain/normalize";
import type { ClassificationResult, ContentClassification } from "./types";

// ---------------------------------------------------------------------------
// Special-day keywords (Turkish + English)
// Posts with these are EXCLUDED from gap analysis
// ---------------------------------------------------------------------------

const SPECIAL_DAY_PHRASES: readonly string[] = [
  // Turkish national / calendar days
  "anneler gunu",
  "anneler gunun",
  "babalar gunu",
  "babalar gunun",
  "sevgililer gunu",
  "valentines day",
  "ramazan bayrami",
  "kurban bayrami",
  "ramazan",
  "iftar",
  "sahur",
  "bayram",
  "yilbasi",
  "yeni yil",
  "yeniyil",
  "noel",
  "christmas",
  "new year",
  "23 nisan",
  "19 mayis",
  "29 ekim",
  "30 agustos",
  "cumhuriyet bayrami",
  "zafer bayrami",
  "cocuk bayrami",
  "genclik bayrami",
  "ozel gun",
  "ozel gunler",
  "kutlu olsun",
  "kutlama",
  "halloween",
  "paskalya",
  "easter",
  "dunya kadinlar gunu",
  "8 mart",
  "ogretmenler gunu",
  "ogrenciler gunu",
];

const SPECIAL_DAY_HASHTAGS: ReadonlySet<string> = new Set([
  "annelergunu",
  "babalargunu",
  "sevgililergunu",
  "ramazan",
  "bayram",
  "yilbasi",
  "23nisan",
  "19mayis",
  "29ekim",
  "30agustos",
  "ozelgun",
  "valentinesday",
  "mothersday",
  "fathersday",
  "newyear",
  "christmas",
  "halloween",
  "iftar",
  "sahur",
]);

// ---------------------------------------------------------------------------
// Recipe content indicators (Turkish + English)
// ---------------------------------------------------------------------------

const RECIPE_PHRASES: readonly string[] = [
  // Recipe structure words
  "tarif",
  "tarifi",
  "tarifim",
  "tarifimiz",
  "nasil yapilir",
  "nasil hazirlenir",
  "yapimi",
  "yapilisi",
  "hazirlayis",
  "hazirlanis",
  "hazirlanisi",
  "malzeme",
  "malzemeler",
  // Cooking actions
  "pisir",
  "kaynat",
  "karistir",
  "dogra",
  "rendele",
  "ezin",
  "ekle",
  "koyun",
  "servis",
  "servis edin",
  "susleme",
  "sogutu",
  "sogutun",
  "buzlu",
  "sicak servis",
  // Recipe format
  "adim adim",
  "kolay tarif",
  "pratik tarif",
  "evde yap",
  "ev yapimi",
  "homemade",
  "recipe",
  "step by step",
];

const RECIPE_HASHTAGS: ReadonlySet<string> = new Set([
  "tarif",
  "tarifler",
  "yemektarifi",
  "yemektarifleri",
  "kolaytarif",
  "pratiktarif",
  "evyapimi",
  "evdeyap",
  "recipe",
  "recipes",
  "homemade",
  "cooking",
  "baking",
  "foodrecipe",
]);

// ---------------------------------------------------------------------------
// Taste/food content indicators (broader than recipe)
// ---------------------------------------------------------------------------

const TASTE_PHRASES: readonly string[] = [
  "lezzet",
  "lezzetli",
  "leziz",
  "nefis",
  "tatli",
  "tat",
  "taze",
  "dogal",
  "meyve",
  "meyveli",
  "sebze",
  "icecek",
  "smoothie",
  "limonata",
  "meyve suyu",
  "portakal suyu",
  "elma suyu",
  "visne suyu",
  "seftali",
  "cilek",
  "muz",
  "karpuz",
  "kavun",
  "ananas",
  "mango",
  "yesil cay",
  "buzlu cay",
  "kahve",
  "espresso",
  "cappuccino",
  "latte",
  "americano",
  "cold brew",
  "ferahlat",
  "ferahlik",
  "serinlet",
  "serinlik",
  "susuzluk",
  "damak",
  "damak zevki",
  "gurme",
  "atistirmalik",
  "saglikli",
  "saglikli beslenme",
  "vitamin",
  "enerji",
  "protein",
  "fit",
  "detox",
];

const TASTE_HASHTAGS: ReadonlySet<string> = new Set([
  "lezzet",
  "lezzetli",
  "nefis",
  "taze",
  "dogal",
  "meyve",
  "smoothie",
  "limonata",
  "meyvesuyu",
  "icecek",
  "tatli",
  "saglikli",
  "sagliklibeslenme",
  "kahve",
  "coffee",
  "espresso",
  "coldcoffee",
  "coldbrew",
  "buzlukahve",
  "buzlucay",
  "food",
  "foodie",
  "yummy",
  "delicious",
  "healthy",
  "drink",
  "drinks",
  "beverage",
  "juice",
  "freshdrink",
]);

// ---------------------------------------------------------------------------
// Dimes/Obsesso brand product names (for taste context detection)
// ---------------------------------------------------------------------------

const BRAND_PRODUCT_NAMES: readonly string[] = [
  // Dimes products
  "dimes",
  "dimes premium",
  "dimes classic",
  "dimes aktif",
  "dimes light",
  "dimes cool",
  // Obsesso products
  "obsesso",
  "obsesso cold",
  "obsesso cold brew",
  "obsesso espresso",
  "obsesso cappuccino",
  "obsesso latte",
];

// ---------------------------------------------------------------------------
// Classification engine
// ---------------------------------------------------------------------------

export function classifyContent(
  rawCaption: string | null,
  hashtags?: string[]
): ClassificationResult {
  if (!rawCaption) {
    return {
      classification: "other",
      confidence: "low",
      signals: ["no_caption"],
      isRecipeOrTaste: false,
      isSpecialDay: false,
      isEligibleForGapAnalysis: false,
    };
  }

  const normalized = normalizeCaption(rawCaption);
  const tokenized = toTokenizedView(normalized);
  const tags = hashtags ?? extractHashtags(normalized);

  const signals: string[] = [];

  // --- 1. Special-day detection ---
  let isSpecialDay = false;

  for (const phrase of SPECIAL_DAY_PHRASES) {
    if (tokenized.includes(phrase) || normalized.includes(phrase)) {
      signals.push(`special_day:phrase:${phrase}`);
      isSpecialDay = true;
    }
  }
  for (const tag of tags) {
    if (SPECIAL_DAY_HASHTAGS.has(tag)) {
      signals.push(`special_day:hashtag:#${tag}`);
      isSpecialDay = true;
    }
  }

  // --- 2. Recipe detection ---
  let recipeScore = 0;

  for (const phrase of RECIPE_PHRASES) {
    if (tokenized.includes(phrase) || normalized.includes(phrase)) {
      signals.push(`recipe:phrase:${phrase}`);
      recipeScore += 2;
    }
  }
  for (const tag of tags) {
    if (RECIPE_HASHTAGS.has(tag)) {
      signals.push(`recipe:hashtag:#${tag}`);
      recipeScore += 1;
    }
  }

  // --- 3. Taste/food detection ---
  let tasteScore = 0;

  for (const phrase of TASTE_PHRASES) {
    if (tokenized.includes(phrase) || normalized.includes(phrase)) {
      signals.push(`taste:phrase:${phrase}`);
      tasteScore += 1;
    }
  }
  for (const tag of tags) {
    if (TASTE_HASHTAGS.has(tag)) {
      signals.push(`taste:hashtag:#${tag}`);
      tasteScore += 1;
    }
  }

  // Boost taste score if brand product name appears
  for (const product of BRAND_PRODUCT_NAMES) {
    if (tokenized.includes(product)) {
      signals.push(`taste:brand_product:${product}`);
      tasteScore += 2;
    }
  }

  // --- Classify ---
  let classification: ContentClassification;
  let confidence: "high" | "medium" | "low";

  if (isSpecialDay && (recipeScore > 0 || tasteScore > 0)) {
    classification = "special_day";
    confidence = recipeScore >= 3 || tasteScore >= 3 ? "high" : "medium";
  } else if (recipeScore >= 3) {
    classification = "recipe";
    confidence = "high";
  } else if (recipeScore >= 1) {
    classification = "recipe";
    confidence = recipeScore >= 2 ? "medium" : "low";
  } else if (tasteScore >= 3) {
    classification = "taste";
    confidence = "high";
  } else if (tasteScore >= 1) {
    classification = "taste";
    confidence = tasteScore >= 2 ? "medium" : "low";
  } else {
    classification = "other";
    confidence = "high";
  }

  const isRecipeOrTaste =
    classification === "recipe" || classification === "taste";

  return {
    classification,
    confidence,
    signals,
    isRecipeOrTaste,
    isSpecialDay: classification === "special_day",
    isEligibleForGapAnalysis: isRecipeOrTaste && !isSpecialDay,
  };
}

// ---------------------------------------------------------------------------
// Recipe name extraction
// Used for clustering anchor
// ---------------------------------------------------------------------------

/**
 * Attempt to extract a recipe/drink name from a caption.
 * 
 * Strategy: look for common Turkish patterns like:
 * - "X Tarifi" (X Recipe)
 * - "X Nasıl Yapılır" (How to make X)
 * - Product name + taste descriptor
 * 
 * Returns null if no recipe name can be identified.
 */
export function extractRecipeName(rawCaption: string | null): string | null {
  if (!rawCaption) return null;

  const normalized = normalizeCaption(rawCaption);

  // Pattern: "X tarifi" or "X tarif"
  const tarifMatch = normalized.match(/([a-z\s]{3,30})\s*tarifi?\b/);
  if (tarifMatch) {
    return tarifMatch[1].trim();
  }

  // Pattern: "X nasıl yapılır" → "X nasil yapilir" after normalization
  const nasilMatch = normalized.match(/([a-z\s]{3,30})\s*nasil yapilir/);
  if (nasilMatch) {
    return nasilMatch[1].trim();
  }

  // Pattern: "X smoothie" / "X limonata" / "X suyu"
  const drinkMatch = normalized.match(
    /([a-z\s]{3,25})\s*(smoothie|limonata|suyu|kahvesi|lattesi)\b/
  );
  if (drinkMatch) {
    return `${drinkMatch[1].trim()} ${drinkMatch[2]}`;
  }

  // Pattern: Dimes/Obsesso product + descriptor
  for (const product of BRAND_PRODUCT_NAMES) {
    if (normalized.includes(product)) {
      // Try to get the surrounding context
      const idx = normalized.indexOf(product);
      const after = normalized.slice(idx, idx + 50).split(/[.!?\n]/)[0];
      if (after.length > product.length + 3) {
        return after.trim();
      }
      return product;
    }
  }

  return null;
}
