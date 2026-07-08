import { useState } from 'react'
import { Link } from 'react-router-dom'
import { updateFinancialYear } from '../api/client'
import type { Client, FinancialYear } from '../types'
import { formatFyDisplay, getEligibleBusinesses } from '../utils/financialYear'
import './FinancialYearModal.css'

interface FinancialYearModalProps {
  client: Client
  editingFy: FinancialYear
  onClose: () => void
  onSaved: (fy: FinancialYear) => void
}

function FinancialYearModal({ client, editingFy, onClose, onSaved }: FinancialYearModalProps) {
  const [closedBusinessIds, setClosedBusinessIds] = useState<string[]>(
    editingFy.closedBusinessIds ? [...editingFy.closedBusinessIds] : [],
  )
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const eligibleBusinesses = getEligibleBusinesses(client.businesses, editingFy.endYear)

  const toggleClosedBusiness = (businessId: string) => {
    setClosedBusinessIds((current) =>
      current.includes(businessId)
        ? current.filter((id) => id !== businessId)
        : [...current, businessId],
    )
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const updated = await updateFinancialYear(client.id, editingFy.id, {
        closedBusinessIds,
      })
      onSaved(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="fy-modal" onClick={(event) => event.stopPropagation()}>
        <h2>Closed Businesses — {formatFyDisplay(editingFy)}</h2>
        <p className="fy-modal-subtitle">
          Financial year details are managed in <Link to="/settings">Settings</Link>. Mark businesses
          closed only if they stopped during {editingFy.label}.
        </p>

        {error && <div className="fy-modal-error">{error}</div>}

        <form className="fy-modal-form" onSubmit={handleSubmit}>
          <div className="fy-modal-preview">
            <span>Period</span>
            <strong>
              {editingFy.startYear} – {editingFy.endYear}
            </strong>
          </div>

          <div className="fy-modal-closed">
            <h3>Mark businesses closed this year (optional)</h3>
            <p className="fy-modal-hint">
              Unchecked businesses continue in {editingFy.label}. Mark only if a business closed
              during this year.
            </p>

            {eligibleBusinesses.length === 0 ? (
              <p className="fy-modal-empty">No eligible businesses for {editingFy.label}.</p>
            ) : (
              <div className="fy-modal-checklist">
                {eligibleBusinesses.map((business) => (
                  <label key={business.id} className="fy-modal-check">
                    <input
                      type="checkbox"
                      checked={closedBusinessIds.includes(business.id)}
                      onChange={() => toggleClosedBusiness(business.id)}
                    />
                    <span>
                      {business.name} ({business.type}) — Started {business.startingFy}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="fy-modal-actions">
            <div className="fy-modal-actions-right">
              <button type="button" className="secondary-btn" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="primary-btn" disabled={submitting}>
                {submitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default FinancialYearModal
