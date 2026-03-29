"use client";

/**
 * Settings Page — Redirect fallback
 *
 * Settings is a modal opened from the account dropdown in AppShell.
 * This route exists only for backward compatibility / direct URL access.
 * It redirects to the workspace where the user can open settings from the dropdown.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--bg-primary)" }}>
      <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
        Redirecting to workspace...
      </p>
    </div>
  );
}
