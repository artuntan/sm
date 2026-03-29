import {
  normalizeUsername,
  normalizeCaption,
  isSponsoredCaption,
  detectSponsoredDisclosure,
  classifyBenchmarkExclusion,
  toTokenizedView,
  toCompactView,
  extractHashtags,
  extractMentions,
  parseCaption,
} from "@/lib/domain/normalize";

// ---------------------------------------------------------------------------
// normalizeUsername
// ---------------------------------------------------------------------------
describe("normalizeUsername", () => {
  it("trims whitespace", () => {
    expect(normalizeUsername("  testuser  ")).toBe("testuser");
  });
  it("removes leading @", () => {
    expect(normalizeUsername("@testuser")).toBe("testuser");
  });
  it("lowercases", () => {
    expect(normalizeUsername("TestUser")).toBe("testuser");
  });
  it("handles @ with whitespace", () => {
    expect(normalizeUsername("  @TestUser  ")).toBe("testuser");
  });
  it("handles already normalized input", () => {
    expect(normalizeUsername("testuser")).toBe("testuser");
  });
});

// ---------------------------------------------------------------------------
// normalizeCaption
// ---------------------------------------------------------------------------
describe("normalizeCaption", () => {
  it("lowercases text", () => {
    expect(normalizeCaption("HELLO WORLD")).toBe("hello world");
  });
  it("folds Turkish ı to i", () => {
    expect(normalizeCaption("ışık")).toBe("isik");
  });
  it("folds Turkish ş to s", () => {
    expect(normalizeCaption("şehir")).toBe("sehir");
  });
  it("folds Turkish ğ to g", () => {
    expect(normalizeCaption("dağ")).toBe("dag");
  });
  it("folds Turkish ç to c", () => {
    expect(normalizeCaption("çay")).toBe("cay");
  });
  it("folds Turkish ö to o", () => {
    expect(normalizeCaption("göl")).toBe("gol");
  });
  it("folds Turkish ü to u", () => {
    expect(normalizeCaption("gül")).toBe("gul");
  });
  it("strips diacritics from accented characters", () => {
    expect(normalizeCaption("café résumé")).toBe("cafe resume");
  });
  it("normalizes #işbirliği to #isbirligi", () => {
    expect(normalizeCaption("#işbirliği")).toBe("#isbirligi");
  });
  it("normalizes #İŞBİRLİĞİ (uppercase) to #isbirligi", () => {
    expect(normalizeCaption("#İŞBİRLİĞİ")).toBe("#isbirligi");
  });
});

// ---------------------------------------------------------------------------
// View helpers
// ---------------------------------------------------------------------------
describe("toTokenizedView", () => {
  it("turns punctuation into word separators", () => {
    expect(toTokenizedView("*reklam #kesfet")).toBe("reklam kesfet");
  });
  it("splits apostrophe-suffixed forms", () => {
    expect(toTokenizedView("reklam'da")).toBe("reklam da");
  });
  it("handles hashtags", () => {
    expect(toTokenizedView("#reklam")).toBe("reklam");
  });
  it("handles parentheses", () => {
    expect(toTokenizedView("(reklam)")).toBe("reklam");
  });
});

describe("toCompactView", () => {
  it("strips punctuation but keeps spaces", () => {
    expect(toCompactView("is birligi videosu")).toBe("is birligi videosu");
  });
});

describe("extractHashtags", () => {
  it("extracts hashtags without # prefix", () => {
    expect(extractHashtags("#cerave #cerawardsturkiye #kesfet")).toEqual([
      "cerave",
      "cerawardsturkiye",
      "kesfet",
    ]);
  });
  it("returns empty for no hashtags", () => {
    expect(extractHashtags("no tags here")).toEqual([]);
  });
});

