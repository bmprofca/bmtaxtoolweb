import type { CreateUserPayload, CreateUserResponse, User } from '../types'
import { request } from './client'

export function fetchUsers(): Promise<{ users: User[] }> {
  return request<{ users: User[] }>('/api/users')
}

export function createAppUser(payload: CreateUserPayload): Promise<CreateUserResponse> {
  return request<CreateUserResponse>('/api/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function regenerateAppUserToken(userId: string): Promise<CreateUserResponse> {
  return request<CreateUserResponse>(`/api/users/${userId}/regenerate-token`, {
    method: 'POST',
  })
}
