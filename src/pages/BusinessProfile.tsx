import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  fetchClient,
  removeBusiness,
  updateBusiness,
} from '../api/client'
import type { BusinessStatus, Client } from '../types'
import {
  BUSINESS_TYPES,
  formatBusinessDate,
  getBusinessStatusLabel,
  getFyCellStatusLabel,
  getNormalizedFinancialYears,
  isProprietorshipType,
  normalizeClientBusinesses,
} from '../utils/businessUtils'
import { formatPanInput, getPanValidationMessage } from '../utils/clientValidation'
import {
  buildShortFyLabel,
  getBusinessFyCellState,
  sortFinancialYears,
} from '../utils/financialYear'
import {
  confirmDelete,
  confirmSave,
  showDeletedAlert,
  showUpdatedAlert,
} from '../utils/sweetAlert'
import PageRefreshButton from '../components/PageRefreshButton'
import '../styles/shared.css'
import './BusinessProfile.css'

type ProfileTab = 'details' | 'financial-years'

function BusinessProfile() {
  const { clientId, businessId } = useParams<{ clientId: string; businessId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [modalError, setModalError] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [businessName, setBusinessName] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [businessPan, setBusinessPan] = useState('')
  const [businessAddress, setBusinessAddress] = useState('')
  const [businessGstNumber, setBusinessGstNumber] = useState('')
  const [businessStatus, setBusinessStatus] = useState<BusinessStatus>('active')
  const [businessStartYear, setBusinessStartYear] = useState(String(new Date().getFullYear()))
  const [businessStartingFy, setBusinessStartingFy] = useState(
    buildShortFyLabel(new Date().getFullYear(), new Date().getFullYear() + 1),
  )

  const activeTab: ProfileTab =
    searchParams.get('tab') === 'financial-years' ? 'financial-years' : 'details'

  const loadClient = async () => {
    if (!clientId) {
      return
    }

    try {
      setError('')
      const data = await fetchClient(clientId)
      const normalizedBusinesses = normalizeClientBusinesses(data)
      setClient({
        ...data,
        businesses: normalizedBusinesses,
        financialYears: getNormalizedFinancialYears({
          ...data,
          businesses: normalizedBusinesses,
        }),
      })
    } catch {
      setClient(null)
      setError('Could not load business profile.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadClient()
  }, [clientId])

  const business = useMemo(
    () => client?.businesses.find((item) => item.id === businessId) ?? null,
    [client?.businesses, businessId],
  )

  const financialYears = useMemo(
    () => sortFinancialYears(client?.financialYears || []),
    [client?.financialYears],
  )

  const activeFyCount = useMemo(() => {
    if (!business) {
      return 0
    }

    return financialYears.filter((fy) => getBusinessFyCellState(business, fy) === 'active').length
  }, [business, financialYears])

  const setActiveTab = (tab: ProfileTab) => {
    setSearchParams(tab === 'details' ? {} : { tab })
  }

  const handleBusinessStartYearChange = (value: string) => {
    const start = Number(value)
    const end = start + 1
    setBusinessStartYear(value)
    setBusinessStartingFy(buildShortFyLabel(start, end))
  }

  const openEditModal = () => {
    if (!business) {
      return
    }

    setBusinessName(business.name)
    setBusinessType(business.type)
    setBusinessPan(formatPanInput(business.pan || ''))
    setBusinessAddress(business.address || '')
    setBusinessGstNumber(business.gstNumber || '')
    setBusinessStatus(business.status || 'active')
    setBusinessStartYear(String(business.startingYear))
    setBusinessStartingFy(business.startingFy)
    setConfirmPassword('')
    setModalError('')
    setShowEditModal(true)
  }

  const openDeleteModal = () => {
    setConfirmPassword('')
    setModalError('')
    setShowDeleteModal(true)
  }

  const handleEditBusiness = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!clientId || !business || !businessName.trim() || !businessType.trim()) {
      setModalError('Business name and type are required')
      return
    }

    const panToValidate =
      isProprietorshipType(businessType) && !businessPan.trim()
        ? client?.pan || ''
        : businessPan
    const panError = getPanValidationMessage(panToValidate)
    if (panError) {
      setModalError(panError)
      return
    }

    if (!confirmPassword) {
      setModalError('Password is required')
      return
    }

    const confirmed = await confirmSave({ action: 'edit', itemLabel: businessName.trim() })
    if (!confirmed) {
      return
    }

    setSubmitting(true)
    setModalError('')

    try {
      await updateBusiness(clientId, business.id, {
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
      setShowEditModal(false)
      setConfirmPassword('')
      await showUpdatedAlert(businessName.trim())
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to update business')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteBusiness = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!clientId || !business) {
      return
    }

    if (!confirmPassword) {
      setModalError('Password is required')
      return
    }

    const confirmed = await confirmDelete({
      itemLabel: business.name,
      extraMessage: 'This is a soft delete. The business can be restored later.',
    })
    if (!confirmed) {
      return
    }

    setSubmitting(true)
    setModalError('')

    try {
      await removeBusiness(clientId, business.id, confirmPassword)
      await showDeletedAlert(business.name, true)
      navigate(`/clients/${clientId}/business`)
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to delete business')
      setSubmitting(false)
    }
  }

  if (loading) {
    return <p className="empty-state">Loading business profile...</p>
  }

  if (!client || !business) {
    return (
      <div className="business-profile-page">
        <p className="empty-state">Business not found.</p>
        <button
          type="button"
          className="bp-back-link"
          onClick={() => navigate(clientId ? `/clients/${clientId}/business` : '/clients')}
        >
          ← Back to Business
        </button>
      </div>
    )
  }

  return (
    <div className="business-profile-page">
      <button
        type="button"
        className="bp-back-link"
        onClick={() => navigate(`/clients/${clientId}/business`)}
      >
        ← Back to Business
      </button>

      {error && <div className="alert">{error}</div>}

      <section className="bp-hero-card">
        <div className="bp-hero-gradient" aria-hidden="true" />
        <div className="bp-hero-content">
          <div className="bp-hero-top">
            <div>
              <span className="bp-hero-kicker">Business Profile</span>
              <h1>{business.name}</h1>
              <p className="bp-hero-type">{business.type || 'General Business'}</p>
            </div>
            <div className="bp-hero-actions">
              <PageRefreshButton
                onRefresh={async () => {
                  setLoading(true)
                  await loadClient()
                }}
                disabled={loading}
              />
              <button type="button" className="bp-hero-btn" onClick={openEditModal}>
                Edit
              </button>
              <button type="button" className="bp-hero-btn bp-hero-btn--danger" onClick={openDeleteModal}>
                Delete
              </button>
            </div>
          </div>

          <div className="bp-hero-grid">
            <article className="bp-info-card">
              <div className="bp-info-card-head">
                <span className="bp-info-icon bp-info-icon--client">CL</span>
                <div>
                  <h2>Client Details</h2>
                  <p>Account information</p>
                </div>
              </div>
              <dl className="bp-info-list">
                <div className="bp-info-item">
                  <dt>Client Name</dt>
                  <dd>{client.name}</dd>
                </div>
                <div className="bp-info-item">
                  <dt>Mobile</dt>
                  <dd>{client.mobile || '—'}</dd>
                </div>
                <div className="bp-info-item">
                  <dt>Email</dt>
                  <dd>{client.email || '—'}</dd>
                </div>
                <div className="bp-info-item">
                  <dt>Address</dt>
                  <dd>{client.address || '—'}</dd>
                </div>
                <div className="bp-info-item">
                  <dt>PIN</dt>
                  <dd>{client.pin || '—'}</dd>
                </div>
              </dl>
            </article>

            <article className="bp-info-card">
              <div className="bp-info-card-head">
                <span className="bp-info-icon bp-info-icon--business">BZ</span>
                <div>
                  <h2>Business Details</h2>
                  <p>Entity overview</p>
                </div>
              </div>
              <dl className="bp-info-list">
                <div className="bp-info-item">
                  <dt>Business Name</dt>
                  <dd>{business.name}</dd>
                </div>
                <div className="bp-info-item">
                  <dt>Business Type</dt>
                  <dd>{business.type || '—'}</dd>
                </div>
                <div className="bp-info-item">
                  <dt>PAN</dt>
                  <dd>{business.pan || '—'}</dd>
                </div>
                <div className="bp-info-item">
                  <dt>Address</dt>
                  <dd>{business.address || '—'}</dd>
                </div>
                <div className="bp-info-item">
                  <dt>GST Number</dt>
                  <dd>{business.gstNumber || '—'}</dd>
                </div>
                <div className="bp-info-item">
                  <dt>Status</dt>
                  <dd>{getBusinessStatusLabel(business.status)}</dd>
                </div>
                <div className="bp-info-item">
                  <dt>Starting FY</dt>
                  <dd>
                    <span className="bp-fy-badge">{business.startingFy}</span>
                  </dd>
                </div>
                <div className="bp-info-item">
                  <dt>Start Year</dt>
                  <dd>{business.startingYear}</dd>
                </div>
                <div className="bp-info-item">
                  <dt>Created On</dt>
                  <dd>{formatBusinessDate(business.createdAt)}</dd>
                </div>
              </dl>
            </article>
          </div>

          <div className="bp-hero-stats">
            <div className="bp-stat">
              <span className="bp-stat-value">{financialYears.length}</span>
              <span className="bp-stat-label">Total Financial Years</span>
            </div>
            <div className="bp-stat">
              <span className="bp-stat-value">{activeFyCount}</span>
              <span className="bp-stat-label">Active Statements</span>
            </div>
            <div className="bp-stat">
              <span className="bp-stat-value">{client.businesses.length}</span>
              <span className="bp-stat-label">Client Businesses</span>
            </div>
          </div>
        </div>
      </section>

      <section className="bp-tabs-panel">
        <div className="bp-tabs">
          <button
            type="button"
            className={`bp-tab${activeTab === 'details' ? ' active' : ''}`}
            onClick={() => setActiveTab('details')}
          >
            Business Details
          </button>
          <button
            type="button"
            className={`bp-tab${activeTab === 'financial-years' ? ' active' : ''}`}
            onClick={() => setActiveTab('financial-years')}
          >
            Financial Years
          </button>
        </div>

        {activeTab === 'details' && (
          <div className="bp-tab-content">
            <div className="bp-details-grid">
              <div className="bp-detail-card">
                <span className="bp-detail-label">Business Name</span>
                <strong>{business.name}</strong>
              </div>
              <div className="bp-detail-card">
                <span className="bp-detail-label">Business Type</span>
                <strong>{business.type || '—'}</strong>
              </div>
              <div className="bp-detail-card">
                <span className="bp-detail-label">PAN</span>
                <strong>{business.pan || '—'}</strong>
              </div>
              <div className="bp-detail-card">
                <span className="bp-detail-label">Address</span>
                <strong>{business.address || '—'}</strong>
              </div>
              <div className="bp-detail-card">
                <span className="bp-detail-label">GST Number</span>
                <strong>{business.gstNumber || '—'}</strong>
              </div>
              <div className="bp-detail-card">
                <span className="bp-detail-label">Status</span>
                <strong>{getBusinessStatusLabel(business.status)}</strong>
              </div>
              <div className="bp-detail-card">
                <span className="bp-detail-label">Starting FY</span>
                <strong>{business.startingFy}</strong>
              </div>
              <div className="bp-detail-card">
                <span className="bp-detail-label">Start Year</span>
                <strong>{business.startingYear}</strong>
              </div>
              <div className="bp-detail-card">
                <span className="bp-detail-label">Created On</span>
                <strong>{formatBusinessDate(business.createdAt)}</strong>
              </div>
              <div className="bp-detail-card">
                <span className="bp-detail-label">Client</span>
                <strong>{client.name}</strong>
              </div>
            </div>

            <div className="bp-tab-actions">
              <button type="button" className="primary-btn" onClick={openEditModal}>
                Edit Business
              </button>
              <Link to={`/clients/${clientId}/business`} className="secondary-btn bp-link-btn">
                Back to Matrix
              </Link>
            </div>
          </div>
        )}

        {activeTab === 'financial-years' && (
          <div className="bp-tab-content">
            <p className="bp-tab-hint">
              All financial years for <strong>{business.name}</strong>. Open FS to prepare or
              review statements.
            </p>

            {financialYears.length === 0 ? (
              <p className="empty-state">
                No financial years configured. Add them in <Link to="/settings">Settings</Link>.
              </p>
            ) : (
              <div className="bp-fy-table-card">
                <table className="bp-fy-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Financial Year</th>
                      <th>Period</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financialYears.map((fy, index) => {
                      const cellState = getBusinessFyCellState(business, fy)

                      return (
                        <tr key={fy.id} className={cellState === 'active' ? 'bp-fy-row-active' : ''}>
                          <td>
                            <span className="bp-fy-sno">{index + 1}</span>
                          </td>
                          <td>
                            <span className="bp-fy-label">{fy.label}</span>
                          </td>
                          <td>
                            <span className="bp-fy-period">
                              {fy.startYear} – {fy.endYear}
                            </span>
                          </td>
                          <td>
                            <span className={`bp-status bp-status--${cellState}`}>
                              {getFyCellStatusLabel(cellState)}
                            </span>
                          </td>
                          <td>
                            {cellState === 'active' ? (
                              <Link
                                to={`/clients/${clientId}/fs/${fy.id}/business/${business.id}`}
                                className="bp-fs-link"
                              >
                                Open FS
                              </Link>
                            ) : (
                              <span className="bp-fs-muted">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal modal-wide" onClick={(event) => event.stopPropagation()}>
            <h2>Edit Business</h2>
            {modalError && <div className="modal-error">{modalError}</div>}
            <form className="modal-form" onSubmit={handleEditBusiness}>
              <div className="modal-form-grid modal-form-grid-edit">
                <label className="modal-field">
                  Business Name *
                  <input
                    type="text"
                    value={businessName}
                    onChange={(event) => setBusinessName(event.target.value)}
                    required
                    autoFocus
                  />
                </label>
                <label className="modal-field">
                  Business Type *
                  <select
                    value={businessType}
                    onChange={(event) => {
                      const value = event.target.value
                      setBusinessType(value)
                      if (isProprietorshipType(value) && client?.pan) {
                        setBusinessPan(formatPanInput(client.pan))
                      }
                    }}
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
                <label className="modal-field">
                  PAN *
                  <input
                    type="text"
                    value={businessPan}
                    onChange={(event) => setBusinessPan(formatPanInput(event.target.value))}
                    maxLength={10}
                  />
                </label>
                <label className="modal-field">
                  Status *
                  <select
                    value={businessStatus}
                    onChange={(event) => setBusinessStatus(event.target.value as BusinessStatus)}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
                <label className="modal-field modal-field-span-2">
                  Address
                  <textarea
                    value={businessAddress}
                    onChange={(event) => setBusinessAddress(event.target.value)}
                    rows={2}
                  />
                </label>
                <label className="modal-field">
                  GST Number
                  <input
                    type="text"
                    value={businessGstNumber}
                    onChange={(event) => setBusinessGstNumber(event.target.value.toUpperCase())}
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
                <div className="fy-preview modal-field-span-2">
                  <span>Starting FY</span>
                  <strong>{businessStartingFy}</strong>
                </div>
              </div>
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
                <button type="button" className="secondary-btn" onClick={() => setShowEditModal(false)}>
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

      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h2>Delete Business</h2>
            <p className="modal-text">
              Are you sure you want to delete <strong>{business.name}</strong>? Enter password to
              confirm.
            </p>
            {modalError && <div className="modal-error">{modalError}</div>}
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
                <button type="button" className="secondary-btn" onClick={() => setShowDeleteModal(false)}>
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
    </div>
  )
}

export default BusinessProfile
