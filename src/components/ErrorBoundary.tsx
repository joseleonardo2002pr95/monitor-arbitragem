import { Component, type ReactNode } from 'react';

/** Se um painel quebrar, mostra o erro só nele em vez de deixar a página em branco. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="card">
        <p className="error">Este painel teve um erro: {this.state.error.message}</p>
        <button onClick={() => this.setState({ error: undefined })}>Tentar de novo</button>
      </section>
    );
  }
}
