import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { createBusiness, fetchClient, fetchDeletedBusinesses, removeBusiness, restoreBusiness, updateBusiness } from '../api/client'
import type { Business as BusinessRecord, BusinessStatus, Client } from '../types'
import {
  BUSINESS_TYPES,
  formatBusinessDate,
  getBusinessStatusLabel,
  getNormalizedFinancialYears,
  isProprietorshipType,
  normalizeClientBusinesses,
} from '../utils/businessUtils'
import { formatPanInput, getPanValidationMessage } from '../utils/clientValidation'
import { getDefaultFyForBusiness, buildShortFyLabel, sortFinancialYears } from '../utils/financialYear'
import {
  confirmDelete,
  confirmRestore,
  confirmSave,
  showAddedAlert,
  showDeletedAlert,
  showRestoredAlert,
  showUpdatedAlert,
} from '../utils/sweetAlert'
import {
  CONSOLIDATED_BUSINESS_ID,
  CONSOLIDATED_BUSINESS_LABEL,
  getDefaultFyForConsolidated,
} from '../utils/consolidatedFs'
import PageRefreshButton from '../components/PageRefreshButton'
import { APP_NAME } from '../config/app'
import { TOOLS } from '../config/tools'
import { buildBusinessProfileRoute, buildToolPickerRoute, buildToolWorkspaceRoute } from '../utils/toolRoutes'
import '../styles/shared.css'
import './Business.css'

const currentYear = new Date().getFullYear()

type BusinessModalMode = 'add' | 'edit' | 'delete' | null

