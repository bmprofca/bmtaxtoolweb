import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Client, FinancialYear } from '../types'
import {
  formatFyDisplay,
  getBusinessesForFy,
  getActiveFinancialYears,
  sortFinancialYears,
} from '../utils/financialYear'
import {
  CONSOLIDATED_BUSINESS_ID,
  CONSOLIDATED_BUSINESS_LABEL,
  isConsolidatedApplicableForFy,
} from '../utils/consolidatedFs'
import { buildToolPickerRoute, buildToolWorkspaceRoute } from '../utils/toolRoutes'
import type { ToolId } from '../config/tools'
import './ClientContextBar.css'

interface ClientContextBarProps {
  client: Client
  clientId: string
  toolId: ToolId | string
  currentFy: FinancialYear
  businessId: string
  activeTab?: string
  trailing?: React.ReactNode
  summaryLabel?: string
}

function ClientContextBar({
  client,
  clientId,
  toolId,
  currentFy,
  businessId,
  activeTab,
  trailing,
  summaryLabel = 'Viewing',
}: ClientContextBarProps) {
  const navigate = useNavigate()

  const sortedYears = useMemo(
    () => sortFinancialYears(getActiveFinancialYears(client.financialYears || [])),
    [client.financialYears],
  )

  const fyBusinesses = getBusinessesForFy(client.businesses, currentFy)
  const consolidatedApplicable = isConsolidatedApplicableForFy(client.businesses, currentFy)
  const showBusinessSwitch = consolidatedApplicable || fyBusinesses.length > 1

  const goToContext = (nextFyId: string, nextBusinessId = businessId) => {
    navigate(buildToolWorkspaceRoute(clientId, toolId, nextFyId, nextBusinessId), {
      state: activeTab ? { activeTab } : undefined,
    })
  }

  const goToToolPicker = () => {
    navigate(buildToolPickerRoute(clientId, businessId))
  }

  return (
    <div className="client-context-bar">
      <div className="client-context-selectors">
        <label className="client-context-field client-context-field--fy">
          <span>Financial Year</span>
          <select
            value={currentFy.id}
            onChange={(event) => {
              const nextFyId = event.target.value
              if (nextFyId !== currentFy.id) {
                goToContext(nextFyId)
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

        {showBusinessSwitch && (
          <label className="client-context-field client-context-field--business">
            <span>Business</span>
            <select
              value={businessId}
              onChange={(event) => goToContext(currentFy.id, event.target.value)}
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

        <button type="button" className="client-context-tools-btn" onClick={goToToolPicker}>
          All Tools
        </button>

        {trailing}
      </div>

      <div className="client-context-summary" title={formatFyDisplay(currentFy)}>
        <span className="client-context-summary-label">{summaryLabel}</span>
        <strong>{formatFyDisplay(currentFy)}</strong>
      </div>
    </div>
  )
}

export default ClientContextBar
