"use client";

/**
 * AppShell — Unified, self-contained application shell
 *
 * Single top bar used across ALL authenticated pages.
 * Fetches its own identity via /api/auth/me — no prop-threading needed.
 * Renders account dropdown with Settings (modal), Appearance, and Sign Out.
 *
 * skills.name language: tight 40px bar, mono nav, emerald dot.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Modal } from "@/app/components/ui/Modal";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NavTab = {
  label: string;
  href: string;
  match: (path: string) => boolean;
  accent?: boolean;
  adminOnly?: boolean;
};

type Identity = {
  name: string;
  email: string;
  teamName?: string;
  isAdmin: boolean;
  isTeamAdmin: boolean;
  systemRole?: string;
};

type AppearancePrefs = {
  theme: "dark" | "light" | "system";
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS: NavTab[] = [
  { label: "ANALYZE", href: "/", match: (p) => p === "/" },
  { label: "CAMPAIGNS", href: "/campaigns", match: (p) => p.startsWith("/campaigns") },
  { label: "CREATORS", href: "/warehouse", match: (p) => p.startsWith("/warehouse") },
  { label: "COVERAGE", href: "/coverage", match: (p) => p.startsWith("/coverage") },
];

const PREFS_KEY = "cb-appearance";

function loadPrefs(): AppearancePrefs {
  if (typeof window === "undefined") return { theme: "dark" };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate old shape: if it has 'density' but no 'theme', it's the old format
      if (parsed.theme && ["dark", "light", "system"].includes(parsed.theme)) {
        return { theme: parsed.theme };
      }
      // Old format — default to dark
      return { theme: "dark" };
    }
  } catch {}
  return { theme: "dark" };
}

function savePrefs(prefs: AppearancePrefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
}

function applyTheme(theme: "dark" | "light" | "system") {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

// ---------------------------------------------------------------------------
// Module-level identity cache — survives component remounts across route
// transitions so the user cluster never disappears during navigation.
// ---------------------------------------------------------------------------

let _cachedIdentity: Identity | null = null;
let _identityPromise: Promise<Identity | null> | null = null;

async function fetchIdentity(): Promise<Identity | null> {
  try {
    const res = await fetch("/api/auth/me");
    if (!res.ok) return null;
    const data = await res.json();
    const id: Identity = {
      name: data.name || data.email?.split("@")[0] || "User",
      email: data.email || "",
      teamName: data.team?.teamName || undefined,
      isAdmin: data.systemRole === "system_admin" || data.isSystemAdmin === true,
      isTeamAdmin: data.team?.role === "team_admin",
      systemRole: data.systemRole || "user",
    };
    _cachedIdentity = id;
    return id;
  } catch {
    return _cachedIdentity; // On error, keep showing cached if available
  }
}

/** Shared fetch that deduplicates concurrent requests */ 
function getIdentity(forceRefresh = false): Promise<Identity | null> {
  if (!forceRefresh && _identityPromise) return _identityPromise;
  _identityPromise = fetchIdentity().finally(() => {
    // Clear the promise after completion so future mounts can re-check
    setTimeout(() => { _identityPromise = null; }, 30_000);
  });
  return _identityPromise;
}

// ---------------------------------------------------------------------------
// AppShell
// ---------------------------------------------------------------------------

