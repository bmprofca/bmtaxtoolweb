import { useEffect, useState } from 'react'
import type { NoteBreakdownRow } from '../types/fs'
import { createBreakdownRow, sumBreakdownRows } from '../utils/fsDefaults'
import { confirmDelete, confirmSave } from '../utils/sweetAlert'
import './NoteBreakdownModal.css'

interface NoteBreakdownModalProps {
  title: string
  periodLabel: string
  rows: NoteBreakdownRow[]
  onClose: () => void
  onSave: (rows: NoteBreakdownRow[]) => void
}

function NoteBreakdownModal({
  title,
  periodLabel,
  rows,
  onClose,
  onSave,
}: NoteBreakdownModalProps) {
  const [localRows, setLocalRows] = useState<NoteBreakdownRow[]>(rows)

  useEffect(() => {
    setLocalRows(rows.length > 0 ? rows : [createBreakdownRow()])
  }, [rows])

  const total = sumBreakdownRows(localRows)

  const updateRow = (index: number, field: 'particular' | 'amount', value: string) => {
    setLocalRows((current) =>
      current.map((row, i) =>
        i === index
          ? { ...row, [field]: field === 'amount' ? Number(value) || 0 : value }
          : row,
      ),
    )
  }

  const addRow = () => {
    setLocalRows((current) => [...current, createBreakdownRow()])
  }

  const removeRow = async (index: number) => {
    const row = localRows[index]
    const itemLabel = row?.particular.trim() || `row ${index + 1}`
    const confirmed = await confirmDelete({ itemLabel })
    if (!confirmed) {
      return
    }
    setLocalRows((current) => current.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    const confirmed = await confirmSave({
      action: 'edit',
      itemLabel: title,
    })
    if (!confirmed) {
      return
    }

    const cleaned = localRows.filter((row) => row.particular.trim() || row.amount)
    onSave(cleaned)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="breakdown-modal" onClick={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        <p className="breakdown-subtitle">{periodLabel} — Enter particulars and amounts</p>

        <div className="table-wrap">
          <table className="breakdown-table">
            <thead>
              <tr>
                <th>S.No</th>
                <th>Particular</th>
                <th>Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {localRows.map((row, index) => (
                <tr key={row.id}>
                  <td>{index + 1}</td>
                  <td>
                    <input
                      value={row.particular}
                      onChange={(event) => updateRow(index, 'particular', event.target.value)}
                      placeholder="Particular"
                      autoFocus={index === 0}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={row.amount || ''}
                      onChange={(event) => updateRow(index, 'amount', event.target.value)}
                      placeholder="0"
                    />
                  </td>
                  <td>
                    <button type="button" className="danger-btn" onClick={() => void removeRow(index)}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="total-label">
                  Total
                </td>
                <td colSpan={2} className="total-value">
                  {total.toLocaleString('en-IN')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <button type="button" className="secondary-btn add-row-btn" onClick={addRow}>
          + Add Row
        </button>

        <div className="breakdown-actions">
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary-btn" onClick={handleSave}>
            Apply Total
          </button>
        </div>
      </div>
    </div>
  )
}

export default NoteBreakdownModal
