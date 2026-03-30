"use client";

/**
 * Auth Layout — Shared wrapper for login/signup
 *
 * Adds the minimal ProductFooter to auth pages without
 * duplicating it in each page file.
 */

import { ProductFooter } from "@/app/components/ui/ProductFooter";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <ProductFooter variant="auth" />
    </>
  );
}
