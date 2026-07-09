import type { GlobalFinancialYear } from '../utils/globalFinancialYear'
import { API_BASE } from '../config/api'
import { apiRequest } from './http'

const request = apiRequest

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
