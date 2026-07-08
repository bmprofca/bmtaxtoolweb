import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  createClient,
  fetchClients,
  fetchDeletedClients,
  removeClient,
  restoreClient,
  updateClient,
} from '../api/client'
import type { Client, ClientFormPayload, ClientStatus, ClientStatusFilter } from '../types'
import {
  formatPanInput,
  getPanValidationMessage,
  PAN_FORMAT_HINT,
} from '../utils/clientValidation'
import {
  confirmDelete,
  confirmRestore,
  confirmSave,
  showAddedAlert,
  showDeletedAlert,
  showRestoredAlert,
  showUpdatedAlert,
} from '../utils/sweetAlert'
import PageRefreshButton from '../components/PageRefreshButton'
import '../styles/shared.css'
import './Clients.css'

const EMPTY_FORM: ClientFormPayload = {
  name: '',
  mobile: '',
  email: '',
  address: '',
  pin: '',
  pan: '',
}

type ModalMode = 'add' | 'edit' | 'delete' | 'success' | null

function RequiredMark() {
  return <span className="required">*</span>
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l8.06-8.06.92.92L5.92 19.58zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
      />
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
      />
    </svg>
  )
}

function RestoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12.5 8c-2.65 0-5.05 1.04-6.86 2.74L3 8v7h7l-2.62-2.62A7.94 7.94 0 0 1 12.5 10c1.77 0 3.4.58 4.73 1.55l1.46-1.46A9.94 9.94 0 0 0 12.5 8zm8.96 2.26-1.46 1.46A7.94 7.94 0 0 1 20.5 16c-1.77 0-3.4-.58-4.73-1.55l-1.46 1.46A9.94 9.94 0 0 0 12.5 18c2.65 0 5.05-1.04 6.86-2.74L22 18v-7h-7l2.62 2.62A7.94 7.94 0 0 1 12.5 14c-1.77 0-3.4-.58-4.73-1.55z"
      />
    </svg>
  )
}