function Business() {
  const { clientId } = useParams<{ clientId: string }>()
  const navigate = useNavigate()

  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showAddBusinessModal, setShowAddBusinessModal] = useState(false)
  const [businessModalMode, setBusinessModalMode] = useState<BusinessModalMode>(null)
  const [editingBusiness, setEditingBusiness] = useState<BusinessRecord | null>(null)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [businessModalError, setBusinessModalError] = useState('')
  const [openActionsMenuId, setOpenActionsMenuId] = useState<string | null>(null)
  const [actionsMenuPosition, setActionsMenuPosition] = useState<{
    top: number
    left: number
  } | null>(null)

  const [businessName, setBusinessName] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [businessPan, setBusinessPan] = useState('')
  const [businessAddress, setBusinessAddress] = useState('')
  const [businessGstNumber, setBusinessGstNumber] = useState('')
  const [businessStatus, setBusinessStatus] = useState<BusinessStatus>('active')
  const [businessPanError, setBusinessPanError] = useState('')
  const [deletedBusinesses, setDeletedBusinesses] = useState<BusinessRecord[]>([])
  const [restoringBusinessId, setRestoringBusinessId] = useState<string | null>(null)
  const [businessStartYear, setBusinessStartYear] = useState(String(currentYear))
  const [businessStartingFy, setBusinessStartingFy] = useState(
    buildShortFyLabel(currentYear, currentYear + 1),
  )

  const loadDeletedBusinesses = async () => {
    if (!clientId) {
      return
    }

    try {
      const data = await fetchDeletedBusinesses(clientId)
      setDeletedBusinesses(data)
    } catch {
      setDeletedBusinesses([])
    }
  }

  const loadClient = async () => {
    if (!clientId) {
      return
    }

    try {
      setError('')
      const data = await fetchClient(clientId)
      setClient({
        ...data,
        financialYears: getNormalizedFinancialYears({
          ...data,
          businesses: normalizeClientBusinesses(data),
        }),
        businesses: normalizeClientBusinesses(data),
      })
      await loadDeletedBusinesses()
    } catch {
      setError('Could not load client details.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadClient()
  }, [clientId])

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
        target.closest('.business-actions-trigger') ||
        target.closest('.business-actions-dropdown')
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

  const openActionsMenu = (businessId: string, button: HTMLButtonElement) => {
    if (openActionsMenuId === businessId) {
      closeActionsMenu()
      return
    }

    const rect = button.getBoundingClientRect()
    const menuWidth = 152

    setOpenActionsMenuId(businessId)
    setActionsMenuPosition({
      top: rect.bottom + 6,
      left: Math.max(8, rect.right - menuWidth),
    })
  }

  const handleBusinessStartYearChange = (value: string) => {
    const start = Number(value)
    const end = start + 1
    setBusinessStartYear(value)
    setBusinessStartingFy(buildShortFyLabel(start, end))
  }

  const handleBusinessTypeChange = (value: string) => {
    setBusinessType(value)

    if (isProprietorshipType(value) && client?.pan) {
      setBusinessPan(formatPanInput(client.pan))
      setBusinessPanError('')
    }
  }

  const handleBusinessPanChange = (value: string) => {
    const formatted = formatPanInput(value)
    setBusinessPan(formatted)
    setBusinessPanError(formatted ? getPanValidationMessage(formatted) || '' : '')
  }

  const resetBusinessFormFields = () => {
    setBusinessName('')
    setBusinessType('')
    setBusinessPan('')
    setBusinessAddress('')
    setBusinessGstNumber('')
    setBusinessStatus('active')
    setBusinessPanError('')
    setBusinessStartYear(String(currentYear))
    setBusinessStartingFy(buildShortFyLabel(currentYear, currentYear + 1))
  }

  const openAddBusinessModal = () => {
    setBusinessModalMode('add')
    setEditingBusiness(null)
    resetBusinessFormFields()
    setConfirmPassword('')
    setBusinessModalError('')
    setShowAddBusinessModal(true)
  }

  const openEditBusinessModal = (business: BusinessRecord) => {
    setBusinessModalMode('edit')
    setEditingBusiness(business)
    setBusinessName(business.name)
    setBusinessType(business.type)
    setBusinessPan(formatPanInput(business.pan || ''))
    setBusinessAddress(business.address || '')
    setBusinessGstNumber(business.gstNumber || '')
    setBusinessStatus(business.status || 'active')
    setBusinessPanError('')
    setBusinessStartYear(String(business.startingYear))
    setBusinessStartingFy(business.startingFy)
    setConfirmPassword('')
    setBusinessModalError('')
    setShowAddBusinessModal(true)
  }

  const openDeleteBusinessModal = (business: BusinessRecord) => {
    setBusinessModalMode('delete')
    setEditingBusiness(business)
    setConfirmPassword('')
    setBusinessModalError('')
    setShowAddBusinessModal(true)
  }

  const closeBusinessModal = () => {
    setShowAddBusinessModal(false)
    setBusinessModalMode(null)
    setEditingBusiness(null)
    setConfirmPassword('')
    setBusinessModalError('')
    setSubmitting(false)
  }

  const validateBusinessForm = () => {
    if (!businessName.trim()) {
      return 'Business name is required'
    }

    if (!businessType.trim()) {
      return 'Business type is required'
    }

    const panToValidate =
      isProprietorshipType(businessType) && !businessPan.trim()
        ? client?.pan || ''
        : businessPan

    const panError = getPanValidationMessage(panToValidate)
    if (panError) {
      setBusinessPanError(panError)
      return panError
    }

    if (!businessStatus) {
      return 'Status is required'
    }

    return null
  }

  const handleAddBusiness = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!clientId) {
      return
    }

    const validationError = validateBusinessForm()
    if (validationError) {
      setBusinessModalError(validationError)
      return
    }

    const confirmed = await confirmSave({ action: 'add', itemLabel: businessName.trim() })
    if (!confirmed) {
      return
    }

    setSubmitting(true)
    setBusinessModalError('')

    try {
      const created = await createBusiness(clientId, {
        name: businessName,
        type: businessType,
        pan: businessPan,
        address: businessAddress,
        startingFy: businessStartingFy,
        startingYear: Number(businessStartYear),
        gstNumber: businessGstNumber,
        status: businessStatus,
      })
      await loadClient()
      closeBusinessModal()
      await showAddedAlert(created.name, `
          <div style="text-align:left;font-size:0.92rem;line-height:1.7;color:#4b5563">
            <div><strong>Type:</strong> ${created.type}</div>
            <div><strong>PAN:</strong> ${created.pan}</div>
            <div><strong>Starting FY:</strong> ${created.startingFy}</div>
            <div><strong>Status:</strong> ${getBusinessStatusLabel(created.status)}</div>
          </div>
        `)
    } catch (err) {
      setBusinessModalError(err instanceof Error ? err.message : 'Failed to add business')
      setSubmitting(false)
    }
  }

  const handleEditBusiness = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!clientId || !editingBusiness) {
      return
    }

    const validationError = validateBusinessForm()
    if (validationError) {
      setBusinessModalError(validationError)
      return
    }

    if (!confirmPassword) {
      setBusinessModalError('Password is required')
      return
    }

    const confirmed = await confirmSave({ action: 'edit', itemLabel: businessName.trim() })
    if (!confirmed) {
      return
    }

    setSubmitting(true)
    setBusinessModalError('')

    try {
      await updateBusiness(clientId, editingBusiness.id, {
        name: businessName,
        type: businessType,
        pan: businessPan,
        address: businessAddress,
        startingFy: businessStartingFy,
        startingYear: Number(businessStartYear),
        gstNumber: businessGstNumber,
        status: businessStatus,
        password: confirmPassword,
      })
      await loadClient()
      closeBusinessModal()
      await showUpdatedAlert(businessName.trim())
    } catch (err) {
      setBusinessModalError(err instanceof Error ? err.message : 'Failed to update business')
      setSubmitting(false)
    }
  }

  const handleRestoreBusiness = async (businessId: string) => {
    if (!clientId) {
      return
    }

    const business = deletedBusinesses.find((item) => item.id === businessId)
    const confirmed = await confirmRestore({
      itemLabel: business?.name || 'this business',
    })
    if (!confirmed) {
      return
    }

    setRestoringBusinessId(businessId)
    try {
      await restoreBusiness(clientId, businessId)
      await loadClient()
      await showRestoredAlert(business?.name || 'Business')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore business')
    } finally {
      setRestoringBusinessId(null)
    }
  }

  const renderBusinessFormFields = (mode: 'add' | 'edit') => (
    <div className="business-form-layout">
      <label className="modal-field business-form-field-full">
        Business Name *
        <input
          type="text"
          value={businessName}
          onChange={(event) => setBusinessName(event.target.value)}
          placeholder="Enter business name"
          required
          autoFocus={mode === 'add'}
        />
      </label>

      <div className="business-form-row business-form-row-3">
        <label className="modal-field">
          Business Type *
          <select
            value={businessType}
            onChange={(event) => handleBusinessTypeChange(event.target.value)}
            required
          >
            <option value="">Select type</option>
            {BUSINESS_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <label className="modal-field modal-field-pan">
          PAN *
          <input
            type="text"
            value={businessPan}
            onChange={(event) => handleBusinessPanChange(event.target.value)}
            placeholder={isProprietorshipType(businessType) ? 'Uses proprietor PAN if empty' : 'ABCDE1234F'}
            maxLength={10}
            inputMode="text"
            autoCapitalize="characters"
            spellCheck={false}
            className={`pan-input ${businessPanError ? 'pan-input-invalid' : ''}`}
          />
          {businessPanError ? (
            <span className="pan-field-error">{businessPanError}</span>
          ) : null}
        </label>

        <label className="modal-field">
          Status *
          <select
            value={businessStatus}
            onChange={(event) => setBusinessStatus(event.target.value as BusinessStatus)}
            required
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      </div>

      <label className="modal-field business-form-field-full">
        Address
        <textarea
          value={businessAddress}
          onChange={(event) => setBusinessAddress(event.target.value)}
          placeholder="Business address"
          rows={2}
        />
      </label>

      <div className="business-form-row business-form-row-2">
        <label className="modal-field">
          GST Number
          <input
            type="text"
            value={businessGstNumber}
            onChange={(event) => setBusinessGstNumber(event.target.value.toUpperCase())}
            placeholder="Optional"
          />
        </label>

        <label className="modal-field">
          Start Year *
          <input
            type="number"
            value={businessStartYear}
            onChange={(event) => handleBusinessStartYearChange(event.target.value)}
            min={1900}
            max={2100}
            required
          />
        </label>
      </div>

      <div className="fy-preview business-form-field-full">
        <span>Starting FY</span>
        <strong>{businessStartingFy}</strong>
      </div>
    </div>
  )

  const handleDeleteBusiness = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!clientId || !editingBusiness) {
      return
    }

    if (!confirmPassword) {
      setBusinessModalError('Password is required')
      return
    }

    const confirmed = await confirmDelete({
      itemLabel: editingBusiness.name,
      extraMessage: 'This is a soft delete. The business can be restored later.',
    })
    if (!confirmed) {
      return
    }

    setSubmitting(true)
    setBusinessModalError('')

    try {
      await removeBusiness(clientId, editingBusiness.id, confirmPassword)
      await loadClient()
      closeBusinessModal()
      await showDeletedAlert(editingBusiness.name, true)
    } catch (err) {
      setBusinessModalError(err instanceof Error ? err.message : 'Failed to delete business')
      setSubmitting(false)
    }
  }

  const handleEditFromMenu = () => {
    const business = client?.businesses.find((item) => item.id === openActionsMenuId)
    if (!business) {
      return
    }
    closeActionsMenu()
    openEditBusinessModal(business)
  }

  const handleDeleteFromMenu = () => {
    const business = client?.businesses.find((item) => item.id === openActionsMenuId)
    if (!business) {
      return
    }
    closeActionsMenu()
    openDeleteBusinessModal(business)
  }

  const handleProfileFromMenu = () => {
    const business = client?.businesses.find((item) => item.id === openActionsMenuId)
    if (!business || !clientId) {
      return
    }
    closeActionsMenu()
    navigate(buildBusinessProfileRoute(clientId, business.id))
  }

  const renderBusinessTools = (
    targetBusinessId: string,
    defaultFy: { id: string } | null,
    isConsolidated = false,
  ) => (
    <div className="business-tools-row">
      {TOOLS.map((tool) => {
        const consolidatedBlocked = isConsolidated && !tool.supportsConsolidated
        const disabled = !tool.available || consolidatedBlocked || !defaultFy

        if (disabled) {
          return (
            <span
              key={tool.id}
              className={`business-tool-chip business-tool-chip--disabled business-tool-chip--${tool.accent}`}
              title={
                !defaultFy
                  ? 'No active financial year'
                  : consolidatedBlocked
                    ? 'Not available for consolidated'
                    : 'Coming soon'
              }
            >
              {tool.shortName}
            </span>
          )
        }

        return (
          <Link
            key={tool.id}
            to={buildToolWorkspaceRoute(clientId!, tool.id, defaultFy.id, targetBusinessId)}
            className={`business-tool-chip business-tool-chip--${tool.accent}`}
            title={tool.name}
          >
            {tool.shortName}
          </Link>
        )
      })}
      <Link
        to={buildToolPickerRoute(clientId!, targetBusinessId)}
        className="business-tool-chip business-tool-chip--all"
        title="View all tools"
      >
        All
      </Link>
    </div>
  )

  const financialYears = useMemo(
    () => sortFinancialYears(client?.financialYears || []),
    [client?.financialYears],
  )

  const consolidatedDefaultFy = useMemo(
    () => (client ? getDefaultFyForConsolidated(client.businesses, financialYears) : null),
    [client, financialYears],
  )

  if (loading) {
    return <p className="empty-state">Loading...</p>
  }

  if (!client) {
    return (
      <div>
        <p className="empty-state">Client not found.</p>
        <button type="button" className="back-link" onClick={() => navigate('/clients')}>
          Back to Clients
        </button>
      </div>
    )
  }

  return (
    <div className="business-page">
      <button type="button" className="back-link" onClick={() => navigate('/clients')}>
        ← Back to Clients
      </button>

      <header className="page-header page-header-row">
        <div>
          <h1>Client Workspace</h1>
          <p>
            {APP_NAME} · Client:{' '}
            <Link to={`/clients/${client.id}/business`} className="client-link">
              {client.name}
            </Link>
          </p>
        </div>
        <PageRefreshButton
          onRefresh={async () => {
            setLoading(true)
            await loadClient()
          }}
          disabled={loading}
        />
      </header>

      {error && <div className="alert">{error}</div>}

      <section className="panel">
        <div className="panel-header-row">
          <div>
            <h2>Client Workspace</h2>
            <p className="hint business-matrix-hint">
              Open a tool for each business. Financial year is selected inside each tool or from the
              tool picker. Client and business stay shared across Financial Statement, Cash Flow,
              Project Report, CMA, DPR, and future tools. Years are managed in{' '}
              <Link to="/settings">Settings</Link>.
            </p>
          </div>
          <div className="business-header-actions">
            <Link to="/settings" className="secondary-btn">
              Manage Years
            </Link>
            <button type="button" className="primary-btn" onClick={openAddBusinessModal}>
              Add Business
            </button>
          </div>
        </div>

        {client.businesses.length === 0 ? (
          <p className="empty-state">No businesses yet. Click &quot;Add Business&quot; to get started.</p>
        ) : (
          <div className="business-matrix-section">
            <div className="business-matrix-wrap">
              <table className="business-matrix business-matrix--tools">
                <thead>
                  <tr>
                    <th className="sno-col">S.No</th>
                    <th>Business Name</th>
                    <th>Type</th>
                    <th>PAN</th>
                    <th>Status</th>
                    <th>Starting FY</th>
                    <th className="business-tools-col">Tools</th>
                    <th className="business-matrix-actions-col" aria-label="Actions">
                      <span className="business-matrix-actions-head" title="Actions" aria-hidden="true">
                        ⋮
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {client.businesses.length > 1 && (
                    <tr className="business-matrix-row-consolidated">
                      <td className="sno-col">
                        <span className="business-matrix-consolidated-mark" title="Consolidated">
                          ∑
                        </span>
                      </td>
                      <td className="business-matrix-name">
                        <span className="business-matrix-consolidated-name">
                          {CONSOLIDATED_BUSINESS_LABEL}
                        </span>
                      </td>
                      <td>Consolidated</td>
                      <td>—</td>
                      <td>—</td>
                      <td>All Businesses</td>
                      <td className="business-tools-col">
                        {renderBusinessTools(CONSOLIDATED_BUSINESS_ID, consolidatedDefaultFy, true)}
                      </td>
                      <td className="business-matrix-actions-col">
                        <span className="business-matrix-consolidated-hint" title="Combined view">
                          —
                        </span>
                      </td>
                    </tr>
                  )}
                  {client.businesses.map((business, index) => {
                    const defaultFy = getDefaultFyForBusiness(business, financialYears)

                    return (
                      <tr key={business.id}>
                        <td className="sno-col">{index + 1}</td>
                        <td className="business-matrix-name">
                          <Link
                            to={buildBusinessProfileRoute(clientId!, business.id)}
                            className="business-matrix-name-link"
                          >
                            {business.name}
                          </Link>
                        </td>
                        <td>{business.type}</td>
                        <td>{business.pan || '—'}</td>
                        <td>
                          <span
                            className={`business-status-badge business-status-badge--${business.status || 'active'}`}
                          >
                            {getBusinessStatusLabel(business.status)}
                          </span>
                        </td>
                        <td>{business.startingFy}</td>
                        <td className="business-tools-col">
                          {renderBusinessTools(business.id, defaultFy)}
                        </td>
                        <td className="business-matrix-actions-col">
                          <div className="business-actions-menu">
                            <button
                              type="button"
                              className={`business-actions-trigger${
                                openActionsMenuId === business.id ? ' is-open' : ''
                              }`}
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation()
                                openActionsMenu(business.id, event.currentTarget)
                              }}
                              aria-label={`Actions for ${business.name}`}
                              aria-haspopup="menu"
                              aria-expanded={openActionsMenuId === business.id}
                            >
                              <span className="business-actions-dots" aria-hidden="true">
                                ⋮
                              </span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {financialYears.length === 0 ? (
              <p className="hint business-tools-fy-hint">
                No financial years yet. Add them in <Link to="/settings">Settings</Link> to open
                tools.
              </p>
            ) : null}
          </div>
        )}
      </section>

      {deletedBusinesses.length > 0 && (
        <section className="panel business-deleted-panel">
          <div className="panel-header-row">
            <div>
              <h2>Deleted Businesses</h2>
              <p className="hint">Soft-deleted businesses can be restored when needed.</p>
            </div>
          </div>

          <div className="business-deleted-table-wrap">
            <table className="business-deleted-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>PAN</th>
                  <th>Deleted At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {deletedBusinesses.map((business) => (
                  <tr key={business.id}>
                    <td>{business.name}</td>
                    <td>{business.type}</td>
                    <td>{business.pan || '—'}</td>
                    <td>
                      {business.deletedAt
                        ? formatBusinessDate(business.deletedAt)
                        : '—'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="secondary-btn"
                        disabled={restoringBusinessId === business.id}
                        onClick={() => handleRestoreBusiness(business.id)}
                      >
                        {restoringBusinessId === business.id ? 'Restoring...' : 'Restore'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {openActionsMenuId && actionsMenuPosition && (
        <div
          className="business-actions-dropdown business-actions-dropdown-fixed"
          style={{
            top: actionsMenuPosition.top,
            left: actionsMenuPosition.left,
          }}
          role="menu"
        >
          <button
            type="button"
            className="business-actions-item"
            role="menuitem"
            onClick={handleProfileFromMenu}
          >
            Profile
          </button>
          <button
            type="button"
            className="business-actions-item"
            role="menuitem"
            onClick={handleEditFromMenu}
          >
            Edit
          </button>
          <button
            type="button"
            className="business-actions-item business-actions-item-danger"
            role="menuitem"
            onClick={handleDeleteFromMenu}
          >
            Delete
          </button>
        </div>
      )}

      {showAddBusinessModal && businessModalMode === 'delete' && editingBusiness && (
        <div className="modal-overlay" onClick={closeBusinessModal}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h2>Delete Business</h2>
            <p className="modal-text">
              Are you sure you want to delete <strong>{editingBusiness.name}</strong>? The business
              will be soft-deleted and can be restored later. Enter password to confirm.
            </p>

            {businessModalError && <div className="modal-error">{businessModalError}</div>}

            <form onSubmit={handleDeleteBusiness}>
              <label className="modal-field">
                Password
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Enter password"
                  required
                  autoFocus
                />
              </label>

              <div className="modal-actions">
                <button type="button" className="secondary-btn" onClick={closeBusinessModal}>
                  Cancel
                </button>
                <button type="submit" className="danger-btn" disabled={submitting}>
                  {submitting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddBusinessModal && businessModalMode === 'edit' && editingBusiness && (
        <div className="modal-overlay" onClick={closeBusinessModal}>
          <div className="modal modal-wide" onClick={(event) => event.stopPropagation()}>
            <h2>Edit Business</h2>

            {businessModalError && <div className="modal-error">{businessModalError}</div>}

            <form className="modal-form" onSubmit={handleEditBusiness}>
              {renderBusinessFormFields('edit')}

              <label className="modal-field">
                Password
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Enter password to save changes"
                  required
                />
              </label>

              <div className="modal-actions">
                <button type="button" className="secondary-btn" onClick={closeBusinessModal}>
                  Cancel
                </button>
                <button type="submit" className="primary-btn" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddBusinessModal && businessModalMode === 'add' && (
        <div className="modal-overlay" onClick={closeBusinessModal}>
          <div className="modal modal-wide" onClick={(event) => event.stopPropagation()}>
            <h2>Add Business</h2>

            {businessModalError && <div className="modal-error">{businessModalError}</div>}

            <form className="modal-form" onSubmit={handleAddBusiness}>
              {renderBusinessFormFields('add')}

              <div className="modal-actions">
                <button type="button" className="secondary-btn" onClick={closeBusinessModal}>
                  Cancel
                </button>
                <button type="submit" className="primary-btn" disabled={submitting}>
                  {submitting ? 'Adding...' : 'Add Business'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Business
