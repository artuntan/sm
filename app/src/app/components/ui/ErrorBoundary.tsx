"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { hasError: boolean; error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          minHeight: "50vh", padding: "2rem", textAlign: "center",
          color: "var(--text-primary)", backgroundColor: "var(--bg-primary)"
        }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>Something went wrong</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              backgroundColor: "var(--accent-green)", color: "var(--text-inverse)",
              padding: "0.5rem 1rem", borderRadius: "0.375rem", border: "none",
              cursor: "pointer", fontSize: "0.75rem", fontWeight: 600
            }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
