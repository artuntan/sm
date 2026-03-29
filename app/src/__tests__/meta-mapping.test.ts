import { mapMetaItemToReel } from "@/lib/providers/meta-provider";

describe("mapMetaItemToReel", () => {
  it("maps all raw fields to canonical fields", () => {
    const raw = {
      id: "17895695668004550",
      caption: "Amazing sunset 🌅",
      timestamp: "2025-03-10T14:30:00+0000",
      permalink: "https://www.instagram.com/reel/ABC123/",
      thumbnail_url: "https://example.com/thumb.jpg",
      media_type: "VIDEO",
      media_product_type: "REELS",
      view_count: 45200,
    };

    const result = mapMetaItemToReel(raw, "testuser");

    expect(result).toEqual({
      id: "17895695668004550",
      username: "testuser",
      caption: "Amazing sunset 🌅",
      timestamp: "2025-03-10T14:30:00+0000",
      views: 45200,
      likeCount: null,
      commentsCount: null,
      permalink: "https://www.instagram.com/reel/ABC123/",
      thumbnailUrl: "https://example.com/thumb.jpg",
      provider: "meta",
      rawMediaType: "VIDEO",
      rawProductType: "REELS",
    });
  });

  it("maps view_count to views", () => {
    const raw = { id: "1", view_count: 1234 };
    const result = mapMetaItemToReel(raw, "user");
    expect(result.views).toBe(1234);
  });

  it("maps thumbnail_url to thumbnailUrl", () => {
    const raw = { id: "1", thumbnail_url: "https://example.com/t.jpg" };
    const result = mapMetaItemToReel(raw, "user");
    expect(result.thumbnailUrl).toBe("https://example.com/t.jpg");
  });

  it("maps media_type to rawMediaType", () => {
    const raw = { id: "1", media_type: "VIDEO" };
    const result = mapMetaItemToReel(raw, "user");
    expect(result.rawMediaType).toBe("VIDEO");
  });

  it("maps media_product_type to rawProductType", () => {
    const raw = { id: "1", media_product_type: "REELS" };
    const result = mapMetaItemToReel(raw, "user");
    expect(result.rawProductType).toBe("REELS");
  });

  it("handles missing optional fields gracefully", () => {
    const raw = { id: "2" };
    const result = mapMetaItemToReel(raw, "user");

    expect(result.caption).toBeNull();
    expect(result.views).toBeNull();
    expect(result.thumbnailUrl).toBeNull();
    expect(result.rawMediaType).toBeNull();
    expect(result.rawProductType).toBeNull();
    expect(result.provider).toBe("meta");
  });

  it("sets provider to meta", () => {
    const raw = { id: "3" };
    const result = mapMetaItemToReel(raw, "user");
    expect(result.provider).toBe("meta");
  });
});
