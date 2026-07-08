import { useState } from 'react'
import { updateGlobalFinancialYearStatementType } from '../api/fySettings'
import type { Client, FinancialYear } from '../types'
import {
  FINANCIAL_STATEMENT_TYPES,
  normalizeStatementType,
} from '../utils/financialYear'
import ClientContextBar from './ClientContextBar'
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
  const [savingStatementType, setSavingStatementType] = useState(false)
  const statementType = normalizeStatementType(currentFy.statementType)

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
    <ClientContextBar
      client={client}
      clientId={clientId}
      toolId="financial-statement"
      currentFy={currentFy}
      businessId={businessId}
      activeTab={activeTab}
      trailing={
        <>
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

          {!readOnly && onQuickEntry && (
            <button type="button" className="fs-quick-entry-btn" onClick={onQuickEntry}>
              Quick Entry
            </button>
          )}
        </>
      }
    />
  )
}

export default FsContextBar
