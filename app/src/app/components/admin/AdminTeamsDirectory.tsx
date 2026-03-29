"use client";

/**
 * AdminTeamsDirectory — Organization Surface
 *
 * Structured team directory replacing the card-list.
 * Table-style rows with expandable detail panels.
 */

import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { SkeletonCard } from "@/app/components/ui/Skeleton";

type Team = {
  id: string;
  name?: string | null;
  slug?: string | null;
  active?: boolean | null;
  _count?: { members?: number | null } | null;
  memberCount?: number | null;
  admins?: { id: string; name: string; email: string }[];
};

type Member = {
  membershipId: string;
  userId: string;
  role: string;
  active: boolean;
  joinedAt: string;
  userName?: string | null;
  userEmail?: string | null;
};

type JoinRequest = {
  id: string;
  userId: string;
  teamId?: string;
  status: string;
  createdAt: string;
  userName?: string | null;
  userEmail?: string | null;
};

type TeamDetail = {
  team: { id: string; slug: string; name: string; active: boolean } | null;
  members: Member[];
  requests: JoinRequest[];
};

const safeTeamName = (t: Team) => t.name || "Unnamed";
const safeTeamSlug = (t: Team) => t.slug || "—";
const safeTeamActive = (t: Team) => t.active === true;
const safeMemberCount = (t: Team) => t.memberCount ?? t._count?.members ?? 0;

