import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import DashboardLayout from './components/DashboardLayout'
import { AuthProvider, useAuth } from './context/AuthContext'
import { CA, Business, BusinessProfile, Clients, FinancialStatement, Ledger, Login, Profile, Settings, Users } from './pages'
import { hasPermission, type Permission } from './utils/userPermissions'

function AdminRoute({
  permission,
  children,
}: {
  permission: Permission
  children: ReactNode
}) {
  const { user } = useAuth()

  if (!hasPermission(user, permission)) {
    return <Navigate to="/clients" replace />
  }

  return children
}

function AppContent() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="app-loading">
        <p>Loading...</p>
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route index element={<Navigate to="/clients" replace />} />
        <Route path="clients" element={<Clients />} />
        <Route path="clients/:clientId/business" element={<Business />} />
        <Route
          path="clients/:clientId/business/:businessId/profile"
          element={<BusinessProfile />}
        />
        <Route
          path="clients/:clientId/fs/:fyId/business/:businessId"
          element={<FinancialStatement />}
        />
        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<AdminRoute permission="manageSettings"><Settings /></AdminRoute>} />
        <Route path="users" element={<AdminRoute permission="manageUsers"><Users /></AdminRoute>} />
        <Route path="ca" element={<AdminRoute permission="manageCa"><CA /></AdminRoute>} />
        <Route path="ledger" element={<AdminRoute permission="manageLedger"><Ledger /></AdminRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/clients" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
