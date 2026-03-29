"use client";

/**
 * AdminUsersTable — Operations Queue
 *
 * Table-based user management with proper column alignment,
 * deliberate action weighting, and client-side filtering.
 */

import { StatusBadge } from "@/app/components/ui/StatusBadge";

type User = {
  id: string;
  name?: string | null;
  email?: string | null;
  approvalStatus?: string | null;
  systemRole?: string | null;
  createdAt?: string | null;
};

const safeName = (u: User) => u.name || u.email || "Unknown";
const safeEmail = (u: User) => u.email || "—";
const safeStatus = (u: User) => u.approvalStatus || "unknown";
const safeRole = (u: User) => u.systemRole || "user";

export function AdminUsersTable({
  allUsers,
  filteredUsers,
  pendingCount,
  userFilter,
  setUserFilter,
  onApprove,
  onReject,
  onSuspend,
  actioning,
}: {
  allUsers: User[];
  filteredUsers: User[];
  pendingCount: number;
  userFilter: string;
  setUserFilter: (f: string) => void;
  onApprove: (u: User) => void;
  onReject: (u: User) => void;
  onSuspend: (u: User) => void;
  actioning: string | null;
}) {
  const filters = ["all", "pending", "approved", "rejected"];

  return (
    <div
      className="rounded-md border overflow-hidden"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-subtle)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-semibold tracking-wider"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
          >
            USERS
          </span>
          <span
            className="text-[9px] tabular-nums"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            {allUsers.length}
          </span>
          {pendingCount > 0 && (
            <span
              className="text-[8px] px-1.5 py-0.5 rounded font-medium"
              style={{
                backgroundColor: "var(--accent-green-glow)",
                color: "var(--accent-green)",
                border: "1px solid var(--border-accent)",
              }}
            >
              {pendingCount} pending
            </span>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-0.5">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setUserFilter(f)}
              className="px-2 py-1 rounded text-[8px] font-semibold transition-all cursor-pointer"
              style={{
                backgroundColor: userFilter === f ? "var(--bg-elevated)" : "transparent",
                color: userFilter === f ? "var(--text-primary)" : "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                border: userFilter === f ? "1px solid var(--border-subtle)" : "1px solid transparent",
              }}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Table header — fixed px column widths for stable alignment */}
      <div
        className="hidden sm:grid px-4 py-1.5"
        style={{
          gridTemplateColumns: "160px 1fr auto auto",
          gap: "16px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        {["NAME", "EMAIL", "ROLE", "ACTIONS"].map((h) => (
          <span
            key={h}
            className="text-[8px] font-semibold tracking-wider"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            {h}
          </span>
        ))}
      </div>

      {/* Rows */}
      {filteredUsers.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            No users with status &quot;{userFilter}&quot;
          </p>
        </div>
      ) : (
        <div>
          {filteredUsers.map((u) => {
            const isPending = safeStatus(u) === "pending";
            const isApproved = safeStatus(u) === "approved";
            const isRejected = safeStatus(u) === "rejected";
            return (
              <div
                key={u.id}
                className="sm:grid px-4 py-2 flex flex-col gap-1 sm:items-center transition-colors"
                style={{
                  gridTemplateColumns: "160px 1fr auto auto",
                  gap: "16px",
                  borderBottom: "1px solid var(--border-subtle)",
                  opacity: actioning === u.id ? 0.5 : 1,
                }}
              >
                {/* Name — fixed width column */}
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-semibold shrink-0"
                    style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)" }}
                  >
                    {safeName(u)[0].toUpperCase()}
                  </span>
                  <span
                    className="text-[11px] font-medium truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {safeName(u)}
                  </span>
                </div>

                {/* Email — takes remaining space, perfectly aligned */}
                <span
                  className="text-[10px] truncate"
                  style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                >
                  {safeEmail(u)}
                </span>

                {/* Role — only show role badge; hide status for approved (quiet default) */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <StatusBadge status={safeRole(u)} size="xs" />
                  {isPending && <StatusBadge status="pending" size="xs" />}
                  {isRejected && <StatusBadge status="rejected" size="xs" />}
                </div>

                {/* Actions */}
                <div className="flex gap-1 shrink-0">
                  {isPending && (
                    <>
                      <button
                        onClick={() => onApprove(u)}
                        disabled={actioning === u.id}
                        className="text-[8px] px-2 py-1 rounded font-semibold tracking-wider cursor-pointer transition-opacity hover:opacity-80"
                        style={{
                          backgroundColor: "var(--accent-green)",
                          color: "var(--text-inverse)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        APPROVE
                      </button>
                      <button
                        onClick={() => onReject(u)}
                        disabled={actioning === u.id}
                        className="text-[8px] px-2 py-1 rounded font-semibold tracking-wider cursor-pointer transition-opacity hover:opacity-80"
                        style={{
                          backgroundColor: "var(--accent-pink)",
                          color: "#fff",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        REJECT
                      </button>
                    </>
                  )}
                  {isApproved && (
                    <button
                      onClick={() => onSuspend(u)}
                      disabled={actioning === u.id}
                      className="text-[8px] px-2 py-1 rounded font-semibold tracking-wider cursor-pointer transition-opacity hover:opacity-80"
                      style={{
                        backgroundColor: "var(--bg-elevated)",
                        color: "var(--accent-pink)",
                        fontFamily: "var(--font-mono)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      SUSPEND
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
