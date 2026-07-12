import type { Client, FinancialYear } from '../types'
import { formatPrintReportPeriod } from '../utils/financialYear'
import FsPrintBusinessHeader from './FsPrintBusinessHeader'
import { usePrintLifecycle } from '../print/usePrintLifecycle'
import type { PrintBusinessInfo } from '../print/types'
import './FsPrintLayout.css'

interface FsPrintLayoutProps {
  documentTitle: string
  client: Client
  business: PrintBusinessInfo | null
  isConsolidated: boolean
  fy: FinancialYear
  activeTabLabel?: string
  reportKind?: 'balance-sheet' | 'profit-loss' | 'notes' | 'other'
  printAll?: boolean
  hideBusinessHeader?: boolean
  hidePrintHeader?: boolean
}

function FsPrintLayout({
  documentTitle,
  client,
  business,
  isConsolidated,
  fy,
  activeTabLabel,
  reportKind = 'other',
  printAll,
  hideBusinessHeader = false,
  hidePrintHeader = false,
}: FsPrintLayoutProps) {
  const reportTitle = printAll ? documentTitle || 'Financial Statement' : activeTabLabel || 'Financial Statement'
  const periodLabel = formatPrintReportPeriod(reportKind, fy)
  const entityName = isConsolidated ? client.name : business?.name || client.name
  const fyLabel = fy.label?.trim() || `FY ${fy.endYear}`
  const printDocumentTitle = printAll
    ? `${entityName} - ${documentTitle || 'Financial Statement'} - ${fyLabel}`
    : `${entityName} - ${reportTitle} - ${fyLabel}`

  usePrintLifecycle({ documentTitle: printDocumentTitle })

  return (
    <>
      {!hidePrintHeader && (
        <header className="print-header fs-print-header fs-print-only" aria-hidden="true">
          {!hideBusinessHeader && (
            <FsPrintBusinessHeader client={client} business={business} isConsolidated={isConsolidated} />
          )}

          <div className="fs-print-header-center fs-print-header-report print-document-title">
            {!printAll && (
              <div className="fs-print-notes-report-block fs-print-notes-report-block--title-only print-document-title">
                <p className="fs-print-notes-report-line print-document-title__line print-heading">{reportTitle}</p>
                {periodLabel ? (
                  <p className="fs-print-notes-period-line print-document-title__period print-small">{periodLabel}</p>
                ) : null}
              </div>
            )}
          </div>
        </header>
      )}

    </>
  )
}

export default FsPrintLayout
