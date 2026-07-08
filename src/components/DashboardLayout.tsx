import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { APP_NAME } from '../config/app'
import { getUserTypeLabel, hasPermission, type Permission } from '../utils/userPermissions'
import './DashboardLayout.css'

const SIDEBAR_COLLAPSED_KEY = 'dashboardSidebarCollapsed'

const navItems: { to: string; label: string; abbr: string; permission?: Permission }[] = [
  { to: '/clients', label: 'Clients', abbr: 'CL', permission: 'manageClients' },
  { to: '/ca', label: 'CA', abbr: 'CA', permission: 'manageCa' },
  { to: '/ledger', label: 'Ledger', abbr: 'LG', permission: 'manageLedger' },
  { to: '/settings', label: 'Settings', abbr: 'ST', permission: 'manageSettings' },
]

function readCollapsedPreference() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function DashboardLayout() {
  const { user, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(readCollapsedPreference)

  const visibleNavItems = navItems.filter(
    (item) => !item.permission || hasPermission(user, item.permission),
  )

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
    } catch {
      // ignore storage errors
    }
    document.documentElement.style.setProperty(
      '--sidebar-width',
      collapsed ? '72px' : '240px',
    )
  }, [collapsed])

  return (
    <div className={`dashboard${collapsed ? ' dashboard--sidebar-collapsed' : ''}`}>
      <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-text">
            <h2>{APP_NAME}</h2>
            <p>Client workspace</p>
          </div>
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={() => setCollapsed((current) => !current)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive ? 'nav-link active' : 'nav-link'
              }
              title={item.label}
            >
              <span className="nav-link-abbr" aria-hidden="true">
                {item.abbr}
              </span>
              <span className="nav-link-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <Link to="/profile" className="sidebar-profile-link" title="My profile">
            <span className="sidebar-profile-avatar" aria-hidden="true">
              {(user?.name || user?.username || 'U').charAt(0).toUpperCase()}
            </span>
            <span className="sidebar-profile-meta">
              <span className="user-name">{user?.name}</span>
              <span className="user-type-label">{getUserTypeLabel(user?.userType)}</span>
            </span>
          </Link>
          <button type="button" className="logout-btn" onClick={() => logout()}>
            <span className="logout-btn-label">Logout</span>
          </button>
        </div>
      </aside>

      <main className="dashboard-content">
        <Outlet />
      </main>
    </div>
  )
}

export default DashboardLayout
