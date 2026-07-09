import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import FsContextBar from '../components/FsContextBar'
import FsPrintLayout from '../components/FsPrintLayout'
import FsPrintBusinessHeader from '../components/FsPrintBusinessHeader'
import '../components/FsPrintLayout.css'
import GstRecoTab from '../components/GstRecoTab'
import BankAccountModal from '../components/BankAccountModal'
import LoanModal from '../components/LoanModal'
import LoanCashFlowTable from '../components/LoanCashFlowTable'
import { fetchCaSettings, normalizeCaSettings } from '../api/caSettings'
import type { CaProfile } from '../types/caProfile'
import { EMPTY_CA_PROFILE, isActiveCaProfile } from '../types/caProfile'
import { fetchClient } from '../api/client'
import {
  fetchDepreciationHistory,
  fetchFsData,
  saveBankAccounts,
  saveDepreciationSchedule,
  saveFsData,
  saveLoans,
} from '../api/fs'
import { fetchLedgers } from '../api/ledger'
import type { Client } from '../types'
import type {
  AssetDepreciationHistoryRow,
  CashAdjustment,
  DepreciationRow,
  FinalizationInfo,
  FinancialStatementData,
  FsNotes,
  NoteSubAmounts,
  NoteSubCell,
  PreviousYearDepreciationSummary,
  StatementLine,
  UdinDetails,
} from '../types/fs'
import type { BankAccountRecord } from '../types/bankAccount'
import type { LoanRecord } from '../types/loan'
import {
  calcPercentChange,
  calcValueChange,
  computeStatements,
  formatAmount,
  formatChangeAmount,
  formatPercentChange,
  formatStatementAmount,
  varianceClass,
} from '../utils/fsCalculator'
import { buildBalanceSheetLines, balanceSheetRowId, isBalanceSheetNoteNo, NOTE_SUB_BALANCE_SHEET_REFS } from '../utils/balanceSheetBuilder'
import { isProfitLossNoteNo, profitLossRowId, NOTE_SUB_PL_REFS } from '../utils/plBuilder'
import {
  createEmptyFsData,
  NOTE_FIELDS,
  NOTE_GROUP_ORDER,
  createEmptyUdinDetails,
  migrateNoteBreakdowns,
  migrateNotes,
  notesWithPreviousFromPriorFy,
  normalizePreviousYearDepreciation,
} from '../utils/fsDefaults'
import { normalizeDepreciationSchedule, recalcDepreciationRow, sumDepreciationSchedule, filterActiveDepreciationSchedule } from '../utils/depreciation'
import {
  autoPopulateDepreciationFromLedgers,
  collectBusinessAssetLedgerIds,
  createDepreciationRowFromLedger,
  expandPriorScheduleWithHistory,
  filterScheduleToBusinessAssets,
  getAvailableFixedAssetLedgers,
  getLedgersForAssetSelect,
  mergeDepreciationScheduleLedgerNames,
  updateDepreciationRowLedger,
} from '../utils/depreciationLedgerSync'
import {
  formatLoanInstallmentPeriod,
  mergeCashFlowByYear,
  normalizeLoans,
  recomputeLoansForFy,
  summarizeCashFlowByYear,
} from '../utils/loanCalculator'
import {
  createPlAppropriationLine,
  migratePlAppropriationAmounts,
  normalizePlAppropriationLines,
  sumPlAppropriation,
} from '../utils/plAppropriation'
import {
  PL_APPROPRIATION_CATEGORIES,
  getPlAppropriationCategoryLabel,
  normalizePlAppropriationCategoryId,
  plAppropriationSubId,
} from '../utils/plAppropriationCategories'
import { adminExpenseSubId } from '../utils/adminExpenseCategories'
import {
  manualShortTermInterestSubId,
  manualShortTermSubId,
  normalizeOtherShortTermBorrowingTypeId,
} from '../utils/otherShortTermBorrowingTypes'
import {
  isManualNoteLineKey,
  manualNoteLineSubId,
  type ManualNoteLineKey,
} from '../utils/manualNoteLineConfig'
import {
  capitalAccountLineSubId,
  normalizeCapitalAccountLineSign,
  migrateCapitalAccountSubAmounts,
  normalizeCapitalAccountLines,
  type CapitalAccountLineSign,
} from '../utils/capitalAccountLineConfig'
import {
  buildSubResolveContext,
  enrichPreviousYearSubAmountsWithClosings,
  isCapitalAccountDynamicLine,
  migrateAdminExpenseSubAmounts,
  migrateManualNoteLineSubAmounts,
  migrateOtherShortTermSubAmounts,
  normalizeAdministrativeExpenseLines,
  normalizeManualNoteLines,
  normalizeNoteSubAmounts,
  normalizeOtherShortTermBorrowingLines,
  resolveNoteSubRows,
  type ResolvedSubRow,
} from '../utils/noteSubFields'
import { buildEffectiveNotes, getNoteCalcMap } from '../utils/noteCalculator'
import { normalizeGstReco } from '../utils/gstDefaults'
import { getGstTaxableSalesTotal, isGstLinkedRevenueSub } from '../utils/gstCalculator'
import { applyGstSalesLinkToRevenue } from '../utils/gstRevenueLink'
import {
  applyClosingStockLink,
  isClosingStockLinkedInventoriesSub,
} from '../utils/closingStockLink'
import {
  getBankAccountStatusLabel,
  getBankAccountTypeLabel,
  getCreditClosingAmount,
  getDebitClosingAmount,
  isBankAccountActive,
  normalizeBankAccounts,
  partitionBankAccountsByClosing,
  sumBankAccountColumn,
  sumBankCreditClosingBalances,
  sumBankDebitClosingBalances,
} from '../utils/bankAccount'
import {
  defaultLedgerIdForGroup,
  getLedgersForGroup,
  getFixedAssetLedgers,
  normalizeLedgerSign,
  normalizeLedgers,
  resolveAdminExpenseLabel,
  resolveCapitalAccountLineLabel,
  resolveManualNoteLineLabel,
  resolveShortTermBorrowingLabel,
} from '../utils/ledgerUtils'
import {
  findPreviousFinancialYear,
  buildShortFyLabel,
  buildFsTabOptions,
  formatBalanceSheetReportTitle,
  formatFinancialStatementPageTitle,
  formatFyDisplay,
  formatBalanceSheetPrintColumnLabel,
  formatProfitLossColumnLabel,
  formatNotesReportTitle,
  formatProfitLossReportTitle,
  formatProfitLossTabLabel,
  formatFsTabPrintTitle,
  formatPrintReportPeriod,
  normalizeStatementType,
} from '../utils/financialYear'
import {
  applyOpeningBalanceCarryForward,
  applyDepreciationScheduleCarryForward,
  applyPriorDepClosingToRow,
  buildPriorYearClosingSnapshot,
  buildPriorDepClosingsByLedgerId,
  hasPriorYearDepreciationData,
  isNoteOpeningSubLocked,
  type OpeningBalanceLocks,
} from '../utils/openingBalanceCarryForward'
import {
  CONSOLIDATED_BUSINESS_ID,
  CONSOLIDATED_BUSINESS_LABEL,
  isConsolidatedApplicableForFy,
  isConsolidatedBusinessId,
  loadConsolidatedFsData,
} from '../utils/consolidatedFs'
import {
  confirmDelete,
  confirmProceed,
  confirmSave,
  promptDepreciationAssetSelect,
  promptUnlockConfirmationCode,
  showActionAlert,
  showAddedAlert,
  showDeletedAlert,
  showUpdatedAlert,
} from '../utils/sweetAlert'
import type { LedgerRecord } from '../types/ledger'
import type { GstRecoStatement } from '../types/gst'
import PageRefreshButton from '../components/PageRefreshButton'
import '../styles/shared.css'
import './FinancialStatement.css'

type FsTab =
  | 'notes'
  | 'balance-sheet'
  | 'profit-loss'
  | 'depreciation'
  | 'repayment'
  | 'bank-account'
  | 'gst-reco'
  | 'final-info'
  | 'udin-details'

const CONSOLIDATED_REPORT_TABS: FsTab[] = ['balance-sheet', 'profit-loss', 'notes']

const PRINT_ALL_TAB_ORDER: FsTab[] = [
  'balance-sheet',
  'profit-loss',
  'notes',
  'depreciation',
  'repayment',
  'bank-account',
  'gst-reco',
  'udin-details',
]

function normalizeUdinDetails(value?: Partial<UdinDetails> | null): UdinDetails {
  return {
    enabled: Boolean(value?.enabled),
    caProfileId: value?.caProfileId?.trim() || '',
    udinNumber: value?.udinNumber?.trim() || '',
    udinDate: value?.udinDate?.trim() || '',
    caPartnerName: value?.caPartnerName?.trim() || '',
    caFirmName: value?.caFirmName?.trim() || '',
  }
}

function normalizeCashAdjustment(value?: Partial<CashAdjustment> | null): CashAdjustment {
  return {
    current: Number(value?.current) || 0,
    previous: Number(value?.previous) || 0,
  }
}

function normalizeFinalizationInfo(value?: Partial<FinalizationInfo> | null): FinalizationInfo {
  return {
    isFinalized: Boolean(value?.isFinalized),
    isUnlocked: Boolean(value?.isUnlocked),
    finalizedAt: value?.finalizedAt?.trim() || '',
    unlockedAt: value?.unlockedAt?.trim() || '',
    lockToken: value?.lockToken?.trim() || '',
  }
}