export function AppShell({
  children,
  maxWidth = "1200px",
}: {
  children: ReactNode;
  maxWidth?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  // Initialize from cache immediately — no flash of empty state
  const [identity, setIdentity] = useState<Identity | null>(_cachedIdentity);
  const [menuOpen, setMenuOpen] = useState(false);
  const [prefs, setPrefs] = useState<AppearancePrefs>({ theme: "dark" });
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Settings modal state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // ── Fetch identity — stale-while-revalidate ──────────────────────────────
  useEffect(() => {
    let cancelled = false;
    getIdentity().then(id => {
      if (!cancelled && id) setIdentity(id);
    });
    return () => { cancelled = true; };
  }, []);

  // ── Load & apply theme prefs ────────────────────────────────────────────
  useEffect(() => {
    const p = loadPrefs();
    setPrefs(p);
    applyTheme(p.theme);
  }, []);

  // ── Close menu on outside click / Escape ─────────────────────────────────
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSignOut = useCallback(async () => {
    setMenuOpen(false);
    try {
      const { signOut } = await import("@/lib/auth/client");
      await signOut();
    } catch {}
    router.push("/login");
  }, [router]);

  const setTheme = useCallback((theme: "dark" | "light" | "system") => {
    const next: AppearancePrefs = { theme };
    setPrefs(next);
    savePrefs(next);
    applyTheme(theme);
  }, []);

  const openSettings = useCallback(() => {
    setMenuOpen(false);
    setEditName(identity?.name || "");
    setSaveMsg(null);
    setSettingsOpen(true);
  }, [identity?.name]);

  const handleSaveName = useCallback(async () => {
    const name = editName.trim();
    if (!name || name === identity?.name) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setIdentity(prev => {
          const updated = prev ? { ...prev, name } : prev;
          if (updated) _cachedIdentity = updated;
          return updated;
        });
        setSaveMsg("Saved");
        setTimeout(() => setSaveMsg(null), 2000);
      } else {
        setSaveMsg("Failed to save");
      }
    } catch {
      setSaveMsg("Network error");
    }
    setSaving(false);
  }, [editName, identity?.name]);

  // ── Visibility ───────────────────────────────────────────────────────────

  const isAdmin = identity?.isAdmin || false;
  const isTeamAdmin = identity?.isTeamAdmin || false;

  const visibleTabs = TABS.filter((tab) => {
    if (tab.adminOnly && !isAdmin && !isTeamAdmin) return false;
    return true;
  });

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-primary)" }}>
      {/* ── Responsive nav CSS (injected once) ── */}
      <style dangerouslySetInnerHTML={{ __html: `
        .shell-nav-scroll {
          display: flex;
          align-items: center;
          overflow-x: auto;
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .shell-nav-scroll::-webkit-scrollbar { display: none; }
        .shell-utility-btn:hover {
          background: var(--bg-elevated) !important;
          color: var(--text-secondary) !important;
        }
        @media (max-width: 639px) {
          .shell-header-inner { padding-left: 8px; padding-right: 8px; }
          .shell-nav-link { padding-left: 6px; padding-right: 6px; font-size: 9px; }
        }
        @media (min-width: 640px) and (max-width: 767px) {
          .shell-nav-link { padding-left: 8px; padding-right: 8px; }
        }
      `}} />

      {/* ── Top Bar ── */}
      <header
        className="border-b sticky top-0 z-30"
        style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-primary)" }}
      >
        <div className="shell-header-inner mx-auto px-4 flex items-center justify-between" style={{ maxWidth, height: "40px" }}>
          {/* Left: Logo + Scrollable Tabs */}
          <div className="flex items-center gap-0.5 min-w-0 flex-1">
            <Link href="/" className="flex items-center gap-2 mr-2 shrink-0">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--accent-green)" }} />
              <span
                className="text-[11px] font-semibold tracking-wider hidden md:inline"
                style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
              >
                CREATOR BENCHMARK
              </span>
            </Link>

            <nav className="shell-nav-scroll">
              {visibleTabs.map((tab) => {
                const isActive = tab.match(pathname);
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className="shell-nav-link relative px-2.5 py-2.5 text-[10px] tracking-wider transition-colors cursor-pointer whitespace-nowrap"
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontWeight: 500,
                      color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                    }}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: Utility Actions + Identity + Account Menu */}
          {identity && (
            <div className="relative flex items-center gap-1 shrink-0 ml-1">
              {/* History — utility action (personal activity log) */}
              <Link
                href="/history"
                className="shell-utility-btn flex items-center gap-1 px-1.5 py-1 rounded transition-all"
                style={{
                  background: pathname.startsWith("/history") ? "var(--accent-green-glow)" : "transparent",
                  border: pathname.startsWith("/history") ? "1px solid var(--border-accent)" : "1px solid transparent",
                  color: pathname.startsWith("/history") ? "var(--accent-green)" : "var(--text-muted)",
                }}
                title="Batch history"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8" cy="8" r="6.5" />
                  <path d="M8 4.5V8l2.5 1.5" />
                </svg>
                <span
                  className="text-[9px] tracking-wider hidden lg:inline"
                  style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}
                >
                  HISTORY
                </span>
              </Link>

              {/* Separator */}
              <div className="hidden sm:block w-px h-3.5 mx-0.5" style={{ backgroundColor: "var(--border-subtle)" }} />

              {identity.teamName && (
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded hidden md:inline-block"
                  style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-muted)", fontFamily: "var(--font-mono)", border: "1px solid var(--border-subtle)" }}
                >
                  {identity.teamName.toUpperCase()}
                </span>
              )}
              <button
                ref={triggerRef}
                onClick={() => setMenuOpen(prev => !prev)}
                className="account-trigger flex items-center gap-1.5 transition-all cursor-pointer"
                style={{ background: "none", border: "none" }}
                aria-label="Account menu"
                aria-expanded={menuOpen}
                aria-haspopup="true"
                data-no-press
              >
                <span
                  className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-semibold"
                  style={{ backgroundColor: "var(--accent-green-glow)", color: "var(--accent-green)", border: "1px solid var(--border-accent)" }}
                >
                  {(identity.name || "?")[0].toUpperCase()}
                </span>
                <span
                  className="text-[11px] hidden sm:inline"
                  style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}
                >
                  {identity.name.split(" ")[0] || "User"}
                </span>
                {/* Chevron */}
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="hidden sm:block" style={{ transition: "transform 0.15s ease", transform: menuOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                  <path d="M1.5 3L4 5.5L6.5 3" stroke="var(--text-muted)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {/* ── Account Dropdown ── */}
              {menuOpen && (
                <div
                  ref={menuRef}
                  className="account-menu"
                  role="menu"
                >
                  {/* User info header */}
                  <div className="account-menu-header">
                    <span className="text-[10px] font-medium" style={{ color: "var(--text-primary)" }}>
                      {identity.name}
                    </span>
                    {identity.teamName && (
                      <span className="text-[9px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        {identity.teamName}
                      </span>
                    )}
                  </div>

                  <div className="account-menu-divider" />

                  {/* Settings — opens modal, not a page */}
                  <button
                    className="account-menu-item"
                    role="menuitem"
                    onClick={openSettings}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <line x1="2" y1="3" x2="10" y2="3" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
                      <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
                      <line x1="2" y1="9" x2="10" y2="9" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
                      <circle cx="4" cy="3" r="1" fill="var(--bg-primary)" stroke="currentColor" strokeWidth="0.8" />
                      <circle cx="8" cy="6" r="1" fill="var(--bg-primary)" stroke="currentColor" strokeWidth="0.8" />
                      <circle cx="5" cy="9" r="1" fill="var(--bg-primary)" stroke="currentColor" strokeWidth="0.8" />
                    </svg>
                    <span>Settings</span>
                  </button>

                  {/* Admin — only for authorized roles */}
                  {(isAdmin || isTeamAdmin) && (
                    <>
                      <Link
                        href="/admin"
                        className="account-menu-item"
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M6 1L1.5 3.5v2.5c0 2.8 1.9 5.1 4.5 6 2.6-.9 4.5-3.2 4.5-6V3.5L6 1z" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M4.5 6l1 1 2-2" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span>Admin</span>
                      </Link>
                    </>
                  )}

                  <div className="account-menu-divider" />

                  {/* Theme section */}
                  <div className="account-menu-section">
                    <span className="account-menu-section-label">THEME</span>
                    <div className="account-menu-toggle-row">
                      <div className="account-toggle-group">
                        {(["dark", "light", "system"] as const).map((t) => (
                          <button
                            key={t}
                            className={`account-toggle-btn ${prefs.theme === t ? "active" : ""}`}
                            onClick={() => setTheme(t)}
                            role="menuitemradio"
                            aria-checked={prefs.theme === t}
                          >
                            {t === "dark" ? "Dark" : t === "light" ? "Light" : "System"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="account-menu-divider" />

                  {/* Sign Out */}
                  <button
                    onClick={handleSignOut}
                    className="account-menu-item account-menu-item--danger"
                    role="menuitem"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M4.5 10.5H2.5a1 1 0 01-1-1v-7a1 1 0 011-1h2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                      <path d="M8 8.5l2.5-2.5L8 3.5M5 6h5.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ── Content ── */}
      <main className="mx-auto px-4 py-4" style={{ maxWidth }}>
        {children}
      </main>

      {/* ── Settings Modal ── */}
      {identity && (
        <Modal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          title="SETTINGS"
          width="400px"
        >
          {/* ── Identity Section ── */}
          <div style={{ marginBottom: "20px" }}>
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded flex items-center justify-center text-base font-semibold shrink-0"
                style={{
                  backgroundColor: "var(--accent-green-glow)",
                  color: "var(--accent-green)",
                  border: "1px solid var(--border-accent)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {(identity.name || "?")[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)", lineHeight: "1.3" }}>
                  {identity.name}
                </p>
                <p
                  className="text-[10px] truncate"
                  style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", lineHeight: "1.6" }}
                >
                  {identity.email}
                </p>
              </div>
            </div>
          </div>

          {/* ── Divider ── */}
          <div style={{ height: "1px", backgroundColor: "var(--border-subtle)", margin: "0 0 16px 0" }} />

          {/* ── Display Name Field ── */}
          <div style={{ marginBottom: "16px" }}>
            <p
              className="text-[9px] tracking-wider font-medium"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginBottom: "6px" }}
            >
              DISPLAY NAME
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="flex-1 border px-2.5 py-1.5 text-xs"
                style={{
                  borderColor: "var(--border-default)",
                  color: "var(--text-primary)",
                  backgroundColor: "var(--bg-primary)",
                  fontFamily: "var(--font-mono)",
                  borderRadius: "3px",
                  outline: "none",
                }}
                onFocus={(e) => { e.target.style.borderColor = "var(--accent-green)"; }}
                onBlur={(e) => { e.target.style.borderColor = "var(--border-default)"; }}
              />
              <button
                onClick={handleSaveName}
                disabled={saving || !editName.trim() || editName.trim() === identity.name}
                className="px-3 py-1.5 text-[9px] font-medium tracking-wider"
                style={{
                  backgroundColor: (editName.trim() && editName.trim() !== identity.name) ? "var(--accent-green)" : "transparent",
                  color: (editName.trim() && editName.trim() !== identity.name) ? "var(--text-inverse)" : "var(--text-muted)",
                  border: (editName.trim() && editName.trim() !== identity.name) ? "1px solid var(--accent-green)" : "1px solid var(--border-default)",
                  fontFamily: "var(--font-mono)",
                  borderRadius: "3px",
                  cursor: (editName.trim() && editName.trim() !== identity.name) ? "pointer" : "default",
                  opacity: saving ? 0.5 : 1,
                  transition: "all 0.15s ease",
                }}
              >
                {saving ? "···" : "SAVE"}
              </button>
            </div>
            {saveMsg && (
              <p
                className="text-[9px] tracking-wider font-medium"
                style={{
                  color: saveMsg === "Saved" ? "var(--accent-green)" : "var(--accent-pink)",
                  fontFamily: "var(--font-mono)",
                  marginTop: "4px",
                }}
              >
                {saveMsg.toUpperCase()}
              </p>
            )}
          </div>

          {/* ── Info Fields ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px" }}>
            {/* Team */}
            {identity.teamName && (
              <div className="flex items-baseline justify-between">
                <span
                  className="text-[9px] tracking-wider font-medium"
                  style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                >
                  TEAM
                </span>
                <span
                  className="text-xs font-medium"
                  style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
                >
                  {identity.teamName}
                </span>
              </div>
            )}

            {/* Role */}
            <div className="flex items-baseline justify-between">
              <span
                className="text-[9px] tracking-wider font-medium"
                style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
              >
                ROLE
              </span>
              <span
                className="text-xs font-medium"
                style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
              >
                {identity.systemRole === "system_admin" ? "System Admin" : "User"}
              </span>
            </div>
          </div>

          {/* ── Divider ── */}
          <div style={{ height: "1px", backgroundColor: "var(--border-subtle)", margin: "0 0 12px 0" }} />

          {/* ── Sign Out ── */}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 w-full text-left py-2 px-1 transition-all"
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              background: "none",
              border: "none",
              cursor: "pointer",
              borderRadius: "3px",
              fontSize: "10px",
              letterSpacing: "0.05em",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--accent-pink)";
              e.currentTarget.style.backgroundColor = "rgba(255,100,130,0.06)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M4.5 10.5H2.5a1 1 0 01-1-1v-7a1 1 0 011-1h2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
              <path d="M8 8.5l2.5-2.5L8 3.5M5 6h5.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>SIGN OUT</span>
          </button>
        </Modal>
      )}
    </div>
  );
}