describe("extractMentions", () => {
  it("extracts mentions without @ prefix", () => {
    expect(extractMentions("@ceraveturkiye yeni seri")).toEqual([
      "ceraveturkiye",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Layer 1: Explicit disclosure — positive cases
// ---------------------------------------------------------------------------
describe("classifyBenchmarkExclusion — explicit disclosure positives", () => {
  const cases = [
    { input: "#işbirliği", desc: "#işbirliği" },
    { input: "#isbirligi", desc: "#isbirligi" },
    { input: "iş birliği videosu", desc: "iş birliği with space" },
    { input: "is birligi", desc: "is birligi ASCII" },
    { input: "işbirliği ile", desc: "işbirliği without hashtag" },
    { input: "*reklam", desc: "*reklam (asterisk prefix)" },
    { input: "reklam", desc: "reklam standalone" },
    { input: "reklam'da", desc: "reklam'da (apostrophe suffix)" },
    { input: "reklamdır", desc: "reklamdır (Turkish suffix)" },
    { input: "reklamdir", desc: "reklamdir ASCII" },
    { input: "reklamda", desc: "reklamda (suffixed)" },
    { input: "#reklam", desc: "#reklam" },
    { input: "(reklam)", desc: "(reklam) in parens" },
    { input: "sponsorlu içerik", desc: "sponsorlu" },
    { input: "#sponsorlu", desc: "#sponsorlu" },
    { input: "sponsored content", desc: "sponsored (English)" },
    { input: "paid partnership", desc: "paid partnership" },
    { input: "Paid Partnership with brand", desc: "Paid Partnership capitalized" },
    {
      input: "düştüğümü koymadım... *reklam #kesfet",
      desc: "real-world *reklam caption",
    },
    { input: "Great product! #İŞBİRLİĞİ #beauty", desc: "uppercase İŞBİRLİĞİ" },
    { input: "Reklamda görülen ürün", desc: "Reklamda capitalized" },
  ];

  for (const { input, desc } of cases) {
    it(`excludes: ${desc}`, () => {
      const result = classifyBenchmarkExclusion(input);
      expect(result.shouldExclude).toBe(true);
      expect(result.exclusionCategory).toBe("explicit_disclosure");
      expect(result.matchedSignals.length).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Layer 2: Brand-campaign affiliation — positive cases
// ---------------------------------------------------------------------------
describe("classifyBenchmarkExclusion — brand campaign positives", () => {
  const cases = [
    {
      input: "özlenmiş... #cerave #cerawardsturkiye #kesfet",
      desc: "cerave + cerawardsturkiye (brand+campaign hashtag cluster)",
    },
    {
      input: "PART 3'E HOŞ GELDİNİZ... #cerave #cerawardsturkiye #kesfet",
      desc: "cerave campaign (uppercase, with apostrophe)",
    },
    {
      input: "Yeni ürünler #loreal #lorealparisturkiye",
      desc: "loreal + lorealparisturkiye (brand + geo-campaign)",
    },
    {
      input: "Amazing event! #samsung #samsungunpacked2025",
      desc: "samsung + samsungunpacked2025 (brand + event-year)",
    },
    {
      input: "Tried it! #nivea #niveachallenge",
      desc: "nivea + niveachallenge (brand + challenge suffix)",
    },
    {
      input: "@ceraveturkiye yeni seri #cerave",
      desc: "mention @ceraveturkiye + #cerave (mention-hashtag correlation)",
    },
  ];

  for (const { input, desc } of cases) {
    it(`excludes: ${desc}`, () => {
      const result = classifyBenchmarkExclusion(input);
      expect(result.shouldExclude).toBe(true);
      expect(["brand_campaign", "brand_affiliation"]).toContain(
        result.exclusionCategory
      );
      expect(result.matchedSignals.length).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Layer 2b: Cross-channel mention ↔ hashtag LCP — positive cases
// ---------------------------------------------------------------------------
describe("classifyBenchmarkExclusion — mention-hashtag LCP positives", () => {
  const cases = [
    {
      input:
        "BU FAR PALETİNDEN SİZE DE VAR! ... @nyxcosmetics_turkiye #nyxprofessionalmakeup",
      desc: "NYX regression: @nyxcosmetics_turkiye + #nyxprofessionalmakeup (LCP nyx, 3 chars)",
    },
    {
      input: "@samsungturkiye yeni telefon #samsunggalaxy",
      desc: "samsung mention + hashtag sharing root 'samsung'",
    },
  ];

  for (const { input, desc } of cases) {
    it(`excludes: ${desc}`, () => {
      const result = classifyBenchmarkExclusion(input);
      expect(result.shouldExclude).toBe(true);
      expect(result.matchedSignals.some((s) => s.includes("mention"))).toBe(
        true
      );
    });
  }
});

// ---------------------------------------------------------------------------
// Layer 2c: Brand-mention — positive cases
// ---------------------------------------------------------------------------
describe("classifyBenchmarkExclusion — brand-mention positives", () => {
  const cases = [
    {
      input: "en önemli adım... @lorealparis #kesfet",
      desc: "L'Oréal regression: @lorealparis embedded geo 'paris'",
    },
    {
      input: "@nyxcosmetics_turkiye yeni ürünler",
      desc: "NYX: @nyxcosmetics_turkiye has suffix 'turkiye'",
    },
    {
      input: "Harika! @brand.official yeni koleksiyon",
      desc: "@brand.official has suffix 'official'",
    },
    {
      input: "Try this @garnier_turkiye",
      desc: "@garnier_turkiye has suffix 'turkiye'",
    },
    {
      input: "My @maybellineistanbul fav",
      desc: "@maybellineistanbul embedded geo 'istanbul'",
    },
  ];

  for (const { input, desc } of cases) {
    it(`excludes: ${desc}`, () => {
      const result = classifyBenchmarkExclusion(input);
      expect(result.shouldExclude).toBe(true);
      expect(
        result.matchedSignals.some((s) => s.includes("brand_mention"))
      ).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Negative cases — should NOT be excluded
// ---------------------------------------------------------------------------
describe("classifyBenchmarkExclusion — negative cases", () => {
  const cases = [
    { input: null, desc: "null caption" },
    { input: "", desc: "empty string" },
    { input: "Beautiful day #nature #travel", desc: "organic travel post" },
    { input: "Amazing sunset 🌅", desc: "organic sunset post" },
    { input: "Check my new video! #viral #trending", desc: "viral post" },
    { input: "Best cafe in Istanbul #istanbul", desc: "city post" },
    { input: "Great day at the park #fun", desc: "fun day post" },
    { input: "My morning routine ☀️", desc: "morning routine" },
    {
      input: "#kesfet #fyp #viral",
      desc: "discovery hashtags only — no brand signal",
    },
    {
      input: "Trying new recipes at home #food #cooking",
      desc: "cooking post — no brand",
    },
    {
      input: "Love this dress! #fashion #ootd",
      desc: "fashion post without brand clustering",
    },
    {
      input: "#cerave skincare routine",
      desc: "single brand hashtag without campaign cluster — not enough signal",
      // Rationale: A single brand mention could be genuine unpaid content.
      // We require a second correlated signal (campaign hashtag or mention).
    },
  ];

  for (const { input, desc } of cases) {
    it(`does NOT exclude: ${desc}`, () => {
      const result = classifyBenchmarkExclusion(input);
      expect(result.shouldExclude).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// Signal debugging
// ---------------------------------------------------------------------------
describe("classifyBenchmarkExclusion — signal details", () => {
  it("returns exact match signal for reklam", () => {
    const result = classifyBenchmarkExclusion("*reklam");
    expect(result.matchedSignals).toContain("exact:reklam");
  });

  it("returns prefix signal for reklamdir", () => {
    const result = classifyBenchmarkExclusion("reklamdir");
    expect(
      result.matchedSignals.some((s) => s.startsWith("prefix:reklam"))
    ).toBe(true);
  });

  it("returns phrase signal for is birligi", () => {
    const result = classifyBenchmarkExclusion("iş birliği videosu");
    expect(
      result.matchedSignals.some((s) => s.startsWith("phrase:"))
    ).toBe(true);
  });

  it("returns brand_campaign signal for hashtag cluster", () => {
    const result = classifyBenchmarkExclusion(
      "#cerave #cerawardsturkiye #kesfet"
    );
    expect(
      result.matchedSignals.some((s) => s.includes("brand_campaign"))
    ).toBe(true);
  });

  it("returns brand_affiliation signal for mention+hashtag", () => {
    const result = classifyBenchmarkExclusion(
      "@ceraveturkiye yeni seri #cerave"
    );
    expect(
      result.matchedSignals.some((s) => s.includes("brand_affiliation"))
    ).toBe(true);
  });

  it("includes normalizedCaption in result", () => {
    const result = classifyBenchmarkExclusion("REKLAM");
    expect(result.normalizedCaption).toBe("reklam");
  });
});

// ---------------------------------------------------------------------------
// isSponsoredCaption backward compatibility
// ---------------------------------------------------------------------------
describe("isSponsoredCaption — backward compat", () => {
  it("detects explicit disclosure", () => {
    expect(isSponsoredCaption("Great product! #işbirliği #beauty")).toBe(true);
  });
  it("detects *reklam", () => {
    expect(
      isSponsoredCaption("düştüğümü koymadım... *reklam #kesfet")
    ).toBe(true);
  });
  it("detects brand campaign", () => {
    expect(
      isSponsoredCaption("özlenmiş... #cerave #cerawardsturkiye #kesfet")
    ).toBe(true);
  });
  it("returns false for organic", () => {
    expect(isSponsoredCaption("Beautiful day #nature #travel")).toBe(false);
  });
  it("returns false for null", () => {
    expect(isSponsoredCaption(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectSponsoredDisclosure backward compatibility
// ---------------------------------------------------------------------------
describe("detectSponsoredDisclosure — backward compat", () => {
  it("returns isSponsored true for reklam", () => {
    const r = detectSponsoredDisclosure("*reklam");
    expect(r.isSponsored).toBe(true);
    expect(r.matchedSignals.length).toBeGreaterThan(0);
  });
  it("returns isSponsored true for brand campaign", () => {
    const r = detectSponsoredDisclosure("#cerave #cerawardsturkiye");
    expect(r.isSponsored).toBe(true);
  });
  it("returns isSponsored false for organic", () => {
    const r = detectSponsoredDisclosure("Nice day #travel");
    expect(r.isSponsored).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Layer 3: Branded promo-copy detection — positive cases
// ---------------------------------------------------------------------------
describe("classifyBenchmarkExclusion — branded promo-copy positives", () => {
  const cases = [
    {
      input:
        "Sen kendine acılar türetme diye Patos Acı Baharat yanında. Aç bir Patos, eşsiz acının tadını çıkar. #BizBuŞekil",
      desc: "Patos primary regression — branded product + promo CTA",
    },
    {
      input:
        "Acil lekelerde paniğe kapılma. OMO Ultra Power Kapsül ile leke çıkma garantisi. Hemen dene!",
      desc: "OMO branded product ad without @mention",
    },
    {
      input:
        "Patos Rolls ile sen de ritmi yakala. Her aroması ayrı keyif. #PatosRolls",
      desc: "Patos Rolls campaign with slogan hashtag but no disclosure",
    },
    {
      input:
        "Samsung Galaxy S25 Ultra şimdi satışta. Hemen al, fırsatı kaçırma!",
      desc: "Samsung Galaxy product launch promo",
    },
  ];

  for (const { input, desc } of cases) {
    it(`excludes: ${desc}`, () => {
      const result = classifyBenchmarkExclusion(input);
      expect(result.shouldExclude).toBe(true);
      expect(result.exclusionCategory).toBe("branded_promo_copy");
      expect(
        result.matchedSignals.some((s) => s.includes("branded_promo_copy"))
      ).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Layer 3: Branded promo-copy — negative cases (must NOT be excluded)
// ---------------------------------------------------------------------------
describe("classifyBenchmarkExclusion — branded promo-copy negatives", () => {
  const cases = [
    {
      input: "Bugün Patos yedim çok güzeldi",
      desc: "single brand mention without promo language (Patos alone is not multi-word)",
    },
    {
      input: "Acının tadını çıkar, hayatın tadını çıkar",
      desc: "promo action phrase without branded product name",
    },
    {
      input: "#BizBuŞekil harika bir gün geçirdik",
      desc: "campaign hashtag alone without brand product phrase",
    },
    {
      input: "Çok güzel yemekler yedim, acılı baharat ile süper oldu",
      desc: "generic food reference with common words, no brand structure",
    },
    {
      input: "pov: she's not mad, that's just her face",
      desc: "organic lifestyle English caption",
    },
  ];

  for (const { input, desc } of cases) {
    it(`does NOT exclude: ${desc}`, () => {
      const result = classifyBenchmarkExclusion(input);
      expect(result.shouldExclude).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// Layer 3: Signal details
// ---------------------------------------------------------------------------
describe("classifyBenchmarkExclusion — branded promo-copy signal details", () => {
  it("returns product+cta signal for Patos caption", () => {
    const result = classifyBenchmarkExclusion(
      "Sen kendine acılar türetme diye Patos Acı Baharat yanında. Aç bir Patos, eşsiz acının tadını çıkar. #BizBuŞekil"
    );
    expect(result.matchedSignals.some((s) => s.includes("product+cta"))).toBe(
      true
    );
    expect(result.matchedSignals.some((s) => s.includes("Patos"))).toBe(true);
  });
});
