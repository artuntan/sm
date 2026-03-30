"use client";

/**
 * Signup Page — Sharp auth card
 */

import { useState } from "react";
import { signUp } from "@/lib/auth/client";
import { useRouter } from "next/navigation";
import { TypeOfMark } from "@/app/components/ui/TypeOfBrand";

function BlurredProductSkeleton() {
  return (
    <div className="auth-blur-bg" aria-hidden>
      <div style={{ backgroundColor: "var(--bg-primary)", minHeight: "100vh" }}>
        <div className="border-b" style={{ borderColor: "var(--border-subtle)", padding: "10px 20px" }}>
          <div className="flex items-center gap-2 max-w-[1200px] mx-auto">
            <div className="h-3 rounded" style={{ width: "24px", backgroundColor: "var(--bg-elevated)" }} />
            <div className="h-2.5 rounded" style={{ width: "60px", backgroundColor: "var(--bg-elevated)" }} />
          </div>
        </div>
        <div className="max-w-[1200px] mx-auto px-4 py-6">
          <div className="rounded-md border p-4 mb-4" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-shell)" }}>
            <div className="h-5 rounded mb-2" style={{ width: "80px", backgroundColor: "var(--accent-green-glow)" }} />
            <div className="h-2.5 rounded" style={{ width: "55%", backgroundColor: "var(--bg-elevated)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signUp.email({ name, email, password });
      if (result.error) {
        setError(result.error.message || "Sign up failed.");
      } else {
        router.push("/");
      }
    } catch {
      setError("Sign up failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative" style={{ backgroundColor: "var(--bg-primary)" }}>
      <BlurredProductSkeleton />

      <div
        className="relative z-10 w-full max-w-sm rounded-md border p-6 modal-panel"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-default)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
        }}
      >
        <div className="flex items-center gap-2 mb-5">
          <TypeOfMark size={16} />
          <span
            className="text-[10px] font-semibold tracking-wider"
            style={{ color: "var(--typeof-brand)", fontFamily: "var(--font-mono)" }}
          >
            type of
          </span>
        </div>

        <h1 className="text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
          Create Account
        </h1>
        <p className="text-[11px] mb-5" style={{ color: "var(--text-muted)" }}>
          Sign up to request workspace access. An admin must approve your account.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-[9px] font-semibold mb-1 tracking-widest" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              NAME
            </label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)} required
              className="w-full rounded border px-2.5 py-2 text-[12px] outline-none"
              style={{ backgroundColor: "var(--bg-input)", borderColor: "var(--border-default)", color: "var(--text-primary)" }}
            />
          </div>

          <div>
            <label className="block text-[9px] font-semibold mb-1 tracking-widest" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              EMAIL
            </label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full rounded border px-2.5 py-2 text-[12px] outline-none"
              style={{ backgroundColor: "var(--bg-input)", borderColor: "var(--border-default)", color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
            />
          </div>

          <div>
            <label className="block text-[9px] font-semibold mb-1 tracking-widest" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              PASSWORD
            </label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
              className="w-full rounded border px-2.5 py-2 text-[12px] outline-none"
              style={{ backgroundColor: "var(--bg-input)", borderColor: "var(--border-default)", color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
            />
          </div>

          {error && (
            <p className="text-[11px]" style={{ color: "var(--accent-pink)" }}>{error}</p>
          )}

          <button
            type="submit" disabled={loading}
            className="w-full py-2 rounded text-[10px] font-semibold tracking-wider transition-all"
            style={{ backgroundColor: "var(--accent-green)", color: "var(--text-inverse)", fontFamily: "var(--font-mono)", opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "CREATING ACCOUNT..." : "CREATE ACCOUNT"}
          </button>
        </form>

        <p className="text-[11px] mt-4 text-center" style={{ color: "var(--text-muted)" }}>
          Already have an account?{" "}
          <a href="/login" className="font-medium" style={{ color: "var(--accent-green)" }}>
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
