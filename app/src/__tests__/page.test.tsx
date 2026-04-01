/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
  }),
}));

jest.mock("@/lib/auth/client", () => ({
  signOut: jest.fn(),
}));
import HomePage from "@/app/(dashboard)/page";

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

const mockAuthMeResult = {
  name: "Test User",
  approvalStatus: "approved",
  isSystemAdmin: false,
  team: { teamId: "team-1", role: "team_admin", teamName: "Acme Team" },
  hasPendingTeamRequest: false,
};

const mockMultiPlatformResult = {
  analyzedAt: "2025-03-10T12:00:00Z",
  query: { instagram: "testuser", tiktok: null },
  platforms: {
    instagram: {
      platform: "instagram",
      username: "testuser",
      profile: {
        username: "testuser",
        displayName: "Test User",
        followerCount: 150000,
        followingCount: 500,
        verified: false,
        profilePicUrl: null,
      },
      organic: {
        status: "partial",
        averageViews: 10000,
        sampleSize: 2,
        maxSampleSize: 5,
        reels: [
          {
            id: "r1",
            username: "testuser",
            caption: "Organic post",
            timestamp: "2025-03-10T14:00:00Z",
            views: 10000,
            permalink: "https://instagram.com/reel/r1/",
            provider: "mock",
            isCommercial: false,
            classificationCategory: null,
            matchedSignals: [],
          },
        ],
        warnings: ["2 of 5 target Reels — thin sample."],
      },
      commercial: {
        status: "partial",
        averageViews: 5000,
        sampleSize: 1,
        maxSampleSize: 5,
        reels: [
          {
            id: "r2",
            username: "testuser",
            caption: "Ad *reklam post",
            timestamp: "2025-03-09T14:00:00Z",
            views: 5000,
            permalink: "https://instagram.com/reel/r2/",
            provider: "mock",
            isCommercial: true,
            classificationCategory: "explicit_disclosure",
            matchedSignals: ["exact:reklam"],
          },
        ],
        warnings: ["1 of 5 target Reels — thin sample."],
      },
      comparison: { delta: 5000, adToOrganicRatio: 0.5, strongerBucket: "organic" as const },
      source: "mock",
      totalContentCount: 3,
      limitations: [],
      status: "ok",
    },
  },
};

describe("HomePage", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation(async (input) => {
      const requestUrl =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : String(input);

      if (requestUrl.endsWith("/api/auth/me")) {
        return {
          ok: true,
          json: async () => mockAuthMeResult,
        } as Response;
      }

      return {
        ok: true,
        json: async () => mockMultiPlatformResult,
      } as Response;
    });
  });

  async function renderHomePage() {
    render(<HomePage />);
    await screen.findByText(/Paste creator handles/i);
  }

  it("renders batch intake with guidance and guide button", async () => {
    await renderHomePage();
    // Title
    expect(screen.getByText(/Analyze/i)).toBeInTheDocument();
    // Guide button present
    expect(screen.getByRole("button", { name: /open system guide/i })).toBeInTheDocument();
    // Subheadline teaches row model
    expect(screen.getByText(/Paste creator handles/i)).toBeInTheDocument();
    // Textarea label
    expect(screen.getByText("PASTE CREATOR ROWS")).toBeInTheDocument();
    // Capability chips
    expect(screen.getByText("CSV · TSV · SHEETS")).toBeInTheDocument();
  });

  it("disables Start Analysis button when input is empty", async () => {
    await renderHomePage();
    const button = screen.getByRole("button", { name: /start analysis/i });
    expect(button).toBeDisabled();
  });

  it("enables Start Analysis when input is provided", async () => {
    const user = userEvent.setup();
    await renderHomePage();

    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "testuser,tk_user");

    const button = screen.getByRole("button", { name: /start analysis/i });
    expect(button).not.toBeDisabled();
  });

  it("shows preview with creator rows count", async () => {
    const user = userEvent.setup();
    await renderHomePage();

    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "instagram,tiktok\ncreator_a,tk_a\ncreator_b,tk_b");

    const previewBtn = screen.getByRole("button", { name: /preview/i });
    await user.click(previewBtn);

    // Preview should show creator rows count
    expect(screen.getByText("creator rows")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
