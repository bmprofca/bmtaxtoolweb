import type { Client } from '../types'
import { FsPrintBannerContent } from './FsPrintTableBannerRow'

interface PrintBusinessInfo {
  name: string
  type?: string
  pan?: string
  address?: string
  gstNumber?: string
}

interface FsPrintSectionStationeryProps {
  client: Client
  business: PrintBusinessInfo | null
  isConsolidated: boolean
  title: string
  period?: string
  showClientDetails?: boolean
}

function FsPrintSectionStationery({
  client,
  business,
  isConsolidated,
  title,
  period,
  showClientDetails = true,
}: FsPrintSectionStationeryProps) {
  return (
    <div className="fs-print-section-stationery fs-print-notes-stationery fs-print-client-header fs-print-only" aria-hidden="true">
      <FsPrintBannerContent
        client={client}
        business={business}
        isConsolidated={isConsolidated}
        title={title}
        period={period}
        showClientDetails={showClientDetails}
      />
    </div>
  )
}

export default FsPrintSectionStationery
