"use client";

import React from "react";

interface Props {
  children:  React.ReactNode;
  fallback?: React.ReactNode;
}

interface State { hasError: boolean }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  private reset = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div
          className="flex flex-col items-center justify-center gap-3 py-20 text-center rounded-2xl"
          style={{ border: "1.5px dashed var(--sp-hairline)" }}
        >
          <p className="text-[13px]" style={{ color: "var(--sp-muted)" }}>
            Something went wrong.
          </p>
          <button
            onClick={this.reset}
            className="px-4 py-1.5 rounded-lg text-[12px] font-semibold text-white bg-(--sp-teal) hover:bg-(--sp-teal-dark) transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
