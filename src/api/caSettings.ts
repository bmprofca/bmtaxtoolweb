import type { CaProfile, CaSettings } from '../types/caProfile'
import {
  EMPTY_CA_PROFILE,
  EMPTY_CA_SETTINGS,
  normalizeCaStatus,
} from '../types/caProfile'

const API_BASE = '/api'

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
    if (contentType.includes('application/json')) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }))
      throw new Error(error.error || `Request failed (${response.status})`)
    }

    const text = await response.text().catch(() => '')
    if (response.status === 404) {
      throw new Error('API route not found. Restart the server and try again.')
    }

    throw new Error(text || `Request failed (${response.status})`)
  }

  return response.json()
}

export function normalizeCaProfile(raw?: Partial<CaProfile> | null): CaProfile {
  if (!raw) {
    return { ...EMPTY_CA_PROFILE }
  }

  return {
    id: raw.id?.trim() || '',
    status: normalizeCaStatus(raw.status),
    firmName: raw.firmName?.trim() || '',
    partnerName: raw.partnerName?.trim() || '',
    firmType: raw.firmType?.trim() || '',
    frnNumber: raw.frnNumber?.trim() || '',
    membershipNumber: raw.membershipNumber?.trim() || '',
    udin: raw.udin?.trim() || '',
    sealSignatureName: raw.sealSignatureName?.trim() || '',
    sealSignatureDataUrl: raw.sealSignatureDataUrl?.trim() || '',
    address: raw.address?.trim() || '',
    city: raw.city?.trim() || '',
    pin: raw.pin?.trim() || '',
    place: raw.place?.trim() || '',
    isDeleted: raw.isDeleted,
    deletedAt: raw.deletedAt ?? null,
  }
}

export function normalizeCaSettings(raw?: Partial<CaSettings> | null): CaSettings {
  const caProfiles = Array.isArray(raw?.caProfiles) ? raw.caProfiles.map(normalizeCaProfile) : []

  return {
    ...EMPTY_CA_SETTINGS,
    caProfiles,
  }
}

export function fetchCaProfile(): Promise<{ caProfile: CaProfile }> {
  return request(`${API_BASE}/settings/ca-profile`)
}

export function saveCaProfile(caProfile: CaProfile): Promise<{ caProfile: CaProfile }> {
  return request(`${API_BASE}/settings/ca-profile`, {
    method: 'PUT',
    body: JSON.stringify({ caProfile }),
  })
}

export function fetchCaSettings(): Promise<CaSettings> {
  return request(`${API_BASE}/settings/ca-profiles`)
}

export function saveCaSettings(settings: CaSettings): Promise<CaSettings> {
  return request(`${API_BASE}/settings/ca-profiles`, {
    method: 'PUT',
    body: JSON.stringify(settings),
  })
}

export function fetchDeletedCaProfiles(): Promise<{ caProfiles: CaProfile[] }> {
  return request(`${API_BASE}/settings/ca-profiles/deleted`)
}

export function removeCaProfile(profileId: string, confirmationCode: string): Promise<void> {
  return request(`${API_BASE}/settings/ca-profiles/${profileId}`, {
    method: 'DELETE',
    body: JSON.stringify({ confirmationCode }),
  })
}

export function restoreCaProfile(profileId: string): Promise<{ caProfile: CaProfile }> {
  return request(`${API_BASE}/settings/ca-profiles/${profileId}/restore`, {
    method: 'POST',
  })
}

export async function updateCaProfileStatus(
  profileId: string,
  status: CaProfile['status'],
  caProfiles: CaProfile[],
): Promise<{ caProfile: CaProfile }> {
  const normalized = normalizeCaStatus(status)
  const nextProfiles = caProfiles.map((item) =>
    item.id === profileId ? normalizeCaProfile({ ...item, status: normalized }) : normalizeCaProfile(item),
  )

  try {
    return await request(`${API_BASE}/settings/ca-profiles/${profileId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: normalized }),
    })
  } catch (patchError) {
    const message = patchError instanceof Error ? patchError.message : ''
    const shouldFallback =
      message.includes('API route not found') ||
      message.includes('Request failed (404)') ||
      message.includes('Cannot PATCH')

    if (!shouldFallback) {
      throw patchError
    }

    const saved = await saveCaSettings({ caProfiles: nextProfiles })
    const caProfile = saved.caProfiles.find((item) => item.id === profileId)
    if (!caProfile) {
      throw new Error('CA profile not found after save')
    }

    return { caProfile: normalizeCaProfile(caProfile) }
  }
}
