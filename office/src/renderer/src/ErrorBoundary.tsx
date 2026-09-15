import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Renderer crash", error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8 text-foreground">
        <div className="max-w-lg rounded border border-destructive-muted bg-white p-6 shadow-sm">
          <p className="text-lg font-semibold">Something went wrong</p>
          <p className="mt-2 text-sm text-destructive-ink">{this.state.error.message}</p>
          <button
            type="button"
            className="btn-primary mt-4"
            onClick={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
