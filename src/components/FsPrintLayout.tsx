import { useEffect } from 'react'
import type { Client, FinancialYear } from '../types'
import type { CaProfile } from '../types/caProfile'
import { formatPrintReportPeriod } from '../utils/financialYear'
import FsPrintBusinessHeader from './FsPrintBusinessHeader'
import './FsPrintLayout.css'

interface PrintBusinessInfo {
  name: string
  type?: string
  pan?: string
  address?: string
  gstNumber?: string
}

interface FsPrintLayoutProps {
  documentTitle: string
  client: Client
  business: PrintBusinessInfo | null
  isConsolidated: boolean
  fy: FinancialYear
  caProfile: CaProfile
  udinApplicable: boolean
  udinNumber?: string
  udinDate?: string
  activeTabLabel?: string
  reportKind?: 'balance-sheet' | 'profit-loss' | 'notes' | 'other'
  printAll?: boolean
  hideBusinessHeader?: boolean
  hidePrintHeader?: boolean
}

function formatUdinDate(value?: string) {
  if (!value) {
    return ''
  }
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function FsPrintLayout({
  documentTitle,
  client,
  business,
  isConsolidated,
  fy,
  caProfile,
  udinApplicable,
  udinNumber,
  udinDate,
  activeTabLabel,
  reportKind = 'other',
  printAll,
  hideBusinessHeader = false,
  hidePrintHeader = false,
}: FsPrintLayoutProps) {
  const showCaSigning = udinApplicable && Boolean(caProfile.id && (caProfile.firmName || caProfile.partnerName))
  const showUdin = udinApplicable && Boolean(udinNumber?.trim())
  const formattedUdinDate = formatUdinDate(udinDate)
  const reportTitle = printAll ? documentTitle || 'Financial Statement' : activeTabLabel || 'Financial Statement'
  const periodLabel = formatPrintReportPeriod(reportKind, fy)
  const entityName = isConsolidated ? client.name : business?.name || client.name
  const clientSignatoryName = client.name?.trim() || entityName

  useEffect(() => {
    const previousTitle = document.title
    const fyLabel = fy.label?.trim() || `FY ${fy.endYear}`
    const printDocumentTitle = printAll
      ? `${entityName} - ${documentTitle || 'Financial Statement'} - ${fyLabel}`
      : `${entityName} - ${reportTitle} - ${fyLabel}`

    const onBeforePrint = () => {
      document.title = printDocumentTitle
    }
    const onAfterPrint = () => {
      document.title = previousTitle
    }

    window.addEventListener('beforeprint', onBeforePrint)
    window.addEventListener('afterprint', onAfterPrint)

    return () => {
      window.removeEventListener('beforeprint', onBeforePrint)
      window.removeEventListener('afterprint', onAfterPrint)
    }
  }, [documentTitle, entityName, fy.endYear, fy.label, printAll, reportTitle])

  return (
    <>
      {printAll && (
        <div className="fs-print-fixed-client-header fs-print-client-header fs-print-only" aria-hidden="true">
          <FsPrintBusinessHeader client={client} business={business} isConsolidated={isConsolidated} />
        </div>
      )}

      {!hidePrintHeader && (
        <header className="fs-print-header fs-print-only" aria-hidden="true">
          {!hideBusinessHeader && (
            <FsPrintBusinessHeader client={client} business={business} isConsolidated={isConsolidated} />
          )}

          <div className="fs-print-header-center fs-print-header-report">
            {!printAll && (
              <p className="fs-print-header-report-right">
                <strong>{reportTitle}</strong>
                {periodLabel ? ` — ${periodLabel}` : ''}
              </p>
            )}

            {printAll && (
              <>
                <h2 className="fs-print-report-title">{reportTitle}</h2>
                <p className="fs-print-period">{periodLabel}</p>
              </>
            )}
          </div>
        </header>
      )}

      <footer
        className={`fs-print-footer fs-print-only${showCaSigning ? '' : ' fs-print-footer--client-only'}`}
        aria-hidden="true"
      >
        <div className="fs-print-footer-inner">
          {showCaSigning && (
            <div className="fs-print-footer-left">
              <div className="fs-print-ca-firm-row">
                <div className="fs-print-ca-firm-text">
                  <p className="fs-print-footer-strong">{caProfile.firmName || 'Chartered Accountant'}</p>
                  {showUdin && udinNumber && (
                    <p className="fs-print-footer-line fs-print-ca-udin-inline">UDIN {udinNumber}</p>
                  )}
                  {caProfile.partnerName && (
                    <p className="fs-print-footer-line">{caProfile.partnerName}</p>
                  )}
                </div>
                {caProfile.sealSignatureDataUrl && (
                  <img
                    src={caProfile.sealSignatureDataUrl}
                    alt={caProfile.sealSignatureName || 'Seal and signature'}
                    className="fs-print-seal-image"
                  />
                )}
              </div>
              <div className="fs-print-ca-details">
                {caProfile.frnNumber && (
                  <p className="fs-print-footer-line">FRN {caProfile.frnNumber}</p>
                )}
                {caProfile.membershipNumber && (
                  <p className="fs-print-footer-line">M.No. {caProfile.membershipNumber}</p>
                )}
                {showUdin && formattedUdinDate && (
                  <p className="fs-print-footer-line">Dt. {formattedUdinDate}</p>
                )}
                {caProfile.place && (
                  <p className="fs-print-footer-line">Place: {caProfile.place}</p>
                )}
              </div>
            </div>
          )}

          <div className="fs-print-footer-right">
            <div className="fs-print-sign-area" />
            <p className="fs-print-footer-strong">{clientSignatoryName}</p>
            <p className="fs-print-footer-line">Authorised Signatory</p>
          </div>
        </div>
      </footer>
    </>
  )
}

export default FsPrintLayout
