import { useEffect, useState } from 'react'
import {
  createAppUser,
  deleteAppUser,
  fetchDeletedUsers,
  fetchUsers,
  regenerateAppUserToken,
  restoreAppUser,
  updateAppUser,
} from '../api/users'
import { useAuth } from '../context/AuthContext'
import type { CreateUserPayload, UpdateUserPayload, User, UserType } from '../types'
import { getUserTypeLabel } from '../utils/userPermissions'
import {
  confirmDelete,
  confirmProceed,
  confirmRestore,
  confirmSave,
  showActionAlert,
  showAddedAlert,
  showDeletedAlert,
  showRestoredAlert,
  showUpdatedAlert,
} from '../utils/sweetAlert'
import './SettingsUsersSection.css'

const EMPTY_CREATE_FORM: CreateUserPayload = {
  username: '',
  mobile: '',
  password: '',
  name: '',
  userType: 'staff',
}

const EMPTY_EDIT_FORM: UpdateUserPayload = {
  name: '',
  mobile: '',
  userType: 'staff',
  password: '',
}

type UserModalMode = 'add' | 'edit' | 'token' | null

type UserMenuAction = 'edit' | 'token' | 'delete' | 'restore'

interface SettingsUsersSectionProps {
  onBack?: () => void
  onCountChange?: (count: number) => void
}

function getSubmittingReason(submitting: boolean) {
  return submitting ? 'Please wait until the current action finishes.' : ''
}

function getDeleteDisabledReason(isSelf: boolean, submitting: boolean) {
  if (isSelf) {
    return 'You cannot delete your own account.'
  }
  return getSubmittingReason(submitting)
}

function UserActionMenuItem({
  label,
  onClick,
  disabled,
  disabledReason,
  danger = false,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  disabledReason?: string
  danger?: boolean
}) {
  const button = (
    <button
      type="button"
      className={`settings-users-actions-item${danger ? ' settings-users-actions-item-danger' : ''}`}
      disabled={disabled}
      onClick={onClick}
      role="menuitem"
    >
      {label}
    </button>
  )

  if (disabled && disabledReason) {
    return (
      <span className="settings-users-actions-item-wrap" title={disabledReason}>
        {button}
      </span>
    )
  }

  return button
}

function ActionsMenuIcon() {
  return (
    <span className="settings-users-actions-icon" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  )
}

function getUserInitials(user: Pick<User, 'name' | 'username'>) {
  const source = (user.name || user.username || 'U').trim()
  return source.charAt(0).toUpperCase()
}

function formatUserDate(value?: string | null) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function UserTypePills({
  value,
  onChange,
}: {
  value: UserType
  onChange: (next: UserType) => void
}) {
  return (
    <div className="settings-users-type-pills">
      <button
        type="button"
        className={`settings-users-type-pill${value === 'staff' ? ' active' : ''}`}
        onClick={() => onChange('staff')}
      >
        <strong>Staff</strong>
        <span>Clients and financial statements</span>
      </button>
      <button
        type="button"
        className={`settings-users-type-pill${value === 'admin' ? ' active' : ''}`}
        onClick={() => onChange('admin')}
      >
        <strong>Admin</strong>
        <span>Full application access</span>
      </button>
    </div>
  )
}

