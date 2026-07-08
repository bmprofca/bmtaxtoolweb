import { useEffect, useState } from 'react'
import { createAppUser, fetchUsers, regenerateAppUserToken } from '../api/users'
import type { CreateUserPayload, User, UserType } from '../types'
import { getUserTypeLabel } from '../utils/userPermissions'
import { confirmProceed, confirmSave, showActionAlert, showAddedAlert } from '../utils/sweetAlert'
import PageRefreshButton from '../components/PageRefreshButton'
import '../styles/shared.css'
import './Users.css'

const EMPTY_FORM: CreateUserPayload = {
  username: '',
  mobile: '',
  password: '',
  name: '',
  userType: 'staff',
}

function Users() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState<CreateUserPayload>(EMPTY_FORM)
  const [modalError, setModalError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [createdToken, setCreatedToken] = useState('')
  const [tokenUserLabel, setTokenUserLabel] = useState('')

  const loadUsers = async () => {
    try {
      setError('')
      const data = await fetchUsers()
      setUsers(data.users)
    } catch {
      setError('Could not load users. Make sure the server and database are connected.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const closeModal = () => {
    setShowModal(false)
    setFormData(EMPTY_FORM)
    setModalError('')
    setSubmitting(false)
    setCreatedToken('')
    setTokenUserLabel('')
  }

  const openAddModal = () => {
    setFormData(EMPTY_FORM)
    setModalError('')
    setCreatedToken('')
    setTokenUserLabel('')
    setShowModal(true)
  }

  const updateField = (field: keyof CreateUserPayload, value: string) => {
    setFormData((current) => ({ ...current, [field]: value }))
  }

  const updateUserType = (userType: UserType) => {
    setFormData((current) => ({ ...current, userType }))
  }

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!formData.username.trim()) {
      setModalError('Username is required')
      return
    }

    if (!formData.mobile.trim()) {
      setModalError('Mobile number is required')
      return
    }

    if (!formData.password || formData.password.length < 6) {
      setModalError('Password must be at least 6 characters')
      return
    }

    const confirmed = await confirmSave({
      action: 'add',
      itemLabel: formData.username.trim(),
    })
    if (!confirmed) {
      return
    }

    setSubmitting(true)
    setModalError('')

    try {
      const result = await createAppUser(formData)
      setCreatedToken(result.user.userToken || '')
      setTokenUserLabel(result.user.username)
      await loadUsers()
      setFormData(EMPTY_FORM)
      await showAddedAlert(result.user.username)
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setSubmitting(false)
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
      setShowModal(true)
      await showActionAlert('Token Regenerated', `API token for ${user.username} has been regenerated.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate token')
    }
  }

  return (
    <div className="users-page">
      <header className="page-header page-header-row">
        <div>
          <h1>Users</h1>
          <p className="hint">
            Manage app users. Admins have full access; staff can manage clients and financial statements only.
          </p>
        </div>
        <div className="page-header-actions">
          <PageRefreshButton
            onRefresh={async () => {
              setLoading(true)
              await loadUsers()
            }}
            disabled={loading}
          />
          <button type="button" className="primary-btn" onClick={openAddModal}>
            + Add User
          </button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p>Loading users...</p>
      ) : (
        <div className="users-table-wrap">
          <table className="data-table users-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Mobile</th>
                <th>Name</th>
                <th>Type</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="users-empty">
                    No users yet. Click Add User to create one.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.username}</td>
                    <td>{user.mobile || '—'}</td>
                    <td>{user.name}</td>
                    <td>
                      <span className={`users-type-badge users-type-${user.userType || 'staff'}`}>
                        {getUserTypeLabel(user.userType)}
                      </span>
                    </td>
                    <td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary-btn users-token-btn"
                        onClick={() => handleRegenerateToken(user)}
                      >
                        Regenerate Token
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal users-modal" onClick={(event) => event.stopPropagation()}>
            <h2>{createdToken ? 'User Token' : 'Add User'}</h2>

            {createdToken ? (
              <div className="users-token-panel">
                <p>
                  Save this token for <strong>{tokenUserLabel}</strong>. It will not be shown again.
                </p>
                <code className="users-token-value">{createdToken}</code>
                <p className="users-token-hint">
                  Use as <code>Authorization: Bearer &lt;token&gt;</code> for API access.
                </p>
                <div className="modal-actions">
                  <button type="button" className="primary-btn" onClick={closeModal}>
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateUser}>
                <label>
                  Username (Required)
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(event) => updateField('username', event.target.value)}
                    placeholder="Enter username"
                    required
                  />
                </label>

                <label>
                  Mobile Number (Required)
                  <input
                    type="tel"
                    value={formData.mobile}
                    onChange={(event) => updateField('mobile', event.target.value)}
                    placeholder="Enter mobile number"
                    required
                  />
                </label>

                <label>
                  Password (Required)
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(event) => updateField('password', event.target.value)}
                    placeholder="Minimum 6 characters"
                    minLength={6}
                    required
                  />
                </label>

                <label>
                  Display Name
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(event) => updateField('name', event.target.value)}
                    placeholder="Optional display name"
                  />
                </label>

                <label>
                  User Type
                  <select
                    value={formData.userType || 'staff'}
                    onChange={(event) => updateUserType(event.target.value as UserType)}
                  >
                    <option value="staff">Staff — clients &amp; financial statements</option>
                    <option value="admin">Admin — full access</option>
                  </select>
                </label>

                {modalError && <div className="modal-error">{modalError}</div>}

                <div className="modal-actions">
                  <button type="button" className="secondary-btn" onClick={closeModal}>
                    Cancel
                  </button>
                  <button type="submit" className="primary-btn" disabled={submitting}>
                    {submitting ? 'Saving...' : 'Create User'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Users
