export type UserType = 'admin' | 'staff'

export interface User {
  id: string
  username: string
  name: string
  mobile: string
  userType?: UserType
  createdAt?: string | null
  isActive?: boolean
  userToken?: string
}

export interface AppUser extends User {
  userToken?: never
}

export interface UpdateUserPayload {
  name: string
  mobile: string
  userType?: UserType
  password?: string
}

export interface CreateUserPayload {
  username: string
  mobile: string
  password: string
  name?: string
  userType?: UserType
}

export interface CreateUserResponse {
  success: boolean
  user: User
}

export interface LoginResponse {
  token: string
  user: User
}

export type BusinessStatus = 'active' | 'inactive'

export interface Business {
  id: string
  name: string
  type: string
  pan: string
  address: string
  startingFy: string
  startingYear: number
  gstNumber?: string
  status: BusinessStatus
  isDeleted?: boolean
  deletedAt?: string | null
  createdAt: string
}

export interface FinancialYear {
  id: string
  label: string
  startYear: number
  endYear: number
  statementType: string
  status?: FinancialYearStatus
  closedBusinessIds: string[]
  createdAt: string
}

export type FinancialYearStatus = 'active' | 'inactive'

export type ClientStatus = 'active' | 'inactive'
export type ClientStatusFilter = ClientStatus | 'all'

export interface Client {
  id: string
  name: string
  mobile: string
  email: string
  address: string
  pin: string
  pan: string
  status: ClientStatus
  businesses: Business[]
  financialYears: FinancialYear[]
  fyClosedOverrides?: Record<string, string[]>
  fyStatementTypeOverrides?: Record<string, string>
  isDeleted?: boolean
  deletedAt?: string | null
  createdAt: string
}

export interface ClientFormPayload {
  name: string
  mobile: string
  email: string
  address: string
  pin: string
  pan: string
  status?: ClientStatus
}

export interface FetchClientsOptions {
  status?: ClientStatusFilter
  search?: string
}

export type CreateClientPayload = ClientFormPayload

export interface UpdateClientPayload extends ClientFormPayload {}

export interface CreateBusinessPayload {
  name: string
  type: string
  pan: string
  address?: string
  startingFy: string
  startingYear: number
  gstNumber?: string
  status: BusinessStatus
}

export interface UpdateBusinessPayload extends CreateBusinessPayload {
  password: string
}

export interface DeleteBusinessPayload {
  password: string
}

export interface CreateFinancialYearPayload {
  closedBusinessIds: string[]
}

export interface UpdateFinancialYearPayload {
  closedBusinessIds?: string[]
  statementType?: string
}
