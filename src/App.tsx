import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import type { ReactNode } from 'react'
import DashboardLayout from './components/DashboardLayout'
import { AuthProvider, useAuth } from './context/AuthContext'
import { CA, Business, BusinessProfile, ClientToolPicker, Clients, FinancialStatement, Ledger, Login, Profile, Settings } from './pages'
import { hasPermission, type Permission } from './utils/userPermissions'
import { buildToolPickerRoute, buildToolWorkspaceRoute } from './utils/toolRoutes'

function LegacyToolPickerRedirect() {
  const { clientId, businessId } = useParams<{
    clientId: string
    fyId: string
    businessId: string
  }>()

  if (!clientId || !businessId) {
    return <Navigate to="/clients" replace />
  }

  return <Navigate to={buildToolPickerRoute(clientId, businessId)} replace />
}

function LegacyFsRedirect() {
  const { clientId, fyId, businessId } = useParams<{
    clientId: string
    fyId: string
    businessId: string
  }>()

  if (!clientId || !fyId || !businessId) {
    return <Navigate to="/clients" replace />
  }

  return (
    <Navigate
      to={buildToolWorkspaceRoute(clientId, 'financial-statement', fyId, businessId)}
      replace
    />
  )
}

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
          path="clients/:clientId/tools/business/:businessId"
          element={<ClientToolPicker />}
        />
        <Route
          path="clients/:clientId/tools/:fyId/business/:businessId"
          element={<LegacyToolPickerRedirect />}
        />
        <Route
          path="clients/:clientId/tools/financial-statement/:fyId/business/:businessId"
          element={<FinancialStatement />}
        />
        <Route
          path="clients/:clientId/fs/:fyId/business/:businessId"
          element={<LegacyFsRedirect />}
        />
        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<AdminRoute permission="manageSettings"><Settings /></AdminRoute>} />
        <Route path="users" element={<Navigate to="/settings?section=users" replace />} />
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
