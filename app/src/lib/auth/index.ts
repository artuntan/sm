/**
 * Better Auth — Server Configuration
 *
 * Credentials-based auth with SQLite persistence via Drizzle.
 * Custom fields: systemRole, approvalStatus, approvedBy, approvedAt.
 *
 * Bootstrap: env var BOOTSTRAP_ADMIN_EMAIL triggers auto-approval
 * as system_admin for the first matching signup.
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

const BOOTSTRAP_ADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL || "";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),

  emailAndPassword: {
    enabled: true,
  },

  user: {
    additionalFields: {
      systemRole: {
        type: "string",
        defaultValue: "user",
        input: false,
      },
      approvalStatus: {
        type: "string",
        defaultValue: "pending",
        input: false,
      },
      approvedBy: {
        type: "string",
        required: false,
        input: false,
      },
      approvedAt: {
        type: "number",
        required: false,
        input: false,
      },
    },
  },

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Bootstrap: auto-approve and promote the bootstrap admin
          if (
            BOOTSTRAP_ADMIN_EMAIL &&
            user.email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()
          ) {
            const { eq } = await import("drizzle-orm");
            await db
              .update(schema.user)
              .set({
                systemRole: "system_admin",
                approvalStatus: "approved",
                approvedAt: new Date(),
              })
              .where(eq(schema.user.id, user.id));
          }
        },
      },
    },
  },
});
