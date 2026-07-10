import type { Client } from '../types'
import FsPrintBusinessHeader from './FsPrintBusinessHeader'

interface PrintBusinessInfo {
  name: string
  type?: string
  pan?: string
  address?: string
  gstNumber?: string
}

export interface FsPrintBannerContentProps {
  client: Client
  business: PrintBusinessInfo | null
  isConsolidated: boolean
  title: string
  period?: string
  showClientDetails?: boolean
}

export function FsPrintBannerContent({
  client,
  business,
  isConsolidated,
  title,
  period,
  showClientDetails = true,
}: FsPrintBannerContentProps) {
  return (
    <>
      {showClientDetails ? (
        <FsPrintBusinessHeader client={client} business={business} isConsolidated={isConsolidated} />
      ) : null}
      <div className="fs-print-notes-report-block fs-print-client-header">
        <p className="fs-print-notes-report-line">{title}</p>
        {period ? <p className="fs-print-notes-period-line">{period}</p> : null}
      </div>
    </>
  )
}

interface FsPrintTableBannerRowProps extends FsPrintBannerContentProps {
  colSpan: number
}

export function FsPrintHeadSpacerRow({ colSpan }: { colSpan: number }) {
  return (
    <tr className="fs-print-notes-head-spacer fs-print-only" aria-hidden="true">
      <th colSpan={colSpan} className="fs-print-notes-head-spacer-cell" />
    </tr>
  )
}

function FsPrintTableBannerRow({ colSpan, ...banner }: FsPrintTableBannerRowProps) {
  return (
    <tr className="fs-print-notes-banner-row fs-print-only" aria-hidden="true">
      <th colSpan={colSpan} className="fs-print-notes-banner-cell">
        <div className="fs-print-notes-banner-surface fs-print-client-header">
          <FsPrintBannerContent {...banner} />
        </div>
      </th>
    </tr>
  )
}

export default FsPrintTableBannerRow
