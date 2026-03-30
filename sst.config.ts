/// <reference path="./.sst/platform/config.d.ts" />

/**
 * SST Configuration — SM Creator Intelligence Platform
 *
 * Deploys:
 * - Next.js app on Lambda via OpenNext
 * - RDS Postgres (t4g.micro) for database
 * - Secrets for auth + API tokens
 */

export default $config({
  app(input) {
    return {
      name: "sm",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage ?? ""),
      home: "aws",
      providers: {
        aws: {
          region: "eu-west-1",
        },
      },
    };
  },

  async run() {
    // ── Secrets ──────────────────────────────────────────────
    const betterAuthSecret = new sst.Secret("BetterAuthSecret");
    const metaAccessToken = new sst.Secret("MetaAccessToken");
    const metaIgUserId = new sst.Secret("MetaIgUserId");
    const apifyApiToken = new sst.Secret("ApifyApiToken");
    const youtubeApiKey = new sst.Secret("YoutubeApiKey");
    const bootstrapAdminEmail = new sst.Secret("BootstrapAdminEmail");

    // ── Database ─────────────────────────────────────────────
    const vpc = new sst.aws.Vpc("Vpc", { nat: "managed" });

    const database = new sst.aws.Postgres("Database", {
      vpc,
      scaling: {
        min: "0.5 ACU",
        max: "2 ACU",
      },
    });

    // ── Next.js App ──────────────────────────────────────────
    // Domain — set your custom domain here when ready
    // const domain = "app.yourdomain.com";

    const app = new sst.aws.Nextjs("App", {
      path: "./app",
      vpc,
      link: [database],
      environment: {
        DATABASE_URL: $interpolate`postgresql://${database.username}:${database.password}@${database.host}:${database.port}/${database.database}`,
        BETTER_AUTH_SECRET: betterAuthSecret.value,
        // BETTER_AUTH_URL is set after deployment via SST console or manually
        // because the URL isn't known until CloudFront is created
        BETTER_AUTH_URL: "",
        BOOTSTRAP_ADMIN_EMAIL: bootstrapAdminEmail.value,
        META_ACCESS_TOKEN: metaAccessToken.value,
        META_IG_USER_ID: metaIgUserId.value,
        META_GRAPH_API_VERSION: "v23.0",
        APIFY_API_TOKEN: apifyApiToken.value,
        YOUTUBE_API_KEY: youtubeApiKey.value,
      },
    });

    return {
      url: app.url,
      database: database.host,
    };
  },
});
