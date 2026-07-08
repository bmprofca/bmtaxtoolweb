export type CaProfileStatus = 'active' | 'inactive'

export interface CaProfile {
  id: string
  status: CaProfileStatus
  firmName: string
  partnerName: string
  firmType: string
  frnNumber: string
  membershipNumber: string
  udin: string
  sealSignatureName: string
  sealSignatureDataUrl: string
  address: string
  city: string
  pin: string
  place: string
  isDeleted?: boolean
  deletedAt?: string | null
}

export interface CaSettings {
  caProfiles: CaProfile[]
}

export function normalizeCaStatus(value?: string | null): CaProfileStatus {
  return value === 'inactive' ? 'inactive' : 'active'
}

export function getCaStatusLabel(status?: string | null): string {
  return normalizeCaStatus(status) === 'inactive' ? 'Inactive' : 'Active'
}

export function isActiveCaProfile(profile: Pick<CaProfile, 'status'>): boolean {
  return normalizeCaStatus(profile.status) === 'active'
}

export const EMPTY_CA_PROFILE: CaProfile = {
  id: '',
  status: 'active',
  firmName: '',
  partnerName: '',
  firmType: '',
  frnNumber: '',
  membershipNumber: '',
  udin: '',
  sealSignatureName: '',
  sealSignatureDataUrl: '',
  address: '',
  city: '',
  pin: '',
  place: '',
}

export const EMPTY_CA_SETTINGS: CaSettings = {
  caProfiles: [],
}
