import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('GearVault render error', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-shell">
          <section className="card" style={{ padding: '1rem' }}>
            <h1>Something went wrong</h1>
            <p>Try refreshing. Your data is stored locally and remains safe.</p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
