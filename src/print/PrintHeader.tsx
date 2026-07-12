import FsPrintBusinessHeader from '../components/FsPrintBusinessHeader'
import type { PrintHeaderProps } from './types'

function PrintHeader({
  client,
  business,
  isConsolidated,
  title,
  period,
  showClientDetails = true,
  fixed = false,
}: PrintHeaderProps) {
  const rootClass = [
    'print-header',
    'fs-print-only',
    fixed ? 'print-header--fixed fs-print-fixed-client-header' : '',
    showClientDetails ? 'print-header--with-client' : 'print-header--title-only',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <header className={rootClass} aria-hidden="true">
      {showClientDetails ? (
        <div className="print-header__client fs-print-client-header">
          <FsPrintBusinessHeader client={client} business={business} isConsolidated={isConsolidated} />
        </div>
      ) : null}
      {title ? (
        <div className="print-header__title print-document-title fs-print-document-title">
          <p className="print-document-title__line print-heading fs-print-notes-report-line">{title}</p>
          {period ? (
            <p className="print-document-title__period print-small fs-print-notes-period-line">{period}</p>
          ) : null}
        </div>
      ) : null}
    </header>
  )
}

export default PrintHeader
