import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateGlobalFinancialYearStatementType } from '../api/fySettings'
import type { Client, FinancialYear } from '../types'
import {
  FINANCIAL_STATEMENT_TYPES,
  formatFyDisplay,
  getBusinessesForFy,
  normalizeStatementType,
  sortFinancialYears,
} from '../utils/financialYear'
import {
  CONSOLIDATED_BUSINESS_ID,
  CONSOLIDATED_BUSINESS_LABEL,
  isConsolidatedApplicableForFy,
} from '../utils/consolidatedFs'
import './FsContextBar.css'

interface FsContextBarProps {
  client: Client
  clientId: string
  currentFy: FinancialYear
  businessId: string
  activeTab: string
  readOnly?: boolean
  onQuickEntry?: () => void
  onClientUpdated: () => Promise<Client | null>
}

function FsContextBar({
  client,
  clientId,
  currentFy,
  businessId,
  activeTab,
  readOnly = false,
  onQuickEntry,
  onClientUpdated,
}: FsContextBarProps) {
  const navigate = useNavigate()
  const [savingStatementType, setSavingStatementType] = useState(false)

  const sortedYears = useMemo(
    () => sortFinancialYears(client.financialYears || []),
    [client.financialYears],
  )

  const fyBusinesses = getBusinessesForFy(client.businesses, currentFy)
  const consolidatedApplicable = isConsolidatedApplicableForFy(client.businesses, currentFy)
  const showBusinessSwitch = consolidatedApplicable || fyBusinesses.length > 1
  const statementType = normalizeStatementType(currentFy.statementType)

  const goToFs = (nextFyId: string, nextBusinessId = businessId) => {
    navigate(`/clients/${clientId}/fs/${nextFyId}/business/${nextBusinessId}`, {
      state: { activeTab },
    })
  }

  const handleStatementTypeChange = async (nextType: string) => {
    if (readOnly || normalizeStatementType(nextType) === statementType) {
      return
    }

    try {
      setSavingStatementType(true)
      await updateGlobalFinancialYearStatementType(currentFy.id, nextType)
      await onClientUpdated()
    } finally {
      setSavingStatementType(false)
    }
  }

  return (
    <div className="fs-context-bar">
      <div className="fs-context-selectors">
        <label className="fs-inline-field fs-inline-field--fy">
          <span>Financial Year</span>
          <select
            value={currentFy.id}
            onChange={(event) => {
              const nextFyId = event.target.value
              if (nextFyId !== currentFy.id) {
                goToFs(nextFyId)
              }
            }}
            title="Select financial year"
          >
            {sortedYears.map((fy) => (
              <option key={fy.id} value={fy.id}>
                {fy.label} ({fy.startYear}–{fy.endYear})
              </option>
            ))}
          </select>
        </label>

        <label className="fs-inline-field fs-inline-field--type">
          <span>Type</span>
          <select
            value={statementType}
            onChange={(event) => handleStatementTypeChange(event.target.value)}
            disabled={readOnly || savingStatementType}
            title="Statement type for this year"
          >
            {FINANCIAL_STATEMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        {showBusinessSwitch && (
          <label className="fs-inline-field fs-inline-field--business">
            <span>Business</span>
            <select
              value={businessId}
              onChange={(event) => goToFs(currentFy.id, event.target.value)}
            >
              {consolidatedApplicable && (
                <option value={CONSOLIDATED_BUSINESS_ID}>{CONSOLIDATED_BUSINESS_LABEL}</option>
              )}
              {fyBusinesses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {!readOnly && onQuickEntry && (
          <button type="button" className="fs-quick-entry-btn" onClick={onQuickEntry}>
            Quick Entry
          </button>
        )}
      </div>

      <div className="fs-context-summary" title={formatFyDisplay(currentFy)}>
        <span className="fs-context-summary-label">Viewing</span>
        <strong>{formatFyDisplay(currentFy)}</strong>
      </div>
    </div>
  )
}

export default FsContextBar
