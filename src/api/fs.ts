import type { AssetDepreciationHistoryRow, DepreciationRow, FinancialStatementData, NoteHistoryRow, NotesData, StatementHistoryRow, StatementSnapshot, UdinDetails } from '../types/fs'
import type { BankAccountHistoryRow, BankAccountRecord } from '../types/bankAccount'
import type { GstRecoHistoryRow, GstRecoStatement } from '../types/gst'
import type { LoanFySummary, LoanHistoryRow, LoanRecord } from '../types/loan'
import { API_BASE } from '../config/api'
import { apiRequest } from './http'

const request = apiRequest

export function fetchFsData(
  clientId: string,
  fyId: string,
  businessId: string,
): Promise<FinancialStatementData> {
  return request<FinancialStatementData>(
    `${API_BASE}/clients/${clientId}/fs/${fyId}/businesses/${businessId}`,
  )
}

export function saveFsData(
  clientId: string,
  fyId: string,
  businessId: string,
  data: FinancialStatementData,
): Promise<FinancialStatementData> {
  return request<FinancialStatementData>(
    `${API_BASE}/clients/${clientId}/fs/${fyId}/businesses/${businessId}`,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    },
  )
}

export function fetchUdinDetails(
  clientId: string,
  fyId: string,
  businessId: string,
): Promise<{ udinDetails: UdinDetails }> {
  return request<{ udinDetails: UdinDetails }>(
    `${API_BASE}/clients/${clientId}/fs/${fyId}/businesses/${businessId}/udin`,
  )
}

export function saveUdinDetails(
  clientId: string,
  fyId: string,
  businessId: string,
  udinDetails: UdinDetails,
): Promise<{ udinDetails: UdinDetails }> {
  return request<{ udinDetails: UdinDetails }>(
    `${API_BASE}/clients/${clientId}/fs/${fyId}/businesses/${businessId}/udin`,
    {
      method: 'PUT',
      body: JSON.stringify({ udinDetails }),
    },
  )
}

export function fetchDepreciationSchedule(
  clientId: string,
  fyId: string,
  businessId: string,
): Promise<{
  depreciationSchedule: DepreciationRow[]
  previousYearDepreciation: FinancialStatementData['previousYearDepreciation']
}> {
  return request<{
    depreciationSchedule: DepreciationRow[]
    previousYearDepreciation: FinancialStatementData['previousYearDepreciation']
  }>(`${API_BASE}/clients/${clientId}/fs/${fyId}/businesses/${businessId}/depreciation`)
}

