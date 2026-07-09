import type {
  BankAccountFormInput,
  BankAccountRecord,
  BankAccountStatus,
  BankAccountTypeId,
} from '../types/bankAccount'
import type { NoteValue } from '../types/fs'
import { BANK_ACCOUNT_STATUSES, BANK_ACCOUNT_TYPES } from '../types/bankAccount'

const typeLabelMap = new Map(BANK_ACCOUNT_TYPES.map((item) => [item.id, item.label]))
const statusLabelMap = new Map(BANK_ACCOUNT_STATUSES.map((item) => [item.id, item.label]))

function n(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : 0
}

export function generateBankAccountId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function getBankAccountTypeLabel(typeId: string) {
  return typeLabelMap.get(typeId as BankAccountTypeId) ?? 'Others'
}

export function normalizeBankAccountTypeId(typeId: string | undefined): BankAccountTypeId {
  if (typeId && typeLabelMap.has(typeId as BankAccountTypeId)) {
    return typeId as BankAccountTypeId
  }
  return 'current'
}

export function normalizeBankAccountStatus(status?: string): BankAccountStatus {
  return status === 'closed' ? 'closed' : 'active'
}

export function isBankAccountActive(account: Pick<BankAccountRecord, 'status'>) {
  return normalizeBankAccountStatus(account.status) === 'active'
}

export function getBankAccountStatusLabel(status?: BankAccountStatus) {
  return statusLabelMap.get(normalizeBankAccountStatus(status)) ?? 'Active'
}

export function createEmptyBankAccountForm() {
  return {
    bankName: '',
    accountNumber: '',
    accountType: 'current' as BankAccountTypeId,
    status: 'active' as BankAccountStatus,
  }
}

/** @deprecated Used only to migrate legacy rows without closingBalance */
function legacyCalcClosing(
  account: Pick<BankAccountRecord, 'openingBalance' | 'debit' | 'credit' | 'bankCharge' | 'interest'>,
) {
  return (
    n(account.openingBalance) +
    n(account.credit) -
    n(account.debit) -
    n(account.bankCharge) +
    n(account.interest)
  )
}

export function normalizeBankAccount(
  raw: Partial<BankAccountRecord> & { closingBalance?: number; closed_in_fy_id?: string },
): BankAccountRecord {
  const hasStoredClosing = raw.closingBalance !== undefined && raw.closingBalance !== null
  const status = normalizeBankAccountStatus(raw.status)
  const closedInFyId = String(raw.closedInFyId ?? raw.closed_in_fy_id ?? '').trim()
  return {
    id: raw.id || generateBankAccountId(),
    bankName: raw.bankName?.trim() ?? '',
    accountNumber: raw.accountNumber?.trim() ?? '',
    accountType: normalizeBankAccountTypeId(raw.accountType),
    status,
    closedInFyId: status === 'closed' && closedInFyId ? closedInFyId : undefined,
    openingBalance: n(raw.openingBalance),
    debit: n(raw.debit),
    credit: n(raw.credit),
    bankCharge: n(raw.bankCharge),
    interest: n(raw.interest),
    closingBalance: hasStoredClosing
      ? n(raw.closingBalance)
      : legacyCalcClosing({
          openingBalance: n(raw.openingBalance),
          debit: n(raw.debit),
          credit: n(raw.credit),
          bankCharge: n(raw.bankCharge),
          interest: n(raw.interest),
        }),
  }
}

export function normalizeBankAccounts(raw: BankAccountRecord[] | undefined): BankAccountRecord[] {
  return (raw ?? []).map(normalizeBankAccount)
}

export function createBankAccountFromForm(
  form: BankAccountFormInput,
  existing?: BankAccountRecord | null,
  fyId?: string,
): BankAccountRecord {
  const status = normalizeBankAccountStatus(form.status ?? existing?.status)
  const closedInFyId =
    status === 'closed' ? existing?.closedInFyId || fyId || undefined : undefined

  return {
    id: existing?.id ?? generateBankAccountId(),
    bankName: form.bankName.trim(),
    accountNumber: form.accountNumber.trim(),
    accountType: normalizeBankAccountTypeId(form.accountType),
    status,
    closedInFyId,
    openingBalance: existing?.openingBalance ?? 0,
    debit: existing?.debit ?? 0,
    credit: existing?.credit ?? 0,
    bankCharge: existing?.bankCharge ?? 0,
    interest: existing?.interest ?? 0,
    closingBalance: existing?.closingBalance ?? 0,
  }
}

export function sumBankAccountColumn(
  accounts: BankAccountRecord[],
  field: keyof Pick<
    BankAccountRecord,
    'openingBalance' | 'debit' | 'credit' | 'bankCharge' | 'interest' | 'closingBalance'
  >,
) {
  return accounts.reduce((total, account) => total + n(account[field]), 0)
}

