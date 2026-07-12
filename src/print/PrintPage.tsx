import type { PrintPageProps } from './types'

function PrintPage({ children, className = '' }: PrintPageProps) {
  return <div className={`print-page${className ? ` ${className}` : ''}`}>{children}</div>
}

export default PrintPage
