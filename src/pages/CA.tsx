import { useEffect, useState } from 'react'
import {
  fetchCaSettings,
  fetchDeletedCaProfiles,
  normalizeCaProfile,
  normalizeCaSettings,
  removeCaProfile,
  restoreCaProfile,
  saveCaSettings,
  updateCaProfileStatus,
} from '../api/caSettings'
import type { CaProfile, CaProfileStatus, CaSettings } from '../types/caProfile'
import {
  EMPTY_CA_PROFILE,
  EMPTY_CA_SETTINGS,
  normalizeCaStatus,
} from '../types/caProfile'
import {
  confirmCaStatusChange,
  confirmDelete,
  confirmRestore,
  confirmSave,
  promptConfirmationCode,
  showAddedAlert,
  showCaStatusAlert,
  showDeletedAlert,
  showRestoredAlert,
  showUpdatedAlert,
} from '../utils/sweetAlert'
import PageRefreshButton from '../components/PageRefreshButton'
import '../styles/shared.css'
import './CA.css'

function createDraftCa(): CaProfile {
  return {
    ...EMPTY_CA_PROFILE,
    id: `draft_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
  }
}

function CA() {
  const DELETE_CONFIRMATION_CODE = '123456'
  const [settings, setSettings] = useState<CaSettings>(EMPTY_CA_SETTINGS)
  const [draft, setDraft] = useState<CaProfile>(createDraftCa())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showFormModal, setShowFormModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [deletedCaProfiles, setDeletedCaProfiles] = useState<CaProfile[]>([])
  const [restoringProfileId, setRestoringProfileId] = useState<string | null>(null)
  const [savingStatusProfileId, setSavingStatusProfileId] = useState<string | null>(null)
  const [openActionsMenuId, setOpenActionsMenuId] = useState<string | null>(null)
  const [actionsMenuPosition, setActionsMenuPosition] = useState<{
    top: number
    left: number
  } | null>(null)
  const [openDeletedActionsMenuId, setOpenDeletedActionsMenuId] = useState<string | null>(null)
  const [deletedActionsMenuPosition, setDeletedActionsMenuPosition] = useState<{
    top: number
    left: number
  } | null>(null)

  const loadCaData = async () => {
    try {
      const [settingsData, deletedData] = await Promise.all([
        fetchCaSettings(),
        fetchDeletedCaProfiles().catch(() => ({ caProfiles: [] })),
      ])
      setSettings(normalizeCaSettings(settingsData))
      setDeletedCaProfiles(deletedData.caProfiles.map(normalizeCaProfile))
      setError('')
    } catch {
      setError('Could not load CA profiles.')
    }
  }

  useEffect(() => {
    loadCaData().finally(() => setLoading(false))
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
        target.closest('.ca-actions-trigger') ||
        target.closest('.ca-actions-dropdown')
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

  useEffect(() => {
    if (!openDeletedActionsMenuId) {
      return
    }

    const closeActionsMenu = () => {
      setOpenDeletedActionsMenuId(null)
      setDeletedActionsMenuPosition(null)
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (
        target.closest('.ca-deleted-actions-trigger') ||
        target.closest('.ca-deleted-actions-dropdown')
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
  }, [openDeletedActionsMenuId])

  const closeActionsMenu = () => {
    setOpenActionsMenuId(null)
    setActionsMenuPosition(null)
  }

  const closeDeletedActionsMenu = () => {
    setOpenDeletedActionsMenuId(null)
    setDeletedActionsMenuPosition(null)
  }

  const openActionsMenu = (profileId: string, button: HTMLButtonElement) => {
    if (openActionsMenuId === profileId) {
      closeActionsMenu()
      return
    }

    const rect = button.getBoundingClientRect()
    const menuWidth = 168

    setOpenActionsMenuId(profileId)
    setActionsMenuPosition({
      top: rect.bottom + 6,
      left: Math.max(8, rect.right - menuWidth),
    })
  }

  const openDeletedActionsMenu = (profileId: string, button: HTMLButtonElement) => {
    if (openDeletedActionsMenuId === profileId) {
      closeDeletedActionsMenu()
      return
    }

    const rect = button.getBoundingClientRect()
    const menuWidth = 152

    setOpenDeletedActionsMenuId(profileId)
    setDeletedActionsMenuPosition({
      top: rect.bottom + 6,
      left: Math.max(8, rect.right - menuWidth),
    })
  }

  const updateField = (field: keyof CaProfile, value: string | boolean) => {
    setDraft((current) => ({ ...current, [field]: value }))
    setFormError('')
  }

  const caProfiles = settings.caProfiles

  const resetDraft = () => {
    setDraft(createDraftCa())
    setEditingId(null)
    setFormError('')
  }

  const openAddModal = () => {
    resetDraft()
    setShowFormModal(true)
  }

  const closeFormModal = () => {
    setShowFormModal(false)
    resetDraft()
  }

  const validateDraft = () => {
    if (!draft.partnerName.trim()) {
      return 'CA name is required.'
    }
    if (!draft.firmName.trim()) {
      return 'Firm name is required.'
    }
    if (!draft.frnNumber.trim()) {
      return 'FRN number is required.'
    }
    if (!draft.firmType.trim()) {
      return 'Type of firm is required.'
    }
    if (!draft.membershipNumber.trim()) {
      return 'Membership number is required.'
    }
    if (!draft.place.trim()) {
      return 'Place is required.'
    }
    return ''
  }

  const persistSettings = async (nextSettings: CaSettings) => {
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...nextSettings,
        caProfiles: nextSettings.caProfiles.map(normalizeCaProfile),
      }
      const saved = await saveCaSettings(payload)
      setSettings(normalizeCaSettings(saved))
      await loadCaData()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save CA list')
      return false
    } finally {
      setSaving(false)
    }
  }

  const upsertDraft = async () => {
    const validationError = validateDraft()
    if (validationError) {
      setFormError(validationError)
      return
    }

    const normalizedDraft = normalizeCaProfile(draft)
    const exists = settings.caProfiles.some((profile) => profile.id === normalizedDraft.id)
    const itemLabel = normalizedDraft.partnerName || normalizedDraft.firmName || 'CA profile'

    const confirmed = await confirmSave({
      action: exists ? 'edit' : 'add',
      itemLabel,
    })
    if (!confirmed) {
      return
    }

    const nextProfiles = exists
      ? settings.caProfiles.map((profile) =>
          profile.id === normalizedDraft.id ? normalizedDraft : profile,
        )
      : [...settings.caProfiles, normalizedDraft]

    const nextSettings: CaSettings = {
      caProfiles: nextProfiles,
    }

    const saved = await persistSettings(nextSettings)
    if (saved) {
      closeFormModal()
      if (exists) {
        await showUpdatedAlert(itemLabel)
      } else {
        await showAddedAlert(itemLabel)
      }
    }
  }

  const startEdit = (profile: CaProfile) => {
    closeActionsMenu()
    setDraft(normalizeCaProfile(profile))
    setEditingId(profile.id)
    setFormError('')
    setShowFormModal(true)
  }

  const requestDeleteProfile = async (profile: CaProfile) => {
    const confirmed = await confirmDelete({
      itemLabel: profile.partnerName || profile.firmName || 'CA profile',
      extraMessage: 'This is a soft delete. The profile can be restored later.',
    })
    if (!confirmed) {
      return
    }

    const code = await promptConfirmationCode({
      title: 'Confirm Deletion',
      itemLabel: profile.firmName || profile.partnerName || 'CA profile',
    })
    if (!code) {
      return
    }

    if (code.trim() !== DELETE_CONFIRMATION_CODE) {
      setError('Invalid confirmation code.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await removeCaProfile(profile.id, code.trim())
      await loadCaData()
      await showDeletedAlert(profile.partnerName || profile.firmName, true)
      if (editingId === profile.id) {
        resetDraft()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete CA profile')
    } finally {
      setSaving(false)
    }
  }

  const handleRestoreProfile = async (profileId: string) => {
    const profile = deletedCaProfiles.find((item) => item.id === profileId)
    const confirmed = await confirmRestore({
      itemLabel: profile?.partnerName || profile?.firmName || 'CA profile',
    })
    if (!confirmed) {
      return
    }

    setRestoringProfileId(profileId)
    setError('')
    try {
      await restoreCaProfile(profileId)
      await loadCaData()
      await showRestoredAlert(profile?.partnerName || profile?.firmName || 'CA profile')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore CA profile')
    } finally {
      setRestoringProfileId(null)
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

  const handleStatusChange = async (profile: CaProfile, nextStatus: CaProfileStatus) => {
    const normalized = normalizeCaStatus(nextStatus)
    if (normalizeCaStatus(profile.status) === normalized) {
      return
    }

    const itemLabel = profile.partnerName || profile.firmName || 'CA profile'
    const confirmed = await confirmCaStatusChange({
      itemLabel,
      nextStatus: normalized,
    })
    if (!confirmed) {
      return
    }

    setSavingStatusProfileId(profile.id)
    setError('')
    try {
      const result = await updateCaProfileStatus(profile.id, normalized, settings.caProfiles)
      setSettings((current) => ({
        ...current,
        caProfiles: current.caProfiles.map((item) =>
          item.id === profile.id ? normalizeCaProfile(result.caProfile) : item,
        ),
      }))
      await showCaStatusAlert({ itemLabel, status: normalized })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update CA status')
    } finally {
      setSavingStatusProfileId(null)
    }
  }

  const handleEditFromMenu = () => {
    const profile = caProfiles.find((item) => item.id === openActionsMenuId)
    if (!profile) {
      return
    }
    startEdit(profile)
  }

  const handleDeleteFromMenu = () => {
    const profile = caProfiles.find((item) => item.id === openActionsMenuId)
    closeActionsMenu()
    if (!profile) {
      return
    }
    void requestDeleteProfile(profile)
  }

  const handleRestoreFromMenu = () => {
    const profileId = openDeletedActionsMenuId
    closeDeletedActionsMenu()
    if (!profileId) {
      return
    }
    void handleRestoreProfile(profileId)
  }

  const onSealSignatureChange = async (file: File | null) => {
    if (!file) {
      updateField('sealSignatureName', '')
      updateField('sealSignatureDataUrl', '')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      updateField('sealSignatureName', file.name)
      updateField('sealSignatureDataUrl', String(reader.result || ''))
    }
    reader.onerror = () => setFormError('Could not read attached seal/sign file.')
    reader.readAsDataURL(file)
  }

  if (loading) {
    return <p className="empty-state">Loading...</p>
  }

  return (
    <div className="ca-page">
      <header className="page-header">
        <div>
          <h1>Chartered Accountant</h1>
          <p className="hint">
            Add CA profiles here and set each as active or inactive. Active CAs appear in the
            financial statement UDIN assignment list.
          </p>
        </div>
        <div className="ca-header-actions">
          <PageRefreshButton
            onRefresh={async () => {
              setLoading(true)
              await loadCaData()
              setLoading(false)
            }}
            disabled={loading}
          />
          <button type="button" className="secondary-btn" onClick={openAddModal}>
            + Add CA
          </button>
        </div>
      </header>

      {error && <div className="alert">{error}</div>}

      <section className="panel ca-list-panel">
        <div className="ca-panel-head">
          <div>
            <h2>CA List</h2>
            <p className="hint">
              Manage CA profiles. Active profiles are available for UDIN assignment on financial
              statements.
            </p>
          </div>
        </div>

        {caProfiles.length === 0 ? (
          <p className="empty-state">No CA added yet.</p>
        ) : (
          <div className="ca-table-wrap">
            <table className="ca-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Membership Number</th>
                  <th>Firm Name</th>
                  <th className="ca-col-status">Status</th>
                  <th className="ca-actions-col" aria-label="Actions">
                    <span className="ca-actions-head" title="Actions" aria-hidden="true">
                      ⋮
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {caProfiles.map((profile) => (
                  <tr key={profile.id}>
                    <td className="ca-col-name">
                      <strong>{profile.partnerName || '—'}</strong>
                    </td>
                    <td className="ca-col-membership">{profile.membershipNumber || '—'}</td>
                    <td className="ca-col-firm">
                      <div className="ca-firm-cell">
                        <strong>{profile.firmName || '—'}</strong>
                        {profile.frnNumber && (
                          <span className="ca-frn-text">FRN: {profile.frnNumber}</span>
                        )}
                      </div>
                    </td>
                    <td className="ca-col-status">
                      <select
                        className={`ca-status-select ca-status-select--${normalizeCaStatus(profile.status)}`}
                        value={normalizeCaStatus(profile.status)}
                        onChange={(event) =>
                          void handleStatusChange(profile, event.target.value as CaProfileStatus)
                        }
                        disabled={saving || savingStatusProfileId === profile.id}
                        aria-label={`Status for ${profile.partnerName || profile.firmName}`}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </td>
                    <td className="ca-actions-col">
                      <div className="ca-actions-menu">
                        <button
                          type="button"
                          className={`ca-actions-trigger${
                            openActionsMenuId === profile.id ? ' is-open' : ''
                          }`}
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation()
                            openActionsMenu(profile.id, event.currentTarget)
                          }}
                          aria-label={`Actions for ${profile.partnerName || profile.firmName}`}
                          aria-haspopup="menu"
                          aria-expanded={openActionsMenuId === profile.id}
                          disabled={saving}
                        >
                          <span className="ca-actions-dots" aria-hidden="true">
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

      {deletedCaProfiles.length > 0 && (
        <section className="panel ca-deleted-panel">
          <div className="ca-panel-head">
            <div>
              <h2>Deleted CA Profiles</h2>
              <p className="hint">Soft-deleted profiles can be restored when needed.</p>
            </div>
          </div>
          <div className="ca-table-wrap">
            <table className="ca-table ca-deleted-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Firm Name</th>
                  <th>Membership Number</th>
                  <th>Deleted At</th>
                  <th className="ca-actions-col" aria-label="Actions">
                    <span className="ca-actions-head" title="Actions" aria-hidden="true">
                      ⋮
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {deletedCaProfiles.map((profile) => (
                  <tr key={profile.id}>
                    <td className="ca-col-name">{profile.partnerName || '—'}</td>
                    <td className="ca-col-firm">{profile.firmName || '—'}</td>
                    <td className="ca-col-membership">{profile.membershipNumber || '—'}</td>
                    <td>{formatDeletedAt(profile.deletedAt)}</td>
                    <td className="ca-actions-col">
                      <div className="ca-actions-menu">
                        <button
                          type="button"
                          className={`ca-actions-trigger ca-deleted-actions-trigger${
                            openDeletedActionsMenuId === profile.id ? ' is-open' : ''
                          }`}
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation()
                            openDeletedActionsMenu(profile.id, event.currentTarget)
                          }}
                          aria-label={`Actions for ${profile.partnerName || profile.firmName}`}
                          aria-haspopup="menu"
                          aria-expanded={openDeletedActionsMenuId === profile.id}
                          disabled={restoringProfileId === profile.id || saving}
                        >
                          <span className="ca-actions-dots" aria-hidden="true">
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
        </section>
      )}

      {openActionsMenuId && actionsMenuPosition && (
        <div
          className="ca-actions-dropdown ca-actions-dropdown-fixed"
          style={{
            top: actionsMenuPosition.top,
            left: actionsMenuPosition.left,
          }}
          role="menu"
        >
          <button
            type="button"
            className="ca-actions-item"
            role="menuitem"
            onClick={handleEditFromMenu}
            disabled={saving}
          >
            Edit
          </button>
          <button
            type="button"
            className="ca-actions-item ca-actions-item-danger"
            role="menuitem"
            onClick={handleDeleteFromMenu}
            disabled={saving}
          >
            Delete
          </button>
        </div>
      )}

      {openDeletedActionsMenuId && deletedActionsMenuPosition && (
        <div
          className="ca-actions-dropdown ca-deleted-actions-dropdown ca-actions-dropdown-fixed"
          style={{
            top: deletedActionsMenuPosition.top,
            left: deletedActionsMenuPosition.left,
          }}
          role="menu"
        >
          <button
            type="button"
            className="ca-actions-item"
            role="menuitem"
            onClick={handleRestoreFromMenu}
            disabled={restoringProfileId === openDeletedActionsMenuId || saving}
          >
            {restoringProfileId === openDeletedActionsMenuId ? 'Restoring...' : 'Restore'}
          </button>
        </div>
      )}

      {showFormModal && (
        <div className="modal-overlay" onClick={closeFormModal}>
          <section className="ca-modal panel" onClick={(event) => event.stopPropagation()}>
            <div className="ca-panel-head">
              <div>
                <h2>{editingId ? 'Edit CA' : 'Add CA'}</h2>
                <p className="hint">
                  Required fields: name, firm name, FRN number, type of firm, membership number,
                  place.
                </p>
              </div>
            </div>
            {formError && <div className="alert">{formError}</div>}
            <div className="ca-form-grid">
              <label>
                Name
                <input
                  value={draft.partnerName}
                  onChange={(event) => updateField('partnerName', event.target.value)}
                  placeholder="CA Name (Required)"
                />
              </label>
              <label>
                Firm name
                <input
                  value={draft.firmName}
                  onChange={(event) => updateField('firmName', event.target.value)}
                  placeholder="ABC & Associates (Required)"
                />
              </label>
              <label>
                FRN number
                <input
                  value={draft.frnNumber}
                  onChange={(event) => updateField('frnNumber', event.target.value)}
                  placeholder="Firm Registration Number (Required)"
                />
              </label>
              <label>
                Type of firm
                <input
                  value={draft.firmType}
                  onChange={(event) => updateField('firmType', event.target.value)}
                  placeholder="Proprietorship / Partnership / LLP (Required)"
                />
              </label>
              <label>
                Membership number
                <input
                  value={draft.membershipNumber}
                  onChange={(event) => updateField('membershipNumber', event.target.value)}
                  placeholder="Membership number (Required)"
                />
              </label>
              <label>
                Seal &amp; Signature attachment
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(event) => void onSealSignatureChange(event.target.files?.[0] ?? null)}
                />
                {draft.sealSignatureName && (
                  <span className="ca-file-name">{draft.sealSignatureName}</span>
                )}
              </label>
              <label className="ca-span-2">
                Address
                <input
                  value={draft.address}
                  onChange={(event) => updateField('address', event.target.value)}
                  placeholder="Office address"
                />
              </label>
              <label>
                City
                <input value={draft.city} onChange={(event) => updateField('city', event.target.value)} />
              </label>
              <label>
                PIN
                <input value={draft.pin} onChange={(event) => updateField('pin', event.target.value)} />
              </label>
              <label>
                Place (for signature)
                <input
                  value={draft.place}
                  onChange={(event) => updateField('place', event.target.value)}
                  placeholder="City for date & place line (Required)"
                />
              </label>
              <label>
                Status
                <select
                  value={normalizeCaStatus(draft.status)}
                  onChange={(event) => updateField('status', event.target.value)}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
            </div>
            <div className="ca-form-actions">
              <button type="button" className="secondary-btn" onClick={closeFormModal}>
                Cancel
              </button>
              <button type="button" className="primary-btn" onClick={() => void upsertDraft()} disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update CA' : 'Add CA'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default CA
