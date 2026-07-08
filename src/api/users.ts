import type {
  CreateUserPayload,
  CreateUserResponse,
  UpdateUserPayload,
  User,
} from '../types'
import { API_BASE } from '../config/api'
import { request } from './client'

export function fetchUsers(): Promise<{ users: User[] }> {
  return request<{ users: User[] }>(`${API_BASE}/users`)
}

export function fetchDeletedUsers(): Promise<{ users: User[] }> {
  return request<{ users: User[] }>(`${API_BASE}/users/deleted`)
}

export function createAppUser(payload: CreateUserPayload): Promise<CreateUserResponse> {
  return request<CreateUserResponse>(`${API_BASE}/users`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateAppUser(userId: string, payload: UpdateUserPayload): Promise<CreateUserResponse> {
  return request<CreateUserResponse>(`${API_BASE}/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteAppUser(userId: string): Promise<void> {
  return request<void>(`${API_BASE}/users/${userId}`, {
    method: 'DELETE',
  })
}

export function restoreAppUser(userId: string): Promise<CreateUserResponse> {
  return request<CreateUserResponse>(`${API_BASE}/users/${userId}/restore`, {
    method: 'POST',
  })
}

export function regenerateAppUserToken(userId: string): Promise<CreateUserResponse> {
  return request<CreateUserResponse>(`${API_BASE}/users/${userId}/regenerate-token`, {
    method: 'POST',
  })
}