function SettingsUsersSection({ onBack, onCountChange }: SettingsUsersSectionProps) {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [deletedUsers, setDeletedUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalMode, setModalMode] = useState<UserModalMode>(null)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [createForm, setCreateForm] = useState<CreateUserPayload>(EMPTY_CREATE_FORM)
  const [editForm, setEditForm] = useState<UpdateUserPayload>(EMPTY_EDIT_FORM)
  const [modalError, setModalError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [restoringUserId, setRestoringUserId] = useState<string | null>(null)
  const [createdToken, setCreatedToken] = useState('')
  const [tokenUserLabel, setTokenUserLabel] = useState('')
  const [openActionsMenuId, setOpenActionsMenuId] = useState<string | null>(null)
  const [actionsMenuPosition, setActionsMenuPosition] = useState<{
    top: number
    left: number
  } | null>(null)
  const [actionsMenuKind, setActionsMenuKind] = useState<'active' | 'deleted'>('active')

  const openActionsUser =
    actionsMenuKind === 'active'
      ? users.find((item) => item.id === openActionsMenuId) || null
      : null
  const openDeletedUser =
    actionsMenuKind === 'deleted'
      ? deletedUsers.find((item) => item.id === openActionsMenuId) || null
      : null

  const loadUsers = async () => {
    try {
      setError('')
      const [activeData, deletedData] = await Promise.all([
        fetchUsers(),
        fetchDeletedUsers().catch(() => ({ users: [] })),
      ])
      setUsers(activeData.users)
      setDeletedUsers(deletedData.users)
      onCountChange?.(activeData.users.length)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed'
      if (message === 'Failed to fetch' || message.includes('NetworkError')) {
        setError(
          'Could not reach the API server. Restart the app with `npm run dev` from the project root (or `npm run dev` in the client folder).',
        )
      } else {
        setError(`Could not load users: ${message}`)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
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
        target.closest('.settings-users-actions-trigger') ||
        target.closest('.settings-users-actions-dropdown')
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

  const openActionsMenu = (
    userId: string,
    button: HTMLButtonElement,
    kind: 'active' | 'deleted',
  ) => {
    if (openActionsMenuId === userId) {
      closeActionsMenu()
      return
    }

    const rect = button.getBoundingClientRect()
    const menuWidth = 168

    setActionsMenuKind(kind)
    setOpenActionsMenuId(userId)
    setActionsMenuPosition({
      top: rect.bottom + 6,
      left: Math.max(8, rect.right - menuWidth),
    })
  }

  const runMenuAction = (action: UserMenuAction) => {
    const activeUser = users.find((item) => item.id === openActionsMenuId)
    const deletedUser = deletedUsers.find((item) => item.id === openActionsMenuId)

    closeActionsMenu()

    if (action === 'edit' && activeUser) {
      openEditModal(activeUser)
      return
    }

    if (action === 'token' && activeUser) {
      void handleRegenerateToken(activeUser)
      return
    }

    if (action === 'delete' && activeUser) {
      void handleDeleteUser(activeUser)
      return
    }

    if (action === 'restore' && deletedUser) {
      void handleRestoreUser(deletedUser.id)
    }
  }

  const closeModal = () => {
    setModalMode(null)
    setEditingUser(null)
    setCreateForm(EMPTY_CREATE_FORM)
    setEditForm(EMPTY_EDIT_FORM)
    setModalError('')
    setSubmitting(false)
    setCreatedToken('')
    setTokenUserLabel('')
  }

  const openAddModal = () => {
    setCreateForm(EMPTY_CREATE_FORM)
    setModalError('')
    setCreatedToken('')
    setTokenUserLabel('')
    setEditingUser(null)
    setModalMode('add')
  }

  const openEditModal = (user: User) => {
    setEditingUser(user)
    setEditForm({
      name: user.name || user.username,
      mobile: user.mobile || '',
      userType: user.userType || 'staff',
      password: '',
    })
    setModalError('')
    setModalMode('edit')
  }

  const updateCreateField = (field: keyof CreateUserPayload, value: string) => {
    setCreateForm((current) => ({ ...current, [field]: value }))
  }

  const updateEditField = (field: keyof UpdateUserPayload, value: string) => {
    setEditForm((current) => ({ ...current, [field]: value }))
  }

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!createForm.username.trim()) {
      setModalError('Username is required')
      return
    }

    if (!createForm.mobile.trim()) {
      setModalError('Mobile number is required')
      return
    }

    if (!createForm.password || createForm.password.length < 6) {
      setModalError('Password must be at least 6 characters')
      return
    }

    const confirmed = await confirmSave({
      action: 'add',
      itemLabel: createForm.username.trim(),
    })
    if (!confirmed) {
      return
    }

    setSubmitting(true)
    setModalError('')

    try {
      const result = await createAppUser(createForm)
      setCreatedToken(result.user.userToken || '')
      setTokenUserLabel(result.user.username)
      await loadUsers()
      setCreateForm(EMPTY_CREATE_FORM)
      setModalMode('token')
      await showAddedAlert(result.user.username)
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditUser = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!editingUser) {
      return
    }

    if (!editForm.name.trim()) {
      setModalError('Name is required')
      return
    }

    if (!editForm.mobile.trim()) {
      setModalError('Mobile number is required')
      return
    }

    if (editForm.password && editForm.password.length < 6) {
      setModalError('Password must be at least 6 characters')
      return
    }

    const confirmed = await confirmSave({
      action: 'edit',
      itemLabel: editingUser.username,
    })
    if (!confirmed) {
      return
    }

    setSubmitting(true)
    setModalError('')

    try {
      const payload: UpdateUserPayload = {
        name: editForm.name.trim(),
        mobile: editForm.mobile.trim(),
        userType: editForm.userType,
      }

      if (editForm.password?.trim()) {
        payload.password = editForm.password
      }

      await updateAppUser(editingUser.id, payload)
      await loadUsers()
      closeModal()
      await showUpdatedAlert(editingUser.username)
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to update user')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteUser = async (user: User) => {
    const confirmed = await confirmDelete({
      itemLabel: user.username,
      extraMessage: 'The user will be deactivated and can be restored later.',
    })
    if (!confirmed) {
      return
    }

    setSubmitting(true)
    setError('')
    try {
      await deleteAppUser(user.id)
      await loadUsers()
      await showDeletedAlert(user.username, true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRestoreUser = async (userId: string) => {
    const user = deletedUsers.find((item) => item.id === userId)
    const confirmed = await confirmRestore({
      itemLabel: user?.username || 'user',
    })
    if (!confirmed) {
      return
    }

    setRestoringUserId(userId)
    setError('')
    try {
      await restoreAppUser(userId)
      await loadUsers()
      await showRestoredAlert(user?.username || 'User')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore user')
    } finally {
      setRestoringUserId(null)
    }
  }

  const handleRegenerateToken = async (user: User) => {
    const confirmed = await confirmProceed({
      title: 'Regenerate API Token?',
      message: `Regenerate API token for ${user.username}? The old token will stop working.`,
      confirmButtonText: 'Yes, regenerate',
    })
    if (!confirmed) {
      return
    }

    try {
      const result = await regenerateAppUserToken(user.id)
      setCreatedToken(result.user.userToken || '')
      setTokenUserLabel(result.user.username)
      setModalMode('token')
      await showActionAlert('Token Regenerated', `API token for ${user.username} has been regenerated.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate token')
    }
  }

  const renderModal = () => {
    if (!modalMode) {
      return null
    }

    const modalTitle =
      modalMode === 'token' ? 'API Token' : modalMode === 'edit' ? 'Edit User' : 'Add User'
    const modalSubtitle =
      modalMode === 'token'
        ? `Save this token for ${tokenUserLabel}. It will not be shown again.`
        : modalMode === 'edit'
          ? `Update account details for ${editingUser?.username}.`
          : 'Create a new app user with login credentials and role.'

    return (
      <div className="settings-users-modal-overlay" onClick={closeModal}>
        <div className="settings-users-modal" onClick={(event) => event.stopPropagation()}>
          <div className="settings-users-modal-header">
            <div>
              <h2>{modalTitle}</h2>
              <p>{modalSubtitle}</p>
            </div>
            <button
              type="button"
              className="settings-users-modal-close"
              onClick={closeModal}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="settings-users-modal-body">
            {modalError && <div className="settings-users-modal-error">{modalError}</div>}

            {modalMode === 'token' ? (
              <div className="settings-users-token-panel">
                <code className="settings-users-token-value">{createdToken}</code>
                <p className="settings-users-token-hint">
                  Use as <code>Authorization: Bearer &lt;token&gt;</code> for API access.
                </p>
                <div className="settings-users-modal-actions">
                  <button type="button" className="primary-btn" onClick={closeModal}>
                    Done
                  </button>
                </div>
              </div>
            ) : modalMode === 'edit' && editingUser ? (
              <form onSubmit={handleEditUser}>
                <div className="settings-users-form-grid">
                  <label className="settings-users-form-field settings-users-form-field--full">
                    Username
                    <input type="text" value={editingUser.username} disabled />
                  </label>

                  <label className="settings-users-form-field">
                    Display Name *
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(event) => updateEditField('name', event.target.value)}
                      required
                    />
                  </label>

                  <label className="settings-users-form-field">
                    Mobile Number *
                    <input
                      type="tel"
                      value={editForm.mobile}
                      onChange={(event) => updateEditField('mobile', event.target.value)}
                      required
                    />
                  </label>

                  <div className="settings-users-form-field settings-users-form-field--full">
                    User Type
                    <UserTypePills
                      value={(editForm.userType || 'staff') as UserType}
                      onChange={(next) => updateEditField('userType', next)}
                    />
                  </div>

                  <label className="settings-users-form-field settings-users-form-field--full">
                    New Password
                    <input
                      type="password"
                      value={editForm.password || ''}
                      onChange={(event) => updateEditField('password', event.target.value)}
                      placeholder="Leave blank to keep current password"
                      minLength={6}
                    />
                    <small>Optional. Minimum 6 characters if changing.</small>
                  </label>
                </div>

                <div className="settings-users-modal-actions">
                  <button type="button" className="secondary-btn" onClick={closeModal} disabled={submitting}>
                    Cancel
                  </button>
                  <button type="submit" className="primary-btn" disabled={submitting}>
                    {submitting ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleCreateUser}>
                <div className="settings-users-form-grid">
                  <label className="settings-users-form-field">
                    Username *
                    <input
                      type="text"
                      value={createForm.username}
                      onChange={(event) => updateCreateField('username', event.target.value)}
                      placeholder="e.g. priya.sharma"
                      required
                      autoFocus
                    />
                  </label>

                  <label className="settings-users-form-field">
                    Mobile Number *
                    <input
                      type="tel"
                      value={createForm.mobile}
                      onChange={(event) => updateCreateField('mobile', event.target.value)}
                      placeholder="10-digit mobile"
                      required
                    />
                  </label>

                  <label className="settings-users-form-field">
                    Password *
                    <input
                      type="password"
                      value={createForm.password}
                      onChange={(event) => updateCreateField('password', event.target.value)}
                      placeholder="Minimum 6 characters"
                      minLength={6}
                      required
                    />
                  </label>

                  <label className="settings-users-form-field">
                    Display Name
                    <input
                      type="text"
                      value={createForm.name}
                      onChange={(event) => updateCreateField('name', event.target.value)}
                      placeholder="Optional display name"
                    />
                  </label>

                  <div className="settings-users-form-field settings-users-form-field--full">
                    User Type
                    <UserTypePills
                      value={(createForm.userType || 'staff') as UserType}
                      onChange={(next) => updateCreateField('userType', next)}
                    />
                  </div>
                </div>

                <div className="settings-users-modal-actions">
                  <button type="button" className="secondary-btn" onClick={closeModal} disabled={submitting}>
                    Cancel
                  </button>
                  <button type="submit" className="primary-btn" disabled={submitting}>
                    {submitting ? 'Creating...' : 'Create User'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="settings-users-section">
      <div className="settings-users-hero">
        <div className="settings-users-hero-main">
          {onBack ? (
            <button type="button" className="settings-users-back-btn" onClick={onBack}>
              ← Back
            </button>
          ) : null}
          <div className="settings-users-hero-copy">
            <span className="settings-users-hero-badge">User Management</span>
            <h2>Users</h2>
            <p>
              Manage app users, roles, and API tokens. Admins have full access; staff can manage
              clients and financial statements only.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="primary-btn settings-users-add-btn"
          onClick={openAddModal}
          disabled={submitting}
        >
          + Add User
        </button>
      </div>

      {error && <div className="alert">{error}</div>}

      {loading ? (
        <div className="settings-users-empty">
          <p className="empty-state">Loading users...</p>
        </div>
      ) : users.length === 0 ? (
        <div className="settings-users-empty">
          <h3>No users yet</h3>
          <p>Create the first user to allow staff login and API access.</p>
          <button type="button" className="primary-btn" onClick={openAddModal}>
            + Add User
          </button>
        </div>
      ) : (
        <div className="settings-users-table-card">
          <div className="settings-users-table-meta">
            <span className="settings-users-count">
              {users.length} active {users.length === 1 ? 'user' : 'users'}
            </span>
            {deletedUsers.length > 0 ? (
              <span className="settings-fy-range">{deletedUsers.length} deleted</span>
            ) : null}
          </div>

          <div className="settings-table-wrap">
            <table className="settings-users-table">
              <thead>
                <tr>
                  <th className="settings-fy-sno-col">#</th>
                  <th>User</th>
                  <th>Mobile</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th className="settings-users-actions-col" aria-label="Actions">
                    <span className="settings-users-actions-head" title="Actions" aria-hidden="true">
                      <ActionsMenuIcon />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, index) => {
                  const isSelf = user.id === currentUser?.id

                  return (
                    <tr
                      key={user.id}
                      className={`settings-users-row${isSelf ? ' settings-users-row--self' : ''}`}
                    >
                      <td className="settings-fy-sno-col">
                        <span className="settings-users-sno">{index + 1}</span>
                      </td>
                      <td>
                        <div className="settings-users-identity">
                          <span className="settings-users-avatar" aria-hidden="true">
                            {getUserInitials(user)}
                          </span>
                          <div className="settings-users-identity-text">
                            <strong>
                              {user.name || user.username}
                              {isSelf ? <span className="settings-users-you-tag">You</span> : null}
                            </strong>
                            <span>@{user.username}</span>
                          </div>
                        </div>
                      </td>
                      <td className="settings-users-mobile">{user.mobile || '—'}</td>
                      <td>
                        <span className={`settings-user-type settings-user-type--${user.userType || 'staff'}`}>
                          {getUserTypeLabel(user.userType)}
                        </span>
                      </td>
                      <td className="settings-users-created">{formatUserDate(user.createdAt)}</td>
                      <td className="settings-users-actions-col">
                        <div className="settings-users-actions-menu">
                          <button
                            type="button"
                            className={`settings-users-actions-trigger${
                              openActionsMenuId === user.id ? ' is-open' : ''
                            }`}
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation()
                              openActionsMenu(user.id, event.currentTarget, 'active')
                            }}
                            aria-label={`Actions for ${user.username}`}
                            aria-haspopup="menu"
                            aria-expanded={openActionsMenuId === user.id}
                          >
                            <ActionsMenuIcon />
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

      {deletedUsers.length > 0 && (
        <div className="settings-users-deleted-panel">
          <h3>Deleted Users</h3>
          <p className="hint">Deactivated users can be restored when needed.</p>
          <div className="settings-table-wrap">
            <table className="settings-users-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th className="settings-users-actions-col" aria-label="Actions">
                    <span className="settings-users-actions-head" title="Actions" aria-hidden="true">
                      <ActionsMenuIcon />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {deletedUsers.map((user) => (
                  <tr key={user.id} className="settings-users-row">
                    <td>@{user.username}</td>
                    <td>{user.name}</td>
                    <td>
                      <span className={`settings-user-type settings-user-type--${user.userType || 'staff'}`}>
                        {getUserTypeLabel(user.userType)}
                      </span>
                    </td>
                    <td className="settings-users-actions-col">
                      <div className="settings-users-actions-menu">
                        <button
                          type="button"
                          className={`settings-users-actions-trigger${
                            openActionsMenuId === user.id ? ' is-open' : ''
                          }`}
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation()
                            openActionsMenu(user.id, event.currentTarget, 'deleted')
                          }}
                          aria-label={`Actions for ${user.username}`}
                          aria-haspopup="menu"
                          aria-expanded={openActionsMenuId === user.id}
                        >
                          <ActionsMenuIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {renderModal()}

      {openActionsMenuId && actionsMenuPosition && actionsMenuKind === 'active' && openActionsUser && (
        <div
          className="settings-users-actions-dropdown settings-users-actions-dropdown-fixed"
          style={{
            top: actionsMenuPosition.top,
            left: actionsMenuPosition.left,
          }}
          role="menu"
        >
          <UserActionMenuItem
            label="Edit"
            onClick={() => runMenuAction('edit')}
            disabled={submitting}
            disabledReason={getSubmittingReason(submitting)}
          />
          <UserActionMenuItem
            label="Regenerate Token"
            onClick={() => runMenuAction('token')}
            disabled={submitting}
            disabledReason={getSubmittingReason(submitting)}
          />
          <UserActionMenuItem
            label="Delete"
            onClick={() => runMenuAction('delete')}
            disabled={submitting || openActionsUser.id === currentUser?.id}
            disabledReason={getDeleteDisabledReason(
              openActionsUser.id === currentUser?.id,
              submitting,
            )}
            danger
          />
        </div>
      )}

      {openActionsMenuId && actionsMenuPosition && actionsMenuKind === 'deleted' && openDeletedUser && (
        <div
          className="settings-users-actions-dropdown settings-users-actions-dropdown-fixed"
          style={{
            top: actionsMenuPosition.top,
            left: actionsMenuPosition.left,
          }}
          role="menu"
        >
          <UserActionMenuItem
            label={restoringUserId === openDeletedUser.id ? 'Restoring...' : 'Restore'}
            onClick={() => runMenuAction('restore')}
            disabled={restoringUserId === openDeletedUser.id || submitting}
            disabledReason={
              restoringUserId === openDeletedUser.id
                ? 'Restore is already in progress.'
                : getSubmittingReason(submitting)
            }
          />
        </div>
      )}
    </div>
  )
}

export default SettingsUsersSection
