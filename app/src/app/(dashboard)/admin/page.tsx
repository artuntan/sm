"use client";

/**
 * Admin Control Plane — Professional Operations Console
 *
 * Three-layer architecture:
 * 1. Executive Overview (KPI strip)
 * 2. Operations Surface (Users table + Teams directory)
 * 3. Intelligence Panel (unified analytics)
 *
 * Desktop: Left column (Users + Teams), Right column (Insights) — wider right rail
 * Mobile: All sections stacked vertically
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { SkeletonStats, SkeletonCard } from "@/app/components/ui/Skeleton";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { AdminKPIStrip } from "@/app/components/admin/AdminKPIStrip";
import { AdminUsersTable } from "@/app/components/admin/AdminUsersTable";
import { AdminTeamsDirectory } from "@/app/components/admin/AdminTeamsDirectory";
import { AdminInsightsPanel } from "@/app/components/admin/AdminInsightsPanel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type User = { id: string; name?: string | null; email?: string | null; approvalStatus?: string | null; systemRole?: string | null; createdAt?: string | null };
type Team = { id: string; name?: string | null; slug?: string | null; active?: boolean | null; _count?: { members?: number | null } | null; memberCount?: number | null; admins?: { id: string; name: string; email: string }[] };
type Member = { membershipId: string; userId: string; role: string; active: boolean; joinedAt: string; userName?: string | null; userEmail?: string | null };
type JoinRequest = { id: string; userId: string; teamId?: string; status: string; createdAt: string; userName?: string | null; userEmail?: string | null };
type TeamDetail = { team: { id: string; slug: string; name: string; active: boolean } | null; members: Member[]; requests: JoinRequest[] };
type PendingAction = { type: "user" | "team-role" | "team-deactivate" | "team-request"; id: string; teamId?: string; action: string; name: string } | null;

type TeamProductivity = {
  teamId: string;
  teamName: string;
  runCount: number;
  totalCreators: number;
  manualMinutes: number;
  autoMinutes: number;
  timeSavedMinutes: number;
  productivityRatio: number;
};

type AnalyticsData = {
  global: {
    totalRuns: number;
    totalCreators: number;
    avgCreatorsPerRun?: number;
    manualMinutes: number;
    autoMinutes: number;
    timeSavedMinutes: number;
    productivityRatio: number;
  };
  teamProductivity: TeamProductivity[];
  formula: { description: string; calibration: string };
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const safeName = (u: User) => u.name || u.email || "Unknown";
const safeStatus = (u: User) => u.approvalStatus || "unknown";

// ---------------------------------------------------------------------------
// Main Admin Page
// ---------------------------------------------------------------------------

export default function AdminControlPlane() {
  // ── State ───────────────────────────────────────────────────────────────
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState("all");
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [teamDetail, setTeamDetail] = useState<TeamDetail | null>(null);
  const [teamDetailLoading, setTeamDetailLoading] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamSlug, setNewTeamSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  // ── Data loading ────────────────────────────────────────────────────────
  const loadAllData = useCallback(async () => {
    try {
      const [usersRes, teamsRes, analyticsRes] = await Promise.all([
        fetch("/api/admin/users?status=all"),
        fetch("/api/admin/teams"),
        fetch("/api/admin/analytics"),
      ]);
      if (!usersRes.ok || !teamsRes.ok) {
        setError(!usersRes.ok && usersRes.status === 403 ? "Access denied." : "Failed to load.");
        setLoading(false);
        return;
      }
      const usersData = await usersRes.json().catch(() => ({}));
      const teamsData = await teamsRes.json().catch(() => ({}));
      const analyticsData = analyticsRes.ok ? await analyticsRes.json().catch(() => null) : null;
      setAllUsers(Array.isArray(usersData?.users) ? usersData.users : []);
      setTeams(Array.isArray(teamsData?.teams) ? teamsData.teams : []);
      if (analyticsData) setAnalytics(analyticsData);
    } catch { setError("Network error."); }
    setLoading(false);
  }, []);

  const reloadUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users?status=all");
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setAllUsers(Array.isArray(data?.users) ? data.users : []);
      }
    } catch {}
  }, []);

  const reloadTeams = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/teams");
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setTeams(Array.isArray(data?.teams) ? data.teams : []);
      }
    } catch {}
  }, []);

  useEffect(() => { loadAllData(); }, [loadAllData]);

  useEffect(() => {
    if (!expandedTeamId) { setTeamDetail(null); return; }
    setTeamDetailLoading(true);
    Promise.all([
      fetch(`/api/admin/teams/${expandedTeamId}/members`).then(r => r.ok ? r.json() : { members: [], team: null }),
      fetch(`/api/admin/teams/${expandedTeamId}/requests?status=pending`).then(r => r.ok ? r.json() : { requests: [] }),
    ]).then(([m, r]) => {
      setTeamDetail({ team: m.team || null, members: m.members || [], requests: r.requests || [] });
      setTeamDetailLoading(false);
    }).catch(() => setTeamDetailLoading(false));
  }, [expandedTeamId]);

  // ── Client-side derived data ────────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    if (userFilter === "all") {
      const nonPending = allUsers.filter(u => safeStatus(u) !== "pending");
      const pending = allUsers.filter(u => safeStatus(u) === "pending");
      return [...nonPending, ...pending];
    }
    return allUsers.filter(u => safeStatus(u) === userFilter);
  }, [allUsers, userFilter]);

  const pendingUsers = useMemo(() => allUsers.filter(u => safeStatus(u) === "pending"), [allUsers]);
  const activeTeams = useMemo(() => teams.filter(t => t.active === true), [teams]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const executeAction = async () => {
    if (!pendingAction) return;
    setActioning(pendingAction.id);
    setPendingAction(null);
    try {
      if (pendingAction.type === "user") {
        const res = await fetch("/api/admin/users", { method: pendingAction.action === "suspend" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: pendingAction.id, action: pendingAction.action }) });
        if (res.ok) {
          setAllUsers(prev => prev.map(u => u.id === pendingAction.id ? { ...u, approvalStatus: pendingAction.action === "approve" ? "approved" : pendingAction.action === "reject" ? "rejected" : u.approvalStatus } : u));
        }
      } else if (pendingAction.type === "team-role" && pendingAction.teamId) {
        await fetch(`/api/admin/teams/${pendingAction.teamId}/members`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ membershipId: pendingAction.id, role: pendingAction.action }) });
      } else if (pendingAction.type === "team-deactivate" && pendingAction.teamId) {
        await fetch(`/api/admin/teams/${pendingAction.teamId}/members`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ membershipId: pendingAction.id }) });
      } else if (pendingAction.type === "team-request" && pendingAction.teamId) {
        await fetch(`/api/admin/teams/${pendingAction.teamId}/requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: pendingAction.id, action: pendingAction.action }) });
      }
    } catch {}
    setActioning(null);
    if (pendingAction.teamId && expandedTeamId === pendingAction.teamId) { setExpandedTeamId(null); setTimeout(() => setExpandedTeamId(pendingAction.teamId!), 50); }
    if (pendingAction.type === "user") reloadUsers();
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim() || !newTeamSlug.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/teams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newTeamName.trim(), slug: newTeamSlug.trim() }) });
      if (res.ok) { setNewTeamName(""); setNewTeamSlug(""); setShowCreateTeam(false); reloadTeams(); }
      else { const d = await res.json().catch(() => ({})); setError(d?.error?.message || "Failed to create team."); }
    } catch { setError("Network error."); }
    setCreating(false);
  };

  // ── ConfirmDialog helpers ───────────────────────────────────────────────
  const confirmTitle = () => {
    if (!pendingAction) return "";
    if (pendingAction.type === "user") return `${pendingAction.action.charAt(0).toUpperCase() + pendingAction.action.slice(1)} ${pendingAction.name}?`;
    if (pendingAction.type === "team-deactivate") return `Remove ${pendingAction.name}?`;
    if (pendingAction.type === "team-role") return `Change role for ${pendingAction.name}?`;
    if (pendingAction.type === "team-request") return `${pendingAction.action === "approve" ? "Approve" : "Reject"} ${pendingAction.name}?`;
    return "Confirm?";
  };
  const confirmVariant = () => {
    if (!pendingAction) return "default" as const;
    if (pendingAction.action === "reject" || pendingAction.action === "suspend" || pendingAction.type === "team-deactivate") return "destructive" as const;
    return "default" as const;
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <>
      {loading ? (
        <div className="space-y-3">
          <SkeletonStats count={6} />
          <div className="grid lg:grid-cols-2 gap-3"><SkeletonCard lines={4} /><SkeletonCard lines={3} /></div>
        </div>
      ) : error ? (
        <div className="rounded-md border p-3" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--accent-pink)" }}>
          <p className="text-[11px]" style={{ color: "var(--accent-pink)" }}>{error}</p>
          <div className="flex gap-1.5 mt-2">
            <button onClick={() => { setError(null); loadAllData(); }} className="text-[9px] px-2 py-1 rounded font-medium cursor-pointer" style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>RETRY</button>
            <a href="/login" className="text-[9px] px-2 py-1 rounded" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>Sign in →</a>
          </div>
        </div>
      ) : (
        <>
          {/* Layer 1: Executive Overview */}
          <AdminKPIStrip
            pendingCount={pendingUsers.length}
            activeTeams={activeTeams.length}
            analytics={analytics}
          />

          {/* Layer 2 + 3: Operations + Intelligence */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-3">
            {/* Left: Operations */}
            <div className="space-y-3">
              <AdminUsersTable
                allUsers={allUsers}
                filteredUsers={filteredUsers}
                pendingCount={pendingUsers.length}
                userFilter={userFilter}
                setUserFilter={setUserFilter}
                onApprove={(u) => setPendingAction({ type: "user", id: u.id, action: "approve", name: safeName(u) })}
                onReject={(u) => setPendingAction({ type: "user", id: u.id, action: "reject", name: safeName(u) })}
                onSuspend={(u) => setPendingAction({ type: "user", id: u.id, action: "suspend", name: safeName(u) })}
                actioning={actioning}
              />

              <AdminTeamsDirectory
                teams={teams}
                expandedTeamId={expandedTeamId}
                setExpandedTeamId={setExpandedTeamId}
                teamDetail={teamDetail}
                teamDetailLoading={teamDetailLoading}
                showCreateTeam={showCreateTeam}
                setShowCreateTeam={setShowCreateTeam}
                newTeamName={newTeamName}
                setNewTeamName={setNewTeamName}
                newTeamSlug={newTeamSlug}
                setNewTeamSlug={setNewTeamSlug}
                creating={creating}
                handleCreateTeam={handleCreateTeam}
                onRoleChange={(id, teamId, role, name) => setPendingAction({ type: "team-role", id, teamId, action: role, name })}
                onDeactivate={(id, teamId, name) => setPendingAction({ type: "team-deactivate", id, teamId, action: "deactivate", name })}
                onRequestApprove={(id, teamId, name) => setPendingAction({ type: "team-request", id, teamId, action: "approve", name })}
                onRequestReject={(id, teamId, name) => setPendingAction({ type: "team-request", id, teamId, action: "reject", name })}
                actioning={actioning}
              />
            </div>

            {/* Right: Intelligence */}
            <div>
              {analytics ? (
                <AdminInsightsPanel data={analytics} />
              ) : (
                <SkeletonCard lines={6} />
              )}
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!pendingAction}
        onClose={() => setPendingAction(null)}
        onConfirm={executeAction}
        title={confirmTitle()}
        description="This action will take effect immediately."
        confirmLabel={pendingAction?.action?.toUpperCase() || "CONFIRM"}
        variant={confirmVariant()}
      />
    </>
  );
}
