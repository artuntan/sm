"use client";

/**
 * Team Admin — Join Request Management Page
 *
 * Uses ConfirmDialog for approve/reject instead of alert().
 */

import { useState, useEffect } from "react";

import { SkeletonCard } from "@/app/components/ui/Skeleton";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";

type JoinRequest = {
  id: string;
  userId: string;
  teamId: string;
  status: string;
  createdAt: string;
  userName: string;
  userEmail: string;
};

type PendingAction = { requestId: string; action: "approve" | "reject"; userName: string } | null;

export default function AdminTeamPage() {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(data => { if (data.team?.teamId) setTeamId(data.team.teamId); });
  }, []);

  const loadRequests = async () => {
    if (!teamId) return;
    setLoading(true);
    const res = await fetch(`/api/admin/team-requests?teamId=${teamId}`);
    if (res.ok) {
      const data = await res.json();
      setRequests(data.requests || []);
    }
    setLoading(false);
  };

  useEffect(() => { if (teamId) loadRequests(); }, [teamId]);

  const executeAction = async () => {
    if (!pendingAction) return;
    const { requestId, action } = pendingAction;
    setActioning(requestId);
    setPendingAction(null);
    await fetch("/api/admin/team-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, action }),
    });
    setActioning(null);
    loadRequests();
  };

  return (
    <>
      <p className="text-xs font-medium mb-3" style={{ color: "var(--text-primary)" }}>Pending Join Requests</p>

      {loading ? (
        <div className="space-y-1.5">{[1, 2].map(i => <SkeletonCard key={i} lines={1} />)}</div>
      ) : requests.length === 0 ? (
        <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>No pending requests</p>
      ) : (
        <div className="space-y-1.5">
          {requests.map(r => (
            <div
              key={r.id}
              className="rounded-md border px-4 py-3 flex items-center justify-between"
              style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-subtle)" }}
            >
              <div>
                <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{r.userName}</p>
                <p className="text-[10px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{r.userEmail}</p>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setPendingAction({ requestId: r.id, action: "approve", userName: r.userName })}
                  disabled={actioning === r.id}
                  className="px-2.5 py-1 rounded-md text-[10px] font-medium"
                  style={{ backgroundColor: "var(--accent-green)", color: "var(--text-inverse)", fontFamily: "var(--font-mono)", opacity: actioning === r.id ? 0.6 : 1 }}
                >
                  APPROVE
                </button>
                <button
                  onClick={() => setPendingAction({ requestId: r.id, action: "reject", userName: r.userName })}
                  disabled={actioning === r.id}
                  className="px-2.5 py-1 rounded-md text-[10px] font-medium"
                  style={{ backgroundColor: "var(--accent-pink)", color: "#fff", fontFamily: "var(--font-mono)", opacity: actioning === r.id ? 0.6 : 1 }}
                >
                  REJECT
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingAction}
        onClose={() => setPendingAction(null)}
        onConfirm={executeAction}
        title={`${pendingAction?.action.toUpperCase()} request?`}
        description={`Are you sure you want to ${pendingAction?.action} ${pendingAction?.userName}'s join request?`}
        confirmLabel={pendingAction?.action.toUpperCase() || "CONFIRM"}
        variant={pendingAction?.action === "approve" ? "default" : "destructive"}
      />
    </>
  );
}
