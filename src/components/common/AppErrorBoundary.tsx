import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Top-level error boundary for the entire application.
 *
 * Primary purpose: catch the Vite HMR context-reference mismatch error that
 * occurs when AuthContext.tsx is hot-reloaded. During HMR, a new AuthContext
 * object is created while AuthProvider still exposes the old reference.
 * useContext(newRef) returns undefined → "useAuth must be used within an
 * AuthProvider" is thrown. The fix: detect this transient error and reload
 * the page so all modules load fresh with consistent object references.
 *
 * Secondary purpose: catch any other unexpected render errors and show a
 * friendly recovery UI instead of a blank screen.
 */
export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    // HMR context mismatch — reload silently so all modules re-initialise together
    if (error.message?.includes('must be used within an AuthProvider')) {
      window.location.reload();
      return;
    }
    console.error('[AppErrorBoundary]', error);
  }

  handleReload = () => window.location.reload();

  render() {
    const { hasError, error } = this.state;

    // Don't render the error UI while the page is about to reload
    if (hasError && error?.message?.includes('must be used within an AuthProvider')) {
      return null;
    }

    if (hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center mx-auto">
              <span className="text-2xl">⚠</span>
            </div>
            <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              An unexpected error occurred. Please reload the page to continue.
            </p>
            {error?.message && (
              <pre className="text-xs text-left bg-muted rounded-lg p-3 overflow-x-auto text-muted-foreground">
                {error.message}
              </pre>
            )}
            <button
              onClick={this.handleReload}
              className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-5 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