function Clients() {
  const [clients, setClients] = useState<Client[]>([])
  const [deletedClients, setDeletedClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ClientStatusFilter>('active')

  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [activeClientId, setActiveClientId] = useState<string | null>(null)
  const [formData, setFormData] = useState<ClientFormPayload>(EMPTY_FORM)
  const [deletePassword, setDeletePassword] = useState('')
  const [modalError, setModalError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [successClient, setSuccessClient] = useState<Client | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [panFieldError, setPanFieldError] = useState('')

  const loadClients = async () => {
    try {
      setError('')
      const [listed, deleted] = await Promise.all([
        fetchClients({ status: statusFilter, search: debouncedSearch }),
        fetchDeletedClients(),
      ])
      setClients(listed)
      setDeletedClients(deleted)
    } catch {
      setError('Could not load clients. Make sure the server is running on port 3001.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => window.clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    setLoading(true)
    loadClients()
  }, [statusFilter, debouncedSearch])

  const closeModal = () => {
    setModalMode(null)
    setActiveClientId(null)
    setFormData(EMPTY_FORM)
    setDeletePassword('')
    setModalError('')
    setSubmitting(false)
    setSuccessClient(null)
    setPanFieldError('')
  }

  const openAddModal = () => {
    setFormData(EMPTY_FORM)
    setModalError('')
    setPanFieldError('')
    setSuccessClient(null)
    setModalMode('add')
  }

  const openEditModal = (client: Client) => {
    setActiveClientId(client.id)
    setFormData({
      name: client.name,
      mobile: client.mobile,
      email: client.email,
      address: client.address,
      pin: client.pin,
      pan: formatPanInput(client.pan || ''),
      status: client.status,
    })
    setPanFieldError(getPanValidationMessage(client.pan || '') || '')
    setModalError('')
    setSuccessClient(null)
    setModalMode('edit')
  }

  const openDeleteModal = (clientId: string) => {
    setActiveClientId(clientId)
    setDeletePassword('')
    setModalError('')
    setModalMode('delete')
  }

  const updateFormField = (field: keyof ClientFormPayload, value: string) => {
    if (field === 'pan') {
      const formatted = formatPanInput(value)
      setFormData((current) => ({ ...current, pan: formatted }))
      setPanFieldError(formatted ? getPanValidationMessage(formatted) || '' : '')
      return
    }

    setFormData((current) => ({ ...current, [field]: value }))
  }

  const validatePanField = () => {
    const message = getPanValidationMessage(formData.pan)
    setPanFieldError(message || '')
    return !message
  }

  const handleSaveClient = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!formData.name.trim()) {
      setModalError('Name is required')
      return
    }

    if (!validatePanField()) {
      setModalError(getPanValidationMessage(formData.pan) || 'Enter a valid PAN')
      return
    }

    const itemLabel = formData.name.trim()
    const confirmed = await confirmSave({
      action: modalMode === 'add' ? 'add' : 'edit',
      itemLabel,
    })
    if (!confirmed) {
      return
    }

    setSubmitting(true)
    setModalError('')

    try {
      if (modalMode === 'add') {
        const created = await createClient(formData)
        await loadClients()
        closeModal()
        await showAddedAlert(created.name, `
          <div style="text-align:left;font-size:0.92rem;line-height:1.7;color:#4b5563">
            <div><strong>PAN:</strong> ${created.pan}</div>
            <div><strong>Mobile:</strong> ${created.mobile || '—'}</div>
            <div><strong>Email:</strong> ${created.email || '—'}</div>
          </div>
        `)
        return
      }

      if (modalMode === 'edit' && activeClientId) {
        await updateClient(activeClientId, formData)
        await loadClients()
        closeModal()
        await showUpdatedAlert(itemLabel)
      }
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to save client')
      setSubmitting(false)
    }
  }

  const handleConfirmDelete = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!activeClientId) {
      return
    }

    const clientToDelete = clients.find((client) => client.id === activeClientId)
    if (!clientToDelete) {
      return
    }

    const confirmed = await confirmDelete({
      itemLabel: clientToDelete.name,
      extraMessage: 'This is a soft delete. The client can be restored from Deleted Clients.',
    })
    if (!confirmed) {
      return
    }

    setSubmitting(true)
    setModalError('')

    try {
      await removeClient(activeClientId, deletePassword)
      await loadClients()
      closeModal()
      await showDeletedAlert(clientToDelete.name, true)
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to delete client')
      setSubmitting(false)
    }
  }

  const handleRestoreClient = async (clientId: string) => {
    const client = deletedClients.find((item) => item.id === clientId)
    const confirmed = await confirmRestore({
      itemLabel: client?.name || 'this client',
    })
    if (!confirmed) {
      return
    }

    setRestoringId(clientId)
    setError('')

    try {
      await restoreClient(clientId)
      await loadClients()
      await showRestoredAlert(client?.name || 'Client')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore client')
    } finally {
      setRestoringId(null)
    }
  }

  const activeClient = clients.find((client) => client.id === activeClientId)

  return (
    <div className="clients-page">
      <header className="page-header page-header-row">
        <div>
          <h1>Clients</h1>
          <p>Manage clients and their businesses — data loaded from your database</p>
        </div>
        <div className="page-header-actions">
          <PageRefreshButton
            onRefresh={async () => {
              setLoading(true)
              await loadClients()
            }}
            disabled={loading}
          />
          <button type="button" className="primary-btn" onClick={openAddModal}>
            Add Client
          </button>
        </div>
      </header>

      {error && <div className="alert">{error}</div>}

      <section className="panel clients-panel">
        <div className="clients-toolbar">
          <div className="clients-toolbar-top">
            <div className="clients-toolbar-title">
              <h2>All Clients</h2>
              {!loading && (
                <span className="clients-count-badge">{clients.length} shown</span>
              )}
            </div>
            <label className="clients-status-filter">
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as ClientStatusFilter)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="all">All</option>
              </select>
            </label>
          </div>
          <label className="clients-search clients-search-full">
            <span className="sr-only">Search clients</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search name, PAN, mobile, email..."
              className="clients-search-input"
            />
          </label>
        </div>

        {loading ? (
          <p className="empty-state">Loading clients...</p>
        ) : clients.length === 0 ? (
          <p className="empty-state">
            {debouncedSearch
              ? `No clients match "${debouncedSearch}".`
              : statusFilter === 'inactive'
                ? 'No inactive clients found.'
                : 'No clients yet. Click "Add Client" to get started.'}
          </p>
        ) : (
          <div className="clients-table-wrap">
            <table className="clients-table">
              <thead>
                <tr>
                  <th className="col-sno">Sl No</th>
                  <th className="col-name">Name</th>
                  <th className="col-pan">PAN</th>
                  <th className="col-status">Status</th>
                  <th className="col-mobile">Mobile</th>
                  <th className="col-email">Email</th>
                  <th className="col-address">Address</th>
                  <th className="col-pin">PIN</th>
                  <th className="col-businesses">Biz</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client, index) => (
                  <tr key={client.id}>
                    <td className="col-sno">
                      <span className="sno-value">{index + 1}</span>
                    </td>
                    <td className="col-name">
                      {client.status === 'active' ? (
                        <Link
                          to={`/clients/${client.id}/business`}
                          className="client-name-link"
                        >
                          {client.name}
                        </Link>
                      ) : (
                        <span className="client-name-static">{client.name}</span>
                      )}
                    </td>
                    <td className="col-pan">
                      {client.pan ? (
                        <span className="pan-value">{client.pan}</span>
                      ) : (
                        <span className="cell-empty">—</span>
                      )}
                    </td>
                    <td className="col-status">
                      <span className={`status-badge status-badge-${client.status}`}>
                        {client.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="col-mobile">
                      {client.mobile || <span className="cell-empty">—</span>}
                    </td>
                    <td className="col-email">
                      <span className="email-value" title={client.email || undefined}>
                        {client.email || <span className="cell-empty">—</span>}
                      </span>
                    </td>
                    <td className="col-address">
                      <span className="address-value" title={client.address || undefined}>
                        {client.address || <span className="cell-empty">—</span>}
                      </span>
                    </td>
                    <td className="col-pin">
                      {client.pin || <span className="cell-empty">—</span>}
                    </td>
                    <td className="col-businesses">
                      <span className="business-count">{client.businesses.length}</span>
                    </td>
                    <td className="col-actions">
                      <div className="action-icon-group">
                        <button
                          type="button"
                          className="action-icon-btn action-icon-btn-edit"
                          onClick={() => openEditModal(client)}
                          title="Edit client"
                          aria-label={`Edit ${client.name}`}
                        >
                          <EditIcon />
                        </button>
                        <button
                          type="button"
                          className="action-icon-btn action-icon-btn-delete"
                          onClick={() => openDeleteModal(client.id)}
                          title="Delete client"
                          aria-label={`Delete ${client.name}`}
                        >
                          <DeleteIcon />
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

      {deletedClients.length > 0 && (
        <section className="panel deleted-clients-panel">
          <button
            type="button"
            className="deleted-toggle"
            onClick={() => setShowDeleted((current) => !current)}
          >
            {showDeleted ? '▼' : '▶'} Deleted Clients ({deletedClients.length})
          </button>

          {showDeleted && (
            <div className="clients-table-wrap clients-table-wrap-muted">
              <p className="deleted-hint">
                Deleted clients are kept in the database and can be restored with all their data.
              </p>
              <table className="clients-table clients-table-compact">
                <thead>
                  <tr>
                    <th className="col-sno">Sl No</th>
                    <th className="col-name">Name</th>
                    <th className="col-pan">PAN</th>
                    <th className="col-mobile">Mobile</th>
                    <th className="col-deleted">Deleted On</th>
                    <th className="col-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deletedClients.map((client, index) => (
                    <tr key={client.id}>
                      <td className="col-sno">
                        <span className="sno-value">{index + 1}</span>
                      </td>
                      <td className="col-name">{client.name}</td>
                      <td className="col-pan">
                        {client.pan ? (
                          <span className="pan-value">{client.pan}</span>
                        ) : (
                          <span className="cell-empty">—</span>
                        )}
                      </td>
                      <td className="col-mobile">
                        {client.mobile || <span className="cell-empty">—</span>}
                      </td>
                      <td className="col-deleted">
                        {client.deletedAt
                          ? new Date(client.deletedAt).toLocaleString()
                          : <span className="cell-empty">—</span>}
                      </td>
                      <td className="col-actions">
                        <button
                          type="button"
                          className="action-icon-btn action-icon-btn-restore"
                          disabled={restoringId === client.id}
                          onClick={() => handleRestoreClient(client.id)}
                          title="Restore client"
                          aria-label={`Restore ${client.name}`}
                        >
                          <RestoreIcon />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {modalMode && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className={`modal ${modalMode === 'add' || modalMode === 'edit' ? 'modal-wide' : ''}`}
            onClick={(event) => event.stopPropagation()}
          >
            {modalMode === 'success' && successClient ? (
              <div className="success-panel">
                <div className="success-icon" aria-hidden="true">
                  ✓
                </div>
                <h2>Client Added</h2>
                <p className="success-message">
                  <strong>{successClient.name}</strong> has been saved to the database.
                </p>
                <dl className="success-details">
                  <div>
                    <dt>PAN</dt>
                    <dd>{successClient.pan}</dd>
                  </div>
                  <div>
                    <dt>Mobile</dt>
                    <dd>{successClient.mobile || '—'}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{successClient.email || '—'}</dd>
                  </div>
                </dl>
                <div className="modal-actions">
                  <button type="button" className="primary-btn" onClick={closeModal}>
                    Done
                  </button>
                </div>
              </div>
            ) : modalMode === 'delete' ? (
              <>
                <h2>Delete Client</h2>
                <p className="modal-text">
                  Are you sure you want to delete{' '}
                  <strong>{activeClient?.name}</strong>? The client will be moved to deleted state
                  and can be restored later. Enter password to confirm.
                </p>

                {modalError && <div className="modal-error">{modalError}</div>}

                <form onSubmit={handleConfirmDelete}>
                  <label className="modal-field">
                    Password <RequiredMark />
                    <input
                      type="password"
                      value={deletePassword}
                      onChange={(event) => setDeletePassword(event.target.value)}
                      placeholder="Enter password"
                      required
                      autoFocus
                    />
                  </label>

                  <div className="modal-actions">
                    <button type="button" className="secondary-btn" onClick={closeModal}>
                      Cancel
                    </button>
                    <button type="submit" className="danger-btn" disabled={submitting}>
                      {submitting ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="modal-header">
                  <h2>{modalMode === 'add' ? 'Add Client' : 'Edit Client'}</h2>
                  <p className="modal-subtitle">
                    Fields marked with <RequiredMark /> are required
                  </p>
                </div>

                {modalError && <div className="modal-error">{modalError}</div>}

                <form className="modal-form" onSubmit={handleSaveClient}>
                  <div
                    className={`modal-form-grid ${modalMode === 'edit' ? 'modal-form-grid-edit' : ''}`}
                  >
                    <label className="modal-field">
                      Name <RequiredMark />
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(event) => updateFormField('name', event.target.value)}
                        placeholder="Client name"
                        required
                        autoFocus={modalMode === 'add'}
                      />
                    </label>

                    <label className="modal-field modal-field-pan">
                      PAN Card <RequiredMark />
                      <input
                        type="text"
                        value={formData.pan}
                        onChange={(event) => updateFormField('pan', event.target.value)}
                        onBlur={validatePanField}
                        placeholder="ABCDE1234F"
                        maxLength={10}
                        required
                        inputMode="text"
                        autoCapitalize="characters"
                        spellCheck={false}
                        aria-invalid={Boolean(panFieldError)}
                        className={`pan-input ${panFieldError ? 'pan-input-invalid' : ''} ${
                          formData.pan.length === 10 && !panFieldError ? 'pan-input-valid' : ''
                        }`}
                      />
                      <span className="pan-format-hint">{PAN_FORMAT_HINT}</span>
                      {panFieldError ? (
                        <span className="pan-field-error">{panFieldError}</span>
                      ) : (
                        <span className="pan-char-count">{formData.pan.length}/10</span>
                      )}
                    </label>

                    {modalMode === 'edit' ? (
                      <label className="modal-field">
                        Status
                        <select
                          value={formData.status || 'active'}
                          onChange={(event) =>
                            updateFormField('status', event.target.value as ClientStatus)
                          }
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </label>
                    ) : (
                      <label className="modal-field">
                        Mobile Number
                        <input
                          type="tel"
                          value={formData.mobile}
                          onChange={(event) => updateFormField('mobile', event.target.value)}
                          placeholder="Mobile number"
                        />
                      </label>
                    )}

                    {modalMode === 'edit' ? (
                      <label className="modal-field">
                        Mobile Number
                        <input
                          type="tel"
                          value={formData.mobile}
                          onChange={(event) => updateFormField('mobile', event.target.value)}
                          placeholder="Mobile number"
                        />
                      </label>
                    ) : (
                      <label className="modal-field">
                        Email ID
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(event) => updateFormField('email', event.target.value)}
                          placeholder="Email address"
                        />
                      </label>
                    )}

                    <label className="modal-field">
                      {modalMode === 'edit' ? 'Email ID' : 'PIN'}
                      {modalMode === 'edit' ? (
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(event) => updateFormField('email', event.target.value)}
                          placeholder="Email address"
                        />
                      ) : (
                        <input
                          type="text"
                          value={formData.pin}
                          onChange={(event) => updateFormField('pin', event.target.value)}
                          placeholder="PIN code"
                        />
                      )}
                    </label>

                    {modalMode === 'edit' && (
                      <label className="modal-field">
                        PIN
                        <input
                          type="text"
                          value={formData.pin}
                          onChange={(event) => updateFormField('pin', event.target.value)}
                          placeholder="PIN code"
                        />
                      </label>
                    )}
                  </div>

                  <label className="modal-field modal-field-full">
                    Address
                    <textarea
                      rows={3}
                      value={formData.address}
                      onChange={(event) => updateFormField('address', event.target.value)}
                      placeholder="Full address"
                      className="address-textarea"
                    />
                  </label>

                  <div className="modal-actions">
                    <button type="button" className="secondary-btn" onClick={closeModal}>
                      Cancel
                    </button>
                    <button type="submit" className="primary-btn" disabled={submitting}>
                      {submitting ? 'Saving...' : modalMode === 'add' ? 'Add Client' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Clients
