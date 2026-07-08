import type { Client, FinancialYear } from '../types'
import type { CaProfile } from '../types/caProfile'
import { isProprietorshipType } from '../utils/businessUtils'
import { formatPrintReportPeriod } from '../utils/financialYear'
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

function buildAddressLine(client: Client, business: PrintBusinessInfo | null, isConsolidated: boolean) {
  const address = (isConsolidated ? client.address : business?.address || client.address || '').trim()
  return address || ''
}

function buildPinLine(client: Client) {
  return client.pin?.trim() ? `PIN ${client.pin.trim()}` : ''
}

function FsPrintLayout({
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
}: FsPrintLayoutProps) {
  const showCaSigning = udinApplicable && Boolean(caProfile.id && (caProfile.firmName || caProfile.partnerName))
  const showUdin = udinApplicable && Boolean(udinNumber?.trim())
  const formattedUdinDate = formatUdinDate(udinDate)
  const isProprietorship = Boolean(business?.type && isProprietorshipType(business.type))
  const addressLine = buildAddressLine(client, business, isConsolidated)
  const pinLine = buildPinLine(client)
  const locationLine = [addressLine, pinLine].filter(Boolean).join(' · ')
  const reportTitle = printAll ? 'Financial Statement' : activeTabLabel || 'Financial Statement'
  const periodLabel = formatPrintReportPeriod(reportKind, fy)
  const entityName = isConsolidated ? client.name : business?.name || client.name
  const clientSignatoryName = client.name?.trim() || entityName

  return (
    <>
      <header className="fs-print-header fs-print-only" aria-hidden="true">
        <div className="fs-print-header-center">
          <h1 className="fs-print-business-name">{entityName}</h1>

          {!isConsolidated && isProprietorship && (
            <p className="fs-print-proprietorship">In Proprietorship of {client.name}</p>
          )}

          {isConsolidated && (
            <p className="fs-print-proprietorship">Consolidated Financial Statements</p>
          )}

          {locationLine && <p className="fs-print-location">{locationLine}</p>}

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
