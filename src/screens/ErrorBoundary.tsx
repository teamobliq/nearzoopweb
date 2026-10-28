import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { hasError: boolean }

/** Keeps a render crash from blanking the app to the orange backdrop. */
class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error): void {
    console.error('NearZoop crashed:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="done">
          <section className="done-card">
            <h1 className="done-title">Something broke.</h1>
            <p className="done-body">
              A screen failed to load. Retry — it usually recovers right away.
            </p>
            <button
              type="button"
              className="btn-secondary done-signout"
              onClick={() => this.setState({ hasError: false })}
            >
              Try again
            </button>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
