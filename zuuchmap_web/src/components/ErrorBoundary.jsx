import { Component, Fragment } from 'react'
import { captureError } from '../lib/observability'
import i18n from '../i18n'
import Button from './Button'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, resetKey: 0 }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    const where = info?.componentStack?.trim().split('\n')[0]?.trim() ?? 'unknown'
    // The user gets a fallback either way; this is so someone finds out it
    // happened, which until now nothing did.
    captureError(error, { boundary: where })
  }

  handleRetry = () => {
    // Reset the queries first, then remount the subtree via `resetKey` —
    // clearing the error alone would re-render the exact tree that just threw.
    this.props.queryClient?.resetQueries()
    this.setState((s) => ({ error: null, resetKey: s.resetKey + 1 }))
  }

  render() {
    if (!this.state.error) {
      return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>
    }

    if (this.props.inline) {
      return (
        <div className="flex items-center justify-center p-6 text-center">
          <div>
            <p className="text-sm text-muted mb-2">{i18n.t('common.loadFailed')}</p>
            <button
              onClick={this.handleRetry}
              className="text-xs text-primary-text hover:underline"
            >
              {i18n.t('common.retry')}
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-surface border border-border/20 shadow-card rounded-card p-6 md:p-8 text-center">
          <p className="text-lg font-semibold text-text mb-2">{i18n.t('common.error')}</p>
          <p className="text-sm text-muted mb-4">
            {import.meta.env.DEV ? this.state.error?.message : i18n.t('common.loadFailedDesc')}
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button size="md" onClick={this.handleRetry}>
              {i18n.t('common.retry')}
            </Button>
            <a
              href="/"
              className="px-4 py-2 border border-border/50 rounded-btn text-sm font-medium text-muted hover:text-text transition-colors"
            >
              {i18n.t('common.goHome')}
            </a>
          </div>
        </div>
      </div>
    )
  }
}
