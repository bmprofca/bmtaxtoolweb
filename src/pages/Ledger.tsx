import { useEffect, useMemo, useState } from 'react'
import { LedgerGroupSearch } from '../components/LedgerGroupSearch'
import { fetchLedgers, invalidateLedgersCache, saveLedgers } from '../api/ledger'
import type { LedgerRecord } from '../types/ledger'
import type { FsNotes } from '../types/fs'
import {
  generateLedgerId,
  getLedgerGroupOptions,
  getNoteFieldLabel,
  filterLedgers,
  findDuplicateLedger,
  formatLedgerDuplicateError,
  normalizeLedgerSign,
  normalizeLedgerRecord,
  normalizeLedgers,
} from '../utils/ledgerUtils'
import {
  confirmDelete,
  confirmSave,
  showActionAlert,
  showAddedAlert,
  showDeletedAlert,
  showUpdatedAlert,
} from '../utils/sweetAlert'
import PageRefreshButton from '../components/PageRefreshButton'
import '../styles/shared.css'
import './Ledger.css'

type ModalMode = 'add' | 'edit' | null

function Ledger() {
  const [ledgers, setLedgers] = useState<LedgerRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [editingLedgerId, setEditingLedgerId] = useState<string | null>(null)
  const [openActionsMenuId, setOpenActionsMenuId] = useState<string | null>(null)
  const [actionsMenuPosition, setActionsMenuPosition] = useState<{
    top: number
    left: number
  } | null>(null)
  const [formName, setFormName] = useState('')
  const [formGroup, setFormGroup] = useState<keyof FsNotes>('otherAdministrativeExpenses')
  const [formSign, setFormSign] = useState<'add' | 'less'>('add')
  const [modalError, setModalError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [groupFilter, setGroupFilter] = useState<keyof FsNotes | ''>('')

  const groupOptions = useMemo(() => getLedgerGroupOptions(), [])

  const filteredLedgers = useMemo(
    () => filterLedgers(ledgers, searchQuery, groupFilter, groupOptions),
    [ledgers, searchQuery, groupFilter, groupOptions],
  )

  const hasActiveFilters = Boolean(searchQuery.trim() || groupFilter)

  const selectedGroupOption = groupOptions.find((item) => item.group === formGroup)

  const loadLedgerData = async () => {
    setLoading(true)
    try {
      setError('')
      invalidateLedgersCache()
      const data = await fetchLedgers({ fresh: true })
      setLedgers(normalizeLedgers(data.ledgers))
    } catch {
      setLedgers([])
      setError('Could not load ledgers.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLedgerData()
  }, [])

  useEffect(() => {
    if (!openActionsMenuId) {
      return
    }

    const closeActionsMenu = () => {
      setOpenActionsMenuId(null)
      setActionsMenuPosition(null)
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (
        target.closest('.ledger-actions-trigger') ||
        target.closest('.ledger-actions-dropdown')
      ) {
        return
      }
      closeActionsMenu()
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeActionsMenu()
      }
    }

    const handleScrollOrResize = () => {
      closeActionsMenu()
    }

    const timeoutId = window.setTimeout(() => {
      document.addEventListener('mousedown', handlePointerDown)
    }, 0)

    document.addEventListener('keydown', handleEscape)
    window.addEventListener('resize', handleScrollOrResize)
    window.addEventListener('scroll', handleScrollOrResize, true)

    return () => {
      window.clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('resize', handleScrollOrResize)
      window.removeEventListener('scroll', handleScrollOrResize, true)
    }
  }, [openActionsMenuId])

  const closeActionsMenu = () => {
    setOpenActionsMenuId(null)
    setActionsMenuPosition(null)
  }

  const openActionsMenu = (ledgerId: string, button: HTMLButtonElement) => {
    if (openActionsMenuId === ledgerId) {
      closeActionsMenu()
      return
    }

    const rect = button.getBoundingClientRect()
    const menuWidth = 152

    setOpenActionsMenuId(ledgerId)
    setActionsMenuPosition({
      top: rect.bottom + 6,
      left: Math.max(8, rect.right - menuWidth),
    })
  }

  const closeModal = () => {
    setModalMode(null)
    setEditingLedgerId(null)
    setFormName('')
    setFormGroup('otherAdministrativeExpenses')
    setFormSign('add')
    setModalError('')
  }

  const openAddModal = () => {
    setFormName('')
    setFormGroup('otherAdministrativeExpenses')
    setFormSign('add')
    setModalError('')
    setModalMode('add')
  }

  const openEditModal = (ledger: LedgerRecord) => {
    closeActionsMenu()
    setEditingLedgerId(ledger.id)
    setFormName(ledger.name)
    setFormGroup(ledger.group)
    setFormSign(normalizeLedgerSign(ledger.sign))
    setModalError('')
    setModalMode('edit')
  }

  const deleteLedger = async (ledger: LedgerRecord) => {
    let latestLedger = ledger
    try {
      invalidateLedgersCache()
      const data = await fetchLedgers({ fresh: true })
      latestLedger =
        data.ledgers.find((item) => item.id === ledger.id) ?? normalizeLedgerRecord(ledger) ?? ledger
    } catch {
      // Fall back to in-memory ledger when refresh fails.
    }

    if (Boolean(latestLedger.hasEntries)) {
      await showActionAlert(
        'Cannot delete ledger',
        `"${latestLedger.name}" has transaction entries in current or past years and cannot be deleted.`,
      )
      return
    }

    const confirmed = await confirmDelete({
      itemLabel: ledger.name,
    })
    if (!confirmed) {
      return
    }

    const nextLedgers = ledgers.filter((item) => item.id !== ledger.id)
    const saved = await persistLedgers(nextLedgers)
    if (saved) {
      await showDeletedAlert(ledger.name)
    }
  }

  const handleEditFromMenu = () => {
    const ledger = ledgers.find((item) => item.id === openActionsMenuId)
    if (!ledger) {
      return
    }
    openEditModal(ledger)
  }

  const handleDeleteFromMenu = () => {
    const ledger = ledgers.find((item) => item.id === openActionsMenuId)
    closeActionsMenu()
    if (!ledger) {
      return
    }
    void deleteLedger(ledger)
  }

  const persistLedgers = async (nextLedgers: LedgerRecord[]): Promise<boolean> => {
    setSaving(true)
    setSaveMessage('')
    setError('')
    try {
      const saved = await saveLedgers(nextLedgers)
      setLedgers(normalizeLedgers(saved.ledgers))
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save ledger'
      setModalError(message)
      setError(message)
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleSaveLedger = async (event: React.FormEvent) => {
    event.preventDefault()

    const name = formName.trim()
    if (!name) {
      setModalError('Ledger name is required')
      return
    }

    const editingId = modalMode === 'edit' ? editingLedgerId ?? '' : ''
    const duplicate = findDuplicateLedger(ledgers, {
      id: editingId,
      name,
      group: formGroup,
    })
    if (duplicate) {
      setModalError(formatLedgerDuplicateError(name, formGroup, duplicate))
      return
    }

    const confirmed = await confirmSave({
      action: modalMode === 'add' ? 'add' : 'edit',
      itemLabel: name,
    })
    if (!confirmed) {
      return
    }

    let nextLedgers = [...ledgers]

    if (modalMode === 'add') {
      nextLedgers = [
        ...nextLedgers,
        {
          id: generateLedgerId(),
          name,
          group: formGroup,
          sign: formSign,
        },
      ]
    } else if (modalMode === 'edit' && editingLedgerId) {
      nextLedgers = nextLedgers.map((item) =>
        item.id === editingLedgerId
          ? { ...item, name, group: formGroup, sign: formSign }
          : item,
      )
    }

    const saved = await persistLedgers(nextLedgers)
    if (saved) {
      closeModal()
      if (modalMode === 'add') {
        await showAddedAlert(name)
      } else {
        await showUpdatedAlert(name)
      }
    }
  }

  return (
    <div className="ledger-page">
      <header className="page-header ledger-page-header">
        <div>
          <h1>Ledger</h1>
          <p>Global ledger list — shared across all clients and businesses</p>
        </div>
        <div className="page-header-actions">
          <PageRefreshButton onRefresh={loadLedgerData} disabled={loading || saving} />
          <button
            type="button"
            className="primary-btn ledger-add-btn"
            onClick={openAddModal}
            disabled={saving}
          >
            + Add Ledger
          </button>
        </div>
      </header>

      {error && <p className="error-text">{error}</p>}
      {saveMessage && <p className="success-text">{saveMessage}</p>}

      <section className="panel ledger-table-panel">
        <div className="ledger-list-toolbar">
          <div className="ledger-list-toolbar-top">
            <h2>Ledger List</h2>
            {!loading && ledgers.length > 0 && (
              <span className="ledger-count-badge">
                {filteredLedgers.length} of {ledgers.length} shown
              </span>
            )}
          </div>

          {!loading && ledgers.length > 0 && (
            <div className="ledger-list-filters">
              <label className="ledger-list-search">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by ledger name, group, note..."
                  className="ledger-list-search-input"
                  aria-label="Search ledgers"
                />
              </label>

              <label className="ledger-list-group-filter">
                <span className="ledger-list-filter-label">Group</span>
                <LedgerGroupSearch
                  value={groupFilter}
                  onChange={setGroupFilter}
                  allowAll
                  compact
                  allLabel="All Groups"
                />
              </label>
            </div>
          )}
        </div>

        {loading ? (
          <p className="empty-state">Loading ledgers...</p>
        ) : ledgers.length === 0 ? (
          <p className="empty-state">No ledgers yet. Click + Add Ledger to create one.</p>
        ) : filteredLedgers.length === 0 ? (
          <p className="empty-state">
            {hasActiveFilters
              ? 'No ledgers match your search. Try a different name or group filter.'
              : 'No ledgers found.'}
          </p>
        ) : (
          <div className="ledger-table-wrap">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th className="ledger-col-sno">Sl No</th>
                  <th>Ledger Name</th>
                  <th>Group</th>
                  <th className="ledger-actions-col" aria-label="Actions">
                    <span className="ledger-actions-head" title="Actions" aria-hidden="true">
                      ⋮
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredLedgers.map((ledger, index) => (
                  <tr key={ledger.id}>
                    <td className="ledger-col-sno">{index + 1}</td>
                    <td className="ledger-col-name">
                      {ledger.name}
                      {Boolean(ledger.hasEntries) ? (
                        <span
                          className="ledger-in-use-badge"
                          title="Used in financial statements — cannot delete"
                        >
                          In use
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <span className="ledger-group-badge">
                        Note {groupOptions.find((item) => item.group === ledger.group)?.noteNo}:{' '}
                        {getNoteFieldLabel(ledger.group)}
                      </span>
                      {ledger.sign === 'less' && (
                        <span className="ledger-sign-badge ledger-sign-less">Less</span>
                      )}
                    </td>
                    <td className="ledger-actions-col">
                      <div className="ledger-actions-menu">
                        <button
                          type="button"
                          className={`ledger-actions-trigger${
                            openActionsMenuId === ledger.id ? ' is-open' : ''
                          }`}
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation()
                            openActionsMenu(ledger.id, event.currentTarget)
                          }}
                          aria-label={`Actions for ${ledger.name}`}
                          aria-haspopup="menu"
                          aria-expanded={openActionsMenuId === ledger.id}
                          disabled={saving}
                        >
                          <span className="ledger-actions-dots" aria-hidden="true">
                            ⋮
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalMode && (
        <div className="modal-overlay ledger-modal-overlay" onClick={closeModal}>
          <div className="ledger-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="ledger-modal-header">
              <div>
                <span className="ledger-modal-kicker">
                  {modalMode === 'add' ? 'New Entry' : 'Update Entry'}
                </span>
                <h2>{modalMode === 'add' ? 'Add Ledger' : 'Edit Ledger'}</h2>
                <p className="ledger-modal-subtitle">
                  {modalMode === 'add'
                    ? 'Create a ledger line mapped to a financial statement note group.'
                    : 'Update the ledger name, type, or note group mapping.'}
                </p>
              </div>
              <button
                type="button"
                className="ledger-modal-close"
                onClick={closeModal}
                aria-label="Close modal"
              >
                ×
              </button>
            </div>

            <form className="ledger-modal-form" onSubmit={handleSaveLedger}>
              <div className="ledger-modal-section">
                <label className="ledger-form-field">
                  <span className="ledger-form-label">
                    Ledger Name <span className="required">*</span>
                  </span>
                  <input
                    type="text"
                    className="ledger-form-input"
                    value={formName}
                    onChange={(event) => setFormName(event.target.value)}
                    placeholder="e.g. Rent, Bank Charges, Capital Introduced"
                    autoFocus
                  />
                </label>
              </div>

              <div className="ledger-modal-section">
                <span className="ledger-form-label">
                  Entry Type <span className="required">*</span>
                </span>
                <div className="ledger-type-toggle" role="radiogroup" aria-label="Entry type">
                  <button
                    type="button"
                    className={`ledger-type-option${formSign === 'add' ? ' active' : ''}`}
                    onClick={() => setFormSign('add')}
                  >
                    <strong>Add</strong>
                    <span>Increases the note total</span>
                  </button>
                  <button
                    type="button"
                    className={`ledger-type-option${formSign === 'less' ? ' active' : ''}`}
                    onClick={() => setFormSign('less')}
                  >
                    <strong>Less</strong>
                    <span>Deducts from the note total</span>
                  </button>
                </div>
              </div>

              <div className="ledger-modal-section">
                <label className="ledger-form-field ledger-form-field-group">
                  <span className="ledger-form-label">
                    Note Group <span className="required">*</span>
                  </span>
                  <LedgerGroupSearch
                    value={formGroup}
                    onChange={(group) => {
                      if (group) {
                        setFormGroup(group)
                      }
                    }}
                    disabled={saving}
                  />
                </label>

                {selectedGroupOption && (
                  <div className="ledger-group-preview">
                    <span>Selected mapping</span>
                    <strong>
                      Note {selectedGroupOption.noteNo}: {selectedGroupOption.label}
                    </strong>
                    <em>{selectedGroupOption.section}</em>
                  </div>
                )}
              </div>

              {modalError && <div className="ledger-modal-error">{modalError}</div>}

              <div className="ledger-modal-actions">
                <button type="button" className="secondary-btn" onClick={closeModal} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="primary-btn" disabled={saving}>
                  {saving ? 'Saving...' : modalMode === 'add' ? 'Add Ledger' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {openActionsMenuId && actionsMenuPosition && (() => {
        const openMenuLedger = ledgers.find((item) => item.id === openActionsMenuId)
        return (
        <div
          className="ledger-actions-dropdown ledger-actions-dropdown-fixed"
          style={{
            top: actionsMenuPosition.top,
            left: actionsMenuPosition.left,
          }}
          role="menu"
        >
          <button
            type="button"
            className="ledger-actions-item"
            role="menuitem"
            onClick={handleEditFromMenu}
            disabled={saving}
          >
            Edit
          </button>
          {Boolean(openMenuLedger?.hasEntries) ? (
            <span
              className="ledger-actions-item ledger-actions-item-disabled"
              title="Cannot delete — entries exist in current or past years"
            >
              Delete (in use)
            </span>
          ) : (
            <button
              type="button"
              className="ledger-actions-item ledger-actions-item-danger"
              role="menuitem"
              onClick={handleDeleteFromMenu}
              disabled={saving}
            >
              Delete
            </button>
          )}
        </div>
        )
      })()}
    </div>
  )
}

export default Ledger
