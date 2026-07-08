import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  fetchDeletedGlobalFinancialYears,
  fetchGlobalFinancialYears,
  removeGlobalFinancialYear,
  restoreGlobalFinancialYear,
  saveGlobalFinancialYears,
  updateGlobalFinancialYearStatementType,
  updateGlobalFinancialYearStatus,
} from '../api/fySettings'
import {
  canDeleteFinancialYear,
  FINANCIAL_STATEMENT_TYPES,
  getAutoFillYearsPreview,
  getAvailableFinancialYearOptions,
  mergeFinancialYearRange,
  normalizeFinancialYearStatus,
  normalizeStatementType,
  validateSequentialFinancialYears,
} from '../utils/financialYear'
import {
  generateGlobalFinancialYearId,
  normalizeGlobalFinancialYears,
  type GlobalFinancialYear,
} from '../utils/globalFinancialYear'
import {
  confirmDelete,
  confirmFinancialYearStatusChange,
  confirmRestore,
  confirmSave,
  showAddedAlert,
  showDeletedAlert,
  showFinancialYearStatusAlert,
  showRestoredAlert,
  showUpdatedAlert,
} from '../utils/sweetAlert'
import PageRefreshButton from '../components/PageRefreshButton'
import SettingsUsersSection from '../components/SettingsUsersSection'
import { fetchUsers } from '../api/users'
import '../styles/shared.css'
import './Settings.css'

type SettingsSection = 'financial-year' | 'users'
type ModalMode = 'add' | 'edit'

const SETTING_MODULES: Array<{
  id: SettingsSection
  name: string
  description: string
  accent: 'sky' | 'violet'
}> = [
  {
    id: 'financial-year',
    name: 'Financial Year',
    description: 'Application-wide financial years used across all clients and tools.',
    accent: 'sky',
  },
  {
    id: 'users',
    name: 'Users',
    description: 'App users, roles, passwords, and API access tokens.',
    accent: 'violet',
  },
]

