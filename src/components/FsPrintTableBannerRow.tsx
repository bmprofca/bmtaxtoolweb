import type { ReactNode } from 'react'
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
      <div
        className={`fs-print-notes-report-block fs-print-client-header print-document-title${
          showClientDetails ? '' : ' fs-print-notes-report-block--title-only'
        }`}
      >
        <p className="fs-print-notes-report-line print-document-title__line print-heading">{title}</p>
        {period ? (
          <p className="fs-print-notes-period-line print-document-title__period print-small">{period}</p>
        ) : null}
      </div>
    </>
  )
}

interface FsPrintTableBannerRowProps extends FsPrintBannerContentProps {
  colSpan?: number
}

export function FsPrintHeadSpacerRow({ colSpan = 1 }: { colSpan?: number }) {
  return (
    <tr className="fs-print-notes-head-spacer fs-print-only" aria-hidden="true">
      <th colSpan={colSpan} className="fs-print-notes-head-spacer-cell" />
    </tr>
  )
}

export function FsPrintStationeryTable({ children }: { children: ReactNode }) {
  return (
    <table className="fs-print-stationery-table fs-print-only" role="presentation">
      <thead>
        <tr>
          <th className="fs-print-stationery-cell" align="center">
            <table className="fs-print-stationery-inner" role="presentation">
              <tbody>{children}</tbody>
            </table>
          </th>
        </tr>
      </thead>
    </table>
  )
}

function FsPrintTableBannerRow({ colSpan = 1, ...banner }: FsPrintTableBannerRowProps) {
  return (
    <tr className="fs-print-notes-banner-row fs-print-only" aria-hidden="true">
      <th colSpan={colSpan} className="fs-print-notes-banner-cell" align="center">
        <div className="fs-print-notes-banner-surface fs-print-document-title">
          <FsPrintBannerContent {...banner} />
        </div>
      </th>
    </tr>
  )
}

export default FsPrintTableBannerRow
