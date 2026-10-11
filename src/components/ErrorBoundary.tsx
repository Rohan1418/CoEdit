import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  private handleReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // ignore
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-stone-950 text-stone-200 p-6 font-mono">
          <div className="max-w-xl w-full bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-rose-400">Application Error</h2>
            <p className="text-xs text-stone-400">
              The editor encountered an unexpected error during initialization:
            </p>
            <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 text-rose-300 text-xs overflow-auto max-h-48 whitespace-pre-wrap leading-relaxed">
              {this.state.error?.message || 'Unknown error'}
            </div>
            <div className="flex gap-2">
              <button
                onClick={this.handleReset}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition"
              >
                Clear Cache & Reload
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg text-xs font-semibold transition"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