function Settings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const sectionParam = searchParams.get('section')
  const activeSection: SettingsSection | null =
    sectionParam === 'users'
      ? 'users'
      : sectionParam === 'financial-year'
        ? 'financial-year'
        : null
  const [usersRefreshKey, setUsersRefreshKey] = useState(0)
  const [userCount, setUserCount] = useState<number | null>(null)
  const [financialYears, setFinancialYears] = useState<GlobalFinancialYear[]>([])
  const [deletedFinancialYears, setDeletedFinancialYears] = useState<GlobalFinancialYear[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [restoringFyId, setRestoringFyId] = useState<string | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('add')
  const [editingFy, setEditingFy] = useState<GlobalFinancialYear | null>(null)
  const [selectedStartYear, setSelectedStartYear] = useState(String(new Date().getFullYear()))
  const [selectedStatementType, setSelectedStatementType] = useState('Actual')
  const [savingStatementTypeFyId, setSavingStatementTypeFyId] = useState<string | null>(null)
  const [savingStatusFyId, setSavingStatusFyId] = useState<string | null>(null)
  const [modalError, setModalError] = useState('')

  const sortedYears = useMemo(
    () => normalizeGlobalFinancialYears(financialYears),
    [financialYears],
  )

  const yearOptions = useMemo(
    () =>
      getAvailableFinancialYearOptions(sortedYears, {
        excludeFyId: modalMode === 'edit' ? editingFy?.id : undefined,
      }),
    [sortedYears, modalMode, editingFy?.id],
  )

  const selectedYearOption = yearOptions.find(
    (item) => String(item.startYear) === selectedStartYear,
  )

  const autoFillPreview = useMemo(() => {
    const startYear = Number(selectedStartYear)
    if (!startYear || Number.isNaN(startYear)) {
      return []
    }

    return getAutoFillYearsPreview(
      sortedYears,
      startYear,
      modalMode === 'edit' ? editingFy?.id : undefined,
    )
  }, [sortedYears, selectedStartYear, modalMode, editingFy?.id])

  const loadFinancialYears = async () => {
    setLoading(true)
    try {
      setError('')
      const [activeData, deletedData] = await Promise.all([
        fetchGlobalFinancialYears(),
        fetchDeletedGlobalFinancialYears().catch(() => ({ financialYears: [] })),
      ])
      setFinancialYears(normalizeGlobalFinancialYears(activeData.financialYears))
      setDeletedFinancialYears(normalizeGlobalFinancialYears(deletedData.financialYears))
    } catch {
      setFinancialYears([])
      setDeletedFinancialYears([])
      setError('Could not load financial years.')
    } finally {
      setLoading(false)
    }
  }

  const loadUserCount = async () => {
    try {
      const data = await fetchUsers()
      setUserCount(data.users.length)
    } catch {
      setUserCount(null)
    }
  }

  const loadSettingsOverview = async () => {
    await Promise.all([loadFinancialYears(), loadUserCount()])
  }

  useEffect(() => {
    loadSettingsOverview()
  }, [])

  const closeModal = () => {
    setShowModal(false)
    setEditingFy(null)
    setModalError('')
  }

  const openAddModal = () => {
    const options = getAvailableFinancialYearOptions(sortedYears)
    const defaultOption = options[options.length - 1] ?? options[0]
    setModalMode('add')
    setEditingFy(null)
    setSelectedStartYear(String(defaultOption?.startYear ?? new Date().getFullYear()))
    setSelectedStatementType('Actual')
    setModalError('')
    setShowModal(true)
  }

  const openEditModal = (fy: GlobalFinancialYear) => {
    setModalMode('edit')
    setEditingFy(fy)
    setSelectedStartYear(String(fy.startYear))
    setSelectedStatementType(normalizeStatementType(fy.statementType))
    setModalError('')
    setShowModal(true)
  }

  const persistFinancialYears = async (nextYears: GlobalFinancialYear[]) => {
    const sequenceError = validateSequentialFinancialYears(nextYears)
    if (sequenceError) {
      setModalError(sequenceError)
      return
    }

    setSaving(true)
    setSaveMessage('')
    setError('')
    try {
      const saved = await saveGlobalFinancialYears(nextYears)
      setFinancialYears(normalizeGlobalFinancialYears(saved.financialYears))
      closeModal()
      if (modalMode === 'edit') {
        await showUpdatedAlert(selectedYearOption?.label || editingFy?.label || 'Financial year')
      } else {
        await showAddedAlert(selectedYearOption?.label || 'Financial year')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save financial year'
      setModalError(message)
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveFy = async (event: React.FormEvent) => {
    event.preventDefault()

    const targetStartYear = Number(selectedStartYear)
    if (!targetStartYear || Number.isNaN(targetStartYear)) {
      setModalError('Select a valid financial year.')
      return
    }

    const merged = mergeFinancialYearRange(
      sortedYears,
      {
        targetStartYear,
        replaceFyId: modalMode === 'edit' ? editingFy?.id : undefined,
      },
      generateGlobalFinancialYearId,
    )

    if (!Array.isArray(merged)) {
      setModalError(merged.error)
      return
    }

    const mergedWithType = merged.map((fy) => {
      if (modalMode === 'edit' && fy.id === editingFy?.id) {
        return { ...fy, statementType: selectedStatementType }
      }

      if (modalMode === 'add' && fy.startYear === targetStartYear) {
        return { ...fy, statementType: selectedStatementType }
      }

      return fy
    })

    const fyLabel = selectedYearOption?.label || `${targetStartYear}-${targetStartYear + 1}`
    const confirmed = await confirmSave({
      action: modalMode === 'edit' ? 'edit' : 'add',
      itemLabel: fyLabel,
    })
    if (!confirmed) {
      return
    }

    await persistFinancialYears(mergedWithType)
  }

  const handleStatementTypeChange = async (fy: GlobalFinancialYear, nextType: string) => {
    const normalized = normalizeStatementType(nextType)
    if (normalizeStatementType(fy.statementType) === normalized) {
      return
    }

    setSavingStatementTypeFyId(fy.id)
    setError('')
    try {
      const result = await updateGlobalFinancialYearStatementType(fy.id, normalized)
      setFinancialYears((current) =>
        current.map((item) => (item.id === fy.id ? result.financialYear : item)),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update statement type')
    } finally {
      setSavingStatementTypeFyId(null)
    }
  }

  const handleStatusChange = async (
    fy: GlobalFinancialYear,
    nextStatus: 'active' | 'inactive',
  ) => {
    const normalized = normalizeFinancialYearStatus(nextStatus)
    if (normalizeFinancialYearStatus(fy.status) === normalized) {
      return
    }

    const confirmed = await confirmFinancialYearStatusChange({
      itemLabel: fy.label,
      nextStatus: normalized,
    })
    if (!confirmed) {
      return
    }

    setSavingStatusFyId(fy.id)
    setError('')
    try {
      const result = await updateGlobalFinancialYearStatus(fy.id, normalized)
      setFinancialYears((current) =>
        current.map((item) => (item.id === fy.id ? result.financialYear : item)),
      )
      await showFinancialYearStatusAlert({ itemLabel: fy.label, status: normalized })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update financial year status')
    } finally {
      setSavingStatusFyId(null)
    }
  }

  const handleDeleteFy = async (fy: GlobalFinancialYear) => {
    if (!canDeleteFinancialYear(sortedYears, fy.id)) {
      setError('Delete the latest financial year first to keep years in sequence.')
      return
    }

    const confirmed = await confirmDelete({
      itemLabel: fy.label,
      extraMessage: 'The year will be soft-deleted and can be restored later. Financial statement data is kept.',
    })

    if (!confirmed) {
      return
    }

    setSaving(true)
    setSaveMessage('')
    setError('')
    try {
      await removeGlobalFinancialYear(fy.id)
      await loadFinancialYears()
      await showDeletedAlert(fy.label, true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete financial year')
    } finally {
      setSaving(false)
    }
  }

  const handleRestoreFy = async (fyId: string) => {
    const fy = deletedFinancialYears.find((item) => item.id === fyId)
    const confirmed = await confirmRestore({
      itemLabel: fy?.label || 'financial year',
    })
    if (!confirmed) {
      return
    }

    setRestoringFyId(fyId)
    setError('')
    setSaveMessage('')
    try {
      await restoreGlobalFinancialYear(fyId)
      await loadFinancialYears()
      await showRestoredAlert(fy?.label || 'Financial year')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore financial year')
    } finally {
      setRestoringFyId(null)
    }
  }

  const formatDeletedAt = (value?: string | null) => {
    if (!value) {
      return '—'
    }

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return '—'
    }

    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const openSection = (section: SettingsSection) => {
    setSearchParams({ section })
  }

  const backToSettingsList = () => {
    setSearchParams({})
  }

  const handleRefresh = async () => {
    if (!activeSection) {
      await loadSettingsOverview()
      return
    }

    if (activeSection === 'users') {
      setUsersRefreshKey((current) => current + 1)
      await loadUserCount()
      return
    }

    await loadFinancialYears()
  }

  const getModuleStatus = (moduleId: SettingsSection) => {
    if (moduleId === 'financial-year') {
      if (loading && userCount === null) {
        return 'Loading...'
      }
      if (sortedYears.length === 0) {
        return 'Not configured'
      }
      const activeCount = sortedYears.filter(
        (fy) => normalizeFinancialYearStatus(fy.status) === 'active',
      ).length
      return `${activeCount} active / ${sortedYears.length} ${sortedYears.length === 1 ? 'year' : 'years'}`
    }

    if (userCount === null) {
      return 'Loading...'
    }
    return `${userCount} ${userCount === 1 ? 'user' : 'users'}`
  }

  return (
    <div className="settings-page">
      <header className="page-header page-header-row">
        <div>
          <h1>Settings</h1>
          <p>
            {activeSection
              ? activeSection === 'financial-year'
                ? 'Manage financial years for all clients'
                : 'Settings'
              : 'Configure application-wide master data'}
          </p>
        </div>
        <PageRefreshButton
          onRefresh={handleRefresh}
          disabled={loading && (!activeSection || activeSection === 'financial-year')}
        />
      </header>

      {error && <div className="alert">{error}</div>}
      {saveMessage && <p className="success-text">{saveMessage}</p>}

      {!activeSection ? (
        <section className="panel settings-section">
          <div className="settings-section-header">
            <div>
              <h2>Settings</h2>
              <p className="hint">
                Choose a setting to manage. Financial years and users are maintained here for the
                whole application.
              </p>
            </div>
          </div>

          <div className="settings-fy-table-card">
            <div className="settings-fy-table-meta">
              <span className="settings-fy-count">
                {SETTING_MODULES.length} {SETTING_MODULES.length === 1 ? 'module' : 'modules'}
              </span>
            </div>

            <div className="settings-table-wrap">
              <table className="settings-fy-table settings-modules-table">
                <thead>
                  <tr>
                    <th className="settings-fy-sno-col">#</th>
                    <th>Setting</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th className="settings-fy-actions-col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {SETTING_MODULES.map((module, index) => (
                    <tr key={module.id}>
                      <td className="settings-fy-sno-col">
                        <span className="settings-fy-sno">{index + 1}</span>
                      </td>
                      <td>
                        <div className="settings-module-name">
                          <span className={`settings-module-badge settings-module-badge--${module.accent}`}>
                            {module.name}
                          </span>
                        </div>
                      </td>
                      <td className="settings-module-desc">{module.description}</td>
                      <td>
                        <span className="settings-module-status">{getModuleStatus(module.id)}</span>
                      </td>
                      <td className="settings-fy-actions-col">
                        <button
                          type="button"
                          className="primary-btn settings-module-manage-btn"
                          onClick={() => openSection(module.id)}
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : (
        <>
          {activeSection === 'financial-year' && (
            <button type="button" className="back-link settings-back-link" onClick={backToSettingsList}>
              ← Back to Settings
            </button>
          )}

          {activeSection === 'users' && (
            <SettingsUsersSection
              key={usersRefreshKey}
              onBack={backToSettingsList}
              onCountChange={setUserCount}
            />
          )}

          {activeSection === 'financial-year' && (
          <section className="panel settings-section">
            <div className="settings-section-header">
              <div>
                <h2>Financial Year</h2>
                <p className="hint">
                  Add or edit financial years. You can add previous years — any missing years in
                  between are added automatically so the sequence stays continuous.
                </p>
              </div>
              <button type="button" className="primary-btn" onClick={openAddModal} disabled={saving}>
                Add Financial Year
              </button>
            </div>

            {loading ? (
              <div className="settings-fy-empty">
                <p className="empty-state">Loading financial years...</p>
              </div>
            ) : sortedYears.length === 0 ? (
              <div className="settings-fy-empty">
                <p className="settings-fy-empty-title">No financial years yet</p>
                <p className="settings-fy-empty-text">
                  Click &quot;Add Financial Year&quot; to create the first year for all clients.
                </p>
              </div>
            ) : (
              <div className="settings-fy-table-card">
                <div className="settings-fy-table-meta">
                  <span className="settings-fy-count">
                    {sortedYears.length} {sortedYears.length === 1 ? 'year' : 'years'} configured
                  </span>
                  <span className="settings-fy-range">
                    {sortedYears[0].label} → {sortedYears[sortedYears.length - 1].label}
                  </span>
                </div>

                <div className="settings-table-wrap">
                  <table className="settings-fy-table">
                    <thead>
                      <tr>
                        <th className="settings-fy-sno-col">#</th>
                        <th className="settings-fy-year-col">Financial Year</th>
                        <th className="settings-fy-period-col">Period</th>
                        <th className="settings-fy-type-col">Statement Type</th>
                        <th className="settings-fy-status-col">Status</th>
                        <th className="settings-fy-actions-col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedYears.map((fy, index) => {
                        const canDelete = canDeleteFinancialYear(sortedYears, fy.id)
                        const isLatest = index === sortedYears.length - 1

                        return (
                          <tr
                            key={fy.id}
                            className={isLatest ? 'settings-fy-row settings-fy-row--latest' : 'settings-fy-row'}
                          >
                            <td className="settings-fy-sno-col">
                              <span className="settings-fy-sno">{index + 1}</span>
                            </td>
                            <td className="settings-fy-year-col">
                              <div className="settings-fy-year-cell">
                                <span className="settings-fy-badge">{fy.label}</span>
                                {isLatest && <span className="settings-fy-latest-tag">Latest</span>}
                              </div>
                            </td>
                            <td className="settings-fy-period-col">
                              <span className="settings-fy-period">
                                <span className="settings-fy-period-year">{fy.startYear}</span>
                                <span className="settings-fy-period-sep">to</span>
                                <span className="settings-fy-period-year">{fy.endYear}</span>
                              </span>
                            </td>
                            <td className="settings-fy-type-col">
                              <select
                                className="settings-fy-type-select"
                                value={normalizeStatementType(fy.statementType)}
                                onChange={(event) => handleStatementTypeChange(fy, event.target.value)}
                                disabled={saving || savingStatementTypeFyId === fy.id}
                                aria-label={`Statement type for ${fy.label}`}
                              >
                                {FINANCIAL_STATEMENT_TYPES.map((type) => (
                                  <option key={type} value={type}>
                                    {type}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="settings-fy-status-col">
                              <select
                                className={`settings-fy-status-select settings-fy-status-select--${normalizeFinancialYearStatus(fy.status)}`}
                                value={normalizeFinancialYearStatus(fy.status)}
                                onChange={(event) =>
                                  void handleStatusChange(
                                    fy,
                                    event.target.value as 'active' | 'inactive',
                                  )
                                }
                                disabled={saving || savingStatusFyId === fy.id}
                                aria-label={`Status for ${fy.label}`}
                              >
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                              </select>
                            </td>
                            <td className="settings-fy-actions-col">
                              <div className="settings-fy-actions">
                                <button
                                  type="button"
                                  className="settings-fy-action-btn settings-fy-action-btn--edit"
                                  onClick={() => openEditModal(fy)}
                                  disabled={saving}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="settings-fy-action-btn settings-fy-action-btn--delete"
                                  onClick={() => handleDeleteFy(fy)}
                                  disabled={saving || !canDelete}
                                  title={
                                    canDelete
                                      ? `Delete ${fy.label}`
                                      : 'Delete the latest year first to keep the sequence'
                                  }
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <p className="settings-footnote">
              Open a <Link to="/clients">client</Link> → <strong>Business</strong> to prepare
              statements for each business.
            </p>

            {deletedFinancialYears.length > 0 && (
              <div className="settings-deleted-panel">
                <h3>Deleted Financial Years</h3>
                <p className="hint">Soft-deleted years can be restored when needed.</p>
                <div className="settings-table-wrap">
                  <table className="settings-fy-table settings-deleted-fy-table">
                    <thead>
                      <tr>
                        <th>Financial Year</th>
                        <th>Period</th>
                        <th>Deleted At</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deletedFinancialYears.map((fy) => (
                        <tr key={fy.id}>
                          <td>
                            <span className="settings-fy-badge">{fy.label}</span>
                          </td>
                          <td>
                            {fy.startYear} – {fy.endYear}
                          </td>
                          <td>{formatDeletedAt(fy.deletedAt)}</td>
                          <td>
                            <button
                              type="button"
                              className="secondary-btn"
                              disabled={restoringFyId === fy.id || saving}
                              onClick={() => handleRestoreFy(fy.id)}
                            >
                              {restoringFyId === fy.id ? 'Restoring...' : 'Restore'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
          )}
        </>
      )}

      {showModal && activeSection === 'financial-year' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="settings-fy-modal" onClick={(event) => event.stopPropagation()}>
            <h2>{modalMode === 'edit' ? 'Edit Financial Year' : 'Add Financial Year'}</h2>
            <p className="settings-modal-subtitle">
              {modalMode === 'edit'
                ? 'Change the year. Missing years before or after are added automatically.'
                : 'Pick a year to add. Earlier years are allowed — gap years are filled in automatically.'}
            </p>

            {modalError && <div className="alert">{modalError}</div>}

            <form className="settings-fy-form" onSubmit={handleSaveFy}>
              <label className="settings-field">
                Financial Year
                <select
                  value={selectedStartYear}
                  onChange={(event) => setSelectedStartYear(event.target.value)}
                  required
                >
                  {yearOptions.map((option) => (
                    <option key={option.startYear} value={option.startYear}>
                      {option.label} ({option.startYear} – {option.endYear})
                    </option>
                  ))}
                </select>
              </label>

              <label className="settings-field">
                Statement Type
                <select
                  value={selectedStatementType}
                  onChange={(event) => setSelectedStatementType(event.target.value)}
                  required
                >
                  {FINANCIAL_STATEMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              {selectedYearOption && (
                <div className="settings-preview">
                  <span>Selected</span>
                  <strong>
                    {selectedYearOption.label} ({selectedYearOption.startYear} –{' '}
                    {selectedYearOption.endYear})
                  </strong>
                </div>
              )}

              {autoFillPreview.length > 0 && (
                <div className="settings-preview settings-gap-preview">
                  <span>Auto-added gap years</span>
                  <strong>{autoFillPreview.map((item) => item.label).join(', ')}</strong>
                </div>
              )}

              <div className="settings-modal-actions">
                <button type="button" className="secondary-btn" onClick={closeModal} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="primary-btn" disabled={saving || yearOptions.length === 0}>
                  {saving ? 'Saving...' : modalMode === 'edit' ? 'Save' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Settings
