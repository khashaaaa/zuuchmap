import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  handleRetry = () => {
    this.props.queryClient?.resetQueries()
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children

    if (this.props.inline) {
      return (
        <div className="flex items-center justify-center p-6 text-center">
          <div>
            <p className="text-sm text-muted mb-2">Failed to load this section</p>
            <button
              onClick={this.handleRetry}
              className="text-xs text-primary hover:underline"
            >
              Retry
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-surface border border-border/20 shadow-card rounded-card p-6 md:p-8 text-center">
          <p className="text-lg font-semibold text-text mb-2">Something went wrong</p>
          <p className="text-sm text-muted mb-4">{this.state.error?.message}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 bg-primary text-on-primary rounded-btn text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Try again
            </button>
            <a
              href="/"
              className="px-4 py-2 border border-border/50 rounded-btn text-sm font-medium text-muted hover:text-text transition-colors"
            >
              Go home
            </a>
          </div>
        </div>
      </div>
    )
  }
}
