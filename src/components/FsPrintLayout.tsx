import type { Client, FinancialYear } from '../types'
import type { CaProfile } from '../types/caProfile'
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
  printAll?: boolean
}

function formatClientAddress(client: Client) {
  const parts = [client.address, client.pin ? `PIN ${client.pin}` : ''].filter(Boolean)
  return parts.join(', ')
}

function formatBusinessAddress(business: PrintBusinessInfo) {
  return business.address?.trim() || ''
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
  printAll,
}: FsPrintLayoutProps) {
  const showCaFooter = udinApplicable && Boolean(caProfile.id && (caProfile.firmName || caProfile.partnerName))
  const showUdin = udinApplicable && Boolean(udinNumber?.trim())
  const formattedUdinDate = formatUdinDate(udinDate)

  return (
    <>
      <header className="fs-print-header fs-print-only" aria-hidden="true">
        <div className="fs-print-entity-block">
          {isConsolidated ? (
            <>
              <span className="fs-print-entity-label">Client</span>
              <strong className="fs-print-entity-name">{client.name}</strong>
              {client.pan && <span className="fs-print-entity-line">PAN: {client.pan}</span>}
              {client.mobile && <span className="fs-print-entity-line">Mobile: {client.mobile}</span>}
              {client.email && <span className="fs-print-entity-line">Email: {client.email}</span>}
              {formatClientAddress(client) && (
                <span className="fs-print-entity-line">{formatClientAddress(client)}</span>
              )}
            </>
          ) : business ? (
            <>
              <span className="fs-print-entity-label">Business</span>
              <strong className="fs-print-entity-name">{business.name}</strong>
              {business.type && <span className="fs-print-entity-line">{business.type}</span>}
              {business.pan && <span className="fs-print-entity-line">PAN: {business.pan}</span>}
              {business.gstNumber && (
                <span className="fs-print-entity-line">GSTIN: {business.gstNumber}</span>
              )}
              {formatBusinessAddress(business) && (
                <span className="fs-print-entity-line">{formatBusinessAddress(business)}</span>
              )}
            </>
          ) : null}
        </div>

        <div className="fs-print-title-block">
          <h1 className="fs-print-doc-title">{documentTitle}</h1>
          <p className="fs-print-doc-subtitle">
            {isConsolidated ? (
              <>
                Consolidated Balance Sheet · Financial Year {fy.label} ({fy.startYear} – {fy.endYear})
              </>
            ) : (
              <>
                <strong>{business?.name}</strong>
                {business?.type ? ` · ${business.type}` : ''} · Financial Year {fy.label} (
                {fy.startYear} – {fy.endYear})
              </>
            )}
          </p>
          {activeTabLabel && !printAll && (
            <p className="fs-print-section-label">{activeTabLabel}</p>
          )}
          {printAll && <p className="fs-print-section-label">Complete Financial Statement</p>}
        </div>
      </header>

      <footer className="fs-print-footer fs-print-only" aria-hidden="true">
        <div className="fs-print-footer-inner">
          {showCaFooter ? (
            <div className="fs-print-footer-left">
              <p className="fs-print-footer-heading">Chartered Accountant</p>
              {caProfile.firmName && <p className="fs-print-footer-strong">{caProfile.firmName}</p>}
              {caProfile.partnerName && <p className="fs-print-footer-line">{caProfile.partnerName}</p>}
              {caProfile.firmType && <p className="fs-print-footer-line">{caProfile.firmType}</p>}
              {caProfile.frnNumber && (
                <p className="fs-print-footer-line">FRN: {caProfile.frnNumber}</p>
              )}
              {caProfile.membershipNumber && (
                <p className="fs-print-footer-line">Membership No.: {caProfile.membershipNumber}</p>
              )}
              {showUdin && <p className="fs-print-footer-line">UDIN: {udinNumber}</p>}
              {showUdin && formattedUdinDate && (
                <p className="fs-print-footer-line">UDIN Date: {formattedUdinDate}</p>
              )}
              {caProfile.place && <p className="fs-print-footer-line">Place: {caProfile.place}</p>}
            </div>
          ) : (
            <div className="fs-print-footer-left fs-print-footer-left--empty" />
          )}

          <div className="fs-print-footer-right">
            <div className="fs-print-sign-area" />
            <p className="fs-print-footer-strong">For {client.name}</p>
            <p className="fs-print-footer-line">Authorised Signatory</p>
          </div>
        </div>
      </footer>
    </>
  )
}

export default FsPrintLayout
