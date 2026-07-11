import type {
  BankAccountFormInput,
  BankAccountHistoryRow,
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

export function createEmptyBankAccountForm(startedInFyId = '') {
  return {
    bankName: '',
    accountNumber: '',
    accountType: 'current' as BankAccountTypeId,
    status: 'active' as BankAccountStatus,
    startedInFyId,
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
  raw: Partial<BankAccountRecord> & {
    closingBalance?: number
    closed_in_fy_id?: string
    started_in_fy_id?: string
  },
): BankAccountRecord {
  const hasStoredClosing = raw.closingBalance !== undefined && raw.closingBalance !== null
  const status = normalizeBankAccountStatus(raw.status)
  const closedInFyId = String(raw.closedInFyId ?? raw.closed_in_fy_id ?? '').trim()
  const startedInFyId = String(raw.startedInFyId ?? raw.started_in_fy_id ?? '').trim()
  return {
    id: raw.id || generateBankAccountId(),
    bankName: raw.bankName?.trim() ?? '',
    accountNumber: raw.accountNumber?.trim() ?? '',
    accountType: normalizeBankAccountTypeId(raw.accountType),
    status,
    closedInFyId: status === 'closed' && closedInFyId ? closedInFyId : undefined,
    startedInFyId: startedInFyId || undefined,
    hasEntries: Boolean(raw.hasEntries),
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
    status === 'closed' ? fyId || existing?.closedInFyId || undefined : undefined
  const startedInFyId =
    existing?.startedInFyId || form.startedInFyId?.trim() || fyId || undefined

  return {
    id: existing?.id ?? generateBankAccountId(),
    bankName: form.bankName.trim(),
    accountNumber: form.accountNumber.trim(),
    accountType: normalizeBankAccountTypeId(form.accountType),
    status,
    closedInFyId,
    startedInFyId,
    openingBalance: existing?.openingBalance ?? 0,
    debit: existing?.debit ?? 0,
    credit: existing?.credit ?? 0,
    bankCharge: existing?.bankCharge ?? 0,
    interest: existing?.interest ?? 0,
    closingBalance: existing?.closingBalance ?? 0,
  }
}

export function bankAccountHasEntries(account: Pick<BankAccountRecord, 'hasEntries' | 'openingBalance' | 'debit' | 'credit' | 'bankCharge' | 'interest' | 'closingBalance'>) {
  if (account.hasEntries) {
    return true
  }
  return Boolean(
    n(account.openingBalance) ||
      n(account.debit) ||
      n(account.credit) ||
      n(account.bankCharge) ||
      n(account.interest) ||
      n(account.closingBalance),
  )
}

export function canDeleteBankAccount(account: BankAccountRecord) {
  return !bankAccountHasEntries(account)
}

export function shouldOfferCloseBankAccount(account: BankAccountRecord) {
  return isBankAccountActive(account) && bankAccountHasEntries(account)
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

export function parseBankAccountIdFromSubId(subId: string): string | null {
  if (subId.startsWith('bank-st-')) {
    return subId.slice('bank-st-'.length) || null
  }
  if (subId.startsWith('bank-')) {
    return subId.slice('bank-'.length) || null
  }
  return null
}

export function getBankAccountStartedFyStartYear(
  account: Pick<BankAccountRecord, 'startedInFyId'>,
  fyStartYearById: Map<string, number>,
) {
  if (!account.startedInFyId) {
    return 0
  }
  return fyStartYearById.get(account.startedInFyId) ?? 0
}

export function buildClosedYearByAccountNumberMap(
  accounts: BankAccountRecord[],
  fyStartYearById: Map<string, number>,
): Map<string, number> {
  const map = new Map<string, number>()

  for (const account of accounts) {
    if (isBankAccountActive(account) || !account.closedInFyId) {
      continue
    }
    const key = normalizeBankAccountNumberKey(account.accountNumber)
    if (!key) {
      continue
    }
    const closedYear = fyStartYearById.get(account.closedInFyId)
    if (closedYear === undefined) {
      continue
    }
    const existing = map.get(key)
    if (existing === undefined || closedYear < existing) {
      map.set(key, closedYear)
    }
  }

  return map
}

export function isBankAccountVisibleInFy(
  account: BankAccountRecord,
  currentFyStartYear: number,
  fyStartYearById: Map<string, number>,
  closedYearByAccountNumber?: Map<string, number>,
) {
  const startedYear = getBankAccountStartedFyStartYear(account, fyStartYearById)
  if (startedYear > 0 && currentFyStartYear < startedYear) {
    return false
  }

  const accountNumberKey = normalizeBankAccountNumberKey(account.accountNumber)
  if (accountNumberKey && closedYearByAccountNumber?.has(accountNumberKey)) {
    const closedYear = closedYearByAccountNumber.get(accountNumberKey)!
    if (currentFyStartYear > closedYear) {
      return false
    }
  }

  if (isBankAccountActive(account)) {
    return true
  }

  if (account.closedInFyId) {
    const closedYear = fyStartYearById.get(account.closedInFyId)
    if (closedYear !== undefined && currentFyStartYear > closedYear) {
      return false
    }
  }

  return true
}

function bankAccountHasMovement(account: Pick<BankAccountRecord, 'debit' | 'credit' | 'bankCharge' | 'interest'>) {
  return Boolean(account.debit || account.credit || account.bankCharge || account.interest)
}

/** Carry active bank accounts from the prior FY into the current list when missing. */
export function mergeActiveBankAccountsFromPriorYear(
  currentAccounts: BankAccountRecord[],
  priorAccounts: BankAccountRecord[],
  currentFyStartYear: number,
  currentFyId: string,
  fyStartYearById: Map<string, number>,
): BankAccountRecord[] {
  const byId = new Map(currentAccounts.map((account) => [account.id, { ...account }]))

  for (const prior of priorAccounts) {
    if (!isBankAccountActive(prior)) {
      continue
    }

    const startedInFyId = prior.startedInFyId || currentFyId
    const candidate = { ...prior, startedInFyId }
    if (!isBankAccountVisibleInFy(candidate, currentFyStartYear, fyStartYearById)) {
      continue
    }

    const existing = byId.get(prior.id)
    if (!existing) {
      byId.set(prior.id, {
        ...prior,
        status: 'active',
        closedInFyId: undefined,
        startedInFyId,
        openingBalance: prior.closingBalance,
        debit: 0,
        credit: 0,
        bankCharge: 0,
        interest: 0,
        closingBalance: prior.closingBalance,
      })
      continue
    }

    if (
      isBankAccountActive(existing) &&
      !bankAccountHasMovement(existing) &&
      prior.closingBalance !== 0 &&
      existing.openingBalance === 0 &&
      existing.closingBalance === 0
    ) {
      existing.openingBalance = prior.closingBalance
      existing.closingBalance = prior.closingBalance
    }
    if (!existing.startedInFyId) {
      existing.startedInFyId = startedInFyId
    }
  }

  return Array.from(byId.values())
}

/** Latest snapshot per account from history up to (and including) a FY start year. */
export function buildActiveBankAccountsFromHistory(
  history: BankAccountHistoryRow[],
  maxFyStartYear: number,
): BankAccountRecord[] {
  const latestByAccountId = new Map<string, BankAccountHistoryRow>()

  for (const row of history) {
    const year = Number(row.fyStartYear) || 0
    if (year <= 0 || year > maxFyStartYear) {
      continue
    }

    const existing = latestByAccountId.get(row.bankAccountId)
    if (!existing || (Number(existing.fyStartYear) || 0) < year) {
      latestByAccountId.set(row.bankAccountId, row)
    }
  }

  return Array.from(latestByAccountId.values())
    .map((row) =>
      normalizeBankAccount({
        id: row.bankAccountId,
        bankName: row.bankName,
        accountNumber: row.accountNumber,
        accountType: row.accountType,
        status: row.status,
        closedInFyId: row.closedInFyId,
        startedInFyId: row.startedInFyId,
        openingBalance: row.openingBalance,
        debit: row.debit,
        credit: row.credit,
        bankCharge: row.bankCharge,
        interest: row.interest,
        closingBalance: row.closingBalance,
      }),
    )
    .filter((account) => isBankAccountActive(account))
}

export function combinePriorBankAccountSources(
  ...sources: BankAccountRecord[][]
): BankAccountRecord[] {
  const byId = new Map<string, BankAccountRecord>()
  for (const source of sources) {
    for (const account of source) {
      if (!byId.has(account.id)) {
        byId.set(account.id, account)
      }
    }
  }
  return Array.from(byId.values())
}

export function filterOutExcludedBankAccounts(
  accounts: BankAccountRecord[],
  excludedIds: Iterable<string> = [],
): BankAccountRecord[] {
  const excluded = new Set(excludedIds)
  if (excluded.size === 0) {
    return accounts
  }
  return accounts.filter((account) => !excluded.has(account.id))
}

export function hasMissingActiveBankAccounts(
  currentAccounts: BankAccountRecord[],
  priorAccounts: BankAccountRecord[],
  currentFyStartYear: number,
  currentFyId: string,
  fyStartYearById: Map<string, number>,
  excludedIds: Iterable<string> = [],
): boolean {
  const excluded = new Set(excludedIds)
  const eligiblePrior = filterOutExcludedBankAccounts(priorAccounts, excluded)
  const merged = mergeActiveBankAccountsFromPriorYear(
    currentAccounts,
    eligiblePrior,
    currentFyStartYear,
    currentFyId,
    fyStartYearById,
  )
  if (merged.length !== currentAccounts.length) {
    return true
  }
  const currentIds = new Set(currentAccounts.map((account) => account.id))
  return merged.some((account) => !currentIds.has(account.id))
}

export function filterBankAccountsForFy(
  accounts: BankAccountRecord[],
  currentFyStartYear: number,
  fyStartYearById: Map<string, number>,
  allAccountsForClosedLookup: BankAccountRecord[] = accounts,
) {
  const closedYearByAccountNumber = buildClosedYearByAccountNumberMap(
    allAccountsForClosedLookup,
    fyStartYearById,
  )

  return accounts.filter((account) =>
    isBankAccountVisibleInFy(
      account,
      currentFyStartYear,
      fyStartYearById,
      closedYearByAccountNumber,
    ),
  )
}

export function formatBankAccountStartedFyLabel(
  account: Pick<BankAccountRecord, 'startedInFyId'>,
  financialYears: Array<{ id: string; label: string; startYear?: number }>,
  fallbackFyId?: string,
) {
  const fyId = account.startedInFyId || fallbackFyId
  if (!fyId) {
    return '—'
  }
  const match = financialYears.find((fy) => fy.id === fyId)
  if (match?.label) {
    return match.label
  }
  if (match?.startYear) {
    return String(match.startYear)
  }
  return fyId
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

export function normalizeBankAccountNumberKey(accountNumber: string) {
  return accountNumber.trim().toLowerCase().replace(/\s+/g, '')
}

function bankAccountFigureScore(account: Pick<BankAccountRecord, 'openingBalance' | 'debit' | 'credit' | 'bankCharge' | 'interest' | 'closingBalance'>) {
  return (
    Math.abs(n(account.openingBalance)) +
    Math.abs(n(account.debit)) +
    Math.abs(n(account.credit)) +
    Math.abs(n(account.bankCharge)) +
    Math.abs(n(account.interest)) +
    Math.abs(n(account.closingBalance))
  )
}

/** Keep one row per account number — merges duplicate global bank masters for display. */
export function deduplicateBankAccountsByAccountNumber(
  accounts: BankAccountRecord[],
  fyStartYearById: Map<string, number> = new Map(),
): BankAccountRecord[] {
  const groups = new Map<string, BankAccountRecord[]>()

  for (const account of accounts) {
    const key = normalizeBankAccountNumberKey(account.accountNumber)
    const groupKey = key || `id:${account.id}`
    const group = groups.get(groupKey) ?? []
    group.push(account)
    groups.set(groupKey, group)
  }

  const deduped: BankAccountRecord[] = []

  for (const group of groups.values()) {
    if (group.length === 1) {
      deduped.push(group[0])
      continue
    }

    const ranked = [...group].sort((left, right) => {
      const leftClosed = isBankAccountActive(left) ? 1 : 0
      const rightClosed = isBankAccountActive(right) ? 1 : 0
      if (leftClosed !== rightClosed) {
        return leftClosed - rightClosed
      }
      const startLeft = getBankAccountStartedFyStartYear(left, fyStartYearById) || 9_999_999
      const startRight = getBankAccountStartedFyStartYear(right, fyStartYearById) || 9_999_999
      if (startLeft !== startRight) {
        return startLeft - startRight
      }
      return bankAccountFigureScore(right) - bankAccountFigureScore(left)
    })

    const keeper = { ...ranked[0] }
    for (const duplicate of ranked.slice(1)) {
      if (!isBankAccountActive(duplicate) && duplicate.closedInFyId) {
        keeper.status = 'closed'
        keeper.closedInFyId = duplicate.closedInFyId
      }
      if (!keeper.bankName.trim() && duplicate.bankName.trim()) {
        keeper.bankName = duplicate.bankName
      }
      if (!keeper.startedInFyId && duplicate.startedInFyId) {
        keeper.startedInFyId = duplicate.startedInFyId
      }
      if (!keeper.openingBalance && duplicate.openingBalance) {
        keeper.openingBalance = duplicate.openingBalance
      }
      if (!keeper.debit && duplicate.debit) {
        keeper.debit = duplicate.debit
      }
      if (!keeper.credit && duplicate.credit) {
        keeper.credit = duplicate.credit
      }
      if (!keeper.bankCharge && duplicate.bankCharge) {
        keeper.bankCharge = duplicate.bankCharge
      }
      if (!keeper.interest && duplicate.interest) {
        keeper.interest = duplicate.interest
      }
      if (!keeper.closingBalance && duplicate.closingBalance) {
        keeper.closingBalance = duplicate.closingBalance
      }
      keeper.hasEntries = Boolean(keeper.hasEntries || duplicate.hasEntries)
    }
    deduped.push(keeper)
  }

  return deduped.sort((left, right) => {
    const nameCompare = left.bankName.localeCompare(right.bankName)
    if (nameCompare !== 0) {
      return nameCompare
    }
    return left.accountNumber.localeCompare(right.accountNumber)
  })
}

export function findDuplicateBankAccountByNumber(
  accounts: BankAccountRecord[],
  candidate: Pick<BankAccountRecord, 'id' | 'accountNumber'>,
): BankAccountRecord | undefined {
  const key = normalizeBankAccountNumberKey(candidate.accountNumber)
  if (!key) {
    return undefined
  }

  return accounts.find(
    (account) =>
      account.id !== candidate.id &&
      normalizeBankAccountNumberKey(account.accountNumber) === key,
  )
}

export function formatBankAccountDuplicateError(
  accountNumber: string,
  existing: Pick<BankAccountRecord, 'bankName' | 'accountNumber'>,
) {
  const label = existing.bankName?.trim() || 'another bank account'
  return `Account number "${accountNumber.trim()}" is already used by ${label}. Duplicate account numbers are not allowed.`
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
  currentFyStartYear?: number,
  priorFyStartYear?: number,
  fyStartYearById?: Map<string, number>,
  excludedAccountIds: Iterable<string> = [],
) {
  const excluded = new Set(excludedAccountIds)
  const balances = new Map<string, NoteValue>()
  const currentList = filterOutExcludedBankAccounts(
    currentFyStartYear !== undefined && fyStartYearById
      ? filterBankAccountsForFy(accounts, currentFyStartYear, fyStartYearById)
      : accounts,
    excluded,
  )
  const previousList =
    priorFyStartYear !== undefined && fyStartYearById
      ? filterBankAccountsForFy(previousAccounts, priorFyStartYear, fyStartYearById)
      : previousAccounts
  const currentIds = new Set(currentList.map((account) => account.id))

  for (const account of getShortTermBorrowingBankAccounts(currentList)) {
    balances.set(bankShortTermSubId(account.id), {
      current: getDebitClosingAmount(account.closingBalance),
      previous: findPreviousBankDebitBalance(account, previousList),
    })
  }

  for (const account of getShortTermBorrowingBankAccounts(previousList)) {
    if (currentIds.has(account.id) || excluded.has(account.id)) {
      continue
    }
    balances.set(bankShortTermSubId(account.id), {
      current: 0,
      previous: getDebitClosingAmount(account.closingBalance),
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

export function unionBankAccountsForComparative(
  currentAccounts: BankAccountRecord[],
  previousAccounts: BankAccountRecord[] = [],
): BankAccountRecord[] {
  if (!previousAccounts.length) {
    return currentAccounts
  }
  const byId = new Map(currentAccounts.map((account) => [account.id, account]))
  for (const account of previousAccounts) {
    if (!byId.has(account.id)) {
      byId.set(account.id, account)
    }
  }
  return Array.from(byId.values())
}

export function buildBankCashAtBankBalances(
  accounts: BankAccountRecord[],
  previousAccounts: BankAccountRecord[] = [],
  currentFyStartYear?: number,
  priorFyStartYear?: number,
  fyStartYearById?: Map<string, number>,
  excludedAccountIds: Iterable<string> = [],
) {
  const excluded = new Set(excludedAccountIds)
  const balances = new Map<string, NoteValue>()
  const currentList = filterOutExcludedBankAccounts(
    currentFyStartYear !== undefined && fyStartYearById
      ? filterBankAccountsForFy(accounts, currentFyStartYear, fyStartYearById)
      : accounts,
    excluded,
  )
  const previousList =
    priorFyStartYear !== undefined && fyStartYearById
      ? filterBankAccountsForFy(previousAccounts, priorFyStartYear, fyStartYearById)
      : previousAccounts
  const currentIds = new Set(currentList.map((account) => account.id))

  for (const account of getCashAtBankAccounts(currentList)) {
    balances.set(bankAccountSubId(account.id), {
      current: getCreditClosingAmount(account.closingBalance),
      previous: findPreviousBankCreditBalance(account, previousList),
    })
  }

  for (const account of getCashAtBankAccounts(previousList)) {
    if (currentIds.has(account.id) || excluded.has(account.id)) {
      continue
    }
    balances.set(bankAccountSubId(account.id), {
      current: 0,
      previous: getCreditClosingAmount(account.closingBalance),
    })
  }

  return balances
}