export function AdminTeamsDirectory({
  teams,
  expandedTeamId,
  setExpandedTeamId,
  teamDetail,
  teamDetailLoading,
  showCreateTeam,
  setShowCreateTeam,
  newTeamName,
  setNewTeamName,
  newTeamSlug,
  setNewTeamSlug,
  creating,
  handleCreateTeam,
  onRoleChange,
  onDeactivate,
  onRequestApprove,
  onRequestReject,
  actioning,
}: {
  teams: Team[];
  expandedTeamId: string | null;
  setExpandedTeamId: (id: string | null) => void;
  teamDetail: TeamDetail | null;
  teamDetailLoading: boolean;
  showCreateTeam: boolean;
  setShowCreateTeam: (v: boolean) => void;
  newTeamName: string;
  setNewTeamName: (v: string) => void;
  newTeamSlug: string;
  setNewTeamSlug: (v: string) => void;
  creating: boolean;
  handleCreateTeam: () => void;
  onRoleChange: (membershipId: string, teamId: string, newRole: string, name: string) => void;
  onDeactivate: (membershipId: string, teamId: string, name: string) => void;
  onRequestApprove: (requestId: string, teamId: string, name: string) => void;
  onRequestReject: (requestId: string, teamId: string, name: string) => void;
  actioning: string | null;
}) {
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
            TEAMS
          </span>
          <span
            className="text-[9px] tabular-nums"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            {teams.length}
          </span>
        </div>
        <button
          onClick={() => setShowCreateTeam(!showCreateTeam)}
          className="text-[8px] px-2 py-1 rounded font-semibold tracking-wider transition-all cursor-pointer"
          style={{
            backgroundColor: showCreateTeam ? "var(--bg-elevated)" : "var(--accent-green)",
            color: showCreateTeam ? "var(--text-muted)" : "var(--text-inverse)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {showCreateTeam ? "CANCEL" : "+ NEW TEAM"}
        </button>
      </div>

      {/* Create team form */}
      {showCreateTeam && (
        <div
          className="px-4 py-3"
          style={{ borderBottom: "1px solid var(--border-subtle)", backgroundColor: "var(--bg-secondary)" }}
        >
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Team Name"
              className="flex-1 rounded border px-2.5 py-1.5 text-[11px] bg-transparent"
              style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}
            />
            <input
              type="text"
              value={newTeamSlug}
              onChange={(e) => setNewTeamSlug(e.target.value)}
              placeholder="team-slug"
              className="flex-1 rounded border px-2.5 py-1.5 text-[11px] bg-transparent"
              style={{ borderColor: "var(--border-default)", color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
            />
            <button
              onClick={handleCreateTeam}
              disabled={creating || !newTeamName.trim() || !newTeamSlug.trim()}
              className="px-3 py-1.5 rounded text-[9px] font-semibold cursor-pointer transition-opacity hover:opacity-80"
              style={{
                backgroundColor: "var(--accent-green)",
                color: "var(--text-inverse)",
                fontFamily: "var(--font-mono)",
                opacity: creating ? 0.6 : 1,
              }}
            >
              {creating ? "..." : "CREATE"}
            </button>
          </div>
        </div>
      )}

      {/* Table header */}
      <div
        className="hidden sm:grid px-4 py-1.5"
        style={{
          gridTemplateColumns: "1fr 0.8fr 0.8fr auto auto",
          gap: "12px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        {["TEAM", "SLUG", "ADMIN", "MEMBERS", "STATUS"].map((h) => (
          <span
            key={h}
            className="text-[8px] font-semibold tracking-wider"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            {h}
          </span>
        ))}
      </div>

      {/* Team rows */}
      {teams.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>No teams</p>
        </div>
      ) : (
        <div>
          {teams.map((t) => {
            const mc = safeMemberCount(t);
            const isExp = expandedTeamId === t.id;
            return (
              <div key={t.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <button
                  data-no-press
                  onClick={() => setExpandedTeamId(isExp ? null : t.id)}
                  className="w-full text-left sm:grid px-4 py-2 flex items-center justify-between hover:opacity-90 cursor-pointer"
                  style={{
                    gridTemplateColumns: "1fr 0.8fr 0.8fr auto auto",
                    gap: "12px",
                  }}
                >
                  {/* Team name */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="text-[9px] transition-transform shrink-0"
                      style={{
                        color: "var(--text-muted)",
                        transform: isExp ? "rotate(90deg)" : "rotate(0deg)",
                      }}
                    >
                      ›
                    </span>
                    <span className="text-[11px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
                      {safeTeamName(t)}
                    </span>
                  </div>

                  {/* Slug */}
                  <span
                    className="text-[10px] truncate hidden sm:block"
                    style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                  >
                    {safeTeamSlug(t)}
                  </span>

                  {/* Admin */}
                  <span
                    className="text-[10px] truncate hidden sm:block"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {t.admins?.length ? t.admins.map((a) => a.name).join(", ") : "—"}
                  </span>

                  {/* Members */}
                  <span
                    className="text-[10px] tabular-nums text-right hidden sm:block"
                    style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
                  >
                    {mc}
                  </span>

                  {/* Status */}
                  <StatusBadge status={safeTeamActive(t) ? "active" : "inactive"} size="xs" />
                </button>

                {/* Expanded detail */}
                {isExp && (
                  <div
                    className="px-4 py-3"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                    }}
                  >
                    {teamDetailLoading ? (
                      <SkeletonCard lines={2} />
                    ) : teamDetail ? (
                      <div className="space-y-3">
                        {/* Pending requests */}
                        {teamDetail.requests.length > 0 && (
                          <div>
                            <p
                              className="text-[8px] font-semibold tracking-wider mb-1.5"
                              style={{ color: "var(--accent-green)", fontFamily: "var(--font-mono)" }}
                            >
                              PENDING REQUESTS ({teamDetail.requests.length})
                            </p>
                            <div className="space-y-1">
                              {teamDetail.requests.map((r) => (
                                <div
                                  key={r.id}
                                  className="flex items-center justify-between py-1.5 px-2.5 rounded"
                                  style={{
                                    backgroundColor: "var(--bg-card)",
                                    borderLeft: "2px solid var(--accent-green)",
                                  }}
                                >
                                  <span className="text-[10px] font-medium" style={{ color: "var(--text-primary)" }}>
                                    {r.userName || r.userEmail || "Unknown"}
                                  </span>
                                  <div className="flex gap-1 shrink-0">
                                    <button
                                      onClick={() => onRequestApprove(r.id, t.id, r.userName || "user")}
                                      className="text-[8px] px-1.5 py-0.5 rounded font-semibold cursor-pointer transition-opacity hover:opacity-80"
                                      style={{ backgroundColor: "var(--accent-green)", color: "var(--text-inverse)" }}
                                    >
                                      APPROVE
                                    </button>
                                    <button
                                      onClick={() => onRequestReject(r.id, t.id, r.userName || "user")}
                                      className="text-[8px] px-1.5 py-0.5 rounded font-semibold cursor-pointer transition-opacity hover:opacity-80"
                                      style={{ backgroundColor: "var(--accent-pink)", color: "#fff" }}
                                    >
                                      REJECT
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Members */}
                        <div>
                          <p
                            className="text-[8px] font-semibold tracking-wider mb-1.5"
                            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                          >
                            MEMBERS ({teamDetail.members.length})
                          </p>
                          {teamDetail.members.length === 0 ? (
                            <p className="text-[9px] py-1" style={{ color: "var(--text-muted)" }}>
                              No members
                            </p>
                          ) : (
                            <div className="space-y-1">
                              {teamDetail.members.map((m) => (
                                <div
                                  key={m.membershipId}
                                  className="flex items-center justify-between py-1.5 px-2.5 rounded"
                                  style={{
                                    backgroundColor: "var(--bg-card)",
                                    opacity: m.active ? 1 : 0.5,
                                  }}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span
                                      className="text-[10px] font-medium truncate"
                                      style={{ color: "var(--text-primary)" }}
                                    >
                                      {m.userName || m.userEmail || "Unknown"}
                                    </span>
                                    <StatusBadge status={m.role === "team_admin" ? "team_admin" : "member"} size="xs" />
                                  </div>
                                  {m.active && (
                                    <div className="flex gap-1 shrink-0">
                                      <button
                                        onClick={() =>
                                          onRoleChange(
                                            m.membershipId,
                                            t.id,
                                            m.role === "team_admin" ? "member" : "team_admin",
                                            m.userName || "member"
                                          )
                                        }
                                        className="text-[8px] px-1.5 py-0.5 rounded font-semibold cursor-pointer transition-opacity hover:opacity-80"
                                        style={{
                                          backgroundColor: "var(--bg-elevated)",
                                          color: "var(--text-secondary)",
                                          fontFamily: "var(--font-mono)",
                                          border: "1px solid var(--border-subtle)",
                                        }}
                                      >
                                        {m.role === "team_admin" ? "DEMOTE" : "PROMOTE"}
                                      </button>
                                      <button
                                        onClick={() => onDeactivate(m.membershipId, t.id, m.userName || "member")}
                                        className="text-[8px] px-1.5 py-0.5 rounded font-semibold cursor-pointer transition-opacity hover:opacity-80"
                                        style={{
                                          backgroundColor: "var(--bg-elevated)",
                                          color: "var(--accent-pink)",
                                          fontFamily: "var(--font-mono)",
                                          border: "1px solid var(--border-subtle)",
                                        }}
                                      >
                                        REMOVE
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[9px] py-1" style={{ color: "var(--accent-pink)" }}>
                        Failed to load.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
