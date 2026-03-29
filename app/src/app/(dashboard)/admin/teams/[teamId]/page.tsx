"use client";

/**
 * System Admin — Team Detail Page
 *
 * Members + role management + join requests.
 * Uses ConfirmDialog for deactivate/promote/demote.
 */

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

import { SkeletonCard } from "@/app/components/ui/Skeleton";
import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";

type Member = {
  membershipId: string;
  userId: string;
  role: string;
  active: boolean;
  joinedAt: string;
  userName: string;
  userEmail: string;
};

type JoinRequest = {
  id: string;
  userId: string;
  status: string;
  createdAt: string;
  userName: string;
  userEmail: string;
};

type TeamInfo = { id: string; slug: string; name: string; active: boolean };

type PendingAction = {
  type: "role" | "deactivate" | "request";
  id: string;
  action: string;
  name: string;
} | null;

export default function AdminTeamDetailPage() {
  const params = useParams();
  const teamId = params.teamId as string;

  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [membersRes, requestsRes] = await Promise.all([
        fetch(`/api/admin/teams/${teamId}/members`),
        fetch(`/api/admin/teams/${teamId}/requests?status=pending`),
      ]);
      if (!membersRes.ok) { setError(membersRes.status === 403 ? "Access denied." : "Failed to load."); setLoading(false); return; }
      const membersData = await membersRes.json();
      const requestsData = requestsRes.ok ? await requestsRes.json() : { requests: [] };
      setTeam(membersData.team);
      setMembers(membersData.members || []);
      setRequests(requestsData.requests || []);
    } catch { setError("Network error."); }
    setLoading(false);
  };

  useEffect(() => { if (teamId) loadData(); }, [teamId]);

  const executeAction = async () => {
    if (!pendingAction) return;
    setActioning(pendingAction.id);
    setPendingAction(null);

    if (pendingAction.type === "role") {
      await fetch(`/api/admin/teams/${teamId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: pendingAction.id, role: pendingAction.action }),
      });
    } else if (pendingAction.type === "deactivate") {
      await fetch(`/api/admin/teams/${teamId}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: pendingAction.id }),
      });
    } else if (pendingAction.type === "request") {
      await fetch(`/api/admin/teams/${teamId}/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: pendingAction.id, action: pendingAction.action }),
      });
    }

    setActioning(null);
    loadData();
  };

  const confirmTitle = () => {
    if (!pendingAction) return "";
    if (pendingAction.type === "deactivate") return `Deactivate ${pendingAction.name}?`;
    if (pendingAction.type === "role") return `Change role for ${pendingAction.name}?`;
    return `${pendingAction.action === "approve" ? "Approve" : "Reject"} ${pendingAction.name}?`;
  };

  return (
    <>
      {loading ? (
        <div className="space-y-3"><SkeletonCard lines={1} /><SkeletonCard lines={3} /></div>
      ) : error ? (
        <div className="rounded-md border p-4" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--accent-pink)" }}>
          <p className="text-xs" style={{ color: "var(--accent-pink)" }}>{error}</p>
        </div>
      ) : (
        <>
          {/* Team Info */}
          <div className="rounded-md border px-4 py-3 mb-4 flex items-center justify-between" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-subtle)" }}>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{team?.name}</p>
              <p className="text-[10px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{team?.slug}</p>
            </div>
            <StatusBadge status={team?.active ? "active" : "inactive"} />
          </div>

          {/* Pending Requests */}
          {requests.length > 0 && (
            <div className="mb-4">
              <p className="text-[9px] tracking-wider mb-2" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                PENDING REQUESTS ({requests.length})
              </p>
              <div className="space-y-1.5">
                {requests.map((r) => (
                  <div key={r.id} className="rounded-md border px-4 py-3 flex items-center justify-between" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--accent-green)", borderStyle: "dashed" }}>
                    <div>
                      <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{r.userName}</p>
                      <p className="text-[10px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{r.userEmail}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => setPendingAction({ type: "request", id: r.id, action: "approve", name: r.userName })} disabled={actioning === r.id} className="px-2.5 py-1 rounded-md text-[10px] font-medium" style={{ backgroundColor: "var(--accent-green)", color: "var(--text-inverse)", fontFamily: "var(--font-mono)", opacity: actioning === r.id ? 0.6 : 1 }}>APPROVE</button>
                      <button onClick={() => setPendingAction({ type: "request", id: r.id, action: "reject", name: r.userName })} disabled={actioning === r.id} className="px-2.5 py-1 rounded-md text-[10px] font-medium" style={{ backgroundColor: "var(--accent-pink)", color: "#fff", fontFamily: "var(--font-mono)", opacity: actioning === r.id ? 0.6 : 1 }}>REJECT</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Members */}
          <p className="text-[9px] tracking-wider mb-2" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>MEMBERS ({members.length})</p>
          {members.length === 0 ? (
            <p className="text-xs py-4 text-center" style={{ color: "var(--text-muted)" }}>No members yet</p>
          ) : (
            <div className="space-y-1.5">
              {members.map((m) => (
                <div
                  key={m.membershipId}
                  className="rounded-md border px-4 py-3 flex items-center justify-between"
                  style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-subtle)", opacity: m.active ? 1 : 0.5 }}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{m.userName}</p>
                      <StatusBadge status={m.role === "team_admin" ? "team_admin" : "member"} size="xs" />
                      {!m.active && <StatusBadge status="inactive" size="xs" />}
                    </div>
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{m.userEmail}</p>
                  </div>
                  {m.active && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setPendingAction({ type: "role", id: m.membershipId, action: m.role === "team_admin" ? "member" : "team_admin", name: m.userName })}
                        disabled={actioning === m.membershipId}
                        className="px-2.5 py-1 rounded-md text-[10px] font-medium"
                        style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", opacity: actioning === m.membershipId ? 0.6 : 1 }}
                      >
                        {m.role === "team_admin" ? "DEMOTE" : "PROMOTE"}
                      </button>
                      <button
                        onClick={() => setPendingAction({ type: "deactivate", id: m.membershipId, action: "deactivate", name: m.userName })}
                        disabled={actioning === m.membershipId}
                        className="px-2.5 py-1 rounded-md text-[10px] font-medium"
                        style={{ backgroundColor: "var(--bg-elevated)", color: "var(--accent-pink)", fontFamily: "var(--font-mono)", opacity: actioning === m.membershipId ? 0.6 : 1 }}
                      >
                        DEACTIVATE
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!pendingAction}
        onClose={() => setPendingAction(null)}
        onConfirm={executeAction}
        title={confirmTitle()}
        description="This action will take effect immediately."
        confirmLabel="CONFIRM"
        variant={pendingAction?.type === "deactivate" || pendingAction?.action === "reject" ? "destructive" : "default"}
      />
    </>
  );
}
