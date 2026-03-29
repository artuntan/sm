"use client";

/**
 * Dashboard Layout — Shared Authenticated Shell
 *
 * This layout wraps all authenticated pages (workspace, history, admin, settings)
 * so that AppShell is mounted ONCE and persists across route transitions.
 * Navigation between tabs never unmounts or remounts the shell chrome.
 */

import { AppShell } from "@/app/components/ui/AppShell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
