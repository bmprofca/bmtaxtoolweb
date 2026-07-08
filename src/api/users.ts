import type { CreateUserPayload, CreateUserResponse, User } from '../types'
import { API_BASE } from '../config/api'
import { request } from './client'

export function fetchUsers(): Promise<{ users: User[] }> {
  return request<{ users: User[] }>(`${API_BASE}/users`)
}

export function createAppUser(payload: CreateUserPayload): Promise<CreateUserResponse> {
  return request<CreateUserResponse>(`${API_BASE}/users`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function regenerateAppUserToken(userId: string): Promise<CreateUserResponse> {
  return request<CreateUserResponse>(`${API_BASE}/users/${userId}/regenerate-token`, {
    method: 'POST',
  })
}
