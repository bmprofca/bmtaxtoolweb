import { useEffect, useState } from 'react'
import { changePassword, updateProfile } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { getUserTypeLabel } from '../utils/userPermissions'
import { confirmSave, showActionAlert, showUpdatedAlert } from '../utils/sweetAlert'
import PageRefreshButton from '../components/PageRefreshButton'
import '../styles/shared.css'
import './Profile.css'

function Profile() {
  const { user, refreshUser } = useAuth()
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [profileError, setProfileError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    setName(user?.name || '')
    setMobile(user?.mobile || '')
  }, [user])

  const handleSaveProfile = async (event: React.FormEvent) => {
    event.preventDefault()
    setProfileError('')

    if (!name.trim()) {
      setProfileError('Name is required.')
      return
    }

    if (!mobile.trim()) {
      setProfileError('Mobile number is required.')
      return
    }

    const confirmed = await confirmSave({
      action: 'edit',
      itemLabel: 'profile',
    })
    if (!confirmed) {
      return
    }

    setSavingProfile(true)
    try {
      await updateProfile({ name: name.trim(), mobile: mobile.trim() })
      await refreshUser()
      await showUpdatedAlert('Profile')
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault()
    setPasswordError('')

    if (!currentPassword) {
      setPasswordError('Enter your current password.')
      return
    }

    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.')
      return
    }

    const confirmed = await confirmSave({
      action: 'edit',
      itemLabel: 'password',
    })
    if (!confirmed) {
      return
    }

    setSavingPassword(true)
    try {
      await changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      await showActionAlert('Password Updated', 'Your password has been changed successfully.')
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="profile-page">
      <header className="page-header page-header-row">
        <div>
          <h1>My Profile</h1>
          <p className="hint">Update your account details and password.</p>
        </div>
        <PageRefreshButton
          onRefresh={async () => {
            await refreshUser()
          }}
        />
      </header>

      <div className="profile-grid">
        <section className="panel profile-card">
          <h2>Account Details</h2>
          <p className="hint">Your login username cannot be changed here.</p>

          {profileError && <div className="alert">{profileError}</div>}

          <form className="profile-form" onSubmit={handleSaveProfile}>
            <label>
              Username
              <input type="text" value={user?.username || ''} readOnly className="profile-readonly" />
            </label>
            <label>
              Role
              <input
                type="text"
                value={getUserTypeLabel(user?.userType)}
                readOnly
                className="profile-readonly"
              />
            </label>
            <label>
              Name
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your display name"
                required
              />
            </label>
            <label>
              Mobile
              <input
                type="text"
                value={mobile}
                onChange={(event) => setMobile(event.target.value)}
                placeholder="Mobile number"
                required
              />
            </label>
            <div className="profile-form-actions">
              <button type="submit" className="primary-btn" disabled={savingProfile}>
                {savingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </section>

        <section className="panel profile-card">
          <h2>Change Password</h2>
          <p className="hint">Use at least 6 characters for your new password.</p>

          {passwordError && <div className="alert">{passwordError}</div>}

          <form className="profile-form" onSubmit={handleChangePassword}>
            <label>
              Current Password
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <label>
              New Password
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
              />
            </label>
            <label>
              Confirm New Password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
              />
            </label>
            <div className="profile-form-actions">
              <button type="submit" className="primary-btn" disabled={savingPassword}>
                {savingPassword ? 'Updating...' : 'Change Password'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}

export default Profile
