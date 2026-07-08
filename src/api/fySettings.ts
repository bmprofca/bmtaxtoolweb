import type { GlobalFinancialYear } from '../utils/globalFinancialYear'
import { API_BASE } from '../config/api'

function getAuthHeaders() {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  const token = localStorage.getItem('authToken')

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return headers
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || ''
    const error = contentType.includes('application/json')
      ? await response.json().catch(() => ({ error: 'Request failed' }))
      : {
          error:
            response.status === 404
              ? 'API route not found. Restart the server with the latest code and try again.'
              : `Request failed (${response.status}). Make sure the API server is running.`,
        }
    throw new Error(error.error || 'Request failed')
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
}

export function fetchGlobalFinancialYears(): Promise<{ financialYears: GlobalFinancialYear[] }> {
  return request(`${API_BASE}/settings/financial-years`)
}

export function saveGlobalFinancialYears(
  financialYears: GlobalFinancialYear[],
): Promise<{ financialYears: GlobalFinancialYear[] }> {
  return request(`${API_BASE}/settings/financial-years`, {
    method: 'PUT',
    body: JSON.stringify({ financialYears }),
  })
}

export function removeGlobalFinancialYear(fyId: string): Promise<void> {
  return request(`${API_BASE}/settings/financial-years/${fyId}`, {
    method: 'DELETE',
  })
}

export function fetchDeletedGlobalFinancialYears(): Promise<{ financialYears: GlobalFinancialYear[] }> {
  return request(`${API_BASE}/settings/financial-years/deleted`)
}

export function updateGlobalFinancialYearStatementType(
  fyId: string,
  statementType: string,
): Promise<{ financialYear: GlobalFinancialYear }> {
  return request(`${API_BASE}/settings/financial-years/${fyId}`, {
    method: 'PATCH',
    body: JSON.stringify({ statementType }),
  })
}

export function restoreGlobalFinancialYear(
  fyId: string,
): Promise<{ financialYear: GlobalFinancialYear }> {
  return request(`${API_BASE}/settings/financial-years/${fyId}/restore`, {
    method: 'POST',
  })
}

export function updateGlobalFinancialYearStatus(
  fyId: string,
  status: 'active' | 'inactive',
): Promise<{ financialYear: GlobalFinancialYear }> {
  return request(`${API_BASE}/settings/financial-years/${fyId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}
