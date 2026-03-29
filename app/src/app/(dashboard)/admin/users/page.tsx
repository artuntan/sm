"use client";

/**
 * System Admin — User Management Page
 *
 * Lists users with approve/reject/suspend using ConfirmDialog.
 */

import { useState, useEffect } from "react";

import { SkeletonCard } from "@/app/components/ui/Skeleton";
import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";

type UserRow = {
  id: string;
  name: string;
  email: string;
  systemRole: string;
  approvalStatus: string;
  createdAt: string;
};

type PendingAction = {
  userId: string;
  action: "approve" | "reject" | "suspend";
  userName: string;
} | null;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("pending");
  const [actioning, setActioning] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users?status=${filter}`);
      if (res.status === 401) { setError("Not authenticated."); setLoading(false); return; }
      if (res.status === 403) { setError("Access denied. System admin required."); setLoading(false); return; }
      if (!res.ok) { setError(`Failed to load (HTTP ${res.status}).`); setLoading(false); return; }
      const data = await res.json();
      setUsers(data.users || []);
    } catch { setError("Network error."); }
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, [filter]);

  const executeAction = async () => {
    if (!pendingAction) return;
    const { userId, action } = pendingAction;
    setActioning(userId);
    setPendingAction(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(`Action failed: ${data?.error?.message || `HTTP ${res.status}`}`);
      }
    } catch { setError("Network error."); }
    setActioning(null);
    loadUsers();
  };

  return (
    <>
      {/* Filter tabs */}
      <div className="flex gap-1 mb-4">
        {["pending", "approved", "rejected", "all"].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className="px-2.5 py-1 rounded-md text-[10px] font-medium transition-all"
            style={{
              backgroundColor: filter === s ? "var(--bg-elevated)" : "transparent",
              color: filter === s ? "var(--text-primary)" : "var(--text-muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {s.toUpperCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-1.5">{[1, 2, 3].map(i => <SkeletonCard key={i} lines={1} />)}</div>
      ) : error ? (
        <div className="rounded-md border p-4" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--accent-pink)" }}>
          <p className="text-xs font-medium mb-1" style={{ color: "var(--accent-pink)" }}>Error</p>
          <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>{error}</p>
          <div className="flex gap-2">
            <button onClick={() => { setError(null); loadUsers(); }} className="px-2.5 py-1 rounded-md text-[10px] font-medium" style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>RETRY</button>
          </div>
        </div>
      ) : users.length === 0 ? (
        <p className="text-xs py-8 text-center" style={{ color: "var(--text-muted)" }}>No users with status &quot;{filter}&quot;</p>
      ) : (
        <div className="space-y-1.5">
          {users.map(u => (
            <div
              key={u.id}
              className="rounded-md border px-4 py-3 flex items-center justify-between"
              style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-subtle)" }}
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{u.name}</p>
                  <StatusBadge status={u.approvalStatus} size="xs" />
                  <StatusBadge status={u.systemRole} size="xs" />
                </div>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{u.email}</p>
              </div>
              <div className="flex gap-1.5">
                {u.approvalStatus === "pending" && (
                  <>
                    <button
                      onClick={() => setPendingAction({ userId: u.id, action: "approve", userName: u.name })}
                      disabled={actioning === u.id}
                      className="px-2.5 py-1 rounded-md text-[10px] font-medium"
                      style={{ backgroundColor: "var(--accent-green)", color: "var(--text-inverse)", fontFamily: "var(--font-mono)", opacity: actioning === u.id ? 0.6 : 1 }}
                    >
                      APPROVE
                    </button>
                    <button
                      onClick={() => setPendingAction({ userId: u.id, action: "reject", userName: u.name })}
                      disabled={actioning === u.id}
                      className="px-2.5 py-1 rounded-md text-[10px] font-medium"
                      style={{ backgroundColor: "var(--accent-pink)", color: "#fff", fontFamily: "var(--font-mono)", opacity: actioning === u.id ? 0.6 : 1 }}
                    >
                      REJECT
                    </button>
                  </>
                )}
                {u.approvalStatus === "approved" && (
                  <button
                    onClick={() => setPendingAction({ userId: u.id, action: "suspend", userName: u.name })}
                    disabled={actioning === u.id}
                    className="px-2.5 py-1 rounded-md text-[10px] font-medium"
                    style={{ backgroundColor: "var(--bg-elevated)", color: "var(--accent-pink)", fontFamily: "var(--font-mono)", opacity: actioning === u.id ? 0.6 : 1 }}
                  >
                    SUSPEND
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={!!pendingAction}
        onClose={() => setPendingAction(null)}
        onConfirm={executeAction}
        title={`${pendingAction?.action.toUpperCase()} user?`}
        description={`Are you sure you want to ${pendingAction?.action} ${pendingAction?.userName}?`}
        confirmLabel={pendingAction?.action.toUpperCase() || "CONFIRM"}
        variant={pendingAction?.action === "approve" ? "default" : "destructive"}
      />
    </>
  );
}
