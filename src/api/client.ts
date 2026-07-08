import type {
  Business,
  Client,
  CreateBusinessPayload,
  CreateClientPayload,
  FetchClientsOptions,
  CreateFinancialYearPayload,
  FinancialYear,
  LoginResponse,
  UpdateClientPayload,
  UpdateBusinessPayload,
  UpdateFinancialYearPayload,
  User,
} from '../types'

const API_BASE = '/api'
let authToken: string | null = localStorage.getItem('authToken')

export function setAuthToken(token: string | null) {
  authToken = token

  if (token) {
    localStorage.setItem('authToken', token)
  } else {
    localStorage.removeItem('authToken')
  }
}

export async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers)

  if (!headers.has('Content-Type') && options?.body) {
    headers.set('Content-Type', 'application/json')
  }

  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`)
  }

  const response = await fetch(url, { ...options, headers })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || 'Request failed')
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
}

export function loginUser(username: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>(`${API_BASE}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function logoutUser(): Promise<void> {
  return request(`${API_BASE}/auth/logout`, { method: 'POST' })
}

export function fetchCurrentUser(): Promise<User> {
  return request<User>(`${API_BASE}/auth/me`)
}

export function updateProfile(payload: { name: string; mobile: string }): Promise<User> {
  return request<User>(`${API_BASE}/auth/me`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return request(`${API_BASE}/auth/change-password`, {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

export function fetchClients(options: FetchClientsOptions = {}): Promise<Client[]> {
  const params = new URLSearchParams()
  if (options.status) {
    params.set('status', options.status)
  }
  if (options.search?.trim()) {
    params.set('search', options.search.trim())
  }
  const query = params.toString()
  return request<Client[]>(`${API_BASE}/clients${query ? `?${query}` : ''}`)
}

export function fetchDeletedClients(): Promise<Client[]> {
  return request<Client[]>(`${API_BASE}/clients/deleted`)
}

export function fetchClient(clientId: string): Promise<Client> {
  return request<Client>(`${API_BASE}/clients/${clientId}`)
}

export function createClient(payload: CreateClientPayload): Promise<Client> {
  return request<Client>(`${API_BASE}/clients`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateClient(clientId: string, payload: UpdateClientPayload): Promise<Client> {
  return request<Client>(`${API_BASE}/clients/${clientId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function createBusiness(
  clientId: string,
  payload: CreateBusinessPayload,
): Promise<Business> {
  return request<Business>(`${API_BASE}/clients/${clientId}/businesses`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function removeClient(clientId: string, password: string): Promise<void> {
  return request(`${API_BASE}/clients/${clientId}`, {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  })
}

export function restoreClient(clientId: string): Promise<Client> {
  return request<Client>(`${API_BASE}/clients/${clientId}/restore`, {
    method: 'POST',
  })
}

export function updateBusiness(
  clientId: string,
  businessId: string,
  payload: UpdateBusinessPayload,
): Promise<Business> {
  return request<Business>(`${API_BASE}/clients/${clientId}/businesses/${businessId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function removeBusiness(
  clientId: string,
  businessId: string,
  password: string,
): Promise<void> {
  return request(`${API_BASE}/clients/${clientId}/businesses/${businessId}`, {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  })
}

export function restoreBusiness(clientId: string, businessId: string): Promise<Business> {
  return request<Business>(
    `${API_BASE}/clients/${clientId}/businesses/${businessId}/restore`,
    {
      method: 'POST',
    },
  )
}

export function fetchDeletedBusinesses(clientId: string): Promise<Business[]> {
  return request<Business[]>(`${API_BASE}/clients/${clientId}/businesses/deleted`)
}

export function createFinancialYear(
  clientId: string,
  payload: CreateFinancialYearPayload,
): Promise<FinancialYear> {
  return request<FinancialYear>(`${API_BASE}/clients/${clientId}/financial-years`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateFinancialYear(
  clientId: string,
  fyId: string,
  payload: UpdateFinancialYearPayload,
): Promise<FinancialYear> {
  return request<FinancialYear>(`${API_BASE}/clients/${clientId}/financial-years/${fyId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function removeFinancialYear(clientId: string, fyId: string): Promise<void> {
  return request(`${API_BASE}/clients/${clientId}/financial-years/${fyId}`, {
    method: 'DELETE',
  })
}
