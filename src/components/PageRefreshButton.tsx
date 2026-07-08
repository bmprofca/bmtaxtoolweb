import { useState } from 'react'

interface PageRefreshButtonProps {
  onRefresh: () => void | Promise<void>
  disabled?: boolean
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M17.65 6.35A7.96 7.96 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08a5.99 5.99 0 0 1-5.65 4c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.67 4.24 1.76L13 11h7V4l-2.35 2.35z"
      />
    </svg>
  )
}

function PageRefreshButton({ onRefresh, disabled = false }: PageRefreshButtonProps) {
  const [refreshing, setRefreshing] = useState(false)

  const handleClick = async () => {
    if (disabled || refreshing) {
      return
    }

    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <button
      type="button"
      className={`page-refresh-btn${refreshing ? ' is-refreshing' : ''}`}
      onClick={handleClick}
      disabled={disabled || refreshing}
      title="Refresh"
      aria-label="Refresh page"
    >
      <RefreshIcon />
    </button>
  )
}

export default PageRefreshButton
