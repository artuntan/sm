"use client";

export function PendingApprovalScreen({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="text-center max-w-md animate-fade-in">
        <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: "var(--accent-green-glow)", border: "1px solid var(--border-accent)" }}>
          <span className="text-lg">⏳</span>
        </div>
        <h1 className="text-xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Awaiting Approval</h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
          Your account has been created. A system administrator must approve your access before you can use the workspace.
        </p>
        <button
          onClick={onSignOut}
          className="px-4 py-2 rounded-md text-xs font-medium"
          style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}
        >
          SIGN OUT
        </button>
      </div>
    </div>
  );
}