export function getClosingBalanceSide(value: number): 'credit' | 'debit' | 'flat' {
  if (value > 0) {
    return 'credit'
  }
  if (value < 0) {
    return 'debit'
  }
  return 'flat'
}

export function getCreditClosingAmount(value: number) {
  const balance = n(value)
  return balance > 0 ? balance : 0
}

export function getDebitClosingAmount(value: number) {
  const balance = n(value)
  return balance < 0 ? Math.abs(balance) : 0
}

export function sumBankCreditClosingBalances(accounts: BankAccountRecord[]) {
  return accounts.reduce((total, account) => total + getCreditClosingAmount(account.closingBalance), 0)
}

export function sumBankDebitClosingBalances(accounts: BankAccountRecord[]) {
  return accounts.reduce((total, account) => total + getDebitClosingAmount(account.closingBalance), 0)
}

export function partitionBankAccountsByClosing(accounts: BankAccountRecord[]) {
  const credit: BankAccountRecord[] = []
  const debit: BankAccountRecord[] = []

  for (const account of accounts) {
    const side = getClosingBalanceSide(account.closingBalance)
    if (side === 'credit') {
      credit.push(account)
    } else if (side === 'debit') {
      debit.push(account)
    }
  }

  return { credit, debit }
}

export function isCashAtBankAccountType(typeId: BankAccountTypeId) {
  return typeId === 'current' || typeId === 'savings'
}

export function getCashAtBankAccounts(accounts: BankAccountRecord[]) {
  return accounts.filter((account) => isCashAtBankAccountType(account.accountType))
}

export function bankAccountSubId(accountId: string) {
  return `bank-${accountId}`
}

export function bankShortTermSubId(accountId: string) {
  return `bank-st-${accountId}`
}

export function formatBankAccountNoteLabel(account: BankAccountRecord) {
  const accountNumber = account.accountNumber.trim()
  return accountNumber ? `${account.bankName} — A/c ${accountNumber}` : account.bankName
}

export function formatBankShortTermBorrowingNoteLabel(account: BankAccountRecord) {
  const typeLabel = getBankAccountTypeLabel(account.accountType)
  const base = formatBankAccountNoteLabel(account)
  return `${base} (${typeLabel})`
}

export function isShortTermBorrowingBankType(typeId: BankAccountTypeId) {
  return typeId === 'cc' || typeId === 'od'
}

export function getShortTermBorrowingBankAccounts(accounts: BankAccountRecord[]) {
  return accounts.filter((account) => isShortTermBorrowingBankType(account.accountType))
}

function bankAccountMatchKey(account: Pick<BankAccountRecord, 'bankName' | 'accountNumber'>) {
  return `${account.bankName.trim().toLowerCase()}|${account.accountNumber.trim()}`
}

export function findPreviousBankDebitBalance(
  account: BankAccountRecord,
  previousAccounts: BankAccountRecord[],
) {
  const borrowingAccounts = getShortTermBorrowingBankAccounts(previousAccounts)
  const byId = borrowingAccounts.find((item) => item.id === account.id)
  if (byId) {
    return getDebitClosingAmount(byId.closingBalance)
  }

  const key = bankAccountMatchKey(account)
  const byKey = borrowingAccounts.find((item) => bankAccountMatchKey(item) === key)
  if (byKey) {
    return getDebitClosingAmount(byKey.closingBalance)
  }

  return 0
}

export function buildBankShortTermBorrowingBalances(
  accounts: BankAccountRecord[],
  previousAccounts: BankAccountRecord[] = [],
) {
  const balances = new Map<string, NoteValue>()

  for (const account of getShortTermBorrowingBankAccounts(accounts)) {
    balances.set(bankShortTermSubId(account.id), {
      current: getDebitClosingAmount(account.closingBalance),
      previous: findPreviousBankDebitBalance(account, previousAccounts),
    })
  }

  return balances
}

export function findPreviousBankCreditBalance(
  account: BankAccountRecord,
  previousAccounts: BankAccountRecord[],
) {
  const cashAccounts = getCashAtBankAccounts(previousAccounts)
  const byId = cashAccounts.find((item) => item.id === account.id)
  if (byId) {
    return getCreditClosingAmount(byId.closingBalance)
  }

  const key = bankAccountMatchKey(account)
  const byKey = cashAccounts.find((item) => bankAccountMatchKey(item) === key)
  if (byKey) {
    return getCreditClosingAmount(byKey.closingBalance)
  }

  return 0
}

export function buildBankCashAtBankBalances(
  accounts: BankAccountRecord[],
  previousAccounts: BankAccountRecord[] = [],
) {
  const balances = new Map<string, NoteValue>()

  for (const account of getCashAtBankAccounts(accounts)) {
    balances.set(bankAccountSubId(account.id), {
      current: getCreditClosingAmount(account.closingBalance),
      previous: findPreviousBankCreditBalance(account, previousAccounts),
    })
  }

  return balances
}
