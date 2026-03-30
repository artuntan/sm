"use client";

import { useState, useEffect } from "react";

export function TeamSelectScreen({ onSignOut, onRefresh }: { onSignOut: () => void; onRefresh: () => void }) {
  const [teams, setTeams] = useState<{ id: string; slug: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [requested, setRequested] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/teams").then(r => r.json()).then(d => {
      setTeams(d.teams || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleJoinRequest = async (teamId: string) => {
    setRequesting(teamId);
    const res = await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId }),
    });
    if (res.ok) {
      setRequested(teamId);
    }
    setRequesting(null);
  };

  if (requested) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="text-center max-w-md animate-fade-in">
          <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: "var(--accent-green-glow)", border: "1px solid var(--border-accent)" }}>
            <span className="text-lg">📋</span>
          </div>
          <h1 className="text-xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Request Submitted</h1>
          <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
            Your team join request has been submitted. A team admin must approve it before you can access the workspace.
          </p>
          <button
            onClick={onRefresh}
            className="px-4 py-2 rounded-md text-xs font-medium"
            style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}
          >
            CHECK STATUS
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Select Team</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Choose a team to join. A team admin must approve your request.
          </p>
        </div>
        {loading ? (
          <p className="text-center text-sm" style={{ color: "var(--text-muted)" }}>Loading teams...</p>
        ) : (
          <div className="space-y-3">
            {teams.map(t => (
              <div
                key={t.id}
                className="rounded-md border p-4 flex items-center justify-between"
                style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{t.name}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{t.slug}</p>
                </div>
                <button
                  onClick={() => handleJoinRequest(t.id)}
                  disabled={requesting === t.id}
                  className="px-4 py-1.5 rounded-md text-xs font-medium transition-all"
                  style={{
                    backgroundColor: "var(--accent-green)",
                    color: "var(--text-inverse)",
                    fontFamily: "var(--font-mono)",
                    opacity: requesting === t.id ? 0.6 : 1,
                  }}
                >
                  {requesting === t.id ? "REQUESTING..." : "REQUEST ACCESS"}
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="text-center mt-4">
          <button
            onClick={onSignOut}
            className="text-xs" style={{ color: "var(--text-muted)" }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
