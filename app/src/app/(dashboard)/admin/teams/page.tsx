"use client";

/**
 * System Admin — Team Directory
 *
 * Lists all teams. Uses PageShell + Skeleton.
 */

import { useState, useEffect } from "react";

import { SkeletonCard } from "@/app/components/ui/Skeleton";
import { StatusBadge } from "@/app/components/ui/StatusBadge";

type TeamRow = {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  memberCount: number;
  admins: { id: string; name: string; email: string }[];
};

export default function AdminTeamsPage() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");

  const loadTeams = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/teams");
      if (!res.ok) { setError(res.status === 403 ? "Access denied." : "Failed to load teams."); setLoading(false); return; }
      const data = await res.json();
      setTeams(data.teams || []);
    } catch { setError("Network error."); }
    setLoading(false);
  };

  useEffect(() => { loadTeams(); }, []);

  const handleCreate = async () => {
    if (!newName.trim() || !newSlug.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), slug: newSlug.trim() }),
      });
      if (res.ok) { setNewName(""); setNewSlug(""); loadTeams(); }
      else {
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message || "Failed to create team.");
      }
    } catch { setError("Network error."); }
    setCreating(false);
  };

  return (
    <>
      {/* Create */}
      <div className="rounded-md border p-4 mb-4" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-subtle)" }}>
        <p className="text-[9px] tracking-wider mb-2" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>CREATE NEW TEAM</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Team Name"
            className="flex-1 rounded-md border px-2.5 py-1.5 text-xs bg-transparent"
            style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}
          />
          <input
            type="text" value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="team-slug"
            className="flex-1 rounded-md border px-2.5 py-1.5 text-xs bg-transparent"
            style={{ borderColor: "var(--border-default)", color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
          />
          <button
            onClick={handleCreate} disabled={creating || !newName.trim() || !newSlug.trim()}
            className="px-3 py-1.5 rounded-md text-[10px] font-medium transition-all"
            style={{ backgroundColor: "var(--accent-green)", color: "var(--text-inverse)", fontFamily: "var(--font-mono)", opacity: creating ? 0.6 : 1 }}
          >
            {creating ? "CREATING..." : "CREATE"}
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-1.5">{[1, 2, 3].map(i => <SkeletonCard key={i} lines={1} />)}</div>
      ) : error ? (
        <div className="rounded-md border p-4" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--accent-pink)" }}>
          <p className="text-xs" style={{ color: "var(--accent-pink)" }}>{error}</p>
        </div>
      ) : teams.length === 0 ? (
        <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>No teams found</p>
      ) : (
        <div className="space-y-1.5">
          {teams.map((t) => (
            <a
              key={t.id}
              href={`/admin/teams/${t.id}`}
              className="rounded-md border px-4 py-3 flex items-center justify-between transition-all hover:border-[var(--border-strong)] block"
              style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-subtle)" }}
            >
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{t.name}</p>
                  <StatusBadge status={t.active ? "active" : "inactive"} size="xs" />
                </div>
                <p className="text-[10px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  {t.slug}{t.admins.length > 0 && ` · ${t.admins.map(a => a.name).join(", ")}`}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{t.memberCount}</p>
                <p className="text-[9px] tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>MEMBERS</p>
              </div>
            </a>
          ))}
        </div>
      )}
    </>
  );
}