export function saveDepreciationSchedule(
  clientId: string,
  fyId: string,
  businessId: string,
  payload: {
    depreciationSchedule: DepreciationRow[]
    previousYearDepreciation: FinancialStatementData['previousYearDepreciation']
  },
): Promise<{
  depreciationSchedule: DepreciationRow[]
  previousYearDepreciation: FinancialStatementData['previousYearDepreciation']
}> {
  return request<{
    depreciationSchedule: DepreciationRow[]
    previousYearDepreciation: FinancialStatementData['previousYearDepreciation']
  }>(`${API_BASE}/clients/${clientId}/fs/${fyId}/businesses/${businessId}/depreciation`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function fetchDepreciationHistory(
  clientId: string,
  businessId: string,
  ledgerId?: string,
): Promise<{ history: AssetDepreciationHistoryRow[] }> {
  const query = ledgerId ? `?ledgerId=${encodeURIComponent(ledgerId)}` : ''
  return request<{ history: AssetDepreciationHistoryRow[] }>(
    `${API_BASE}/clients/${clientId}/businesses/${businessId}/depreciation-history${query}`,
  )
}

export function fetchBankAccounts(
  clientId: string,
  fyId: string,
  businessId: string,
): Promise<{ bankAccounts: BankAccountRecord[] }> {
  return request<{ bankAccounts: BankAccountRecord[] }>(
    `${API_BASE}/clients/${clientId}/fs/${fyId}/businesses/${businessId}/bank-accounts`,
  )
}

export function saveBankAccounts(
  clientId: string,
  fyId: string,
  businessId: string,
  bankAccounts: BankAccountRecord[],
): Promise<{ bankAccounts: BankAccountRecord[] }> {
  return request<{ bankAccounts: BankAccountRecord[] }>(
    `${API_BASE}/clients/${clientId}/fs/${fyId}/businesses/${businessId}/bank-accounts`,
    {
      method: 'PUT',
      body: JSON.stringify({ bankAccounts }),
    },
  )
}

export function fetchBankAccountHistory(
  clientId: string,
  businessId: string,
  bankAccountId?: string,
): Promise<{ history: BankAccountHistoryRow[] }> {
  const query = bankAccountId ? `?bankAccountId=${encodeURIComponent(bankAccountId)}` : ''
  return request<{ history: BankAccountHistoryRow[] }>(
    `${API_BASE}/clients/${clientId}/businesses/${businessId}/bank-account-history${query}`,
  )
}

export function fetchGstReco(
  clientId: string,
  fyId: string,
  businessId: string,
): Promise<{ gstReco: GstRecoStatement }> {
  return request<{ gstReco: GstRecoStatement }>(
    `${API_BASE}/clients/${clientId}/fs/${fyId}/businesses/${businessId}/gst-reco`,
  )
}

export function saveGstReco(
  clientId: string,
  fyId: string,
  businessId: string,
  gstReco: GstRecoStatement,
): Promise<{ gstReco: GstRecoStatement }> {
  return request<{ gstReco: GstRecoStatement }>(
    `${API_BASE}/clients/${clientId}/fs/${fyId}/businesses/${businessId}/gst-reco`,
    {
      method: 'PUT',
      body: JSON.stringify({ gstReco }),
    },
  )
}

export function fetchGstRecoHistory(
  clientId: string,
  businessId: string,
  fyId?: string,
): Promise<{ history: GstRecoHistoryRow[] }> {
  const query = fyId ? `?fyId=${encodeURIComponent(fyId)}` : ''
  return request<{ history: GstRecoHistoryRow[] }>(
    `${API_BASE}/clients/${clientId}/businesses/${businessId}/gst-reco-history${query}`,
  )
}

export function fetchLoans(
  clientId: string,
  fyId: string,
  businessId: string,
): Promise<{ loans: LoanRecord[] }> {
  return request<{ loans: LoanRecord[] }>(
    `${API_BASE}/clients/${clientId}/fs/${fyId}/businesses/${businessId}/loans`,
  )
}

export function saveLoans(
  clientId: string,
  fyId: string,
  businessId: string,
  loans: LoanRecord[],
): Promise<{ loans: LoanRecord[] }> {
  return request<{ loans: LoanRecord[] }>(
    `${API_BASE}/clients/${clientId}/fs/${fyId}/businesses/${businessId}/loans`,
    {
      method: 'PUT',
      body: JSON.stringify({ loans }),
    },
  )
}

export function fetchLoanHistory(
  clientId: string,
  businessId: string,
  loanId?: string,
): Promise<{ history: LoanHistoryRow[] }> {
  const query = loanId ? `?loanId=${encodeURIComponent(loanId)}` : ''
  return request<{ history: LoanHistoryRow[] }>(
    `${API_BASE}/clients/${clientId}/businesses/${businessId}/loan-history${query}`,
  )
}

export function fetchLoanFySummary(
  clientId: string,
  fyId: string,
  businessId: string,
): Promise<{ summary: LoanFySummary | null }> {
  return request<{ summary: LoanFySummary | null }>(
    `${API_BASE}/clients/${clientId}/fs/${fyId}/businesses/${businessId}/loan-summary`,
  )
}

export function fetchNotes(
  clientId: string,
  fyId: string,
  businessId: string,
): Promise<{ notesData: NotesData }> {
  return request<{ notesData: NotesData }>(
    `${API_BASE}/clients/${clientId}/fs/${fyId}/businesses/${businessId}/notes`,
  )
}

export function saveNotes(
  clientId: string,
  fyId: string,
  businessId: string,
  notesData: NotesData,
): Promise<{ notesData: NotesData }> {
  return request<{ notesData: NotesData }>(
    `${API_BASE}/clients/${clientId}/fs/${fyId}/businesses/${businessId}/notes`,
    {
      method: 'PUT',
      body: JSON.stringify({ notesData }),
    },
  )
}

export function fetchNoteHistory(
  clientId: string,
  businessId: string,
  fyId?: string,
): Promise<{ history: NoteHistoryRow[] }> {
  const query = fyId ? `?fyId=${encodeURIComponent(fyId)}` : ''
  return request<{ history: NoteHistoryRow[] }>(
    `${API_BASE}/clients/${clientId}/businesses/${businessId}/note-history${query}`,
  )
}

export function fetchBalanceSheet(
  clientId: string,
  fyId: string,
  businessId: string,
): Promise<{ statement: StatementSnapshot }> {
  return request<{ statement: StatementSnapshot }>(
    `${API_BASE}/clients/${clientId}/fs/${fyId}/businesses/${businessId}/balance-sheet`,
  )
}

export function fetchProfitLoss(
  clientId: string,
  fyId: string,
  businessId: string,
): Promise<{ statement: StatementSnapshot }> {
  return request<{ statement: StatementSnapshot }>(
    `${API_BASE}/clients/${clientId}/fs/${fyId}/businesses/${businessId}/profit-loss`,
  )
}

export function fetchStatementHistory(
  clientId: string,
  businessId: string,
  fyId?: string,
): Promise<{ history: StatementHistoryRow[] }> {
  const query = fyId ? `?fyId=${encodeURIComponent(fyId)}` : ''
  return request<{ history: StatementHistoryRow[] }>(
    `${API_BASE}/clients/${clientId}/businesses/${businessId}/statement-history${query}`,
  )
}