function createFinalizationToken() {
  return `LCK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

function formatDateTime(value: string) {
  if (!value) {
    return '—'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fsDataFingerprint(data: FinancialStatementData): string {
  const { updatedAt, savedAt, clientId, fyId, businessId, ...payload } = data
  return JSON.stringify(payload)
}

function formatSubAmount(value: number, kind: ResolvedSubRow['kind']) {
  if (kind === 'percent') {
    return `${value.toFixed(2)}%`
  }
  return formatAmount(value)
}

function StatementTable({
  title,
  lines,
  currentLabel,
  previousLabel,
  printCurrentLabel,
  printPreviousLabel,
  showNoteColumn = false,
  useStatementAmountFormat = false,
  onNoteNavigate,
  highlightedRowId,
  wrapperClassName,
}: {
  title: string
  lines: StatementLine[]
  currentLabel: string
  previousLabel: string
  printCurrentLabel?: string
  printPreviousLabel?: string
  showNoteColumn?: boolean
  useStatementAmountFormat?: boolean
  onNoteNavigate?: (noteKey: keyof FsNotes, noteSubId?: string) => void
  highlightedRowId?: string | null
  wrapperClassName?: string
}) {
  const formatValue = useStatementAmountFormat ? formatStatementAmount : formatAmount

  const renderAmount = (value: number, variant: 'prev' | 'curr', blank?: boolean) => (
    <>
      <div className={`statement-amount-value statement-amount-${variant} fs-screen-only`}>
        {blank ? '—' : formatValue(value)}
      </div>
      <span className={`statement-amount-print statement-amount-${variant} fs-print-only`}>
        {blank ? '—' : formatValue(value)}
      </span>
    </>
  )

  const renderVariance = (change: number, pct: number | null, blank?: boolean) => (
    <>
      <td className={`statement-variance-col statement-change-col ${blank ? 'variance-flat' : varianceClass(change)}`}>
        <div className="statement-variance-value">
          {blank ? '—' : formatChangeAmount(change)}
        </div>
      </td>
      <td
        className={`statement-variance-col statement-pct-col ${blank || pct === null ? 'variance-flat' : varianceClass(change)}`}
      >
        <div className="statement-variance-value">{blank ? '—' : formatPercentChange(pct)}</div>
      </td>
    </>
  )

  const renderNoteCell = (row: StatementLine) => {
    if (!row.noteNo) {
      return <td className="statement-note-col" />
    }

    if (row.noteKey && onNoteNavigate) {
      return (
        <td className="statement-note-col">
          <button
            type="button"
            className="statement-note-link fs-screen-only"
            onClick={() => onNoteNavigate(row.noteKey!, row.noteSubId)}
            title="Open in Notes"
          >
            {row.noteNo}
          </button>
          <span className="statement-note-print-value fs-print-only">{row.noteNo}</span>
        </td>
      )
    }

    return <td className="statement-note-col">{row.noteNo}</td>
  }

  const colSpan = showNoteColumn ? 6 : 5
  const isBalanceSheetTable = wrapperClassName?.includes('balance-sheet') ?? false

  const renderColumnHeaderLabel = (screenLabel: string, printLabel?: string) => {
    const print = printLabel?.trim() || screenLabel
    if (print === screenLabel) {
      return <span className="statement-fy-label statement-fy-label--unified">{screenLabel}</span>
    }

    return (
      <>
        <span className="fs-screen-only statement-fy-label">{screenLabel}</span>
        <span className="fs-print-only statement-fy-label statement-fy-label--print">{print}</span>
      </>
    )
  }

  return (
    <div className={`statement-table-wrap${wrapperClassName ? ` ${wrapperClassName}` : ''}`}>
      <h3>{title}</h3>
      <div className="table-wrap statement-table-container">
        <table className={`statement-table${showNoteColumn ? ' has-note-col' : ''}`}>
          {isBalanceSheetTable && (
            <colgroup>
              <col className="bs-col-particular" />
              <col className="bs-col-note" />
              <col className="bs-col-prev" />
              <col className="bs-col-curr" />
              <col className="bs-col-change" />
              <col className="bs-col-pct" />
            </colgroup>
          )}
          <thead>
            <tr className="statement-head-row">
              <th className="statement-particular-col">Particulars</th>
              {showNoteColumn && <th className="statement-note-col">Note</th>}
              <th className="statement-amount-col statement-prev-col">
                {renderColumnHeaderLabel(previousLabel, printPreviousLabel)}
              </th>
              <th className="statement-amount-col statement-curr-col">
                {renderColumnHeaderLabel(currentLabel, printCurrentLabel)}
              </th>
              <th className="statement-variance-col statement-change-col">
                <span className="statement-fy-label">Change</span>
              </th>
              <th className="statement-variance-col statement-pct-col">
                <span className="statement-fy-label">% Change</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((row, index) => {
              if (row.isHeader) {
                return (
                  <tr key={`${row.label}-${index}`} className="statement-section-row">
                    <td colSpan={colSpan}>{row.label}</td>
                  </tr>
                )
              }

              if (row.isSubHeader) {
                return (
                  <tr key={`${row.label}-${index}`} className="statement-subheader-row">
                    <td
                      colSpan={colSpan}
                      className="statement-particular-col"
                      style={{ paddingLeft: `${0.75 + (row.indent ?? 0) * 1.1}rem` }}
                    >
                      {row.label}
                    </td>
                  </tr>
                )
              }

              if (row.isSpacer) {
                return (
                  <tr key={`spacer-${index}`} className="statement-spacer-row" aria-hidden="true">
                    <td colSpan={colSpan} />
                  </tr>
                )
              }

              const change = calcValueChange(row.current, row.previous)
              const pct = calcPercentChange(row.current, row.previous)
              const blankAmounts = row.blankAmounts ?? false
              const isGrandTotal = row.isGrandTotal ?? false
              const isSubLine = row.isSubLine ?? row.label.startsWith('Less:')
              const indent = row.indent ?? (isSubLine ? 1 : 0)
              const isBlankLabel = row.label.trim().length === 0

              return (
                <tr
                  key={`${row.label}-${index}`}
                  id={row.rowId}
                  className={
                    [
                      isGrandTotal
                        ? 'statement-grand-total-row'
                        : row.isTotal
                          ? 'statement-total-row'
                          : isSubLine
                            ? 'statement-sub-row'
                            : undefined,
                      isBlankLabel ? 'statement-blank-label-row' : undefined,
                      row.rowId && highlightedRowId === row.rowId ? 'notes-row-highlight' : '',
                    ]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                >
                  <td
                    className={`statement-particular-col${isSubLine ? ' is-indented' : ''}`}
                    style={{ paddingLeft: `${0.75 + indent * 1.1}rem` }}
                  >
                    {row.label}
                  </td>
                  {showNoteColumn && renderNoteCell(row)}
                  <td className="statement-amount-col statement-prev-col">
                    {renderAmount(row.previous, 'prev', blankAmounts)}
                  </td>
                  <td className="statement-amount-col statement-curr-col">
                    {renderAmount(row.current, 'curr', blankAmounts)}
                  </td>
                  {renderVariance(change, pct, blankAmounts)}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FinancialStatement() {
  const { clientId, fyId, businessId } = useParams<{
    clientId: string
    fyId: string
    businessId: string
  }>()
  const navigate = useNavigate()
  const location = useLocation()
  const tabFromNavigation = (location.state as { activeTab?: FsTab } | null)?.activeTab
  const isConsolidatedView = isConsolidatedBusinessId(businessId)

  const [client, setClient] = useState<Client | null>(null)
  const [fsData, setFsData] = useState<FinancialStatementData | null>(null)
  const [ledgers, setLedgers] = useState<LedgerRecord[]>([])
  const [depreciationHistory, setDepreciationHistory] = useState<AssetDepreciationHistoryRow[]>([])
  const [priorDepClosingsByLedgerId, setPriorDepClosingsByLedgerId] = useState<Map<string, number>>(
    new Map(),
  )
  const [activeTab, setActiveTab] = useState<FsTab>(tabFromNavigation ?? 'notes')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState('')
  const [previousYearNotes, setPreviousYearNotes] = useState<FsNotes | null>(null)
  const [previousYearSubAmounts, setPreviousYearSubAmounts] = useState<NoteSubAmounts | null>(null)
  const [previousYearPlAppropriationAmounts, setPreviousYearPlAppropriationAmounts] = useState<Record<
    string,
    NoteSubCell
  > | null>(null)
  const [previousYearLoans, setPreviousYearLoans] = useState<LoanRecord[] | null>(null)
  const [previousYearBankAccounts, setPreviousYearBankAccounts] = useState<BankAccountRecord[]>([])
  const [loanModalOpen, setLoanModalOpen] = useState(false)
  const [editingLoan, setEditingLoan] = useState<LoanRecord | null>(null)
  const [bankModalOpen, setBankModalOpen] = useState(false)
  const [editingBank, setEditingBank] = useState<BankAccountRecord | null>(null)
  const [expandedLoanId, setExpandedLoanId] = useState<string | null>(null)
  const [highlightedNote, setHighlightedNote] = useState<{
    noteKey: keyof FsNotes
    noteSubId?: string
  } | null>(null)
  const [highlightedBsRow, setHighlightedBsRow] = useState<string | null>(null)
  const [highlightedPlRow, setHighlightedPlRow] = useState<string | null>(null)
  const [openingBalanceLocks, setOpeningBalanceLocks] = useState<OpeningBalanceLocks | null>(null)
  const [caProfiles, setCaProfiles] = useState<CaProfile[]>([])
  const [printAll, setPrintAll] = useState(false)
  const [printAllModalOpen, setPrintAllModalOpen] = useState(false)
  const [printAllSelection, setPrintAllSelection] = useState<Set<FsTab>>(new Set())
  const [printAllSelectedTabs, setPrintAllSelectedTabs] = useState<Set<FsTab> | null>(null)
  const [printAllSelectionError, setPrintAllSelectionError] = useState('')
  const [printComparison, setPrintComparison] = useState(false)
  const [cashAdjustConfirmOpen, setCashAdjustConfirmOpen] = useState(false)
  const [unlockConfirmationCode, setUnlockConfirmationCode] = useState('')
  const [quickEntryOpen, setQuickEntryOpen] = useState(false)
  const [quickEntryNoteKey, setQuickEntryNoteKey] = useState<keyof FsNotes>('capitalAccount')
  const [quickEntryNoteSearch, setQuickEntryNoteSearch] = useState('')
  const [quickEntryNoteMenuOpen, setQuickEntryNoteMenuOpen] = useState(false)

  useEffect(() => {
    fetchCaSettings()
      .then((settingsData) => {
        const normalizedSettings = normalizeCaSettings(settingsData)
        setCaProfiles(normalizedSettings.caProfiles)
      })
      .catch(() => {
        setCaProfiles([])
      })
  }, [])

  const activeCaProfiles = useMemo(
    () => caProfiles.filter((profile) => isActiveCaProfile(profile)),
    [caProfiles],
  )

  useEffect(() => {
    const onAfterPrint = () => {
      setPrintAll(false)
      setPrintAllSelectedTabs(null)
    }
    window.addEventListener('afterprint', onAfterPrint)
    return () => window.removeEventListener('afterprint', onAfterPrint)
  }, [])

  useEffect(() => {
    if (tabFromNavigation) {
      setActiveTab(tabFromNavigation)
      return
    }
    // When opening FS from matrix links (no navigation state), always start on Notes.
    setActiveTab('notes')
  }, [tabFromNavigation, clientId, fyId, businessId])

  useEffect(() => {
    if (isConsolidatedView && !CONSOLIDATED_REPORT_TABS.includes(activeTab)) {
      setActiveTab('balance-sheet')
    }
  }, [isConsolidatedView, activeTab])

  useEffect(() => {
    if (activeTab !== 'notes' || !highlightedNote) {
      return
    }

    const targetId = highlightedNote.noteSubId
      ? `note-sub-${highlightedNote.noteKey}-${highlightedNote.noteSubId}`
      : `note-row-${highlightedNote.noteKey}`

    requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })

    const timer = window.setTimeout(() => setHighlightedNote(null), 2500)
    return () => window.clearTimeout(timer)
  }, [activeTab, highlightedNote])

  useEffect(() => {
    if (activeTab !== 'balance-sheet' || !highlightedBsRow) {
      return
    }

    requestAnimationFrame(() => {
      document.getElementById(highlightedBsRow)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })

    const timer = window.setTimeout(() => setHighlightedBsRow(null), 2500)
    return () => window.clearTimeout(timer)
  }, [activeTab, highlightedBsRow])

  useEffect(() => {
    if (activeTab !== 'profit-loss' || !highlightedPlRow) {
      return
    }

    requestAnimationFrame(() => {
      document.getElementById(highlightedPlRow)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })

    const timer = window.setTimeout(() => setHighlightedPlRow(null), 2500)
    return () => window.clearTimeout(timer)
  }, [activeTab, highlightedPlRow])

  const navigateToNote = (noteKey: keyof FsNotes, noteSubId?: string) => {
    setHighlightedNote({ noteKey, noteSubId })
    setActiveTab('notes')
  }

  const navigateToBalanceSheet = (noteKey: keyof FsNotes, noteSubId?: string) => {
    setHighlightedBsRow(balanceSheetRowId(noteKey, noteSubId))
    setActiveTab('balance-sheet')
  }

  const navigateToProfitLoss = (noteKey: keyof FsNotes, noteSubId?: string) => {
    setHighlightedPlRow(profitLossRowId(noteKey, noteSubId))
    setActiveTab('profit-loss')
  }

  const renderNoteNumberLink = (
    noteKey: keyof FsNotes,
    noteNo: string,
    noteSubId?: string,
  ) => {
    const field = NOTE_FIELDS.find((item) => item.key === noteKey)
    const linksToPl =
      field?.group === 'Profit & Loss' ||
      isProfitLossNoteNo(noteNo) ||
      (noteSubId !== undefined && NOTE_SUB_PL_REFS[noteSubId] !== undefined)
    const linksToBs =
      !linksToPl &&
      (isBalanceSheetNoteNo(noteNo) || NOTE_SUB_BALANCE_SHEET_REFS[noteSubId ?? ''] !== undefined)

    if (linksToPl) {
      return (
        <button
          type="button"
          className="statement-note-link"
          onClick={() => navigateToProfitLoss(noteKey, noteSubId)}
          title="View on Profit & Loss"
        >
          {noteNo}
        </button>
      )
    }

    if (linksToBs) {
      return (
        <button
          type="button"
          className="statement-note-link"
          onClick={() => navigateToBalanceSheet(noteKey, noteSubId)}
          title="View on Balance Sheet"
        >
          {noteNo}
        </button>
      )
    }

    return noteNo
  }

  const reloadClient = async () => {
    if (!clientId) {
      return null
    }

    const clientData = await fetchClient(clientId)
    setClient(clientData)
    return clientData
  }

  const load = async () => {
    if (!clientId || !fyId || !businessId) {
      return
    }

    try {
      setError('')
      setSavedFingerprint(null)
      const [clientData, ledgerData] = await Promise.all([
        fetchClient(clientId),
        fetchLedgers().catch(() => ({ ledgers: [] })),
      ])
      const normalizedClient = {
        ...clientData,
        financialYears: (clientData.financialYears || []).map((item) => ({
          ...item,
          statementType: normalizeStatementType(item.statementType),
        })),
      }
      setClient(normalizedClient)

      const loadedLedgers = normalizeLedgers(ledgerData.ledgers)
      setLedgers(loadedLedgers)
      let loadedDepreciationHistory: AssetDepreciationHistoryRow[] = []
      if (!isConsolidatedView) {
        try {
          const { history } = await fetchDepreciationHistory(clientId, businessId)
          loadedDepreciationHistory = history
          setDepreciationHistory(history)
        } catch {
          loadedDepreciationHistory = []
          setDepreciationHistory([])
        }
      }
      const fyMeta = clientData.financialYears?.find((item) => item.id === fyId)

      if (!fyMeta) {
        setClient(normalizedClient)
        setFsData(null)
        setError('This financial year is inactive or not available for financial statements.')
        return
      }

      if (isConsolidatedView) {
        if (!fyMeta || !isConsolidatedApplicableForFy(clientData.businesses, fyMeta)) {
          setClient({
            ...clientData,
            financialYears: (clientData.financialYears || []).map((item) => ({
              ...item,
              statementType: normalizeStatementType(item.statementType),
            })),
          })
          setFsData(null)
          setError(
            'Consolidated statement is not applicable when only one business is active for this financial year.',
          )
          return
        }
      }

      const fetchBusinessFs = (targetBusinessId: string) =>
        fetchFsData(clientId, fyId, targetBusinessId)

      let fs: FinancialStatementData
      try {
        fs = isConsolidatedView
          ? await loadConsolidatedFsData(
              clientId,
              fyId,
              clientData.businesses,
              fyMeta || { endYear: new Date().getFullYear(), closedBusinessIds: [] },
              fetchBusinessFs,
            )
          : await fetchBusinessFs(businessId)
      } catch {
        fs = createEmptyFsData(clientId, fyId, businessId)
      }

      const priorFy = findPreviousFinancialYear(clientData.financialYears || [], fyId)
      let priorNotes: FsNotes | null = null
      let priorSubAmounts: NoteSubAmounts | null = null
      let priorLoans: LoanRecord[] | null = null
      let priorBankAccounts: BankAccountRecord[] = []
      let priorFsPrepared: FinancialStatementData | null = null
      let priorPlAppropriationAmounts: Record<string, NoteSubCell> | null = null
      if (priorFy) {
        try {
          const priorFyMeta = clientData.financialYears?.find((item) => item.id === priorFy.id)
          const priorFs = isConsolidatedView
            ? await loadConsolidatedFsData(
                clientId,
                priorFy.id,
                clientData.businesses,
                priorFyMeta || { endYear: priorFy.endYear, closedBusinessIds: priorFy.closedBusinessIds },
                (targetBusinessId) => fetchFsData(clientId, priorFy.id, targetBusinessId),
              )
            : await fetchFsData(clientId, priorFy.id, businessId)
          priorBankAccounts = normalizeBankAccounts(priorFs.bankAccounts)
          const priorFyStart = priorFyMeta?.startYear ?? new Date().getFullYear()
          const priorFyEnd = priorFyMeta?.endYear ?? priorFyStart + 1
          priorLoans = normalizeLoans(priorFs.loans, priorFs.repaymentSchedule, priorFyStart, priorFyEnd)
          const priorAdminLines = normalizeAdministrativeExpenseLines(
            priorFs.administrativeExpenseLines,
            priorFs.noteSubAmounts,
          )
          const priorOtherStLines = normalizeOtherShortTermBorrowingLines(
            priorFs.otherShortTermBorrowingLines,
            priorFs.noteSubAmounts,
          )
          const priorManualLines = normalizeManualNoteLines(
            priorFs.manualNoteLines,
            priorFs.noteSubAmounts,
          )
          const priorCapitalLines = normalizeCapitalAccountLines(
            priorFs.capitalAccountLines,
            priorFs.noteSubAmounts,
          )
          const priorPlLines = normalizePlAppropriationLines(priorFs.plAppropriationLines)
          priorPlAppropriationAmounts = migratePlAppropriationAmounts(
            priorPlLines,
            priorFs.plAppropriationAmounts ?? {},
          )
          priorNotes = migrateNotes(priorFs.notes as Parameters<typeof migrateNotes>[0])
          let priorSub = normalizeNoteSubAmounts(
            priorFs.noteSubAmounts,
            migrateNoteBreakdowns(priorFs.noteBreakdowns),
            priorLoans,
            priorAdminLines,
            priorOtherStLines,
            priorManualLines,
            priorBankAccounts,
            priorCapitalLines,
            loadedLedgers,
          )
          priorSub = migrateAdminExpenseSubAmounts(priorAdminLines, priorSub)
          priorSub = migrateOtherShortTermSubAmounts(priorOtherStLines, priorSub)
          priorSub = migrateManualNoteLineSubAmounts(priorManualLines, priorSub)
          priorSub = migrateCapitalAccountSubAmounts(priorCapitalLines, priorSub)
          const priorComputedLoansPayload = recomputeLoansForFy(
            priorLoans,
            priorFyStart,
            priorFyEnd,
          ).map((loan) => ({
            id: loan.id,
            closingBalance: loan.closingBalance,
            interestForYear: loan.interestForYear,
            lender: loan.lender,
          }))
          const priorEffectiveNotes = buildEffectiveNotes({
            notes: priorNotes,
            noteBreakdowns: migrateNoteBreakdowns(priorFs.noteBreakdowns),
            noteSubAmounts: priorSub,
            previousYearSubAmounts: null,
            depreciationSchedule: normalizeDepreciationSchedule(priorFs.depreciationSchedule || []),
            previousYearDepreciation: normalizePreviousYearDepreciation(
              priorFs.previousYearDepreciation,
            ),
            loans: priorLoans,
            previousYearNotes: null,
            fyStartYear: priorFyStart,
            fyEndYear: priorFyEnd,
            computedLoans: priorComputedLoansPayload,
            previousYearComputedLoans: [],
            administrativeExpenseLines: priorAdminLines,
            otherShortTermBorrowingLines: priorOtherStLines,
            manualNoteLines: priorManualLines,
            capitalAccountLines: priorCapitalLines,
            ledgers: loadedLedgers,
            plAppropriationTotal: priorPlAppropriationAmounts
              ? sumPlAppropriation(priorPlLines, priorPlAppropriationAmounts, null)
              : { current: 0, previous: 0 },
            bankAccounts: priorBankAccounts,
            previousYearBankAccounts: [],
            cashAdjustment: {
              current: Number(priorFs.cashAdjustment?.current) || 0,
              previous: Number(priorFs.cashAdjustment?.previous) || 0,
            },
          })
          const priorComputed = computeStatements(
            priorEffectiveNotes,
            normalizeDepreciationSchedule(priorFs.depreciationSchedule || []),
            priorLoans,
            priorFyStart,
            priorFyEnd,
            normalizePreviousYearDepreciation(priorFs.previousYearDepreciation),
            priorPlAppropriationAmounts
              ? sumPlAppropriation(priorPlLines, priorPlAppropriationAmounts, null)
              : { current: 0, previous: 0 },
          )
          priorSub = enrichPreviousYearSubAmountsWithClosings(
            priorSub,
            buildSubResolveContext(
              priorSub,
              null,
              priorComputed,
              normalizeDepreciationSchedule(priorFs.depreciationSchedule || []),
              normalizePreviousYearDepreciation(priorFs.previousYearDepreciation),
              priorLoans,
              priorComputedLoansPayload,
              priorAdminLines,
              [],
              priorOtherStLines,
              priorManualLines,
              priorPlAppropriationAmounts
                ? sumPlAppropriation(priorPlLines, priorPlAppropriationAmounts, null)
                : { current: 0, previous: 0 },
              priorBankAccounts,
              [],
              priorCapitalLines,
              loadedLedgers,
            ),
          )
          priorSubAmounts = priorSub
          priorFsPrepared = {
            ...priorFs,
            notes: priorNotes,
            noteBreakdowns: migrateNoteBreakdowns(priorFs.noteBreakdowns),
            noteSubAmounts: priorSub,
            administrativeExpenseLines: priorAdminLines,
            otherShortTermBorrowingLines: priorOtherStLines,
            manualNoteLines: priorManualLines,
            capitalAccountLines: priorCapitalLines,
            plAppropriationLines: priorPlLines,
            plAppropriationAmounts: priorPlAppropriationAmounts,
            depreciationSchedule: normalizeDepreciationSchedule(priorFs.depreciationSchedule || []),
            previousYearDepreciation: normalizePreviousYearDepreciation(priorFs.previousYearDepreciation),
            loans: priorLoans,
            gstReco: normalizeGstReco(priorFs.gstReco),
            bankAccounts: priorBankAccounts,
          }
          setPreviousYearPlAppropriationAmounts(priorPlAppropriationAmounts)
        } catch {
          priorNotes = null
          priorSubAmounts = null
          priorLoans = null
          priorBankAccounts = []
          priorFsPrepared = null
          priorPlAppropriationAmounts = null
          setPreviousYearPlAppropriationAmounts(null)
        }
      } else {
        setPreviousYearPlAppropriationAmounts(null)
      }
      setPreviousYearNotes(priorNotes)
      setPreviousYearSubAmounts(priorSubAmounts)
      setPreviousYearLoans(priorLoans)
      setPreviousYearBankAccounts(priorBankAccounts)
      const fyStart = fyMeta?.startYear ?? new Date().getFullYear()
      const fyEnd = fyMeta?.endYear ?? fyStart + 1
      let loans = normalizeLoans(fs.loans, fs.repaymentSchedule, fyStart, fyEnd)
      let administrativeExpenseLines = normalizeAdministrativeExpenseLines(
        fs.administrativeExpenseLines,
        fs.noteSubAmounts,
      )
      let otherShortTermBorrowingLines = normalizeOtherShortTermBorrowingLines(
        fs.otherShortTermBorrowingLines,
        fs.noteSubAmounts,
      )
      let manualNoteLines = normalizeManualNoteLines(fs.manualNoteLines, fs.noteSubAmounts)
      let capitalAccountLines = normalizeCapitalAccountLines(
        fs.capitalAccountLines,
        fs.noteSubAmounts,
      )
      const plAppropriationLines = normalizePlAppropriationLines(fs.plAppropriationLines)
      const plAppropriationAmounts = migratePlAppropriationAmounts(
        plAppropriationLines,
        fs.plAppropriationAmounts ?? {},
      )
      let bankAccounts = normalizeBankAccounts(fs.bankAccounts)
      let noteSubAmounts = normalizeNoteSubAmounts(
        fs.noteSubAmounts,
        migrateNoteBreakdowns(fs.noteBreakdowns),
        loans,
        administrativeExpenseLines,
        otherShortTermBorrowingLines,
        manualNoteLines,
        bankAccounts,
        capitalAccountLines,
        loadedLedgers,
      )
      noteSubAmounts = migrateAdminExpenseSubAmounts(administrativeExpenseLines, noteSubAmounts)
      noteSubAmounts = migrateOtherShortTermSubAmounts(otherShortTermBorrowingLines, noteSubAmounts)
      noteSubAmounts = migrateManualNoteLineSubAmounts(manualNoteLines, noteSubAmounts)
      noteSubAmounts = migrateCapitalAccountSubAmounts(capitalAccountLines, noteSubAmounts)

      const gstReco = normalizeGstReco(fs.gstReco)
      if (gstReco.linkSalesToRevenueNote) {
        noteSubAmounts = applyGstSalesLinkToRevenue(noteSubAmounts, gstReco)
      }
      noteSubAmounts = applyClosingStockLink(noteSubAmounts)

      const migratedNotes = migrateNotes(fs.notes as Parameters<typeof migrateNotes>[0])
      let nextOpeningLocks: OpeningBalanceLocks | null = null
      let carriedDepreciationSchedule = normalizeDepreciationSchedule(fs.depreciationSchedule || [])
      let carriedPreviousYearDepreciation = normalizePreviousYearDepreciation(fs.previousYearDepreciation)

      // Fingerprint before carry-forward/auto-populate so pending opening-balance
      // links count as unsaved changes (Save must work without toggling UDIN).
      const serverBaselineFingerprint = fsDataFingerprint({
        ...fs,
        notes: migratedNotes,
        noteBreakdowns: migrateNoteBreakdowns(fs.noteBreakdowns),
        noteSubAmounts,
        administrativeExpenseLines,
        otherShortTermBorrowingLines,
        manualNoteLines,
        capitalAccountLines,
        plAppropriationLines,
        plAppropriationAmounts,
        depreciationSchedule: carriedDepreciationSchedule,
        previousYearDepreciation: carriedPreviousYearDepreciation,
        loans,
        gstReco,
        bankAccounts,
        cashAdjustment: normalizeCashAdjustment(fs.cashAdjustment),
        udinDetails: normalizeUdinDetails(fs.udinDetails),
        finalizationInfo: normalizeFinalizationInfo(fs.finalizationInfo),
      })

      if (!isConsolidatedView && priorFy && priorFsPrepared) {
        const businessForCarry = clientData.businesses.find((item) => item.id === businessId)
        const priorFyMeta = clientData.financialYears?.find((item) => item.id === priorFy.id)
        const priorFyStart = priorFyMeta?.startYear ?? new Date().getFullYear()
        const priorFyEnd = priorFyMeta?.endYear ?? priorFyStart + 1
        const priorClosing = buildPriorYearClosingSnapshot({
          fs: priorFsPrepared,
          fyStartYear: priorFyStart,
          fyEndYear: priorFyEnd,
          previousYearSubAmounts: null,
          previousYearNotes: null,
          previousYearLoans: null,
          previousYearBankAccounts: [],
          previousYearPlAppropriationAmounts: priorPlAppropriationAmounts,
          ledgers: loadedLedgers,
        })
        const priorClosings = buildPriorDepClosingsByLedgerId(
          expandPriorScheduleWithHistory(
            priorFsPrepared.depreciationSchedule || [],
            loadedDepreciationHistory,
            priorFy.id,
          ),
        )
        setPriorDepClosingsByLedgerId(priorClosings)

        const depLocks: OpeningBalanceLocks = {
          noteSubs: new Set(),
          loanIds: new Set(),
          bankIds: new Set(),
          depRowIds: new Set(),
          previousYearDepOpening: false,
          previousYearDepLinked: false,
        }

        if (
          businessForCarry &&
          hasPriorYearDepreciationData(priorFsPrepared, priorFy.id, loadedDepreciationHistory)
        ) {
          const depCarry = applyDepreciationScheduleCarryForward({
            schedule: carriedDepreciationSchedule,
            priorSchedule: priorFsPrepared.depreciationSchedule ?? [],
            priorClosing,
            previousYearDepreciation: carriedPreviousYearDepreciation,
            priorFs: priorFsPrepared,
            locks: depLocks,
            priorFyId: priorFy.id,
            depreciationHistory: loadedDepreciationHistory,
          })
          carriedDepreciationSchedule = depCarry.schedule
          carriedPreviousYearDepreciation = depCarry.previousYearDepreciation
          nextOpeningLocks = depLocks
        }

        if (businessForCarry) {
          const carryResult = applyOpeningBalanceCarryForward({
            business: businessForCarry,
            priorFy,
            priorFs: priorFsPrepared,
            priorClosing,
            current: {
              noteSubAmounts,
              loans,
              bankAccounts,
              depreciationSchedule: carriedDepreciationSchedule,
              previousYearDepreciation: carriedPreviousYearDepreciation,
              administrativeExpenseLines,
              otherShortTermBorrowingLines,
              manualNoteLines,
              capitalAccountLines,
            },
          })
          noteSubAmounts = carryResult.data.noteSubAmounts
          noteSubAmounts = applyClosingStockLink(noteSubAmounts)
          loans = carryResult.data.loans
          bankAccounts = carryResult.data.bankAccounts
          carriedDepreciationSchedule = carryResult.data.depreciationSchedule
          carriedPreviousYearDepreciation = carryResult.data.previousYearDepreciation
          administrativeExpenseLines =
            carryResult.data.administrativeExpenseLines ?? administrativeExpenseLines
          otherShortTermBorrowingLines =
            carryResult.data.otherShortTermBorrowingLines ?? otherShortTermBorrowingLines
          manualNoteLines = carryResult.data.manualNoteLines ?? manualNoteLines
          capitalAccountLines = carryResult.data.capitalAccountLines ?? capitalAccountLines
          nextOpeningLocks = carryResult.locks
            ? {
                ...carryResult.locks,
                depRowIds: new Set([
                  ...carryResult.locks.depRowIds,
                  ...depLocks.depRowIds,
                ]),
                previousYearDepOpening:
                  nextOpeningLocks?.previousYearDepOpening ||
                  carryResult.locks.previousYearDepOpening ||
                  false,
                previousYearDepLinked:
                  nextOpeningLocks?.previousYearDepLinked ||
                  carryResult.locks.previousYearDepLinked ||
                  false,
              }
            : nextOpeningLocks
        }
      } else {
        setPriorDepClosingsByLedgerId(new Map())
      }
      setOpeningBalanceLocks(nextOpeningLocks)

      if (!isConsolidatedView) {
        const priorClosingsForLedgers = priorFsPrepared
          ? buildPriorDepClosingsByLedgerId(
              expandPriorScheduleWithHistory(
                priorFsPrepared.depreciationSchedule || [],
                loadedDepreciationHistory,
                priorFy?.id ?? '',
              ),
            )
          : new Map<string, number>()
        carriedDepreciationSchedule = autoPopulateDepreciationFromLedgers(
          carriedDepreciationSchedule,
          loadedLedgers,
          priorClosingsForLedgers,
          loadedDepreciationHistory,
        )
        const businessAssetLedgerIds = collectBusinessAssetLedgerIds(
          carriedDepreciationSchedule,
          loadedDepreciationHistory,
          priorClosingsForLedgers,
        )
        carriedDepreciationSchedule = filterScheduleToBusinessAssets(
          carriedDepreciationSchedule,
          businessAssetLedgerIds,
        )
      }

      if (!isConsolidatedView) {
        carriedDepreciationSchedule = mergeDepreciationScheduleLedgerNames(
          carriedDepreciationSchedule,
          loadedLedgers,
        )
      }

      const nextFsData = {
        ...fs,
        notes: migratedNotes,
        noteBreakdowns: migrateNoteBreakdowns(fs.noteBreakdowns),
        noteSubAmounts,
        administrativeExpenseLines,
        otherShortTermBorrowingLines,
        manualNoteLines,
        capitalAccountLines,
        plAppropriationLines,
        plAppropriationAmounts,
        depreciationSchedule: carriedDepreciationSchedule,
        previousYearDepreciation: carriedPreviousYearDepreciation,
        loans,
        gstReco,
        bankAccounts,
        cashAdjustment: normalizeCashAdjustment(fs.cashAdjustment),
        udinDetails: normalizeUdinDetails(fs.udinDetails),
        finalizationInfo: normalizeFinalizationInfo(fs.finalizationInfo),
      }

      setFsData(nextFsData)
      // Never-saved years stay dirty until first save. Saved years become dirty when
      // carry-forward / auto-populate changed data vs the server baseline.
      setSavedFingerprint(fs.savedAt ? serverBaselineFingerprint : '__never_saved__')
    } catch {
      setError('Could not load financial statement data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [clientId, fyId, businessId])

  const fy = client?.financialYears?.find((item) => item.id === fyId)
  const business = isConsolidatedView
    ? {
        id: CONSOLIDATED_BUSINESS_ID,
        name: CONSOLIDATED_BUSINESS_LABEL,
        type: 'Consolidated',
        pan: '',
        address: '',
        startingFy: 'All Businesses',
        startingYear: 0,
        gstNumber: '',
        status: 'active' as const,
        createdAt: '',
      }
    : (client?.businesses.find((item) => item.id === businessId) ??
      (fsData && businessId
        ? {
            id: businessId,
            name: 'Business (Archived)',
            type: '',
            pan: '',
            address: '',
            startingFy: '',
            startingYear: 0,
            gstNumber: '',
            status: 'inactive' as const,
            createdAt: '',
          }
        : undefined))
  const hasLoans = (fsData?.loans.length ?? 0) > 0
  const previousFyLabel = fy
    ? buildShortFyLabel(fy.startYear - 1, fy.endYear - 1)
    : 'Previous'
  const currentFyLabel = fy ? buildShortFyLabel(fy.startYear, fy.endYear) : 'Current'
  const balanceSheetPreviousLabel = fy ? formatBalanceSheetPrintColumnLabel(fy.endYear - 1) : 'Previous'
  const balanceSheetCurrentLabel = fy ? formatBalanceSheetPrintColumnLabel(fy.endYear) : 'Current'
  const profitLossPreviousLabel = fy ? formatProfitLossColumnLabel(fy.endYear - 1) : 'Previous'
  const profitLossCurrentLabel = fy ? formatProfitLossColumnLabel(fy.endYear) : 'Current'

  const computedLoans = useMemo(() => {
    if (!fsData || !fy) {
      return []
    }
    return recomputeLoansForFy(fsData.loans, fy.startYear, fy.endYear)
  }, [fsData, fy])

  const loanCalcPayload = useMemo(
    () =>
      computedLoans.map((loan) => ({
        id: loan.id,
        closingBalance: loan.closingBalance,
        interestForYear: loan.interestForYear,
        lender: loan.lender,
      })),
    [computedLoans],
  )

  const previousYearComputedLoans = useMemo(() => {
    if (!previousYearLoans || !fy) {
      return []
    }
    return recomputeLoansForFy(previousYearLoans, fy.startYear - 1, fy.endYear - 1).map((loan) => ({
      id: loan.id,
      interestForYear: loan.interestForYear,
      lender: loan.lender,
    }))
  }, [previousYearLoans, fy])

  const plAppropriationTotal = useMemo(() => {
    if (!fsData) {
      return { current: 0, previous: 0 }
    }
    return sumPlAppropriation(
      fsData.plAppropriationLines ?? [],
      fsData.plAppropriationAmounts ?? {},
      previousYearPlAppropriationAmounts,
    )
  }, [fsData, previousYearPlAppropriationAmounts])

  const isDirty = useMemo(() => {
    if (!fsData || savedFingerprint === null) {
      return false
    }
    // First-time / never-persisted statements must keep Save enabled.
    // UDIN is optional and must not be required to unlock Save.
    if (!isConsolidatedView && !fsData.savedAt) {
      return true
    }
    return fsDataFingerprint(fsData) !== savedFingerprint
  }, [fsData, savedFingerprint, isConsolidatedView])

  const finalizationInfo = useMemo(
    () => normalizeFinalizationInfo(fsData?.finalizationInfo),
    [fsData?.finalizationInfo],
  )
  const isFsFinalLocked = Boolean(finalizationInfo.lockToken)

  useEffect(() => {
    if (!isDirty || isConsolidatedView) {
      return
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty, isConsolidatedView])

  const bankClosingGroups = useMemo(() => {
    if (!fsData) {
      return { credit: [], debit: [] }
    }
    return partitionBankAccountsByClosing(fsData.bankAccounts)
  }, [fsData])

  const noteCalcContext = useMemo(() => {
    if (!fsData || !fy) {
      return null
    }
    const merged = notesWithPreviousFromPriorFy(fsData.notes, previousYearNotes)
    return {
      notes: merged,
      noteBreakdowns: fsData.noteBreakdowns,
      noteSubAmounts: fsData.noteSubAmounts,
      previousYearSubAmounts,
      depreciationSchedule: fsData.depreciationSchedule,
      previousYearDepreciation: fsData.previousYearDepreciation,
      loans: fsData.loans,
      previousYearNotes,
      fyStartYear: fy.startYear,
      fyEndYear: fy.endYear,
      computedLoans: loanCalcPayload,
      previousYearComputedLoans,
      administrativeExpenseLines: fsData.administrativeExpenseLines ?? [],
      otherShortTermBorrowingLines: fsData.otherShortTermBorrowingLines ?? [],
      manualNoteLines: fsData.manualNoteLines ?? [],
      capitalAccountLines: fsData.capitalAccountLines ?? [],
      ledgers,
      plAppropriationTotal,
      bankAccounts: fsData.bankAccounts,
      previousYearBankAccounts,
      cashAdjustment: normalizeCashAdjustment(fsData.cashAdjustment),
    }
  }, [
    fsData,
    fy,
    previousYearNotes,
    previousYearSubAmounts,
    loanCalcPayload,
    previousYearComputedLoans,
    plAppropriationTotal,
    previousYearBankAccounts,
    ledgers,
  ])

  const effectiveNotes = useMemo(() => {
    if (!noteCalcContext) {
      return null
    }
    return buildEffectiveNotes(noteCalcContext)
  }, [noteCalcContext])

  const computed = useMemo(() => {
    if (!fsData || !fy || !effectiveNotes) {
      return null
    }
    return computeStatements(
      effectiveNotes,
      fsData.depreciationSchedule,
      fsData.loans,
      fy.startYear,
      fy.endYear,
      fsData.previousYearDepreciation,
      plAppropriationTotal,
    )
  }, [fsData, fy, effectiveNotes, plAppropriationTotal])

  const noteCalcMap = useMemo(() => {
    if (!noteCalcContext || !effectiveNotes) {
      return null
    }
    return getNoteCalcMap(noteCalcContext, effectiveNotes)
  }, [noteCalcContext, effectiveNotes])

  const subResolveContext = useMemo(() => {
    if (!fsData || !computed) {
      return null
    }
    return buildSubResolveContext(
      fsData.noteSubAmounts,
      previousYearSubAmounts,
      computed,
      fsData.depreciationSchedule,
      fsData.previousYearDepreciation,
      fsData.loans,
      loanCalcPayload,
      fsData.administrativeExpenseLines ?? [],
      previousYearComputedLoans,
      fsData.otherShortTermBorrowingLines ?? [],
      fsData.manualNoteLines ?? [],
      plAppropriationTotal,
      fsData.bankAccounts,
      previousYearBankAccounts,
      fsData.capitalAccountLines ?? [],
      ledgers,
      openingBalanceLocks,
      normalizeCashAdjustment(fsData.cashAdjustment),
    )
  }, [
    fsData,
    computed,
    previousYearSubAmounts,
    loanCalcPayload,
    previousYearComputedLoans,
    plAppropriationTotal,
    previousYearBankAccounts,
    ledgers,
    openingBalanceLocks,
  ])

  const noteSubRowsMap = useMemo(() => {
    if (!subResolveContext) {
      return null
    }
    const map = {} as Record<keyof FsNotes, ResolvedSubRow[]>
    for (const field of NOTE_FIELDS) {
      map[field.key] = resolveNoteSubRows(field.key, subResolveContext)
    }
    return map
  }, [subResolveContext])

  const balanceSheetLines = useMemo(() => {
    if (!effectiveNotes || !noteSubRowsMap) {
      return []
    }

    return buildBalanceSheetLines({
      notes: effectiveNotes,
      tradePayableRows: noteSubRowsMap.tradePayables,
      inventoryRows: noteSubRowsMap.inventoriesTradeReceivables,
      fixedAssetRows: noteSubRowsMap.depreciationAmortization,
    })
  }, [effectiveNotes, noteSubRowsMap])

  const sourcesOfFundsLines = useMemo(() => {
    const applicationHeaderIndex = balanceSheetLines.findIndex(
      (row) => row.isHeader && row.label === 'II. APPLICATION OF FUNDS',
    )
    if (applicationHeaderIndex <= 0) {
      return balanceSheetLines
    }
    return balanceSheetLines.slice(0, applicationHeaderIndex)
  }, [balanceSheetLines])

  const applicationOfFundsLines = useMemo(() => {
    const applicationHeaderIndex = balanceSheetLines.findIndex(
      (row) => row.isHeader && row.label === 'II. APPLICATION OF FUNDS',
    )
    if (applicationHeaderIndex < 0) {
      return []
    }
    return balanceSheetLines.slice(applicationHeaderIndex)
  }, [balanceSheetLines])

  const sourcesFundsTotal = useMemo(() => {
    const totals = sourcesOfFundsLines.filter((row) => row.isGrandTotal)
    return totals[totals.length - 1] ?? null
  }, [sourcesOfFundsLines])

  const applicationFundsTotal = useMemo(() => {
    const totals = applicationOfFundsLines.filter((row) => row.isGrandTotal)
    return totals[totals.length - 1] ?? null
  }, [applicationOfFundsLines])

  const consolidatedCashFlow = useMemo(
    () => mergeCashFlowByYear(computedLoans),
    [computedLoans],
  )

  const updateSubNote = (noteKey: keyof FsNotes, subId: string, value: string) => {
    if (!fsData || isNoteOpeningSubLocked(openingBalanceLocks, noteKey, subId)) {
      return
    }

    if (
      fsData.gstReco.linkSalesToRevenueNote &&
      noteKey === 'revenueFromOperations' &&
      isGstLinkedRevenueSub(subId)
    ) {
      return
    }

    if (isClosingStockLinkedInventoriesSub(noteKey, subId)) {
      return
    }

    const existing = fsData.noteSubAmounts[noteKey]?.[subId] ?? { current: 0, previous: 0 }

    let noteSubAmounts = {
      ...fsData.noteSubAmounts,
      [noteKey]: {
        ...fsData.noteSubAmounts[noteKey],
        [subId]: {
          ...existing,
          current: Number(value) || 0,
        },
      },
    }

    if (noteKey === 'costOfGoodsSold' && subId === 'less-closing-stock') {
      noteSubAmounts = applyClosingStockLink(noteSubAmounts)
    }

    setFsData({
      ...fsData,
      noteSubAmounts,
    })
    setSaveMessage('')
  }

  const addPlAppropriationLine = () => {
    if (!fsData) {
      return
    }

    const { line, subId, amount } = createPlAppropriationLine()

    setFsData({
      ...fsData,
      plAppropriationLines: [...(fsData.plAppropriationLines ?? []), line],
      plAppropriationAmounts: {
        ...(fsData.plAppropriationAmounts ?? {}),
        [subId]: amount,
      },
    })
    setSaveMessage('')
  }

  const updatePlAppropriationCategory = (lineId: string, categoryId: string) => {
    if (!fsData) {
      return
    }

    setFsData({
      ...fsData,
      plAppropriationLines: (fsData.plAppropriationLines ?? []).map((line) =>
        line.id === lineId
          ? { ...line, categoryId: normalizePlAppropriationCategoryId(categoryId) }
          : line,
      ),
    })
    setSaveMessage('')
  }

  const updatePlAppropriationAmount = (lineId: string, value: string) => {
    if (!fsData) {
      return
    }

    const subId = plAppropriationSubId(lineId)
    const existing = fsData.plAppropriationAmounts?.[subId] ?? { current: 0, previous: 0 }

    setFsData({
      ...fsData,
      plAppropriationAmounts: {
        ...(fsData.plAppropriationAmounts ?? {}),
        [subId]: {
          ...existing,
          current: Number(value) || 0,
        },
      },
    })
    setSaveMessage('')
  }

  const removePlAppropriationLine = (lineId: string) => {
    if (!fsData) {
      return
    }

    const subId = plAppropriationSubId(lineId)
    const amounts = { ...(fsData.plAppropriationAmounts ?? {}) }
    delete amounts[subId]

    setFsData({
      ...fsData,
      plAppropriationLines: (fsData.plAppropriationLines ?? []).filter((line) => line.id !== lineId),
      plAppropriationAmounts: amounts,
    })
    setSaveMessage('')
  }

  const addAdministrativeExpenseLine = () => {
    if (!fsData) {
      return
    }

    const lineId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
    const categoryId = defaultLedgerIdForGroup(ledgers, 'otherAdministrativeExpenses')
    const subId = adminExpenseSubId(lineId)

    setFsData({
      ...fsData,
      administrativeExpenseLines: [
        ...(fsData.administrativeExpenseLines ?? []),
        { id: lineId, categoryId },
      ],
      noteSubAmounts: {
        ...fsData.noteSubAmounts,
        otherAdministrativeExpenses: {
          ...fsData.noteSubAmounts.otherAdministrativeExpenses,
          [subId]: { current: 0, previous: 0 },
        },
      },
    })
    setSaveMessage('')
  }

  const updateAdministrativeExpenseCategory = (lineId: string, categoryId: string) => {
    if (!fsData) {
      return
    }

    setFsData({
      ...fsData,
      administrativeExpenseLines: (fsData.administrativeExpenseLines ?? []).map((line) =>
        line.id === lineId ? { ...line, categoryId } : line,
      ),
    })
    setSaveMessage('')
  }

  const removeAdministrativeExpenseLine = (lineId: string) => {
    if (!fsData) {
      return
    }

    const subId = adminExpenseSubId(lineId)
    const adminSubs = { ...(fsData.noteSubAmounts.otherAdministrativeExpenses ?? {}) }
    delete adminSubs[subId]

    setFsData({
      ...fsData,
      administrativeExpenseLines: (fsData.administrativeExpenseLines ?? []).filter(
        (line) => line.id !== lineId,
      ),
      noteSubAmounts: {
        ...fsData.noteSubAmounts,
        otherAdministrativeExpenses: adminSubs,
      },
    })
    setSaveMessage('')
  }

  const addOtherShortTermBorrowingLine = () => {
    if (!fsData) {
      return
    }

    const lineId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
    const typeId = defaultLedgerIdForGroup(ledgers, 'shortTermBorrowings')
    const subId = manualShortTermSubId(lineId)

    setFsData({
      ...fsData,
      otherShortTermBorrowingLines: [
        ...(fsData.otherShortTermBorrowingLines ?? []),
        { id: lineId, typeId },
      ],
      noteSubAmounts: {
        ...fsData.noteSubAmounts,
        shortTermBorrowings: {
          ...fsData.noteSubAmounts.shortTermBorrowings,
          [subId]: { current: 0, previous: 0 },
        },
      },
    })
    setSaveMessage('')
  }

  const updateOtherShortTermBorrowingType = (lineId: string, typeId: string) => {
    if (!fsData) {
      return
    }

    setFsData({
      ...fsData,
      otherShortTermBorrowingLines: (fsData.otherShortTermBorrowingLines ?? []).map((line) =>
        line.id === lineId
          ? { ...line, typeId: normalizeOtherShortTermBorrowingTypeId(typeId) }
          : line,
      ),
    })
    setSaveMessage('')
  }

  const removeOtherShortTermBorrowingLine = (lineId: string) => {
    if (!fsData) {
      return
    }

    const subId = manualShortTermSubId(lineId)
    const interestSubId = manualShortTermInterestSubId(lineId)
    const stSubs = { ...(fsData.noteSubAmounts.shortTermBorrowings ?? {}) }
    const financeSubs = { ...(fsData.noteSubAmounts.financeCost ?? {}) }
    delete stSubs[subId]
    delete financeSubs[interestSubId]

    setFsData({
      ...fsData,
      otherShortTermBorrowingLines: (fsData.otherShortTermBorrowingLines ?? []).filter(
        (line) => line.id !== lineId,
      ),
      noteSubAmounts: {
        ...fsData.noteSubAmounts,
        shortTermBorrowings: stSubs,
        financeCost: financeSubs,
      },
    })
    setSaveMessage('')
  }

  const addManualNoteLine = (noteKey: ManualNoteLineKey) => {
    if (!fsData) {
      return
    }

    const lineId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
    const typeId = defaultLedgerIdForGroup(ledgers, noteKey)
    const subId = manualNoteLineSubId(lineId)

    setFsData({
      ...fsData,
      manualNoteLines: [
        ...(fsData.manualNoteLines ?? []),
        { id: lineId, noteKey, typeId },
      ],
      noteSubAmounts: {
        ...fsData.noteSubAmounts,
        [noteKey]: {
          ...fsData.noteSubAmounts[noteKey],
          [subId]: { current: 0, previous: 0 },
        },
      },
    })
    setSaveMessage('')
  }

  const updateManualNoteLineType = (noteKey: ManualNoteLineKey, lineId: string, typeId: string) => {
    if (!fsData) {
      return
    }

    setFsData({
      ...fsData,
      manualNoteLines: (fsData.manualNoteLines ?? []).map((line) =>
        line.id === lineId && line.noteKey === noteKey ? { ...line, typeId } : line,
      ),
    })
    setSaveMessage('')
  }

  const removeManualNoteLine = (noteKey: ManualNoteLineKey, lineId: string) => {
    if (!fsData) {
      return
    }

    const subId = manualNoteLineSubId(lineId)
    const noteSubs = { ...(fsData.noteSubAmounts[noteKey] ?? {}) }
    delete noteSubs[subId]

    setFsData({
      ...fsData,
      manualNoteLines: (fsData.manualNoteLines ?? []).filter(
        (line) => !(line.id === lineId && line.noteKey === noteKey),
      ),
      noteSubAmounts: {
        ...fsData.noteSubAmounts,
        [noteKey]: noteSubs,
      },
    })
    setSaveMessage('')
  }

  const defaultCapitalLedgerId = (sign: CapitalAccountLineSign) => {
    const groupLedgers = getLedgersForGroup(ledgers, 'capitalAccount').filter(
      (ledger) => normalizeLedgerSign(ledger.sign) === sign,
    )
    return groupLedgers[0]?.id ?? defaultLedgerIdForGroup(ledgers, 'capitalAccount')
  }

  const addCapitalAccountLine = () => {
    if (!fsData) {
      return
    }

    const lineId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
    const sign = 'less' as const
    const typeId = defaultCapitalLedgerId(sign)
    const subId = capitalAccountLineSubId(lineId)

    setFsData({
      ...fsData,
      capitalAccountLines: [
        ...(fsData.capitalAccountLines ?? []),
        { id: lineId, sign, typeId },
      ],
      noteSubAmounts: {
        ...fsData.noteSubAmounts,
        capitalAccount: {
          ...fsData.noteSubAmounts.capitalAccount,
          [subId]: { current: 0, previous: 0 },
        },
      },
    })
    setSaveMessage('')
  }

  const updateCapitalAccountLineSign = (lineId: string, sign: string) => {
    if (!fsData) {
      return
    }

    const normalizedSign = normalizeCapitalAccountLineSign(sign)

    setFsData({
      ...fsData,
      capitalAccountLines: (fsData.capitalAccountLines ?? []).map((line) =>
        line.id === lineId
          ? {
              ...line,
              sign: normalizedSign,
              typeId: defaultCapitalLedgerId(normalizedSign),
            }
          : line,
      ),
    })
    setSaveMessage('')
  }

  const updateCapitalAccountLineType = (lineId: string, typeId: string) => {
    if (!fsData) {
      return
    }

    setFsData({
      ...fsData,
      capitalAccountLines: (fsData.capitalAccountLines ?? []).map((line) =>
        line.id === lineId ? { ...line, typeId } : line,
      ),
    })
    setSaveMessage('')
  }

  const removeCapitalAccountLine = (lineId: string) => {
    if (!fsData) {
      return
    }

    const subId = capitalAccountLineSubId(lineId)
    const capitalSubs = { ...(fsData.noteSubAmounts.capitalAccount ?? {}) }
    delete capitalSubs[subId]

    setFsData({
      ...fsData,
      capitalAccountLines: (fsData.capitalAccountLines ?? []).filter((line) => line.id !== lineId),
      noteSubAmounts: {
        ...fsData.noteSubAmounts,
        capitalAccount: capitalSubs,
      },
    })
    setSaveMessage('')
  }

  const renderLedgerSelectOptions = (
    group: keyof FsNotes,
    sign?: CapitalAccountLineSign,
  ) => {
    let groupLedgers = getLedgersForGroup(ledgers, group)
    if (group === 'capitalAccount' && sign) {
      groupLedgers = groupLedgers.filter(
        (ledger) => normalizeLedgerSign(ledger.sign) === sign,
      )
    }
    return groupLedgers.map((ledger) => (
      <option key={ledger.id} value={ledger.id}>
        {ledger.name}
      </option>
    ))
  }

  const renderSubPreviousRef = (sub: ResolvedSubRow, noteKey?: keyof FsNotes) => (
    <>
      <div
        className={`note-prev-ref fs-screen-only${noteKey && (isAdminExpenseLine(noteKey, sub) || isManualShortTermLine(noteKey, sub) || isManualFinanceInterestLine(noteKey, sub) || isManualNoteLine(noteKey, sub) || isCapitalAccountDynamicLine(noteKey, sub)) ? ' notes-admin-prev-ref' : ''}`}
        title={`${previousFyLabel} — reference only`}
      >
        {sub.previous ? formatSubAmount(sub.previous, sub.kind) : '—'}
      </div>
      <span className="note-amount-print fs-print-only">
        {sub.previous ? formatSubAmount(sub.previous, sub.kind) : '—'}
      </span>
    </>
  )

  const renderSubVarianceCells = (sub: ResolvedSubRow) => {
    const change = calcValueChange(sub.current, sub.previous)
    const pct = calcPercentChange(sub.current, sub.previous)

    return (
      <>
        <td className={`notes-variance-col notes-change-col ${varianceClass(change)}`}>
          <div className="note-variance-value">
            {sub.kind === 'percent' ? formatPercentChange(change) : formatChangeAmount(change)}
          </div>
        </td>
        <td
          className={`notes-variance-col notes-pct-col ${pct !== null ? varianceClass(change) : 'variance-flat'}`}
        >
          <div className="note-variance-value">{formatPercentChange(pct)}</div>
        </td>
      </>
    )
  }

  const renderSubCurrentCell = (noteKey: keyof FsNotes, sub: ResolvedSubRow) => {
    const gstSalesLinked =
      Boolean(fsData?.gstReco.linkSalesToRevenueNote) &&
      noteKey === 'revenueFromOperations' &&
      isGstLinkedRevenueSub(sub.id)
    const closingStockLinked = isClosingStockLinkedInventoriesSub(noteKey, sub.id)

    if (!sub.editable || gstSalesLinked || closingStockLinked) {
      const scheduleHint = closingStockLinked
        ? 'Auto: Closing stock from Note 21 (Cost of Goods Sold)'
        : gstSalesLinked
        ? sub.id === 'sales-goods'
          ? 'Auto: Taxable sales from GST Reco (Sales + Amended sales)'
          : 'Not used when GST Reco sales are linked'
        : isNoteOpeningSubLocked(openingBalanceLocks, noteKey, sub.id)
          ? 'Opening balance carried from previous year closing (not editable)'
          : noteKey === 'depreciationAmortization' && sub.isAuto
          ? 'Auto from Depreciation Schedule'
          : noteKey === 'financeCost' && sub.kind === 'auto' && sub.id.startsWith('interest-')
            ? 'Auto: Interest paid from Repayment Schedule'
            : (noteKey === 'longTermBorrowings' || noteKey === 'shortTermBorrowings') &&
                sub.kind === 'auto' &&
                sub.id.startsWith('loan-')
              ? 'Auto: Closing balance from Loan Repayment Schedule'
              : noteKey === 'cashAtBank' && sub.kind === 'auto' && sub.id.startsWith('bank-') && !sub.id.startsWith('bank-st-')
              ? 'Auto: Credit balance from Bank Account tab (Current / Savings)'
              : noteKey === 'cashInHand' && sub.id === 'cash-flow-adjustment'
                ? 'Auto: Sources vs Application difference (Cash Flow Adjustment)'
                : noteKey === 'shortTermBorrowings' && sub.kind === 'auto' && sub.id.startsWith('bank-st-')
                ? 'Auto: Debit balance from Bank Account tab (CC / OD)'
                : undefined
      return (
        <>
          <div
            className={`note-sub-auto fs-screen-only${sub.isAuto ? ' is-auto-calc' : ''}`}
            title={scheduleHint}
          >
            {sub.current ? formatSubAmount(sub.current, sub.kind) : '—'}
          </div>
          <span className="note-amount-print fs-print-only">
            {sub.current ? formatSubAmount(sub.current, sub.kind) : '—'}
          </span>
        </>
      )
    }

    const stored = fsData?.noteSubAmounts[noteKey]?.[sub.id]?.current
    const displayValue = stored === 0 ? '' : stored
    const isAdminLine = isAdminExpenseLine(noteKey, sub)
    const isManualStLine = isManualShortTermLine(noteKey, sub)
    const isManualFinanceInterest = isManualFinanceInterestLine(noteKey, sub)
    const isManualLine = isManualNoteLine(noteKey, sub)
    const isCapitalLine = isCapitalAccountDynamicLine(noteKey, sub)

    return (
      <>
        <input
          type="number"
          className={`note-amount-input fs-screen-only${isAdminLine || isManualStLine || isManualFinanceInterest || isManualLine || isCapitalLine ? ' notes-admin-amount-input' : ''}`}
          value={displayValue ?? ''}
          onChange={(event) => updateSubNote(noteKey, sub.id, event.target.value)}
          placeholder={isAdminLine || isManualStLine || isManualFinanceInterest || isManualLine || isCapitalLine ? '0.00' : undefined}
        />
        <span className="note-amount-print fs-print-only">
          {stored ? formatSubAmount(stored, sub.kind) : '—'}
        </span>
      </>
    )
  }

  const renderEmptyNoteHeadCells = (hideVariance = false) => (
    <>
      <td className="notes-amount-col notes-prev-col notes-head-empty-col" aria-hidden="true" />
      <td className="notes-amount-col notes-curr-col notes-head-empty-col" aria-hidden="true" />
      {!hideVariance && (
        <>
          <td className="notes-variance-col notes-change-col notes-head-empty-col" aria-hidden="true" />
          <td className="notes-variance-col notes-pct-col notes-head-empty-col" aria-hidden="true" />
        </>
      )}
    </>
  )

  const renderRepaymentScheduleLinkHeader = (
    field: (typeof NOTE_FIELDS)[number],
    linked: boolean,
    trailing?: ReactNode,
  ) => (
    <div className="notes-main-label-row notes-schedule-header-row">
      <div className="notes-revenue-header">
        <span className="notes-revenue-title">{field.label}</span>
        <div className={`notes-gst-link-bar notes-schedule-link-bar${linked ? ' is-linked' : ''}`}>
          {linked && (
            <span
              className="notes-gst-linked-badge"
              title="Closing balance linked from Loan Repayment Schedule"
            >
              Linked
            </span>
          )}
          <button
            type="button"
            className="notes-gst-open-btn"
            onClick={() => setActiveTab('repayment')}
            title="Open Loan Repayment Schedule"
          >
            Repayment Schedule
            <span className="notes-gst-open-arrow" aria-hidden="true">
              →
            </span>
          </button>
        </div>
      </div>
      {trailing}
    </div>
  )

  const renderMainNoteLabel = (field: (typeof NOTE_FIELDS)[number]) => {
    if (field.key === 'longTermBorrowings') {
      const hasLtLoans = fsData?.loans.some((loan) => loan.loanType === 'long-term') ?? false
      return renderRepaymentScheduleLinkHeader(field, hasLtLoans)
    }

    if (field.key === 'shortTermBorrowings') {
      const hasStLoans = fsData?.loans.some((loan) => loan.loanType === 'short-term') ?? false
      return renderRepaymentScheduleLinkHeader(
        field,
        hasStLoans,
        <button
          type="button"
          className="notes-add-round-btn notes-add-round-btn-st"
          onClick={addOtherShortTermBorrowingLine}
          title="Add other short-term borrowing"
          aria-label="Add other short-term borrowing"
        >
          +
        </button>,
      )
    }

    if (field.key === 'otherAdministrativeExpenses') {
      return (
        <div className="notes-main-label-row">
          <span>{field.label}</span>
          <button
            type="button"
            className="notes-add-round-btn"
            onClick={addAdministrativeExpenseLine}
            title="Add administrative expense"
            aria-label="Add administrative expense"
          >
            +
          </button>
        </div>
      )
    }

    if (field.key === 'capitalAccount') {
      return (
        <div className="notes-main-label-row">
          <span>{field.label}</span>
          <button
            type="button"
            className="notes-add-round-btn notes-add-round-btn-capital"
            onClick={addCapitalAccountLine}
            title="Add capital line (Add or Less)"
            aria-label="Add capital line"
          >
            +
          </button>
        </div>
      )
    }

    if (isManualNoteLineKey(field.key)) {
      const manualKey = field.key
      return (
        <div className="notes-main-label-row">
          <span>{field.label}</span>
          <button
            type="button"
            className="notes-add-round-btn notes-add-round-btn-manual"
            onClick={() => addManualNoteLine(manualKey)}
            title={`Add ${field.label} line`}
            aria-label={`Add ${field.label} line`}
          >
            +
          </button>
        </div>
      )
    }

    if (field.key === 'revenueFromOperations') {
      const linked = Boolean(fsData?.gstReco.linkSalesToRevenueNote)

      return (
        <div className="notes-revenue-header">
          <span className="notes-revenue-title">{field.label}</span>
          <div className={`notes-gst-link-bar${linked ? ' is-linked' : ''}`}>
            <label className="notes-gst-link-chip" title="Link taxable sales from GST Reco to this note">
              <input
                type="checkbox"
                className="notes-gst-link-checkbox"
                checked={linked}
                onChange={(event) => toggleGstSalesLink(event.target.checked)}
                aria-label="Link GST Reco sales to this note"
              />
            </label>
            <span className="notes-gst-link-divider" aria-hidden="true" />
            <button
              type="button"
              className="notes-gst-open-btn"
              onClick={() => setActiveTab('gst-reco')}
              title="Open GST Reco sheet"
            >
              GST Reco
              <span className="notes-gst-open-arrow" aria-hidden="true">
                →
              </span>
            </button>
          </div>
        </div>
      )
    }

    return field.label
  }

  const isAdminExpenseLine = (noteKey: keyof FsNotes, sub: ResolvedSubRow) =>
    noteKey === 'otherAdministrativeExpenses' && sub.id.startsWith('admin-line-')

  const isManualShortTermLine = (noteKey: keyof FsNotes, sub: ResolvedSubRow) =>
    noteKey === 'shortTermBorrowings' && sub.id.startsWith('manual-st-')

  const isManualNoteLine = (noteKey: keyof FsNotes, sub: ResolvedSubRow) =>
    isManualNoteLineKey(noteKey) && sub.id.startsWith('manual-nl-')

  const renderAdminExpenseLabel = (sub: ResolvedSubRow) => {
    const lineId = sub.id.replace('admin-line-', '')
    const line = fsData?.administrativeExpenseLines?.find((item) => item.id === lineId)
    const categoryId = line?.categoryId ?? defaultLedgerIdForGroup(ledgers, 'otherAdministrativeExpenses')

    return (
      <div className="notes-admin-field">
        <span className="notes-admin-field-marker" aria-hidden="true" />
        <div className="notes-admin-select-wrap">
          <select
            className="notes-admin-category-select"
            value={categoryId}
            title={resolveAdminExpenseLabel(ledgers, categoryId)}
            onChange={(event) => updateAdministrativeExpenseCategory(lineId, event.target.value)}
          >
            {renderLedgerSelectOptions('otherAdministrativeExpenses')}
          </select>
        </div>
        <button
          type="button"
          className="notes-admin-remove-btn"
          onClick={() => removeAdministrativeExpenseLine(lineId)}
          title="Remove expense line"
          aria-label="Remove expense line"
        >
          ×
        </button>
      </div>
    )
  }

  const renderManualShortTermLabel = (sub: ResolvedSubRow) => {
    const lineId = sub.id.replace('manual-st-', '')
    const line = fsData?.otherShortTermBorrowingLines?.find((item) => item.id === lineId)
    const typeId = line?.typeId ?? defaultLedgerIdForGroup(ledgers, 'shortTermBorrowings')

    return (
      <div className="notes-admin-field">
        <span className="notes-admin-field-marker" aria-hidden="true" />
        <div className="notes-admin-select-wrap">
          <select
            className="notes-admin-category-select"
            value={typeId}
            title={resolveShortTermBorrowingLabel(ledgers, typeId)}
            onChange={(event) => updateOtherShortTermBorrowingType(lineId, event.target.value)}
          >
            {renderLedgerSelectOptions('shortTermBorrowings')}
          </select>
        </div>
        <button
          type="button"
          className="notes-admin-remove-btn"
          onClick={() => removeOtherShortTermBorrowingLine(lineId)}
          title="Remove borrowing line"
          aria-label="Remove borrowing line"
        >
          ×
        </button>
      </div>
    )
  }

  const renderManualNoteLineLabel = (noteKey: ManualNoteLineKey, sub: ResolvedSubRow) => {
    const lineId = sub.id.replace('manual-nl-', '')
    const line = fsData?.manualNoteLines?.find((item) => item.id === lineId && item.noteKey === noteKey)
    const typeId = line?.typeId ?? defaultLedgerIdForGroup(ledgers, noteKey)

    return (
      <div className="notes-admin-field">
        <span className="notes-admin-field-marker notes-manual-marker" aria-hidden="true" />
        <div className="notes-admin-select-wrap">
          <select
            className="notes-admin-category-select"
            value={typeId}
            title={resolveManualNoteLineLabel(ledgers, noteKey, typeId)}
            onChange={(event) => updateManualNoteLineType(noteKey, lineId, event.target.value)}
          >
            {renderLedgerSelectOptions(noteKey)}
          </select>
        </div>
        <button
          type="button"
          className="notes-admin-remove-btn"
          onClick={() => removeManualNoteLine(noteKey, lineId)}
          title="Remove line"
          aria-label="Remove line"
        >
          ×
        </button>
      </div>
    )
  }

  const renderCapitalAccountLineLabel = (sub: ResolvedSubRow) => {
    const lineId = sub.id.replace('capital-line-', '')
    const line = fsData?.capitalAccountLines?.find((item) => item.id === lineId)
    const sign = normalizeCapitalAccountLineSign(line?.sign)
    const typeId = line?.typeId ?? defaultCapitalLedgerId(sign)

    return (
      <div className="notes-admin-field notes-capital-field">
        <span className="notes-admin-field-marker notes-capital-marker" aria-hidden="true" />
        <div className="notes-admin-select-wrap notes-capital-sign-wrap">
          <select
            className="notes-admin-category-select notes-capital-sign-select"
            value={sign}
            title={sign === 'add' ? 'Add value' : 'Less value'}
            onChange={(event) => updateCapitalAccountLineSign(lineId, event.target.value)}
          >
            <option value="add">Add</option>
            <option value="less">Less</option>
          </select>
        </div>
        <div className="notes-admin-select-wrap">
          <select
            className="notes-admin-category-select"
            value={typeId}
            title={resolveCapitalAccountLineLabel(ledgers, sign, typeId)}
            onChange={(event) => updateCapitalAccountLineType(lineId, event.target.value)}
          >
            {renderLedgerSelectOptions('capitalAccount', sign)}
          </select>
        </div>
        <button
          type="button"
          className="notes-admin-remove-btn"
          onClick={() => removeCapitalAccountLine(lineId)}
          title="Remove line"
          aria-label="Remove line"
        >
          ×
        </button>
      </div>
    )
  }

  const isFinanceInterestLine = (noteKey: keyof FsNotes, sub: ResolvedSubRow) =>
    noteKey === 'financeCost' && sub.kind === 'auto' && sub.id.startsWith('interest-')

  const isManualFinanceInterestLine = (noteKey: keyof FsNotes, sub: ResolvedSubRow) =>
    noteKey === 'financeCost' && sub.id.startsWith('interest-manual-st-')

  const isFinanceInterestRow = (noteKey: keyof FsNotes, sub: ResolvedSubRow) =>
    isFinanceInterestLine(noteKey, sub) || isManualFinanceInterestLine(noteKey, sub)

  const renderFinanceInterestLabel = (sub: ResolvedSubRow) => (
    <div className="notes-finance-interest-label">
      <span className="notes-finance-lender">{sub.label}</span>
      {sub.loanType && (
        <span className={`loan-type-badge ${sub.loanType}`}>
          {sub.loanType === 'long-term' ? 'Long Term' : 'Short Term'}
        </span>
      )}
    </div>
  )

  const renderFinanceSubLabel = (noteKey: keyof FsNotes, sub: ResolvedSubRow) => {
    if (sub.kind === 'header') {
      const isMainHeader = sub.id === 'interest-main-header'
      if (sub.id === 'interest-lt-header') {
        return (
          <button
            type="button"
            className="notes-repayment-link-btn"
            onClick={() => setActiveTab('repayment')}
            title="Open Loan Repayment Schedule"
          >
            {sub.label}
          </button>
        )
      }
      return (
        <span
          className={
            isMainHeader ? 'notes-finance-section-title' : 'notes-finance-subsection-title'
          }
        >
          {sub.label}
        </span>
      )
    }

    if (isFinanceInterestRow(noteKey, sub)) {
      return renderFinanceInterestLabel(sub)
    }

    return sub.label
  }

  const renderNoteSubRows = (noteKey: keyof FsNotes, options?: { hideVariance?: boolean }) => {
    const hideVariance = options?.hideVariance ?? false
    const trailingColSpan = hideVariance ? 3 : 5
    const subRows = noteSubRowsMap?.[noteKey] ?? []
    const isAdminNote = noteKey === 'otherAdministrativeExpenses'
    const isFinanceNote = noteKey === 'financeCost'
    const isLongTermNote = noteKey === 'longTermBorrowings'
    const isShortTermNote = noteKey === 'shortTermBorrowings'
    const isCapitalNote = noteKey === 'capitalAccount'
    const isMultiLineNote = isManualNoteLineKey(noteKey)
    const hasAdminLines = (fsData?.administrativeExpenseLines?.length ?? 0) > 0
    const hasLongTermLoans = fsData?.loans.some((loan) => loan.loanType === 'long-term') ?? false
    const hasShortTermLoans = fsData?.loans.some((loan) => loan.loanType === 'short-term') ?? false
    const hasManualStLines = (fsData?.otherShortTermBorrowingLines?.length ?? 0) > 0
    const hasManualNoteLines = (fsData?.manualNoteLines ?? []).some((line) => line.noteKey === noteKey)
    const hasCapitalLines = (fsData?.capitalAccountLines?.length ?? 0) > 0

    const renderSubLabel = (sub: ResolvedSubRow) => {
      if (isAdminExpenseLine(noteKey, sub)) {
        return renderAdminExpenseLabel(sub)
      }
      if (
        isLongTermNote &&
        (sub.id === 'long-term-entry' || sub.id === 'long-term-total' || sub.id.startsWith('loan-'))
      ) {
        return (
          <button
            type="button"
            className="notes-repayment-link-btn"
            onClick={() => setActiveTab('repayment')}
            title="Open Loan Repayment Schedule"
          >
            {sub.label}
          </button>
        )
      }
      if (isManualShortTermLine(noteKey, sub)) {
        return renderManualShortTermLabel(sub)
      }
      if (isCapitalAccountDynamicLine(noteKey, sub)) {
        return renderCapitalAccountLineLabel(sub)
      }
      if (isMultiLineNote && isManualNoteLine(noteKey, sub)) {
        return renderManualNoteLineLabel(noteKey, sub)
      }
      if (isFinanceNote) {
        return renderFinanceSubLabel(noteKey, sub)
      }
      if (
        (isLongTermNote || isShortTermNote) &&
        sub.id.startsWith('loan-') &&
        sub.kind === 'auto'
      ) {
        return renderFinanceInterestLabel(sub)
      }
      return sub.label
    }

    return (
      <>
        {isLongTermNote && !hasLongTermLoans && (
          <tr className="notes-lt-empty-row">
            <td className="notes-sno-col" />
            <td className="notes-particular-col notes-lt-empty-hint" colSpan={trailingColSpan}>
              Add long-term loans in the <strong>Repayment Schedule</strong> tab — closing balances
              appear here automatically. You can also enter a manual amount below.
            </td>
          </tr>
        )}
        {isFinanceNote && !hasLoans && !hasManualStLines && (
          <tr className="notes-finance-empty-row">
            <td className="notes-sno-col" />
            <td className="notes-particular-col notes-finance-empty-hint" colSpan={trailingColSpan}>
              Add loans in the <strong>Repayment Schedule</strong> tab to show interest lines here
            </td>
          </tr>
        )}
        {isShortTermNote && !hasShortTermLoans && !hasManualStLines && (
          <tr className="notes-st-empty-row">
            <td className="notes-sno-col" />
            <td className="notes-particular-col notes-st-empty-hint" colSpan={trailingColSpan}>
              Add short-term loans in the <strong>Repayment Schedule</strong> tab for schedule-based
              borrowings, or click <span className="notes-admin-empty-plus">+</span> for other
              borrowings (add ledgers in <strong>Ledger</strong> for dropdown options)
            </td>
          </tr>
        )}
        {isAdminNote && !hasAdminLines && (
          <tr className="notes-admin-empty-row">
            <td className="notes-sno-col" />
            <td className="notes-particular-col notes-admin-empty-hint" colSpan={trailingColSpan}>
              Click <span className="notes-admin-empty-plus">+</span> to add an expense line (add
              ledgers in <strong>Ledger</strong> for dropdown options)
            </td>
          </tr>
        )}
        {isMultiLineNote && !hasManualNoteLines && (
          <tr className="notes-manual-empty-row">
            <td className="notes-sno-col" />
            <td className="notes-particular-col notes-manual-empty-hint" colSpan={trailingColSpan}>
              Click <span className="notes-admin-empty-plus">+</span> to add a line item (add ledgers
              in <strong>Ledger</strong> for dropdown options)
            </td>
          </tr>
        )}
        {isCapitalNote && !hasCapitalLines && (
          <tr className="notes-capital-empty-row">
            <td className="notes-sno-col" />
            <td className="notes-particular-col notes-capital-empty-hint" colSpan={trailingColSpan}>
              Click <span className="notes-admin-empty-plus">+</span> to add Add / Less lines (add
              ledgers in <strong>Ledger</strong> for dropdown options)
            </td>
          </tr>
        )}
        {noteKey === 'revenueFromOperations' && fsData?.gstReco.linkSalesToRevenueNote && (() => {
          const goodsRow = subRows.find((row) => row.id === 'sales-goods')
          const servicesRow = subRows.find((row) => row.id === 'sales-services')
          const current = getGstTaxableSalesTotal(fsData.gstReco)
          const previous = (goodsRow?.previous ?? 0) + (servicesRow?.previous ?? 0)
          const change = calcValueChange(current, previous)
          const pct = calcPercentChange(current, previous)

          return (
            <tr key={`${noteKey}-gst-reco-ref`} className="notes-sub-row notes-gst-ref-row is-auto-row">
              <td className="notes-sno-col" />
              <td className="notes-particular-col notes-sub-label notes-gst-ref-label">
                As per GST Reco
              </td>
              <td className="notes-amount-col notes-prev-col">
                <div className="note-prev-ref" title={`${previousFyLabel} — reference only`}>
                  {previous ? formatAmount(previous) : '—'}
                </div>
              </td>
              <td className="notes-amount-col notes-curr-col">
                <div className="note-sub-auto is-auto-calc" title="Taxable sales from GST Reco">
                  {current ? formatAmount(current) : '—'}
                </div>
              </td>
              {!hideVariance && (
                <>
                  <td className={`notes-variance-col notes-change-col ${varianceClass(change)}`}>
                    <div className="note-variance-value">{formatChangeAmount(change)}</div>
                  </td>
                  <td
                    className={`notes-variance-col notes-pct-col ${pct !== null ? varianceClass(change) : 'variance-flat'}`}
                  >
                    <div className="note-variance-value">{formatPercentChange(pct)}</div>
                  </td>
                </>
              )}
            </tr>
          )
        })()}
        {subRows
          .filter(
            (sub) =>
              sub.id !== 'cash-flow-adjustment' || sub.current !== 0 || sub.previous !== 0,
          )
          .map((sub) => {
          if (
            noteKey === 'revenueFromOperations' &&
            fsData?.gstReco.linkSalesToRevenueNote &&
            isGstLinkedRevenueSub(sub.id)
          ) {
            return null
          }

          if (sub.kind === 'subtotal') {
            return null
          }

          const isAdminLine = isAdminExpenseLine(noteKey, sub)
          const isManualStLine = isManualShortTermLine(noteKey, sub)
          const isManualLine = isManualNoteLine(noteKey, sub)
          const isCapitalLine = isCapitalAccountDynamicLine(noteKey, sub)
          const isSectionHeader =
            (isFinanceNote || isShortTermNote || isLongTermNote) && sub.kind === 'header'
          const isFinanceInterest = isFinanceInterestRow(noteKey, sub)
          const rowClass = [
            'notes-sub-row',
            `notes-sub-kind-${sub.kind}`,
            sub.isAuto ? 'is-auto-row' : '',
            isAdminLine ? 'notes-admin-expense-row' : '',
            isManualStLine ? 'notes-st-manual-row' : '',
            isManualLine ? 'notes-manual-line-row' : '',
            isCapitalLine ? 'notes-capital-line-row' : '',
            isAdminNote && sub.id === 'admin-total' ? 'notes-admin-total-row' : '',
            isShortTermNote && sub.id === 'short-term-total' ? 'notes-st-total-row' : '',
            isLongTermNote && sub.id === 'long-term-total' ? 'notes-lt-total-row' : '',
            isMultiLineNote && sub.id === 'stp-total' ? 'notes-manual-total-row' : '',
            isSectionHeader ? 'notes-finance-header-row' : '',
            sub.id === 'interest-main-header' ||
            sub.id === 'lt-schedule-header' ||
            sub.id === 'st-schedule-header' ||
            sub.id === 'st-manual-header'
              ? 'notes-finance-main-header'
              : '',
            isLongTermNote && sub.id.startsWith('loan-') ? 'notes-lt-loan-row' : '',
            isShortTermNote && sub.id.startsWith('loan-') ? 'notes-st-loan-row' : '',
            sub.id === 'st-manual-header' ? 'notes-st-manual-header-row' : '',
            isFinanceInterest ? 'notes-finance-interest-row' : '',
            isFinanceNote && sub.id === 'total-finance-cost' ? 'notes-finance-total-row' : '',
            sub.kind === 'total' ? 'notes-note-total-row' : '',
          ]
            .filter(Boolean)
            .join(' ')

          if (isSectionHeader) {
            return (
              <tr key={`${noteKey}-${sub.id}`} className={rowClass}>
                <td className="notes-sno-col" />
                <td className="notes-particular-col notes-sub-label" colSpan={trailingColSpan}>
                  {renderSubLabel(sub)}
                </td>
              </tr>
            )
          }

          const subNoteRef = NOTE_SUB_PL_REFS[sub.id] ?? NOTE_SUB_BALANCE_SHEET_REFS[sub.id]

          return (
            <tr
              key={`${noteKey}-${sub.id}`}
              id={`note-sub-${noteKey}-${sub.id}`}
              className={`${rowClass}${
                highlightedNote?.noteKey === noteKey && highlightedNote.noteSubId === sub.id
                  ? ' notes-row-highlight'
                  : ''
              }`}
            >
              <td className="notes-sno-col">
                {subNoteRef
                  ? renderNoteNumberLink(noteKey, subNoteRef, sub.id)
                  : null}
              </td>
              <td className="notes-particular-col notes-sub-label">{renderSubLabel(sub)}</td>
              <td className="notes-amount-col notes-prev-col">
                {renderSubPreviousRef(sub, noteKey)}
              </td>
              <td className="notes-amount-col notes-curr-col">
                {renderSubCurrentCell(noteKey, sub)}
              </td>
              {!hideVariance && renderSubVarianceCells(sub)}
            </tr>
          )
        })}
      </>
    )
  }

  const updateDepreciation = (index: number, field: keyof DepreciationRow, value: string) => {
    if (!fsData) {
      return
    }

    const row = fsData.depreciationSchedule[index]
    if (field === 'openingWdv' && openingBalanceLocks?.depRowIds.has(row.id)) {
      return
    }
    const schedule = [...fsData.depreciationSchedule]
    const stringFields: Array<keyof DepreciationRow> = ['assetName', 'ledgerId']
    const nextRow = {
      ...schedule[index],
      [field]: stringFields.includes(field) ? value : Number(value) || 0,
    }

    schedule[index] = recalcDepreciationRow(nextRow as DepreciationRow)

    setFsData({ ...fsData, depreciationSchedule: schedule })
    setSaveMessage('')
  }

  const persistDepreciationSchedule = async (
    schedule: DepreciationRow[],
    options?: { successAlert?: () => Promise<void> },
  ) => {
    if (!fsData || !clientId || !fyId || !businessId || isConsolidatedView) {
      return false
    }

    const businessAssetLedgerIds = collectBusinessAssetLedgerIds(
      schedule,
      depreciationHistory,
      priorDepClosingsByLedgerId,
    )
    const prunedSchedule = filterScheduleToBusinessAssets(schedule, businessAssetLedgerIds)

    const saved = await saveDepreciationSchedule(clientId, fyId, businessId, {
      depreciationSchedule: prunedSchedule,
      previousYearDepreciation: fsData.previousYearDepreciation,
    })

    const nextFsData = {
      ...fsData,
      depreciationSchedule: saved.depreciationSchedule,
      previousYearDepreciation: saved.previousYearDepreciation,
    }
    setFsData(nextFsData)
    setSavedFingerprint(fsDataFingerprint(nextFsData))
    setSaveMessage('')
    setError('')

    if (options?.successAlert) {
      await options.successAlert()
    }

    return true
  }

  const addDepreciationRow = async () => {
    if (!fsData || !clientId || !fyId || !businessId || isConsolidatedView || isFsFinalLocked) {
      return
    }

    const assetLedgers = getFixedAssetLedgers(ledgers)
    if (assetLedgers.length === 0) {
      return
    }

    const availableLedgers = getAvailableFixedAssetLedgers(fsData.depreciationSchedule, ledgers)
    if (availableLedgers.length === 0) {
      return
    }

    if (fsData.depreciationSchedule.some((row) => !row.ledgerId)) {
      return
    }

    const selectedLedgerId = await promptDepreciationAssetSelect(availableLedgers)
    if (!selectedLedgerId) {
      return
    }

    const ledger = availableLedgers.find((item) => item.id === selectedLedgerId)
    if (!ledger) {
      return
    }

    const confirmed = await confirmSave({
      action: 'add',
      itemLabel: ledger.name,
    })
    if (!confirmed) {
      return
    }

    let newRow = createDepreciationRowFromLedger(ledger)
    newRow = applyPriorDepClosingToRow(newRow, priorDepClosingsByLedgerId)
    const nextSchedule = [...fsData.depreciationSchedule, newRow]
    const previousSchedule = fsData.depreciationSchedule

    // Show the new row immediately while persisting.
    setFsData({ ...fsData, depreciationSchedule: nextSchedule })

    try {
      await persistDepreciationSchedule(nextSchedule, {
        successAlert: () => showAddedAlert(ledger.name),
      })
    } catch (err) {
      setFsData((current) =>
        current ? { ...current, depreciationSchedule: previousSchedule } : current,
      )
      setError(err instanceof Error ? err.message : 'Failed to add asset')
    }
  }

  const removeDepreciationAsset = async (index: number) => {
    if (!fsData || !clientId || !fyId || !businessId || isConsolidatedView || isFsFinalLocked) {
      return
    }

    const row = fsData.depreciationSchedule[index]
    const confirmed = await confirmDelete({
      itemLabel: row.assetName || 'this asset',
    })
    if (!confirmed) {
      return
    }

    const nextSchedule = fsData.depreciationSchedule.filter((_, rowIndex) => rowIndex !== index)

    try {
      await persistDepreciationSchedule(nextSchedule, {
        successAlert: () => showDeletedAlert(row.assetName || 'Asset'),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove asset')
    }
  }

  const changeDepreciationAsset = (index: number, ledgerId: string) => {
    if (!fsData || isConsolidatedView || isFsFinalLocked) {
      return
    }

    const schedule = updateDepreciationRowLedger(
      fsData.depreciationSchedule,
      index,
      ledgerId,
      ledgers,
    ).map((row, rowIndex) =>
      rowIndex === index ? applyPriorDepClosingToRow(row, priorDepClosingsByLedgerId) : row,
    )
    setFsData({ ...fsData, depreciationSchedule: schedule })
    setSaveMessage('')
  }

  const handleLoansSaved = (loans: LoanRecord[]) => {
    setFsData((current) => {
      if (!current) {
        return current
      }
      const next = { ...current, loans }
      setSavedFingerprint(fsDataFingerprint(next))
      return next
    })
    setSaveMessage('')
    setError('')
    setLoanModalOpen(false)
    setEditingLoan(null)
  }

  const deleteLoan = async (loanId: string) => {
    if (!fsData || !clientId || !fyId || !businessId || isConsolidatedView) {
      return
    }

    const loan = fsData.loans.find((item) => item.id === loanId)
    const confirmed = await confirmDelete({
      itemLabel: loan?.lender || 'this loan',
    })
    if (!confirmed) {
      return
    }

    const loans = fsData.loans.filter((item) => item.id !== loanId)

    try {
      const { loans: savedLoans } = await saveLoans(clientId, fyId, businessId, loans)
      setFsData((current) => {
        if (!current) {
          return current
        }
        const next = { ...current, loans: savedLoans }
        setSavedFingerprint(fsDataFingerprint(next))
        return next
      })
      setSaveMessage('')
      setError('')
      if (expandedLoanId === loanId) {
        setExpandedLoanId(null)
      }
      await showDeletedAlert(loan?.lender || 'Loan')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete loan')
    }
  }

  const openAddLoan = () => {
    setEditingLoan(null)
    setLoanModalOpen(true)
  }

  const openEditLoan = (loan: LoanRecord) => {
    setEditingLoan(loan)
    setLoanModalOpen(true)
  }

  const openAddBank = () => {
    setEditingBank(null)
    setBankModalOpen(true)
  }

  const openEditBank = (account: BankAccountRecord) => {
    setEditingBank(account)
    setBankModalOpen(true)
  }

  const handleBankAccountsSaved = (bankAccounts: BankAccountRecord[]) => {
    setFsData((current) => (current ? { ...current, bankAccounts } : current))
    setSaveMessage('')
    setError('')
    setBankModalOpen(false)
    setEditingBank(null)
  }

  const deleteBank = async (accountId: string) => {
    if (!fsData || !clientId || !fyId || !businessId || isConsolidatedView) {
      return
    }

    const account = fsData.bankAccounts.find((item) => item.id === accountId)
    const confirmed = await confirmDelete({
      itemLabel: account?.bankName || 'this bank account',
    })
    if (!confirmed) {
      return
    }

    const bankAccounts = fsData.bankAccounts.filter((item) => item.id !== accountId)

    try {
      const { bankAccounts: savedBankAccounts } = await saveBankAccounts(
        clientId,
        fyId,
        businessId,
        bankAccounts,
      )
      setFsData((current) =>
        current ? { ...current, bankAccounts: savedBankAccounts } : current,
      )
      setSaveMessage('')
      setError('')
      await showDeletedAlert(account?.bankName || 'Bank account')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete bank account')
    }
  }

  const updateBankAmount = (
    accountId: string,
    field: keyof Pick<
      BankAccountRecord,
      'openingBalance' | 'debit' | 'credit' | 'bankCharge' | 'interest' | 'closingBalance'
    >,
    value: string,
  ) => {
    if (!fsData) {
      return
    }

    if (field === 'openingBalance' && openingBalanceLocks?.bankIds.has(accountId)) {
      return
    }

    const parsed =
      field === 'debit' || field === 'credit'
        ? Math.abs(Number(value) || 0)
        : Number(value) || 0
    setFsData({
      ...fsData,
      bankAccounts: fsData.bankAccounts.map((account) =>
        account.id === accountId ? { ...account, [field]: parsed } : account,
      ),
    })
    setSaveMessage('')
  }

  const updateBankClosingSide = (
    accountId: string,
    side: 'debit' | 'credit',
    value: string,
  ) => {
    if (!fsData) {
      return
    }

    const amount = Math.abs(Number(value) || 0)
    const closingBalance = side === 'credit' ? amount : amount > 0 ? -amount : 0

    setFsData({
      ...fsData,
      bankAccounts: fsData.bankAccounts.map((account) =>
        account.id === accountId ? { ...account, closingBalance } : account,
      ),
    })
    setSaveMessage('')
  }

  const toggleGstSalesLink = (linked: boolean) => {
    if (!fsData) {
      return
    }

    const gstReco = { ...fsData.gstReco, linkSalesToRevenueNote: linked }
    const noteSubAmounts = linked
      ? applyGstSalesLinkToRevenue(fsData.noteSubAmounts, gstReco)
      : fsData.noteSubAmounts

    setFsData({ ...fsData, gstReco, noteSubAmounts })
    setSaveMessage('')
  }

  const updateGstReco = (gstReco: GstRecoStatement) => {
    if (!fsData) {
      return
    }

    const noteSubAmounts = gstReco.linkSalesToRevenueNote
      ? applyGstSalesLinkToRevenue(fsData.noteSubAmounts, gstReco)
      : fsData.noteSubAmounts

    setFsData({ ...fsData, gstReco, noteSubAmounts })
    setSaveMessage('')
  }

  const updatePreviousYearDep = (
    field: keyof PreviousYearDepreciationSummary,
    value: string,
  ) => {
    if (!fsData) {
      return
    }

    if (openingBalanceLocks?.previousYearDepLinked) {
      return
    }

    if (openingBalanceLocks?.previousYearDepOpening) {
      return
    }

    setFsData({
      ...fsData,
      previousYearDepreciation: {
        ...fsData.previousYearDepreciation,
        [field]: Number(value) || 0,
      },
    })
    setSaveMessage('')
  }

  const handleSave = async (options?: {
    finalizationOverride?: FinalizationInfo
    unlockCode?: string
    successMessage?: string
    skipConfirm?: boolean
    dataOverride?: FinancialStatementData
  }) => {
    // Allow save while a local lock token is set so Finalize/Relock can be persisted.
    // Block only when the year is already locked and there is nothing new to save.
    const hasLockAction = Boolean(options?.finalizationOverride || options?.unlockCode)
    if (isConsolidatedView || (isFsFinalLocked && !isDirty && !hasLockAction)) {
      return false
    }

    const workingData = options?.dataOverride || fsData

    if (!clientId || !fyId || !businessId || !workingData || !effectiveNotes || !computed) {
      return false
    }

    if (!options?.skipConfirm) {
      const confirmed = await confirmSave({
        action: 'edit',
        itemLabel: business?.name || 'financial statement',
      })
      if (!confirmed) {
        return false
      }
    }

    setSaving(true)
    setSaveMessage('')

    try {
      const plLine = (label: string) => computed.profitAndLoss.find((line) => line.label === label)
      const cashAdj = normalizeCashAdjustment(workingData.cashAdjustment)
      const statementSnapshot = {
        balanceSheetLines,
        profitAndLossLines: computed.profitAndLoss,
        summary: {
          sourcesTotalCurrent: sourcesFundsTotal?.current ?? 0,
          sourcesTotalPrevious: sourcesFundsTotal?.previous ?? 0,
          applicationTotalCurrent: applicationFundsTotal?.current ?? 0,
          applicationTotalPrevious: applicationFundsTotal?.previous ?? 0,
          netProfitCurrent: plLine('Net Profit / (Loss)')?.current ?? 0,
          netProfitPrevious: plLine('Net Profit / (Loss)')?.previous ?? 0,
          grossProfitCurrent: plLine('Gross Profit')?.current ?? 0,
          grossProfitPrevious: plLine('Gross Profit')?.previous ?? 0,
          totalIncomeCurrent: plLine('Total Income')?.current ?? 0,
          totalIncomePrevious: plLine('Total Income')?.previous ?? 0,
          totalExpensesCurrent: plLine('Total Expenses')?.current ?? 0,
          totalExpensesPrevious: plLine('Total Expenses')?.previous ?? 0,
          cashAdjustmentCurrent: cashAdj.current,
          cashAdjustmentPrevious: cashAdj.previous,
          sourcesApplicationDiffCurrent:
            (sourcesFundsTotal?.current ?? 0) - (applicationFundsTotal?.current ?? 0),
          sourcesApplicationDiffPrevious:
            (sourcesFundsTotal?.previous ?? 0) - (applicationFundsTotal?.previous ?? 0),
        },
      }

      const nextFinalization = options?.finalizationOverride
        ? normalizeFinalizationInfo(options.finalizationOverride)
        : normalizeFinalizationInfo(workingData.finalizationInfo)
      const unlockCode = options?.unlockCode || unlockConfirmationCode
      const notesForSave = options?.dataOverride
        ? notesWithPreviousFromPriorFy(options.dataOverride.notes, previousYearNotes)
        : notesWithPreviousFromPriorFy(effectiveNotes, previousYearNotes)

      const businessAssetLedgerIds = collectBusinessAssetLedgerIds(
        workingData.depreciationSchedule,
        depreciationHistory,
        priorDepClosingsByLedgerId,
      )
      const prunedDepreciationSchedule = isConsolidatedView
        ? filterActiveDepreciationSchedule(workingData.depreciationSchedule)
        : filterScheduleToBusinessAssets(workingData.depreciationSchedule, businessAssetLedgerIds)

      const payload: FinancialStatementData = {
        ...workingData,
        notes: notesForSave,
        depreciationSchedule: prunedDepreciationSchedule,
        statementSnapshot,
        finalizationInfo: nextFinalization,
        ...(unlockCode ? { unlockConfirmationCode: unlockCode } : {}),
      }
      const saved = await saveFsData(clientId, fyId, businessId, payload)
      const savedAdminLines = normalizeAdministrativeExpenseLines(
        saved.administrativeExpenseLines,
        saved.noteSubAmounts,
      )
      const savedOtherStLines = normalizeOtherShortTermBorrowingLines(
        saved.otherShortTermBorrowingLines,
        saved.noteSubAmounts,
      )
      const savedManualLines = normalizeManualNoteLines(saved.manualNoteLines, saved.noteSubAmounts)
      const savedCapitalLines = normalizeCapitalAccountLines(
        saved.capitalAccountLines,
        saved.noteSubAmounts,
      )
      const savedPlLines = normalizePlAppropriationLines(saved.plAppropriationLines)
      const savedPlAmounts = migratePlAppropriationAmounts(
        savedPlLines,
        saved.plAppropriationAmounts ?? {},
      )
      let savedSubAmounts = normalizeNoteSubAmounts(
        saved.noteSubAmounts,
        migrateNoteBreakdowns(saved.noteBreakdowns),
        workingData.loans,
        savedAdminLines,
        savedOtherStLines,
        savedManualLines,
        normalizeBankAccounts(saved.bankAccounts),
        savedCapitalLines,
        ledgers,
      )
      savedSubAmounts = migrateAdminExpenseSubAmounts(savedAdminLines, savedSubAmounts)
      savedSubAmounts = migrateOtherShortTermSubAmounts(savedOtherStLines, savedSubAmounts)
      savedSubAmounts = migrateManualNoteLineSubAmounts(savedManualLines, savedSubAmounts)
      savedSubAmounts = migrateCapitalAccountSubAmounts(savedCapitalLines, savedSubAmounts)
      savedSubAmounts = applyClosingStockLink(savedSubAmounts)

      const nextState = {
        ...saved,
        notes: migrateNotes(saved.notes as Parameters<typeof migrateNotes>[0]),
        noteBreakdowns: migrateNoteBreakdowns(saved.noteBreakdowns),
        noteSubAmounts: savedSubAmounts,
        administrativeExpenseLines: savedAdminLines,
        otherShortTermBorrowingLines: savedOtherStLines,
        manualNoteLines: savedManualLines,
        capitalAccountLines: savedCapitalLines,
        plAppropriationLines: savedPlLines,
        plAppropriationAmounts: savedPlAmounts,
        depreciationSchedule: normalizeDepreciationSchedule(saved.depreciationSchedule || []),
        previousYearDepreciation: normalizePreviousYearDepreciation(saved.previousYearDepreciation),
        loans: workingData.loans,
        gstReco: normalizeGstReco(saved.gstReco),
        bankAccounts: normalizeBankAccounts(saved.bankAccounts),
        cashAdjustment: normalizeCashAdjustment(saved.cashAdjustment),
        udinDetails: normalizeUdinDetails(saved.udinDetails),
        finalizationInfo: normalizeFinalizationInfo(saved.finalizationInfo),
      }

      setFsData(nextState)
      setSavedFingerprint(fsDataFingerprint(nextState))
      setUnlockConfirmationCode('')
      setSaveMessage(options?.successMessage || 'Financial statement saved successfully.')
      if (options?.successMessage) {
        await showActionAlert('Done', options.successMessage)
      } else {
        await showUpdatedAlert(business?.name || 'Financial statement')
      }

      if (!isConsolidatedView) {
        try {
          const { history } = await fetchDepreciationHistory(clientId, businessId)
          setDepreciationHistory(history)
        } catch {
          // history refresh is best-effort after save
        }
      }
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      return false
    } finally {
      setSaving(false)
    }
  }

  const openQuickEntry = () => {
    if (!fsData || isFsReadOnly) {
      return
    }
    const firstKey = NOTE_FIELDS[0]?.key ?? 'capitalAccount'
    setQuickEntryNoteKey(firstKey)
    setQuickEntryNoteSearch('')
    setQuickEntryNoteMenuOpen(false)
    setQuickEntryOpen(true)
  }

  const saveQuickEntry = async () => {
    if (!fsData || isFsReadOnly) {
      return
    }
    await handleSave({
      skipConfirm: true,
    })
  }

  if (loading) {
    return <p className="empty-state">Loading financial statement...</p>
  }

  if (!client || !fy || !business) {
    return (
      <div>
        <p className="empty-state">Financial statement not found.</p>
        <button type="button" className="back-link" onClick={() => navigate(`/clients/${clientId}/business`)}>
          Back
        </button>
      </div>
    )
  }

  if (!fsData || !computed || !noteCalcMap || !effectiveNotes || !noteSubRowsMap) {
    return (
      <div className="fs-page">
        <button
          type="button"
          className="back-link"
          onClick={() => navigate(`/clients/${clientId}/business`)}
        >
          ← Back to Business & Financial Year
        </button>
        {error && <div className="alert">{error}</div>}
        <p className="empty-state">{error || 'Financial statement not found.'}</p>
      </div>
    )
  }

  const noteGroups = NOTE_GROUP_ORDER
  const depTotals = sumDepreciationSchedule(fsData.depreciationSchedule)
  const fixedAssetLedgers = getFixedAssetLedgers(ledgers)
  const availableFixedAssetLedgers = getAvailableFixedAssetLedgers(fsData.depreciationSchedule, ledgers)
  const hasBlankDepRow = fsData.depreciationSchedule.some((row) => !row.ledgerId)
  const udinDetails = normalizeUdinDetails(fsData.udinDetails)
  const udinCaOptions = (() => {
    const options = [...activeCaProfiles]
    const assignedProfile = udinDetails.caProfileId
      ? caProfiles.find((profile) => profile.id === udinDetails.caProfileId)
      : null

    if (assignedProfile && !options.some((profile) => profile.id === assignedProfile.id)) {
      options.push(assignedProfile)
    }

    return options
  })()
  const statementType = normalizeStatementType(fy.statementType)
  const balanceSheetLabel = formatBalanceSheetReportTitle(statementType)
  const profitLossLabel = formatProfitLossReportTitle(statementType)
  const notesLabel = formatNotesReportTitle(statementType)
  const baseTabs = isConsolidatedView
    ? buildFsTabOptions(statementType).filter(([tab]) => CONSOLIDATED_REPORT_TABS.includes(tab))
    : buildFsTabOptions(statementType)
  const visibleTabs: Array<[FsTab, string]> = [...baseTabs]
  if (!isConsolidatedView) {
    visibleTabs.push(['final-info', 'Final Info'])
  }
  if (!isConsolidatedView && udinDetails.enabled) {
    visibleTabs.push(['udin-details', 'UDIN Details'])
  }
  const resolvedActiveTab = visibleTabs.some(([tab]) => tab === activeTab)
    ? activeTab
    : (visibleTabs[0]?.[0] ?? 'notes')
  const printableTabSet = new Set(visibleTabs.filter(([tab]) => tab !== 'final-info').map(([tab]) => tab))

  const printTitleForTab = (tab: FsTab) => formatFsTabPrintTitle(tab, statementType)

  const tabHasPrintContent = (tab: FsTab): boolean => {
    if (!fsData) {
      return false
    }
    switch (tab) {
      case 'depreciation':
        return fixedAssetLedgers.length > 0 && fsData.depreciationSchedule.length > 0
      case 'repayment':
        return fsData.loans.length > 0
      case 'bank-account':
        return fsData.bankAccounts.length > 0
      case 'udin-details':
        return Boolean(
          udinDetails.enabled &&
            (udinDetails.udinNumber?.trim() ||
              udinDetails.caProfileId ||
              udinDetails.caPartnerName?.trim() ||
              udinDetails.caFirmName?.trim()),
        )
      default:
        return true
    }
  }

  const printableTabsInPrintOrder = PRINT_ALL_TAB_ORDER.filter(
    (tab) => printableTabSet.has(tab) && tabHasPrintContent(tab),
  )
  const selectedPrintTabsInOrder = printAllSelectedTabs
    ? printableTabsInPrintOrder.filter((tab) => printAllSelectedTabs.has(tab))
    : printableTabsInPrintOrder
  const firstPrintableTabInAll = selectedPrintTabsInOrder[0]
  const hidePrintHeader = !printAll && resolvedActiveTab === 'notes'
  const hidePrintBusinessHeader =
    hidePrintHeader || (printAll && firstPrintableTabInAll === 'notes')
  const notesPrintColSpan = 6
  const notesPrintPeriod = fy ? formatPrintReportPeriod('notes', fy) : ''
  const isNotesPrintOutput =
    (!printAll && resolvedActiveTab === 'notes') ||
    (printAll && Boolean(printAllSelectedTabs?.has('notes')))

  const tabLabelFor = (tab: FsTab) =>
    visibleTabs.find(([visibleTab]) => visibleTab === tab)?.[1] ?? printTitleForTab(tab)

  const printTabExtraClass = (tab: FsTab) => {
    if (!printAll) {
      return ''
    }
    if (
      tab === 'final-info' ||
      !printableTabSet.has(tab) ||
      !tabHasPrintContent(tab) ||
      (printAllSelectedTabs && !printAllSelectedTabs.has(tab))
    ) {
      return ' fs-print-tab-skip'
    }
    if (tab !== firstPrintableTabInAll) {
      return ' fs-print-section-break'
    }
    return ''
  }

  const printReportKind: 'balance-sheet' | 'profit-loss' | 'notes' | 'other' =
    resolvedActiveTab === 'balance-sheet'
      ? 'balance-sheet'
      : resolvedActiveTab === 'profit-loss'
        ? 'profit-loss'
        : resolvedActiveTab === 'notes'
          ? 'notes'
          : 'other'

  const tabPanelClass = (tab: FsTab) =>
    `panel fs-tab-panel${resolvedActiveTab === tab ? ' is-active' : ''}${printTabExtraClass(tab)}`

  const isFsReadOnly = isConsolidatedView || isFsFinalLocked
  const canAddDepreciationRow =
    !isFsReadOnly &&
    fixedAssetLedgers.length > 0 &&
    availableFixedAssetLedgers.length > 0 &&
    !hasBlankDepRow
  const isPreviousYearDepLinked = Boolean(openingBalanceLocks?.previousYearDepLinked)
  const isPreviousYearDepValuesLocked = Boolean(
    openingBalanceLocks?.previousYearDepLinked || openingBalanceLocks?.previousYearDepOpening,
  )
  const isDepOpeningLinked = (row: DepreciationRow) =>
    Boolean(
      (row.ledgerId && priorDepClosingsByLedgerId.has(row.ledgerId)) ||
        openingBalanceLocks?.depRowIds.has(row.id),
    )

  const canFinalizeStatement =
    !isConsolidatedView &&
    !saving &&
    Boolean(fsData?.savedAt) &&
    !isDirty &&
    !finalizationInfo.isFinalized

  const finalizeStatement = async () => {
    if (!canFinalizeStatement || !fsData) {
      return
    }

    const confirmed = await confirmProceed({
      title: 'Finalize & Lock?',
      message:
        'This will save the statement as finalized and lock it for editing. Continue?',
      confirmButtonText: 'Yes, finalize',
    })
    if (!confirmed) {
      return
    }

    const now = new Date().toISOString()
    setUnlockConfirmationCode('')
    await handleSave({
      skipConfirm: true,
      finalizationOverride: {
        isFinalized: true,
        isUnlocked: false,
        finalizedAt: now,
        unlockedAt: '',
        lockToken: createFinalizationToken(),
      },
      successMessage: 'Statement finalized and locked successfully.',
    })
  }

  const unlockFinalizedStatement = async () => {
    if (!fsData || !finalizationInfo.lockToken || saving) {
      return
    }

    const code = await promptUnlockConfirmationCode({
      itemLabel: business?.name || 'this financial statement',
    })
    if (code === null) {
      return
    }
    if (code !== '123456') {
      setError('Invalid confirmation code. Enter 123456 to unlock this finalized statement.')
      return
    }

    setUnlockConfirmationCode(code)
    await handleSave({
      skipConfirm: true,
      unlockCode: code,
      finalizationOverride: {
        isFinalized: true,
        isUnlocked: true,
        finalizedAt: finalizationInfo.finalizedAt,
        unlockedAt: new Date().toISOString(),
        lockToken: '',
      },
      successMessage: 'Statement unlocked for edits. Save your changes, then lock again when done.',
    })
  }

  const relockFinalizedStatement = async () => {
    if (!fsData || saving || finalizationInfo.lockToken) {
      return
    }

    const confirmed = await confirmProceed({
      title: 'Lock Again?',
      message: 'Lock this finalized statement to prevent further edits?',
      confirmButtonText: 'Yes, lock',
    })
    if (!confirmed) {
      return
    }

    setUnlockConfirmationCode('')
    await handleSave({
      skipConfirm: true,
      finalizationOverride: {
        isFinalized: true,
        isUnlocked: false,
        finalizedAt: finalizationInfo.finalizedAt || new Date().toISOString(),
        unlockedAt: finalizationInfo.unlockedAt,
        lockToken: createFinalizationToken(),
      },
      successMessage: 'Statement locked successfully.',
    })
  }

  const handlePrint = (mode: 'current' | 'all') => {
    if (mode === 'all') {
      setPrintAllSelection(new Set(printableTabsInPrintOrder))
      setPrintAllSelectionError('')
      setPrintAllModalOpen(true)
      return
    }
    setPrintAll(false)
    setPrintAllSelectedTabs(null)
    window.print()
  }

  const togglePrintAllSelection = (tab: FsTab) => {
    setPrintAllSelection((current) => {
      const next = new Set(current)
      if (next.has(tab)) {
        next.delete(tab)
      } else {
        next.add(tab)
      }
      return next
    })
    setPrintAllSelectionError('')
  }

  const confirmPrintAll = () => {
    if (printAllSelection.size === 0) {
      setPrintAllSelectionError('Select at least one section to print.')
      return
    }
    setPrintAllSelectedTabs(new Set(printAllSelection))
    setPrintAll(true)
    setPrintAllModalOpen(false)
    setPrintAllSelectionError('')
    requestAnimationFrame(() => window.print())
  }

  const handleExportPdf = () => {
    const escapeHtml = (value: string) =>
      String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')

    const renderSection = (
      title: string,
      headers: string[],
      sectionRows: Array<Array<string | number>>,
      rightAlignFrom = 2,
    ) => {
      const headerHtml = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')
      const bodyHtml = sectionRows
        .map(
          (row) =>
            `<tr>${row
              .map((cell, index) => {
                const isNumeric = typeof cell === 'number' && index >= rightAlignFrom
                return `<td class="${isNumeric ? 'num' : ''}">${escapeHtml(
                  isNumeric ? formatAmount(cell) : String(cell ?? ''),
                )}</td>`
              })
              .join('')}</tr>`,
        )
        .join('')

      return `
        <section class="report-section">
          <h3>${escapeHtml(title)}</h3>
          <table>
            <thead><tr>${headerHtml}</tr></thead>
            <tbody>${bodyHtml}</tbody>
          </table>
        </section>
      `
    }

    const sections: string[] = []
    sections.push(
      renderSection(
        'Balance Sheet',
        ['Particular', 'Note', previousFyLabel, currentFyLabel],
        balanceSheetLines.map((line) => [line.label, line.noteNo || '', line.previous, line.current]),
      ),
    )
    sections.push(
      renderSection(
        'Profit & Loss',
        ['Particular', 'Note', previousFyLabel, currentFyLabel],
        computed.profitAndLoss.map((line) => [line.label, line.noteNo || '', line.previous, line.current]),
      ),
    )

    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900')
    if (!printWindow) {
      window.alert('Popup blocked. Please allow popups to export PDF.')
      return
    }

    const title = `${client?.name || 'Client'} - ${business?.name || 'Business'} - ${fy?.label || 'FY'}`
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(title)}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
            .header { margin-bottom: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
            .header h1 { margin: 0 0 6px; font-size: 20px; }
            .meta { color: #475569; font-size: 12px; }
            .report-section { margin-top: 18px; }
            .report-section h3 { margin: 0 0 8px; font-size: 15px; color: #1e293b; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 8px; }
            th { background: #f8fafc; text-align: left; }
            td.num { text-align: right; font-variant-numeric: tabular-nums; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${escapeHtml(formatFinancialStatementPageTitle(statementType))}</h1>
            <div class="meta">
              Client: ${escapeHtml(client?.name || '—')} | Business: ${escapeHtml(business?.name || '—')} | FY: ${escapeHtml(fy?.label || '—')}
            </div>
          </div>
          ${sections.join('')}
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  const handleExportExcel = () => {
    const csvEscape = (value: string | number) => {
      const text = String(value ?? '')
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
    }
    const num = (value: number) => Number(value || 0).toFixed(2)
    const safeName = (value: string) =>
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

    const rows: Array<Array<string | number>> = [
      [formatFinancialStatementPageTitle(statementType)],
      [`Client: ${client?.name || '—'}`],
      [`Business: ${business?.name || '—'}`],
      [`FY: ${fy?.label || '—'}`],
      [],
    ]

    const pushSection = (title: string, headers: string[], sectionRows: Array<Array<string | number>>) => {
      rows.push([title], headers, ...sectionRows, [])
    }

    pushSection(
      'Balance Sheet',
      ['Particular', 'Note', previousFyLabel, currentFyLabel],
      balanceSheetLines.map((line) => [line.label, line.noteNo || '', num(line.previous), num(line.current)]),
    )
    pushSection(
      'Profit & Loss',
      ['Particular', 'Note', previousFyLabel, currentFyLabel],
      computed.profitAndLoss.map((line) => [line.label, line.noteNo || '', num(line.previous), num(line.current)]),
    )

    const csv = `\uFEFF${rows.map((row) => row.map(csvEscape).join(',')).join('\n')}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const fileName = `financial-statement-${safeName(client?.name || 'client')}-${safeName(business?.name || 'business')}-${safeName(fy?.label || 'fy')}.csv`
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const updateUdinDetails = (patch: Partial<UdinDetails>) => {
    if (!fsData || isFsReadOnly) {
      return
    }
    setFsData({
      ...fsData,
      udinDetails: {
        ...createEmptyUdinDetails(),
        ...normalizeUdinDetails(fsData.udinDetails),
        ...patch,
      },
    })
    setSaveMessage('')
  }

  const selectedUdinCa = udinDetails.caProfileId
    ? caProfiles.find((profile) => profile.id === udinDetails.caProfileId) || null
    : null
  const effectivePrintCaProfile = selectedUdinCa
    ? {
        ...selectedUdinCa,
        udin: udinDetails.udinNumber || selectedUdinCa.udin,
      }
    : EMPTY_CA_PROFILE
  const printUdinDate = udinDetails.caProfileId ? udinDetails.udinDate : ''

  const sourcesVsApplicationDiff = {
    current:
      (sourcesFundsTotal?.current ?? 0) - (applicationFundsTotal?.current ?? 0),
    previous:
      (sourcesFundsTotal?.previous ?? 0) - (applicationFundsTotal?.previous ?? 0),
  }
  const cashAdjustmentApplied = normalizeCashAdjustment(fsData?.cashAdjustment)
  const hasSourcesApplicationDiff =
    Math.round(sourcesVsApplicationDiff.current) !== 0 ||
    Math.round(sourcesVsApplicationDiff.previous) !== 0
  const signedAmountText = (value: number) => {
    if (value === 0) {
      return formatAmount(value)
    }
    return `${value > 0 ? '+' : '-'}${formatAmount(Math.abs(value))}`
  }
  const rateOnSalesText = (amount: number, sales: number) => {
    if (!sales) {
      return '—'
    }
    return `${((amount / sales) * 100).toFixed(1)}%`
  }

  const livePlMetrics = (() => {
    const plLine = (label: string) => computed?.profitAndLoss.find((line) => line.label === label)
    const sales = effectiveNotes?.revenueFromOperations ?? { current: 0, previous: 0 }
    const grossProfit = plLine('Gross Profit') ?? { current: 0, previous: 0 }
    const netProfit = plLine('Net Profit / (Loss)') ?? { current: 0, previous: 0 }
    const sources = {
      current: sourcesFundsTotal?.current ?? 0,
      previous: sourcesFundsTotal?.previous ?? 0,
    }
    return {
      sales,
      grossProfit,
      netProfit,
      sources,
      gpRateOnSales: {
        current: rateOnSalesText(grossProfit.current, sales.current),
        previous: rateOnSalesText(grossProfit.previous, sales.previous),
      },
      npRateOnSales: {
        current: rateOnSalesText(netProfit.current, sales.current),
        previous: rateOnSalesText(netProfit.previous, sales.previous),
      },
    }
  })()

  const finalInfoSummaryRows = (() => {
    const plLine = (label: string) => computed?.profitAndLoss.find((line) => line.label === label)
    const sales = effectiveNotes?.revenueFromOperations ?? { current: 0, previous: 0 }
    const capital = effectiveNotes?.capitalAccount ?? { current: 0, previous: 0 }
    const grossProfit = plLine('Gross Profit') ?? { current: 0, previous: 0 }
    const netProfit = plLine('Net Profit / (Loss)') ?? { current: 0, previous: 0 }
    const rows = [
      { label: 'Sales', current: sales.current, previous: sales.previous },
      { label: 'Gross Profit', current: grossProfit.current, previous: grossProfit.previous },
      { label: 'Net Profit / (Loss)', current: netProfit.current, previous: netProfit.previous },
      { label: 'Capital', current: capital.current, previous: capital.previous },
    ]
    return rows.map((row) => {
      const change = calcValueChange(row.current, row.previous)
      const pct = calcPercentChange(row.current, row.previous)
      return {
        ...row,
        change,
        pct,
      }
    })
  })()

  const adjustDifferenceInCashBalance = () => {
    if (!fsData || isFsReadOnly || !hasSourcesApplicationDiff) {
      return
    }

    const nextCashAdjustment = {
      current: cashAdjustmentApplied.current + sourcesVsApplicationDiff.current,
      previous: cashAdjustmentApplied.previous + sourcesVsApplicationDiff.previous,
    }

    setFsData({
      ...fsData,
      cashAdjustment: nextCashAdjustment,
    })
    setSaveMessage(
      'Difference applied to Cash in Hand (Note 18) on the Balance Sheet. Click Save to store in the database.',
    )
    setCashAdjustConfirmOpen(false)
  }

  return (
    <div
      className={`fs-page${isConsolidatedView ? ' fs-page--consolidated-readonly' : ''}${isFsFinalLocked ? ' fs-page--edit-locked' : ''}${printAll ? ' fs-print-all' : ''}${printComparison ? ' fs-print-with-comparison' : ''}${isNotesPrintOutput ? ' fs-print-notes-section' : ''}${!printAll && resolvedActiveTab === 'profit-loss' ? ' fs-print-report-profit-loss' : ''} fs-page--cash-adjust-banner`}
    >
      <FsPrintLayout
        documentTitle={formatFinancialStatementPageTitle(statementType)}
        client={client}
        business={business ?? null}
        isConsolidated={isConsolidatedView}
        fy={fy}
        caProfile={effectivePrintCaProfile}
        udinApplicable={!isConsolidatedView && udinDetails.enabled && Boolean(udinDetails.caProfileId)}
        udinNumber={udinDetails.udinNumber || effectivePrintCaProfile.udin}
        udinDate={printUdinDate}
        activeTabLabel={printTitleForTab(resolvedActiveTab)}
        reportKind={printReportKind}
        printAll={printAll}
        hideBusinessHeader={hidePrintBusinessHeader}
        hidePrintHeader={hidePrintHeader}
      />

      <button
        type="button"
        className="back-link fs-no-print"
        onClick={() => navigate(`/clients/${clientId}/business`)}
      >
        ← Back to Business & Financial Year
      </button>

      <header className="page-header fs-page-header fs-no-print">
        <div>
          <h1>{formatFinancialStatementPageTitle(statementType)}</h1>
          <p>
            <strong>{business.name}</strong> · Client:{' '}
            <Link to={`/clients/${clientId}/business`} className="client-link">
              {client.name}
            </Link>
          </p>
        </div>
        <div className="fs-header-actions">
          <PageRefreshButton
            onRefresh={async () => {
              setLoading(true)
              await load()
            }}
            disabled={loading || saving}
          />
          {!isConsolidatedView && (
            <label className="fs-print-option" title="Enable UDIN details tab and print">
              <input
                type="checkbox"
                checked={udinDetails.enabled}
                onChange={(event) => {
                  const enabled = event.target.checked
                  updateUdinDetails({
                    enabled,
                    caProfileId:
                      enabled && !udinDetails.caProfileId
                        ? activeCaProfiles[0]?.id || ''
                        : udinDetails.caProfileId,
                  })
                  if (!enabled && resolvedActiveTab === 'udin-details') {
                    setActiveTab('gst-reco')
                  }
                }}
                disabled={isFsReadOnly}
              />
              <span>UDIN</span>
            </label>
          )}
          <label className="fs-print-option" title="Show change amount and % columns when printing">
            <input
              type="checkbox"
              checked={printComparison}
              onChange={(event) => setPrintComparison(event.target.checked)}
            />
            <span>Change &amp; % in print</span>
          </label>
          <button type="button" className="secondary-btn" onClick={() => handlePrint('current')}>
            Print
          </button>
          <button type="button" className="secondary-btn" onClick={() => handlePrint('all')}>
            Print all
          </button>
          <select
            className="fs-export-select"
            defaultValue=""
            aria-label="Export options"
            disabled={loading || saving}
            onChange={(event) => {
              const value = event.target.value
              if (value === 'pdf') {
                handleExportPdf()
              } else if (value === 'excel') {
                handleExportExcel()
              }
              event.target.value = ''
            }}
          >
            <option value="" disabled>
              Export
            </option>
            <option value="pdf">Export PDF</option>
            <option value="excel">Export Excel</option>
          </select>
          {!isConsolidatedView && (
            <button
              type="button"
              className={`primary-btn fs-header-save-btn${isDirty && !isFsFinalLocked ? ' fs-header-save-btn--dirty' : ''}`}
              onClick={() => void handleSave()}
              disabled={saving || isFsFinalLocked || !isDirty}
              title={
                isFsFinalLocked
                  ? 'Statement is locked. Unlock from Final Info to save edits.'
                  : isDirty
                    ? 'Save all financial statement changes for this year'
                    : 'All changes are saved'
              }
            >
              {saving ? 'Saving...' : isFsFinalLocked ? 'Locked' : isDirty ? 'Save' : 'Saved'}
            </button>
          )}
        </div>
      </header>

      <div className="fs-no-print">
        <FsContextBar
          client={client}
          clientId={clientId!}
          currentFy={fy}
          businessId={businessId!}
          activeTab={resolvedActiveTab}
          readOnly={isFsReadOnly}
          onQuickEntry={openQuickEntry}
          onClientUpdated={async () => {
            const updated = await reloadClient()
            await load()
            return updated
          }}
        />
      </div>

      {isConsolidatedView && (
        <div className="fs-consolidated-banner fs-no-print">
          <strong>Consolidated report — view only</strong>
          <span>
            Combined figures from all active businesses for this year. This screen is for report
            viewing only. Edit individual business statements to change data.
          </span>
        </div>
      )}

      {error && <div className="alert fs-no-print">{error}</div>}
      {saveMessage && !isConsolidatedView && (
        <div className="save-message fs-no-print">{saveMessage}</div>
      )}

      {isConsolidatedView && (
        <p className="hint fs-no-print">
          View the consolidated <strong>{balanceSheetLabel}</strong>,{' '}
          <strong>{formatProfitLossTabLabel(statementType)}</strong>, and <strong>{notesLabel}</strong> prepared
          from all active businesses. Editing is not available in this report.
        </p>
      )}

      <div className="tabs fs-no-print">
        {visibleTabs.map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            className={resolvedActiveTab === tab ? 'tab active' : 'tab'}
            onClick={() => setActiveTab(tab)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="fs-print-body fs-print-statement-format">
      {printableTabSet.has('notes') && (
        <section
          className={tabPanelClass('notes')}
          data-fs-tab="notes"
          data-print-title={printTitleForTab('notes')}
        >
          <h2>{notesLabel}</h2>
          <p className="hint">
            Enter {currentFyLabel} figures in the sub-lines below each note. {previousFyLabel} amounts are shown for
            reference. Click a <strong>Note</strong> number to jump to the {balanceSheetLabel} (1–18) or{' '}
            {profitLossLabel} (19–24).
          </p>

          {!printAll && (
            <div className="fs-print-notes-stationery fs-print-only" aria-hidden="true">
              <FsPrintBusinessHeader
                client={client}
                business={business ?? null}
                isConsolidated={isConsolidatedView}
              />
              <div className="fs-print-notes-report-block">
                <p className="fs-print-notes-report-line">{notesLabel}</p>
                {notesPrintPeriod && (
                  <p className="fs-print-notes-period-line">{notesPrintPeriod}</p>
                )}
              </div>
            </div>
          )}

          <div className="table-wrap notes-table-wrap">
            <table className="data-table notes-table">
              <colgroup>
                <col className="notes-sno-col" />
                <col className="notes-particular-col" />
                <col className="notes-amount-col notes-prev-col" />
                <col className="notes-amount-col notes-curr-col" />
                <col className="notes-variance-col notes-change-col" />
                <col className="notes-variance-col notes-pct-col" />
              </colgroup>
              <thead>
                {printAll && (
                  <tr className="fs-print-notes-banner-row fs-print-only" aria-hidden="true">
                    <th colSpan={notesPrintColSpan} className="fs-print-notes-banner-cell">
                      <FsPrintBusinessHeader
                        client={client}
                        business={business ?? null}
                        isConsolidated={isConsolidatedView}
                      />
                      <div className="fs-print-notes-report-block">
                        <p className="fs-print-notes-report-line">{notesLabel}</p>
                        {notesPrintPeriod && (
                          <p className="fs-print-notes-period-line">{notesPrintPeriod}</p>
                        )}
                      </div>
                    </th>
                  </tr>
                )}
                {!printAll && (
                  <tr className="fs-print-notes-head-spacer fs-print-only" aria-hidden="true">
                    <th colSpan={notesPrintColSpan} className="fs-print-notes-head-spacer-cell" />
                  </tr>
                )}
                <tr className="notes-head-row">
                  <th className="notes-sno-col">Note</th>
                  <th className="notes-particular-col">Particulars</th>
                  <th className="notes-amount-col notes-prev-col">
                    <span className="notes-fy-label fs-screen-only">{previousFyLabel}</span>
                    <span className="notes-fy-label statement-fy-label--print fs-print-only">
                      {profitLossPreviousLabel}
                    </span>
                  </th>
                  <th className="notes-amount-col notes-curr-col">
                    <span className="notes-fy-label fs-screen-only">{currentFyLabel}</span>
                    <span className="notes-fy-label statement-fy-label--print fs-print-only">
                      {profitLossCurrentLabel}
                    </span>
                  </th>
                  <th className="notes-variance-col notes-change-col">
                    <span className="notes-fy-label">Change</span>
                    <span className="notes-fy-hint">vs last year</span>
                  </th>
                  <th className="notes-variance-col notes-pct-col">
                    <span className="notes-fy-label">% Change</span>
                    <span className="notes-fy-hint">vs last year</span>
                  </th>
                </tr>
              </thead>
              {noteGroups.map((group) => (
                <Fragment key={group}>
                  <tbody className="fs-print-note-group">
                    <tr className="notes-section-row">
                      <td colSpan={6}>{group}</td>
                    </tr>
                  </tbody>
                  {NOTE_FIELDS.filter((field) => field.group === group).map((field) => (
                    <tbody key={field.key} className="fs-print-note-block">
                      <tr
                        id={`note-row-${field.key}`}
                        className={`notes-main-row notes-main-row-header${field.key === 'longTermBorrowings' ? ' notes-main-row-lt' : ''}${field.key === 'otherAdministrativeExpenses' ? ' notes-main-row-admin' : ''}${field.key === 'shortTermBorrowings' ? ' notes-main-row-st' : ''}${field.key === 'financeCost' ? ' notes-main-row-finance' : ''}${field.key === 'capitalAccount' ? ' notes-main-row-capital' : ''}${field.key === 'revenueFromOperations' ? ' notes-main-row-revenue' : ''}${isManualNoteLineKey(field.key) ? ' notes-main-row-manual' : ''}${
                          highlightedNote?.noteKey === field.key && !highlightedNote.noteSubId
                            ? ' notes-row-highlight'
                            : ''
                        }`}
                      >
                        <td className="notes-sno-col">
                          {renderNoteNumberLink(field.key, field.noteNo)}
                        </td>
                        <td className="notes-particular-col notes-main-label">
                          {renderMainNoteLabel(field)}
                        </td>
                        {renderEmptyNoteHeadCells()}
                      </tr>
                      {renderNoteSubRows(field.key)}
                    </tbody>
                  ))}
                </Fragment>
              ))}
            </table>
          </div>

          <div className="auto-summary">
            <p>
              Depreciation (from schedule): Current {formatAmount(computed.totalDepreciation.current)}{' '}
              | Previous {formatAmount(computed.totalDepreciation.previous)}
            </p>
            <p>
              Long-term loans closing: Current {formatAmount(computed.longTermClosing.current)} | Previous{' '}
              {formatAmount(computed.longTermClosing.previous)}
            </p>
            <p>
              Short-term loans closing: Current {formatAmount(computed.shortTermClosing.current)} | Previous{' '}
              {formatAmount(computed.shortTermClosing.previous)}
            </p>
            {hasLoans && (
              <p>
                Loan interest (charged in P&L): Current {formatAmount(computed.loanInterest.current)}
                {' · '}
                Principal repaid (cash flow): Current {formatAmount(computedLoans.reduce((t, l) => t + l.principalRepaid, 0))}
              </p>
            )}
            {hasSourcesApplicationDiff && (
              <p className="fs-balance-diff-line">
                Source vs Application difference (adjust in Cash in Hand, Note 18): Current{' '}
                {formatAmount(sourcesVsApplicationDiff.current)} | Previous{' '}
                {formatAmount(sourcesVsApplicationDiff.previous)}
              </p>
            )}
            {(cashAdjustmentApplied.current !== 0 || cashAdjustmentApplied.previous !== 0) &&
              !hasSourcesApplicationDiff && (
                <p>
                  Cash flow adjustment applied (Note 18 — Cash in Hand): Current{' '}
                  {formatAmount(cashAdjustmentApplied.current)} | Previous{' '}
                  {formatAmount(cashAdjustmentApplied.previous)}
                </p>
              )}
          </div>
        </section>
      )}

      {printableTabSet.has('balance-sheet') && fy && (
        <section
          className={tabPanelClass('balance-sheet')}
          data-fs-tab="balance-sheet"
          data-print-title={printTitleForTab('balance-sheet')}
        >
          <p className="hint">
            Layout per balance sheet format. Click any <strong>Note</strong> number to open the matching note for
            entry.
          </p>
          <div className="fs-balance-sheet-print-body">
          <StatementTable
            title={`${balanceSheetLabel} — Sources of Funds — ${balanceSheetCurrentLabel}`}
            lines={sourcesOfFundsLines}
            wrapperClassName="statement-table-wrap--balance-sheet statement-table-wrap--balance-sheet-sources"
            currentLabel={balanceSheetCurrentLabel}
            previousLabel={balanceSheetPreviousLabel}
            showNoteColumn
            useStatementAmountFormat
            onNoteNavigate={navigateToNote}
            highlightedRowId={highlightedBsRow}
          />
          <StatementTable
            title={`${balanceSheetLabel} — Application of Funds — ${balanceSheetCurrentLabel}`}
            lines={applicationOfFundsLines}
            wrapperClassName="statement-table-wrap--balance-sheet statement-table-wrap--balance-sheet-application"
            currentLabel={balanceSheetCurrentLabel}
            previousLabel={balanceSheetPreviousLabel}
            showNoteColumn
            useStatementAmountFormat
            onNoteNavigate={navigateToNote}
            highlightedRowId={highlightedBsRow}
          />
          </div>
        </section>
      )}

      {printableTabSet.has('profit-loss') && fy && (
        <section
          className={tabPanelClass('profit-loss')}
          data-fs-tab="profit-loss"
          data-print-title={printTitleForTab('profit-loss')}
        >
          <p className="hint">
            Click any <strong>Note</strong> number to open the matching note for entry.
          </p>
          <div className="fs-profit-loss-print-body">
          <StatementTable
            title={`${profitLossLabel} — ${profitLossCurrentLabel}`}
            lines={computed.profitAndLoss}
            currentLabel={profitLossCurrentLabel}
            previousLabel={profitLossPreviousLabel}
            showNoteColumn
            useStatementAmountFormat
            onNoteNavigate={navigateToNote}
            highlightedRowId={highlightedPlRow}
          />

          <div
            className={`pl-appropriation-panel fs-print-pl-appropriation-block${
              (fsData.plAppropriationLines?.length ?? 0) === 0 ? ' pl-appropriation-panel--empty' : ''
            }`}
          >
            <h3 className="pl-appr-print-title fs-print-only">Profit &amp; Loss Appropriation</h3>
            <div className="pl-appropriation-header">
              <div>
                <h3>P&L Appropriation — detail lines</h3>
                <p className="hint">
                  Add appropriation items below. The total reduces net profit; balance profit is
                  transferred to <strong>Note 1 — Capital Account</strong>.
                </p>
              </div>
              <button
                type="button"
                className="notes-add-round-btn notes-add-round-btn-pl"
                onClick={addPlAppropriationLine}
                title="Add P&L appropriation line"
                aria-label="Add P&L appropriation line"
              >
                +
              </button>
            </div>

            {(fsData.plAppropriationLines?.length ?? 0) === 0 && (
              <p className="pl-appropriation-empty">
                Click <span className="notes-admin-empty-plus">+</span> to add dividend, reserve
                transfer, etc.
              </p>
            )}

            <div
              className={`table-wrap pl-appropriation-table-wrap${
                (fsData.plAppropriationLines?.length ?? 0) === 0 ? ' pl-appropriation-table-wrap--empty' : ''
              }`}
            >
              <table className="data-table pl-appropriation-table">
                <colgroup>
                  <col className="pl-col-particular" />
                  <col className="pl-col-prev" />
                  <col className="pl-col-curr" />
                  <col className="pl-col-change" />
                  <col className="pl-col-pct" />
                </colgroup>
                <thead>
                  <tr className="pl-appr-head-row">
                    <th className="pl-appr-particular-col">Particular</th>
                    <th className="pl-appr-amount-col pl-appr-prev-col">
                      <span className="notes-fy-label fs-screen-only">{previousFyLabel}</span>
                      <span className="notes-fy-label statement-fy-label--print fs-print-only">
                        {profitLossPreviousLabel}
                      </span>
                    </th>
                    <th className="pl-appr-amount-col pl-appr-curr-col">
                      <span className="notes-fy-label fs-screen-only">{currentFyLabel}</span>
                      <span className="notes-fy-label statement-fy-label--print fs-print-only">
                        {profitLossCurrentLabel}
                      </span>
                    </th>
                    <th className="pl-appr-variance-col pl-appr-change-col">
                      <span className="notes-fy-label">Change</span>
                      <span className="notes-fy-hint">vs last year</span>
                    </th>
                    <th className="pl-appr-variance-col pl-appr-pct-col">
                      <span className="notes-fy-label">% Change</span>
                      <span className="notes-fy-hint">vs last year</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(fsData.plAppropriationLines ?? []).map((line) => {
                    const subId = plAppropriationSubId(line.id)
                    const stored = fsData.plAppropriationAmounts?.[subId]
                    const previousRef =
                      previousYearPlAppropriationAmounts?.[subId]?.current ?? stored?.previous ?? 0
                    const currentValue = stored?.current ?? 0
                    const change = calcValueChange(currentValue, previousRef)
                    const pct = calcPercentChange(currentValue, previousRef)
                    const categoryLabel = getPlAppropriationCategoryLabel(line.categoryId)

                    return (
                      <tr key={line.id} className="pl-appr-data-row">
                        <td className="pl-appr-particular-col">
                          <span className="pl-appr-particular-print fs-print-only">{categoryLabel}</span>
                          <div className="notes-admin-field pl-appr-field fs-screen-only">
                            <span className="notes-admin-field-marker pl-appr-marker" aria-hidden="true" />
                            <div className="notes-admin-select-wrap">
                              <select
                                className="notes-admin-category-select"
                                value={line.categoryId}
                                title={categoryLabel}
                                onChange={(event) =>
                                  updatePlAppropriationCategory(line.id, event.target.value)
                                }
                              >
                                {PL_APPROPRIATION_CATEGORIES.map((category) => (
                                  <option key={category.id} value={category.id}>
                                    {category.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <button
                              type="button"
                              className="notes-admin-remove-btn"
                              onClick={() => removePlAppropriationLine(line.id)}
                              title="Remove appropriation line"
                              aria-label="Remove appropriation line"
                            >
                              ×
                            </button>
                          </div>
                        </td>
                        <td className="pl-appr-amount-col pl-appr-prev-col">
                          <div
                            className="note-prev-ref notes-admin-prev-ref"
                            title={`${previousFyLabel} — reference only`}
                          >
                            {previousRef ? formatAmount(previousRef) : '—'}
                          </div>
                        </td>
                        <td className="pl-appr-amount-col pl-appr-curr-col">
                          <input
                            type="number"
                            className="note-amount-input notes-admin-amount-input fs-screen-only"
                            value={currentValue === 0 ? '' : currentValue}
                            onChange={(event) =>
                              updatePlAppropriationAmount(line.id, event.target.value)
                            }
                            placeholder="0.00"
                          />
                          <span className="statement-amount-print fs-print-only">
                            {currentValue ? formatAmount(currentValue) : '—'}
                          </span>
                        </td>
                        <td className={`pl-appr-variance-col pl-appr-change-col ${varianceClass(change)}`}>
                          <div className="note-variance-value">{formatChangeAmount(change)}</div>
                        </td>
                        <td
                          className={`pl-appr-variance-col pl-appr-pct-col ${pct !== null ? varianceClass(change) : 'variance-flat'}`}
                        >
                          <div className="note-variance-value">{formatPercentChange(pct)}</div>
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="pl-appropriation-total-row">
                    <td className="pl-appr-particular-col">Total P&L Appropriation</td>
                    <td className="pl-appr-amount-col pl-appr-prev-col pl-appr-total-value">
                      {plAppropriationTotal.previous
                        ? formatAmount(plAppropriationTotal.previous)
                        : '—'}
                    </td>
                    <td className="pl-appr-amount-col pl-appr-curr-col pl-appr-total-value">
                      {plAppropriationTotal.current
                        ? formatAmount(plAppropriationTotal.current)
                        : '—'}
                    </td>
                    <td
                      className={`pl-appr-variance-col pl-appr-change-col pl-appr-total-value ${varianceClass(calcValueChange(plAppropriationTotal.current, plAppropriationTotal.previous))}`}
                    >
                      {formatChangeAmount(
                        calcValueChange(plAppropriationTotal.current, plAppropriationTotal.previous),
                      )}
                    </td>
                    <td
                      className={`pl-appr-variance-col pl-appr-pct-col pl-appr-total-value ${calcPercentChange(plAppropriationTotal.current, plAppropriationTotal.previous) !== null ? varianceClass(calcValueChange(plAppropriationTotal.current, plAppropriationTotal.previous)) : 'variance-flat'}`}
                    >
                      {formatPercentChange(
                        calcPercentChange(plAppropriationTotal.current, plAppropriationTotal.previous),
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          </div>
        </section>
      )}

      {printableTabSet.has('depreciation') && (
        <section
          className={tabPanelClass('depreciation')}
          data-fs-tab="depreciation"
          data-print-title={printTitleForTab('depreciation')}
        >
          <div className="panel-header-row">
            <h2>Depreciation Schedule (Income Tax Act)</h2>
          </div>
          <p className="hint">
            As per Section 32: additions on or after 3rd October get 50% depreciation (used less
            than 180 days). Asset deletion reduces the block before depreciation is calculated.
            Choose assets from <strong>Ledger → Note 9: Fixed Assets</strong>. Only assets added to
            this business profile are shown. Assets carried from the prior year appear automatically
            until closing WDV reaches zero; use <strong>+</strong> for new purchases in this year.
            Adding or removing assets saves immediately to the database.
          </p>
          {fixedAssetLedgers.length === 0 ? (
            <p className="empty-state">
              No fixed asset ledgers found. Add ledgers under <strong>Note 9: Fixed Assets</strong>{' '}
              in the Ledger page to build this schedule.
            </p>
          ) : (
            <div className="table-wrap dep-schedule-wrap fs-print-section-block">
              <table className="data-table schedule-table dep-schedule-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Rate %</th>
                    <th>Opening WDV</th>
                    <th>Add. before 3 Oct</th>
                    <th>Add. on/after 3 Oct</th>
                    <th>Deletion</th>
                    <th>Depreciation</th>
                    <th>Closing WDV</th>
                    {!isFsReadOnly && (
                      <th className="dep-actions-col">
                        <button
                          type="button"
                          className="notes-add-round-btn dep-add-row-btn"
                          onClick={addDepreciationRow}
                          disabled={!canAddDepreciationRow}
                          title="Add asset row"
                          aria-label="Add asset row"
                        >
                          +
                        </button>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {fsData.depreciationSchedule.map((row, index) => {
                    const calc = recalcDepreciationRow(row)
                    const assetOptions = getLedgersForAssetSelect(
                      fsData.depreciationSchedule,
                      index,
                      ledgers,
                    )
                    return (
                      <tr key={row.id}>
                        <td>
                          {isFsReadOnly ? (
                            <span className="dep-asset-name" title={row.assetName}>
                              {row.assetName || '—'}
                            </span>
                          ) : (
                            <select
                              className="dep-asset-select"
                              value={row.ledgerId || ''}
                              onChange={(e) => changeDepreciationAsset(index, e.target.value)}
                            >
                              <option value="">Select asset…</option>
                              {assetOptions.map((ledger) => (
                                <option key={ledger.id} value={ledger.id}>
                                  {ledger.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td>
                          <input
                            type="number"
                            value={row.rate || ''}
                            onChange={(e) => updateDepreciation(index, 'rate', e.target.value)}
                            readOnly={isFsReadOnly}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={row.openingWdv || ''}
                            onChange={(e) => updateDepreciation(index, 'openingWdv', e.target.value)}
                            readOnly={
                              isFsReadOnly || isDepOpeningLinked(row)
                            }
                            title={
                              isDepOpeningLinked(row)
                                ? 'Opening WDV carried from prior year closing (same asset)'
                                : undefined
                            }
                            className={
                              isDepOpeningLinked(row) ? 'fs-readonly-input' : undefined
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={row.additionBeforeOct3 || ''}
                            onChange={(e) =>
                              updateDepreciation(index, 'additionBeforeOct3', e.target.value)
                            }
                            readOnly={isFsReadOnly}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={row.additionOnAfterOct3 || ''}
                            onChange={(e) =>
                              updateDepreciation(index, 'additionOnAfterOct3', e.target.value)
                            }
                            readOnly={isFsReadOnly}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={row.assetDeletion || ''}
                            onChange={(e) => updateDepreciation(index, 'assetDeletion', e.target.value)}
                            readOnly={isFsReadOnly}
                          />
                        </td>
                        <td className="calc-cell">{formatAmount(calc.depreciation)}</td>
                        <td className="calc-cell">{formatAmount(calc.closingWdv)}</td>
                        {!isFsReadOnly && (
                          <td className="dep-actions-col">
                            <button
                              type="button"
                              className="danger-btn"
                              onClick={() => removeDepreciationAsset(index)}
                              title="Remove asset"
                              aria-label="Remove asset"
                            >
                              ×
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                  <tr className="schedule-total-row">
                    <td colSpan={2}>
                      <strong>Total</strong>
                    </td>
                    <td className="calc-cell">{formatAmount(depTotals.openingWdv)}</td>
                    <td className="calc-cell">{formatAmount(depTotals.additionBeforeOct3)}</td>
                    <td className="calc-cell">{formatAmount(depTotals.additionOnAfterOct3)}</td>
                    <td className="calc-cell">{formatAmount(depTotals.assetDeletion)}</td>
                    <td className="calc-cell">
                      <strong>{formatAmount(depTotals.depreciation)}</strong>
                    </td>
                    <td className="calc-cell">{formatAmount(depTotals.closingWdv)}</td>
                    {!isFsReadOnly && <td />}
                  </tr>
                  <tr className="schedule-prev-row">
                    <td colSpan={2}>
                      <strong>Previous Year ({previousFyLabel})</strong>
                      {isPreviousYearDepLinked && (
                        <span
                          className="dep-prev-linked-label"
                          title="Column totals from prior year depreciation schedule"
                        >
                          linked
                        </span>
                      )}
                    </td>
                    {isPreviousYearDepLinked ? (
                      <>
                        <td
                          className="calc-cell prev-dep-linked-cell"
                          title="From prior year schedule total"
                        >
                          {formatAmount(fsData.previousYearDepreciation.openingWdv)}
                        </td>
                        <td
                          className="calc-cell prev-dep-linked-cell"
                          title="From prior year schedule total"
                        >
                          {formatAmount(fsData.previousYearDepreciation.additionBeforeOct3)}
                        </td>
                        <td
                          className="calc-cell prev-dep-linked-cell"
                          title="From prior year schedule total"
                        >
                          {formatAmount(fsData.previousYearDepreciation.additionOnAfterOct3)}
                        </td>
                        <td
                          className="calc-cell prev-dep-linked-cell"
                          title="From prior year schedule total"
                        >
                          {formatAmount(fsData.previousYearDepreciation.assetDeletion)}
                        </td>
                        <td
                          className="calc-cell prev-dep-linked-cell"
                          title="From prior year schedule total"
                        >
                          {formatAmount(fsData.previousYearDepreciation.depreciation)}
                        </td>
                        <td
                          className="calc-cell prev-dep-linked-cell"
                          title="From prior year schedule total"
                        >
                          {formatAmount(fsData.previousYearDepreciation.closingWdv)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td>
                          <input
                            type="number"
                            className={`prev-dep-input${isPreviousYearDepValuesLocked ? ' fs-readonly-input' : ''}`}
                            value={fsData.previousYearDepreciation.openingWdv || ''}
                            onChange={(e) => updatePreviousYearDep('openingWdv', e.target.value)}
                            readOnly={isFsReadOnly || isPreviousYearDepValuesLocked}
                            title={
                              isPreviousYearDepValuesLocked
                                ? 'Values linked from prior year depreciation schedule'
                                : undefined
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className={`prev-dep-input${isPreviousYearDepValuesLocked ? ' fs-readonly-input' : ''}`}
                            value={fsData.previousYearDepreciation.additionBeforeOct3 || ''}
                            onChange={(e) => updatePreviousYearDep('additionBeforeOct3', e.target.value)}
                            readOnly={isFsReadOnly || isPreviousYearDepValuesLocked}
                            title={
                              isPreviousYearDepValuesLocked
                                ? 'Values linked from prior year depreciation schedule'
                                : undefined
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className={`prev-dep-input${isPreviousYearDepValuesLocked ? ' fs-readonly-input' : ''}`}
                            value={fsData.previousYearDepreciation.additionOnAfterOct3 || ''}
                            onChange={(e) => updatePreviousYearDep('additionOnAfterOct3', e.target.value)}
                            readOnly={isFsReadOnly || isPreviousYearDepValuesLocked}
                            title={
                              isPreviousYearDepValuesLocked
                                ? 'Values linked from prior year depreciation schedule'
                                : undefined
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className={`prev-dep-input${isPreviousYearDepValuesLocked ? ' fs-readonly-input' : ''}`}
                            value={fsData.previousYearDepreciation.assetDeletion || ''}
                            onChange={(e) => updatePreviousYearDep('assetDeletion', e.target.value)}
                            readOnly={isFsReadOnly || isPreviousYearDepValuesLocked}
                            title={
                              isPreviousYearDepValuesLocked
                                ? 'Values linked from prior year depreciation schedule'
                                : undefined
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className={`prev-dep-input${isPreviousYearDepValuesLocked ? ' fs-readonly-input' : ''}`}
                            value={fsData.previousYearDepreciation.depreciation || ''}
                            onChange={(e) => updatePreviousYearDep('depreciation', e.target.value)}
                            readOnly={isFsReadOnly || isPreviousYearDepValuesLocked}
                            title={
                              isPreviousYearDepValuesLocked
                                ? 'Values linked from prior year depreciation schedule'
                                : undefined
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className={`prev-dep-input${isPreviousYearDepValuesLocked ? ' fs-readonly-input' : ''}`}
                            value={fsData.previousYearDepreciation.closingWdv || ''}
                            onChange={(e) => updatePreviousYearDep('closingWdv', e.target.value)}
                            readOnly={isFsReadOnly || isPreviousYearDepValuesLocked}
                            title={
                              isPreviousYearDepValuesLocked
                                ? 'Values linked from prior year depreciation schedule'
                                : undefined
                            }
                          />
                        </td>
                      </>
                    )}
                    {!isFsReadOnly && <td />}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {!isConsolidatedView && depreciationHistory.length > 0 && (
            <div className="dep-history-section">
              <h3>Year-wise Asset Depreciation History</h3>
              <p className="hint">
                Recorded each time the financial statement is saved. Shows which assets were used and
                depreciation charged per financial year.
              </p>
              <div className="table-wrap dep-history-wrap">
                <table className="data-table dep-history-table">
                  <thead>
                    <tr>
                      <th>Financial Year</th>
                      <th>Asset</th>
                      <th>Rate %</th>
                      <th>Opening WDV</th>
                      <th>Depreciation</th>
                      <th>Closing WDV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {depreciationHistory.map((item) => (
                      <tr key={item.id}>
                        <td>{item.fyLabel || item.fyStartYear || '—'}</td>
                        <td>{item.assetName || '—'}</td>
                        <td className="calc-cell">{item.rate || '—'}</td>
                        <td className="calc-cell">{formatAmount(item.openingWdv)}</td>
                        <td className="calc-cell">{formatAmount(item.depreciationCharged)}</td>
                        <td className="calc-cell">{formatAmount(item.closingWdv)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {printableTabSet.has('repayment') && (
        <section
          className={tabPanelClass('repayment')}
          data-fs-tab="repayment"
          data-print-title={printTitleForTab('repayment')}
        >
          <div className="panel-header-row">
            <h2>Loan Repayment Schedule</h2>
            <button type="button" className="secondary-btn" onClick={openAddLoan}>
              Add Loan
            </button>
          </div>
          <p className="hint">
            Add multiple long-term or short-term loans. Each loan is saved immediately to the database
            after confirmation. The EMI schedule projects every installment until the loan is fully
            repaid or closed. Interest for the current financial year and closing balances flow to
            Notes (long-term / short-term borrowings).
          </p>

          {fsData.loans.length === 0 ? (
            <p className="empty-state">No loans added yet. Click &quot;Add Loan&quot; to begin.</p>
          ) : (
            <div className="loan-list">
              {computedLoans.map((loan) => {
                const record = fsData.loans.find((item) => item.id === loan.id)!
                const expanded = expandedLoanId === loan.id
                const startInstallmentDate = record.emiStartDate || record.disbursementDate || ''
                return (
                  <div key={loan.id} className="loan-card">
                    <div className="loan-card-header">
                      <div className="loan-card-title-block">
                        <strong>{loan.lender}</strong>
                        <span className={`loan-type-badge ${loan.loanType}`}>
                          {loan.loanType === 'long-term' ? 'Long-term' : 'Short-term'}
                        </span>
                        <div className="loan-start-period">
                          Start installment from:{' '}
                          <strong>{formatLoanInstallmentPeriod(startInstallmentDate)}</strong>
                        </div>
                      </div>
                      <div className="loan-card-actions">
                        <button
                          type="button"
                          className="secondary-btn loan-card-toggle-btn"
                          onClick={() => setExpandedLoanId(expanded ? null : loan.id)}
                        >
                          {expanded ? 'Hide EMI Schedule' : `View Full EMI Schedule (${loan.monthlySchedule.length})`}
                        </button>
                        <button type="button" className="secondary-btn" onClick={() => openEditLoan(record)}>
                          Edit
                        </button>
                        <button type="button" className="danger-btn" onClick={() => void deleteLoan(loan.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="loan-summary-grid">
                      <div>
                        <span>Opening</span>
                        <strong>{formatAmount(loan.openingBalance)}</strong>
                      </div>
                      <div>
                        <span>Disbursement</span>
                        <strong>{formatAmount(loan.disbursement)}</strong>
                      </div>
                      <div>
                        <span>Rate</span>
                        <strong>{loan.interestRate}%</strong>
                      </div>
                      <div>
                        <span>EMI</span>
                        <strong>{formatAmount(loan.emiAmount)}</strong>
                      </div>
                      <div>
                        <span>Interest (FY)</span>
                        <strong>{formatAmount(loan.interestForYear)}</strong>
                      </div>
                      <div>
                        <span>Principal (FY)</span>
                        <strong>{formatAmount(loan.principalRepaid)}</strong>
                      </div>
                      <div>
                        <span>Closing</span>
                        <strong>{formatAmount(loan.closingBalance)}</strong>
                        {Boolean(record.closingAdjustmentEnabled) && (
                          <div className="loan-closing-adj-note">
                            FY closing adjusted
                            {record.closingAdjustmentMode === 'target-balance'
                              ? ` to ${formatAmount(record.closingAdjustmentTargetBalance)}`
                              : ''}
                            {loan.scheduleClosingBalance != null &&
                            loan.scheduleClosingBalance !== loan.closingBalance
                              ? ` (schedule: ${formatAmount(loan.scheduleClosingBalance)})`
                              : ''}
                          </div>
                        )}
                      </div>
                    </div>
                    <LoanCashFlowTable
                      title="Cash flow by year (current and projected until loan closure)"
                      rows={summarizeCashFlowByYear(loan.monthlySchedule)}
                      compact
                    />
                    {expanded && (
                      <>
                        {loan.monthlySchedule.length > 0 ? (
                          <div className="table-wrap loan-emi-table-wrap">
                            <table className="data-table schedule-table loan-emi-table">
                              <thead>
                                <tr>
                                  <th>S.No</th>
                                  <th>Month</th>
                                  <th>Year</th>
                                  <th>EMI</th>
                                  <th>Principal</th>
                                  <th>Interest</th>
                                  <th>Balance</th>
                                </tr>
                              </thead>
                              <tbody>
                                {loan.monthlySchedule.map((row) => (
                                  <tr
                                    key={`${loan.id}-${row.serialNo}`}
                                    className={row.isPrepayment ? 'prepay-row' : undefined}
                                  >
                                    <td>{row.serialNo}</td>
                                    <td>
                                      {row.monthLabel}
                                      {row.isPreClosure || row.isPrepayment ? ' (Pre-closure)' : ''}
                                    </td>
                                    <td>{row.year}</td>
                                    <td className="calc-cell">{formatAmount(row.emi)}</td>
                                    <td className="calc-cell">{formatAmount(row.principal)}</td>
                                    <td className="calc-cell">{formatAmount(row.interest)}</td>
                                    <td className="calc-cell">{formatAmount(row.balance)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="loan-emi-empty">No EMI rows generated for this financial year.</p>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {consolidatedCashFlow.length > 0 && (
            <div className="loan-cashflow-panel">
              <h3>Cash Flow Statement — Loan Repayments (All Loans)</h3>
              <p>
                Year-wise interest and principal paid across all loans — including projected future
                years until each loan is fully repaid or closed.
              </p>
              <LoanCashFlowTable rows={consolidatedCashFlow} />
            </div>
          )}
        </section>
      )}

      {printableTabSet.has('bank-account') && (
        <section
          className={tabPanelClass('bank-account')}
          data-fs-tab="bank-account"
          data-print-title={printTitleForTab('bank-account')}
        >
          <div className="panel-header-row">
            <h2>Bank Accounts</h2>
            <button type="button" className="secondary-btn" onClick={openAddBank}>
              Add Bank
            </button>
          </div>
          <p className="hint">
            Add banks via the modal, then enter figures for {currentFyLabel}. Use{' '}
            <strong>−</strong> column for debits (outflows) and <strong>+</strong> column for credits
            (inflows). Enter closing balance in <strong>− Dr Balance</strong> or{' '}
            <strong>+ Cr Balance</strong> — use only one side per account. Current &amp; Savings
            accounts with credit balance flow to <strong>Note 17 — Cash at Bank</strong>. CC &amp; OD
            accounts with debit balance flow to <strong>Short Term Borrowings</strong>.
          </p>

          {fsData.bankAccounts.length === 0 ? (
            <p className="empty-state">No bank accounts added yet. Click &quot;Add Bank&quot; to begin.</p>
          ) : (
            <>
            <div className="bank-account-table-wrap">
              <table className="bank-account-table">
                <colgroup>
                  <col className="bank-col-name" />
                  <col className="bank-col-number" />
                  <col className="bank-col-type" />
                  <col className="bank-col-status" />
                  <col className="bank-col-amount" />
                  <col className="bank-col-amount" />
                  <col className="bank-col-amount" />
                  <col className="bank-col-amount" />
                  <col className="bank-col-amount bank-col-interest" />
                  <col className="bank-col-closing" />
                  <col className="bank-col-closing" />
                </colgroup>
                <thead>
                  <tr>
                    <th className="bank-col-name">Bank Name</th>
                    <th className="bank-col-number">A/c No.</th>
                    <th className="bank-col-type">Type</th>
                    <th className="bank-col-status">Status</th>
                    <th className="bank-col-amount" title="Opening Balance">
                      Op. Bal.
                    </th>
                    <th className="bank-col-amount bank-col-debit" title="Debit (outflow)">
                      <span className="bank-sign-head bank-sign-debit">−</span>
                      <span className="bank-sign-label">Debit</span>
                    </th>
                    <th className="bank-col-amount bank-col-credit" title="Credit (inflow)">
                      <span className="bank-sign-head bank-sign-credit">+</span>
                      <span className="bank-sign-label">Credit</span>
                    </th>
                    <th className="bank-col-amount" title="Bank Charge">
                      Charges
                    </th>
                    <th className="bank-col-amount bank-col-interest" title="Interest Expense / Income">
                      <span className="bank-th-stack">
                        <span>Interest</span>
                        <span className="bank-th-sub">Exp / Inc</span>
                      </span>
                    </th>
                    <th className="bank-col-amount bank-col-closing bank-col-debit" title="Debit (OD) closing balance">
                      <span className="bank-sign-head bank-sign-debit">−</span>
                      <span className="bank-sign-label">Dr Bal.</span>
                    </th>
                    <th className="bank-col-amount bank-col-closing bank-col-credit" title="Credit closing balance">
                      <span className="bank-sign-head bank-sign-credit">+</span>
                      <span className="bank-sign-label">Cr Bal.</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {fsData.bankAccounts.map((account) => {
                    const debitClosing = getDebitClosingAmount(account.closingBalance)
                    const creditClosing = getCreditClosingAmount(account.closingBalance)
                    const isClosed = !isBankAccountActive(account)
                    return (
                      <tr
                        key={account.id}
                        className={`bank-data-row${isClosed ? ' bank-data-row-closed' : ''}`}
                      >
                        <td className="bank-col-name">
                          <div className="bank-name-cell">
                            <span className="bank-name-text" title={account.bankName}>
                              {account.bankName}
                            </span>
                            <span className="bank-row-actions">
                              <button
                                type="button"
                                className="bank-icon-btn"
                                onClick={() => openEditBank(account)}
                                title="Edit bank details"
                                aria-label="Edit bank"
                              >
                                ✎
                              </button>
                              <button
                                type="button"
                                className="bank-icon-btn bank-icon-btn-danger"
                                onClick={() => void deleteBank(account.id)}
                                title="Delete bank"
                                aria-label="Delete bank"
                              >
                                ×
                              </button>
                            </span>
                          </div>
                        </td>
                        <td className="bank-col-number">
                          <span className="bank-acct-no" title={account.accountNumber}>
                            {account.accountNumber || '—'}
                          </span>
                        </td>
                        <td className="bank-col-type">
                          <span className="bank-type-badge" title={getBankAccountTypeLabel(account.accountType)}>
                            {getBankAccountTypeLabel(account.accountType)}
                          </span>
                        </td>
                        <td className="bank-col-status">
                          <span
                            className={`bank-status-badge bank-status-${account.status}`}
                            title={
                              isClosed
                                ? 'Closed in this financial year — will not carry forward'
                                : 'Active — carries forward to next financial year'
                            }
                          >
                            {getBankAccountStatusLabel(account.status)}
                          </span>
                        </td>
                        <td className="bank-col-amount">
                          <input
                            type="number"
                            className={`bank-amount-input${openingBalanceLocks?.bankIds.has(account.id) ? ' fs-readonly-input' : ''}`}
                            value={account.openingBalance === 0 ? '' : account.openingBalance}
                            onChange={(event) =>
                              updateBankAmount(account.id, 'openingBalance', event.target.value)
                            }
                            readOnly={openingBalanceLocks?.bankIds.has(account.id)}
                            title={
                              openingBalanceLocks?.bankIds.has(account.id)
                                ? 'Opening balance from previous year closing'
                                : undefined
                            }
                            placeholder="0"
                          />
                        </td>
                        <td className="bank-col-amount bank-col-debit">
                          <input
                            type="number"
                            className="bank-amount-input bank-amount-debit"
                            value={account.debit === 0 ? '' : account.debit}
                            onChange={(event) => updateBankAmount(account.id, 'debit', event.target.value)}
                            placeholder="0"
                            min={0}
                          />
                        </td>
                        <td className="bank-col-amount bank-col-credit">
                          <input
                            type="number"
                            className="bank-amount-input bank-amount-credit"
                            value={account.credit === 0 ? '' : account.credit}
                            onChange={(event) => updateBankAmount(account.id, 'credit', event.target.value)}
                            placeholder="0"
                            min={0}
                          />
                        </td>
                        <td className="bank-col-amount">
                          <input
                            type="number"
                            className="bank-amount-input"
                            value={account.bankCharge === 0 ? '' : account.bankCharge}
                            onChange={(event) =>
                              updateBankAmount(account.id, 'bankCharge', event.target.value)
                            }
                            placeholder="0"
                          />
                        </td>
                        <td className="bank-col-amount">
                          <input
                            type="number"
                            className="bank-amount-input"
                            value={account.interest === 0 ? '' : account.interest}
                            onChange={(event) =>
                              updateBankAmount(account.id, 'interest', event.target.value)
                            }
                            placeholder="0"
                            title="Positive = interest income, negative = interest expense"
                          />
                        </td>
                        <td className="bank-col-amount bank-col-closing bank-col-debit">
                          <input
                            type="number"
                            className="bank-amount-input bank-amount-debit"
                            value={debitClosing === 0 ? '' : debitClosing}
                            onChange={(event) =>
                              updateBankClosingSide(account.id, 'debit', event.target.value)
                            }
                            placeholder="0"
                            min={0}
                            title="Debit / OD closing balance"
                          />
                        </td>
                        <td className="bank-col-amount bank-col-closing bank-col-credit">
                          <input
                            type="number"
                            className="bank-amount-input bank-amount-credit"
                            value={creditClosing === 0 ? '' : creditClosing}
                            onChange={(event) =>
                              updateBankClosingSide(account.id, 'credit', event.target.value)
                            }
                            placeholder="0"
                            min={0}
                            title="Credit closing balance"
                          />
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="bank-total-row">
                    <td colSpan={4} className="bank-total-label">
                      Total
                    </td>
                    <td className="bank-col-amount">
                      {formatAmount(sumBankAccountColumn(fsData.bankAccounts, 'openingBalance'))}
                    </td>
                    <td className="bank-col-amount bank-col-debit bank-total-value">
                      {formatAmount(sumBankAccountColumn(fsData.bankAccounts, 'debit'))}
                    </td>
                    <td className="bank-col-amount bank-col-credit bank-total-value">
                      {formatAmount(sumBankAccountColumn(fsData.bankAccounts, 'credit'))}
                    </td>
                    <td className="bank-col-amount">
                      {formatAmount(sumBankAccountColumn(fsData.bankAccounts, 'bankCharge'))}
                    </td>
                    <td className="bank-col-amount">
                      {formatAmount(sumBankAccountColumn(fsData.bankAccounts, 'interest'))}
                    </td>
                    <td className="bank-col-amount bank-col-closing bank-col-debit bank-total-value">
                      {formatAmount(sumBankDebitClosingBalances(fsData.bankAccounts))}
                    </td>
                    <td className="bank-col-amount bank-col-closing bank-col-credit bank-total-value">
                      {formatAmount(sumBankCreditClosingBalances(fsData.bankAccounts))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="bank-closing-summary">
              <div className="bank-closing-group bank-closing-group-credit">
                <h3>
                  <span className="bank-sign-head bank-sign-credit">+</span> Credit Balance
                </h3>
                {bankClosingGroups.credit.length === 0 ? (
                  <p className="bank-closing-empty">No credit balance accounts</p>
                ) : (
                  <table className="bank-closing-group-table">
                    <tbody>
                      {bankClosingGroups.credit.map((account) => (
                        <tr key={account.id}>
                          <td className="bank-closing-bank-name">{account.bankName}</td>
                          <td className="bank-closing-acct">{account.accountNumber || '—'}</td>
                          <td className="bank-closing-amount bank-closing-amount-credit">
                            {formatAmount(getCreditClosingAmount(account.closingBalance))}
                          </td>
                        </tr>
                      ))}
                      <tr className="bank-closing-group-total">
                        <td colSpan={2}>Total Credit Balance</td>
                        <td className="bank-closing-amount bank-closing-amount-credit">
                          {formatAmount(sumBankCreditClosingBalances(fsData.bankAccounts))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>

              <div className="bank-closing-group bank-closing-group-debit">
                <h3>
                  <span className="bank-sign-head bank-sign-debit">−</span> Debit Balance
                </h3>
                {bankClosingGroups.debit.length === 0 ? (
                  <p className="bank-closing-empty">No debit balance accounts</p>
                ) : (
                  <table className="bank-closing-group-table">
                    <tbody>
                      {bankClosingGroups.debit.map((account) => (
                        <tr key={account.id}>
                          <td className="bank-closing-bank-name">{account.bankName}</td>
                          <td className="bank-closing-acct">{account.accountNumber || '—'}</td>
                          <td className="bank-closing-amount bank-closing-amount-debit">
                            {formatAmount(getDebitClosingAmount(account.closingBalance))}
                          </td>
                        </tr>
                      ))}
                      <tr className="bank-closing-group-total">
                        <td colSpan={2}>Total Debit Balance</td>
                        <td className="bank-closing-amount bank-closing-amount-debit">
                          {formatAmount(sumBankDebitClosingBalances(fsData.bankAccounts))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            </>
          )}
        </section>
      )}

      {printableTabSet.has('gst-reco') && (
        <div
          className={`fs-tab-panel${resolvedActiveTab === 'gst-reco' ? ' is-active' : ''}${printTabExtraClass('gst-reco')}`}
          data-fs-tab="gst-reco"
          data-print-title={printTitleForTab('gst-reco')}
        >
        <GstRecoTab
          gstReco={fsData.gstReco}
          fyLabel={currentFyLabel}
          salesFromBooks={fsData.notes.revenueFromOperations.current}
          onOpenRevenueNote={() => setActiveTab('notes')}
          onChange={updateGstReco}
        />
        </div>
      )}
      {printableTabSet.has('udin-details') && (
        <section
          className={tabPanelClass('udin-details')}
          data-fs-tab="udin-details"
          data-print-title={printTitleForTab('udin-details')}
        >
          <h2>UDIN Details</h2>
          <p className="hint">
            Select an active CA profile and enter UDIN details for this financial statement print.
          </p>
          <div className="fs-udin-grid">
            <label>
              Select CA
              <select
                value={udinDetails.caProfileId}
                onChange={(event) => {
                  const profile = udinCaOptions.find((item) => item.id === event.target.value)
                  updateUdinDetails({
                    caProfileId: event.target.value,
                    caPartnerName: profile?.partnerName || '',
                    caFirmName: profile?.firmName || '',
                  })
                }}
                disabled={isFsReadOnly}
              >
                <option value="">Select CA</option>
                {udinCaOptions.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.partnerName || profile.firmName || 'CA'}
                    {profile.firmName ? ` · ${profile.firmName}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              CA Name
              <input
                type="text"
                value={
                  selectedUdinCa?.partnerName ||
                  udinDetails.caPartnerName ||
                  '—'
                }
                readOnly
                className="fs-udin-readonly"
              />
            </label>
            <label>
              Firm Name
              <input
                type="text"
                value={
                  selectedUdinCa?.firmName ||
                  udinDetails.caFirmName ||
                  '—'
                }
                readOnly
                className="fs-udin-readonly"
              />
            </label>
            <label>
              UDIN Number
              <input
                type="text"
                value={udinDetails.udinNumber}
                onChange={(event) => updateUdinDetails({ udinNumber: event.target.value })}
                placeholder="Enter UDIN number"
                readOnly={isFsReadOnly}
              />
            </label>
            <label>
              UDIN Date
              <input
                type="date"
                value={udinDetails.udinDate}
                onChange={(event) => updateUdinDetails({ udinDate: event.target.value })}
                readOnly={isFsReadOnly}
              />
            </label>
          </div>
        </section>
      )}
      </div>

      {visibleTabs.some(([tab]) => tab === 'final-info') && (
        <section
          className={`${tabPanelClass('final-info')} fs-no-print`}
          data-fs-tab="final-info"
        >
          <h2>Final Info</h2>
          <div className="final-info-grid">
            <div className="final-info-card">
              <h3>Year Comparison Summary</h3>
              <div className="table-wrap final-info-table-wrap">
                <table className="data-table final-info-table">
                  <thead>
                    <tr>
                      <th>Particular</th>
                      <th>{previousFyLabel}</th>
                      <th>{currentFyLabel}</th>
                      <th>Change</th>
                      <th>% Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finalInfoSummaryRows.map((row) => (
                      <tr key={row.label}>
                        <td>{row.label}</td>
                        <td>{formatAmount(row.previous)}</td>
                        <td>{formatAmount(row.current)}</td>
                        <td>{formatChangeAmount(row.change)}</td>
                        <td>{formatPercentChange(row.pct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={`final-info-card final-info-lock-card${isFsFinalLocked ? ' final-info-card--locked' : ''}`}>
              <div className="final-info-lock-header">
                <h3>Financial Statement Lock</h3>
                <span
                  className={`final-info-lock-pill${
                    isFsFinalLocked
                      ? ' final-info-lock-pill--locked'
                      : finalizationInfo.isFinalized
                        ? ' final-info-lock-pill--unlocked'
                        : ' final-info-lock-pill--draft'
                  }`}
                >
                  {finalizationInfo.isFinalized
                    ? finalizationInfo.lockToken
                      ? 'Locked'
                      : 'Unlocked'
                    : 'Draft'}
                </span>
              </div>

              {isFsFinalLocked && (
                <div className="final-info-lock-banner" role="status">
                  <strong>Statement finalized</strong>
                  <span>This financial year is locked. Click Unlock and enter confirmation code to edit.</span>
                </div>
              )}

              <div className="final-info-lock-meta">
                <div>
                  <span className="final-info-lock-meta-label">Status</span>
                  <strong>
                    {finalizationInfo.isFinalized
                      ? finalizationInfo.lockToken
                        ? 'Finalized (Locked)'
                        : 'Finalized (Unlocked for edits)'
                      : 'Draft (Not finalized)'}
                  </strong>
                </div>
                <div>
                  <span className="final-info-lock-meta-label">Finalized On</span>
                  <span>{formatDateTime(finalizationInfo.finalizedAt)}</span>
                </div>
                <div>
                  <span className="final-info-lock-meta-label">Last Unlock</span>
                  <span>{formatDateTime(finalizationInfo.unlockedAt)}</span>
                </div>
                <div>
                  <span className="final-info-lock-meta-label">Lock Token</span>
                  <span className="final-info-lock-token">{finalizationInfo.lockToken || '—'}</span>
                </div>
              </div>

              <div className="final-info-lock-actions">
                {!finalizationInfo.isFinalized && (
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => void finalizeStatement()}
                    disabled={!canFinalizeStatement}
                    title={
                      isDirty
                        ? 'Save the statement first, then finalize'
                        : canFinalizeStatement
                          ? 'Finalize and lock this financial year'
                          : 'Save the statement at least once before finalizing'
                    }
                  >
                    Finalize &amp; Lock
                  </button>
                )}

                {(isFsFinalLocked ||
                  (finalizationInfo.isFinalized && Boolean(finalizationInfo.lockToken))) && (
                  <button
                    type="button"
                    className="secondary-btn final-info-unlock-btn"
                    onClick={() => void unlockFinalizedStatement()}
                    disabled={saving}
                    title="Enter confirmation code to unlock for edits"
                  >
                    Unlock
                  </button>
                )}

                {finalizationInfo.isFinalized && !finalizationInfo.lockToken && (
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => void relockFinalizedStatement()}
                    disabled={saving || isDirty}
                    title={
                      isDirty
                        ? 'Save your edits first, then lock again'
                        : 'Lock this finalized statement again'
                    }
                  >
                    Lock Again
                  </button>
                )}
              </div>

              <p className="final-info-lock-note">
                Save first, then Finalize &amp; Lock. Unlock requires confirmation code{' '}
                <strong>123456</strong>. Lock status is stored in the database immediately.
              </p>
              {saveMessage && <p className="final-info-lock-note">{saveMessage}</p>}
            </div>
          </div>
        </section>
      )}

      {loanModalOpen && clientId && fyId && businessId && fsData && fy && !isConsolidatedView && (
        <div className="fs-no-print">
        <LoanModal
          title={editingLoan ? 'Edit Loan' : 'Add Loan'}
          clientId={clientId}
          fyId={fyId}
          businessId={businessId}
          fyLabel={formatFyDisplay(fy)}
          fyStartYear={fy.startYear}
          fyEndYear={fy.endYear}
          existingLoans={fsData.loans}
          loan={editingLoan}
          openingBalanceReadOnly={
            editingLoan ? Boolean(openingBalanceLocks?.loanIds.has(editingLoan.id)) : false
          }
          onClose={() => {
            setLoanModalOpen(false)
            setEditingLoan(null)
          }}
          onSaved={handleLoansSaved}
        />
        </div>
      )}

      {bankModalOpen && clientId && fyId && businessId && fsData && !isConsolidatedView && (
        <div className="fs-no-print">
        <BankAccountModal
          title={editingBank ? 'Edit Bank Account' : 'Add Bank Account'}
          clientId={clientId}
          fyId={fyId}
          businessId={businessId}
          existingAccounts={fsData.bankAccounts}
          account={editingBank}
          onClose={() => {
            setBankModalOpen(false)
            setEditingBank(null)
          }}
          onSaved={handleBankAccountsSaved}
        />
        </div>
      )}

      {printAllModalOpen && (
        <div className="modal-overlay fs-no-print" onClick={() => setPrintAllModalOpen(false)}>
          <div
            className="fs-edit-unlock-modal fs-print-all-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fs-print-all-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="fs-print-all-title">Print sections</h2>
            <p className="fs-edit-unlock-hint">
              Choose which financial statement sections to include in this print.
            </p>
            <div className="fs-print-all-toolbar">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  setPrintAllSelection(new Set(printableTabsInPrintOrder))
                  setPrintAllSelectionError('')
                }}
              >
                Select all
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  setPrintAllSelection(new Set())
                  setPrintAllSelectionError('')
                }}
              >
                Clear all
              </button>
            </div>
            <div className="fs-print-all-options">
              {printableTabsInPrintOrder.map((tab) => (
                <label key={tab} className="fs-print-all-option">
                  <input
                    type="checkbox"
                    checked={printAllSelection.has(tab)}
                    onChange={() => togglePrintAllSelection(tab)}
                  />
                  <span>{tabLabelFor(tab)}</span>
                </label>
              ))}
            </div>
            {printAllSelectionError && (
              <p className="fs-edit-unlock-error" role="alert">
                {printAllSelectionError}
              </p>
            )}
            <div className="fs-edit-unlock-actions">
              <button type="button" className="secondary-btn" onClick={() => setPrintAllModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="primary-btn" onClick={confirmPrintAll}>
                Print selected
              </button>
            </div>
          </div>
        </div>
      )}

      {cashAdjustConfirmOpen && (
        <div className="modal-overlay fs-no-print" onClick={() => setCashAdjustConfirmOpen(false)}>
          <div
            className="fs-edit-unlock-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fs-cash-adjust-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="fs-cash-adjust-title">Confirm Cash Adjustment</h2>
            <p className="fs-edit-unlock-hint">
              This will add the Sources vs Application difference to{' '}
              <strong>Cash in Hand (Note 18)</strong> on the Balance Sheet.
              <br />
              Current difference: {formatAmount(sourcesVsApplicationDiff.current)} | Previous:{' '}
              {formatAmount(sourcesVsApplicationDiff.previous)}
              {(cashAdjustmentApplied.current !== 0 || cashAdjustmentApplied.previous !== 0) && (
                <>
                  <br />
                  Existing adjustment — Current: {formatAmount(cashAdjustmentApplied.current)} |
                  Previous: {formatAmount(cashAdjustmentApplied.previous)}
                </>
              )}
            </p>
            <div className="fs-edit-unlock-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setCashAdjustConfirmOpen(false)}
              >
                Cancel
              </button>
              <button type="button" className="primary-btn" onClick={adjustDifferenceInCashBalance}>
                Confirm Adjustment
              </button>
            </div>
          </div>
        </div>
      )}

      {quickEntryOpen && (() => {
        const selectedField =
          NOTE_FIELDS.find((field) => field.key === quickEntryNoteKey) ?? NOTE_FIELDS[0]
        const selectedTotal = selectedField
          ? (effectiveNotes?.[selectedField.key] ?? { current: 0, previous: 0 })
          : { current: 0, previous: 0 }
        const noteSearch = quickEntryNoteSearch.trim().toLowerCase()
        const filteredNoteFields = noteSearch
          ? NOTE_FIELDS.filter((field) => {
              const haystack = `note ${field.noteNo} ${field.label}`.toLowerCase()
              return haystack.includes(noteSearch)
            })
          : NOTE_FIELDS

        return (
          <div className="modal-overlay fs-no-print fs-quick-entry-overlay">
            <div className="fs-quick-entry-modal" onClick={(event) => event.stopPropagation()}>
              <header className="fs-quick-entry-header">
                <div>
                  <h3>Quick Entry</h3>
                  <p>Select a note, enter amounts, then Save. Switch notes anytime — Close when finished.</p>
                </div>
                {selectedField && (
                  <div className="fs-quick-entry-totals">
                    <div className="fs-quick-entry-total-chip">
                      <span>Previous</span>
                      <strong>{formatAmount(selectedTotal.previous)}</strong>
                    </div>
                    <div className="fs-quick-entry-total-chip fs-quick-entry-total-chip--current">
                      <span>Current</span>
                      <strong>{formatAmount(selectedTotal.current)}</strong>
                    </div>
                  </div>
                )}
              </header>

              <div className="fs-quick-entry-toolbar">
                <label className="fs-quick-entry-select">
                  <span>Note</span>
                  <div className="fs-quick-entry-combobox">
                    <input
                      type="text"
                      className="fs-quick-entry-combobox-input"
                      role="combobox"
                      aria-expanded={quickEntryNoteMenuOpen}
                      aria-controls="fs-quick-entry-note-list"
                      aria-autocomplete="list"
                      placeholder="Search note number or name…"
                      value={
                        quickEntryNoteMenuOpen
                          ? quickEntryNoteSearch
                          : selectedField
                            ? `Note ${selectedField.noteNo}: ${selectedField.label}`
                            : ''
                      }
                      onFocus={() => {
                        setQuickEntryNoteSearch('')
                        setQuickEntryNoteMenuOpen(true)
                      }}
                      onChange={(event) => {
                        setQuickEntryNoteSearch(event.target.value)
                        setQuickEntryNoteMenuOpen(true)
                      }}
                      onBlur={() => {
                        window.setTimeout(() => setQuickEntryNoteMenuOpen(false), 150)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          setQuickEntryNoteMenuOpen(false)
                          ;(event.target as HTMLInputElement).blur()
                        }
                      }}
                    />
                    {quickEntryNoteMenuOpen && (
                      <ul
                        id="fs-quick-entry-note-list"
                        className="fs-quick-entry-combobox-list"
                        role="listbox"
                      >
                        {filteredNoteFields.length === 0 ? (
                          <li className="fs-quick-entry-combobox-empty">No matching notes</li>
                        ) : (
                          filteredNoteFields.map((field) => (
                            <li key={field.key} role="option">
                              <button
                                type="button"
                                className={`fs-quick-entry-combobox-option${
                                  field.key === quickEntryNoteKey ? ' is-selected' : ''
                                }`}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                  setQuickEntryNoteKey(field.key)
                                  setQuickEntryNoteSearch('')
                                  setQuickEntryNoteMenuOpen(false)
                                }}
                              >
                                Note {field.noteNo}: {field.label}
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    )}
                  </div>
                </label>
              </div>

              <div className="fs-quick-entry-body">
                <table className="fs-quick-entry-table">
                  <thead>
                    <tr>
                      <th className="fs-qe-col-no">#</th>
                      <th className="fs-qe-col-particular">Particulars</th>
                      <th className="fs-qe-col-amount">{previousFyLabel}</th>
                      <th className="fs-qe-col-amount">{currentFyLabel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedField && (
                      <>
                        <tr className="notes-main-row notes-main-row-header">
                          <td className="notes-sno-col fs-qe-col-no">{selectedField.noteNo}</td>
                          <td className="notes-particular-col notes-main-label fs-qe-col-particular">
                            {renderMainNoteLabel(selectedField)}
                          </td>
                          {renderEmptyNoteHeadCells(true)}
                        </tr>
                        {renderNoteSubRows(selectedField.key, { hideVariance: true })}
                      </>
                    )}
                  </tbody>
                </table>
              </div>

              <footer className="fs-quick-entry-actions">
                <button type="button" className="secondary-btn" onClick={() => setQuickEntryOpen(false)}>
                  Close
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  disabled={saving}
                  onClick={() => void saveQuickEntry()}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </footer>
            </div>
          </div>
        )
      })()}

      {createPortal(
        <div className="fs-live-summary-banner fs-no-print" role="status" aria-live="polite">
          <strong className="fs-live-summary-title">Live</strong>
          <div className="fs-live-summary-metrics">
            <span className="fs-live-summary-chip" title="Gross Profit">
              <span className="fs-live-summary-label">GP</span>
              <strong>{formatAmount(livePlMetrics.grossProfit.current)}</strong>
            </span>
            <span className="fs-live-summary-chip" title="GP rate on sales">
              <span className="fs-live-summary-label">GP%</span>
              <strong>{livePlMetrics.gpRateOnSales.current}</strong>
            </span>
            <span className="fs-live-summary-chip" title="Net Profit / (Loss)">
              <span className="fs-live-summary-label">NP</span>
              <strong>{formatAmount(livePlMetrics.netProfit.current)}</strong>
            </span>
            <span className="fs-live-summary-chip" title="NP rate on sales">
              <span className="fs-live-summary-label">NP%</span>
              <strong>{livePlMetrics.npRateOnSales.current}</strong>
            </span>
            <span className="fs-live-summary-chip" title="Sources of Funds">
              <span className="fs-live-summary-label">Sources</span>
              <strong>{formatAmount(livePlMetrics.sources.current)}</strong>
            </span>
            <span
              className={`fs-live-summary-chip${
                sourcesVsApplicationDiff.current !== 0 ? ' fs-live-summary-chip--warn' : ''
              }`}
              title="Sources vs Application difference (current)"
            >
              <span className="fs-live-summary-label">Diff Cur</span>
              <strong>{signedAmountText(sourcesVsApplicationDiff.current)}</strong>
            </span>
            <span
              className={`fs-live-summary-chip${
                sourcesVsApplicationDiff.previous !== 0 ? ' fs-live-summary-chip--warn' : ''
              }`}
              title="Sources vs Application difference (previous)"
            >
              <span className="fs-live-summary-label">Diff Prev</span>
              <strong>{signedAmountText(sourcesVsApplicationDiff.previous)}</strong>
            </span>
            {(cashAdjustmentApplied.current !== 0 || cashAdjustmentApplied.previous !== 0) && (
              <span
                className={`fs-live-summary-chip${
                  cashAdjustmentApplied.current !== 0 || cashAdjustmentApplied.previous !== 0
                    ? ' fs-live-summary-chip--warn'
                    : ''
                }`}
                title="Cash adjustment applied"
              >
                <span className="fs-live-summary-label">Adj</span>
                <strong>
                  {signedAmountText(cashAdjustmentApplied.current)} /{' '}
                  {signedAmountText(cashAdjustmentApplied.previous)}
                </strong>
              </span>
            )}
          </div>
          {!isFsReadOnly && hasSourcesApplicationDiff && (
            <button
              type="button"
              className="fs-balance-diff-banner-btn"
              onClick={() => setCashAdjustConfirmOpen(true)}
            >
              Adjust
            </button>
          )}
        </div>,
        document.body,
      )}

    </div>
  )
}

export default FinancialStatement
