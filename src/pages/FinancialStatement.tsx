import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import FsContextBar from '../components/FsContextBar'
import FsPrintLayout from '../components/FsPrintLayout'
import '../components/FsPrintLayout.css'
import PrintFooter from '../print/PrintFooter'
import GstRecoTab from '../components/GstRecoTab'
import { formatUdinDatePrint, normalizeSealDataUrl } from '../components/FsPrintCaSignOff'
import FsUdinSignBanner from '../components/FsUdinSignBanner'
import { AdminExpenseLedgerPicker } from '../components/AdminExpenseLedgerPicker'
import BankAccountModal from '../components/BankAccountModal'
import LoanModal from '../components/LoanModal'
import LoanCashFlowTable from '../components/LoanCashFlowTable'
import { fetchCaSettings, normalizeCaSettings } from '../api/caSettings'
import type { CaProfile } from '../types/caProfile'
import { EMPTY_CA_PROFILE, isActiveCaProfile } from '../types/caProfile'
import { fetchClient } from '../api/client'
import { updateGlobalFinancialYearStatementType } from '../api/fySettings'
import {
  fetchDepreciationHistory,
  fetchFsData,
  fetchGstReco,
  saveBankAccounts,
  saveDepreciationSchedule,
  saveFsData,
  saveLoans,
  saveUdinDetails,
} from '../api/fs'
import { fetchLedgers } from '../api/ledger'
import type { Client } from '../types'
import type {
  AdministrativeExpenseLine,
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
import {
  buildFsDerivedState,
  fsDataFingerprint,
  mergeComparativeDerivedState,
  type FsDerivedState,
} from '../utils/fsEngine'
import { resolveYearDisplaySnapshot, type YearDisplaySnapshotChain } from '../utils/yearDisplaySnapshot'
import { buildExportBusinessHeaderHtml, buildExportBusinessHeaderLines } from '../utils/printExportHeader'
import {
  buildConsolidatedStatementDisplayLines,
  buildBalanceSheetLinesForFsRecord,
  buildProfitLossLinesForFsRecord,
  buildFsDerivedForFsRecord,
  consolidatedBusinessColumnsFromBusinesses,
  getConsolidatedNoteSubBusinessValues,
} from '../utils/consolidatedStatement'
import { buildBalanceSheetLines, balanceSheetRowId, isBalanceSheetNoteNo, NOTE_SUB_BALANCE_SHEET_REFS } from '../utils/balanceSheetBuilder'
import { isProfitLossNoteNo, profitLossRowId, NOTE_SUB_PL_REFS } from '../utils/plBuilder'
import {
  createEmptyFsData,
  NOTE_FIELDS,
  NOTES_TABLE_SECTIONS,
  getNoteFieldsForTableSection,
  getNoteSectionTabForNoteKey,
  isNoteSectionTab,
  NOTE_SECTION_TAB_IDS,
  type NoteSectionTabId,
  createEmptyUdinDetails,
  buildComparativeCashAdjustment,
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
import {
  adminExpenseSubId,
  isLegacyAdminCategoryId,
} from '../utils/adminExpenseCategories'
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
  cogsExtraLineSubId,
  getCogsExtraLineTypes,
  isCogsExtraDynamicLine,
  migrateCogsExtraSubAmounts,
  normalizeCogsExtraLineSign,
  normalizeCogsExtraLines,
  type CogsExtraLineSign,
} from '../utils/cogsExtraLineConfig'
import {
  buildSubResolveContext,
  enrichPreviousYearSubAmountsWithClosings,
  isCapitalAccountDynamicLine,
  migrateAdminExpenseSubAmounts,
  migrateManualNoteLineSubAmounts,
  migrateOtherShortTermSubAmounts,
  deduplicateAdministrativeExpenseLines,
  reconcileAdministrativeExpenseLines,
  normalizeManualNoteLines,
  normalizeNoteSubAmounts,
  normalizeOtherShortTermBorrowingLines,
  buildCompleteNoteSubAmounts,
  type ResolvedSubRow,
} from '../utils/noteSubFields'
import { buildEffectiveNotes, getNoteCalcMap } from '../utils/noteCalculator'
import { normalizeGstReco } from '../utils/gstDefaults'
import { getGstTaxableSalesTotal } from '../utils/gstCalculator'
import { applyGstSalesFromRecoToRevenue, withGstSalesOnNoteSubAmounts } from '../utils/gstRevenueLink'
import {
  applyClosingStockLink,
  applyOpeningStockLink,
  isClosingStockLinkedInventoriesSub,
} from '../utils/closingStockLink'
import {
  getBankAccountStatusLabel,
  getBankAccountTypeLabel,
  getCreditClosingAmount,
  getDebitClosingAmount,
  deduplicateBankAccountsByAccountNumber,
  filterBankAccountsForFy,
  formatBankAccountStartedFyLabel,
  canDeleteBankAccount,
  shouldOfferCloseBankAccount,
  isBankAccountActive,
  normalizeBankAccounts,
  parseBankAccountIdFromSubId,
  partitionBankAccountsByClosing,
  sumBankAccountColumn,
  sumBankCreditClosingBalances,
  sumBankDebitClosingBalances,
  unionBankAccountsForComparative,
} from '../utils/bankAccount'
import {
  defaultLedgerIdForGroup,
  getUnusedAdminExpenseLedgers,
  getLedgersForGroup,
  getFixedAssetLedgers,
  normalizeLedgerSign,
  normalizeLedgers,
  resolveAdminExpenseLabel,
  resolveAdminExpenseCategoryId,
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
  formatBalanceSheetColumnLabel,
  formatBalanceSheetPrintColumnLabel,
  formatProfitLossColumnLabel,
  formatProfitLossColumnLabelCompact,
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
  buildOpeningBalanceLocksForLoadedYear,
  buildPriorYearClosingSnapshot,
  buildPriorDepClosingsByLedgerId,
  hasPriorYearDepreciationData,
  isAdminExpenseLineCategoryLocked,
  canRemoveAdministrativeExpenseLine,
  isManualNoteLineCategoryLocked,
  type OpeningBalanceLocks,
} from '../utils/openingBalanceCarryForward'
import {
  currentYearReadOnlyHint,
  isNoteSubCurrentYearReadOnly,
} from '../utils/noteSubEditability'
import {
  CONSOLIDATED_BUSINESS_ID,
  CONSOLIDATED_BUSINESS_LABEL,
  isConsolidatedApplicableForFy,
  isConsolidatedBusinessId,
  loadConsolidatedFsBundle,
  type ConsolidatedFsBundle,
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
import { useFinancialStatementPrint } from '../hooks/useFinancialStatementPrint'
import '../styles/shared.css'
import './FinancialStatement.css'

type FsTab =
  | 'notes'
  | NoteSectionTabId
  | 'balance-sheet'
  | 'profit-loss'
  | 'depreciation'
  | 'repayment'
  | 'bank-account'
  | 'gst-reco'
  | 'final-info'
  | 'udin-details'

const CONSOLIDATED_REPORT_TABS: FsTab[] = [
  'balance-sheet',
  'profit-loss',
  'notes',
  ...NOTE_SECTION_TAB_IDS,
]

const FS_TAB_IDS = new Set<FsTab>([
  'notes',
  ...NOTE_SECTION_TAB_IDS,
  'balance-sheet',
  'profit-loss',
  'depreciation',
  'repayment',
  'bank-account',
  'gst-reco',
  'final-info',
  'udin-details',
])

function parseFsTabParam(value: string | null): FsTab | null {
  if (!value || !FS_TAB_IDS.has(value as FsTab)) {
    return null
  }
  return value as FsTab
}

function normalizeUdinDetails(value?: Partial<UdinDetails> | null): UdinDetails {
  return {
    enabled: Boolean(value?.enabled),
    caProfileId: value?.caProfileId?.trim() || '',
    udinNumber: value?.udinNumber?.trim() || '',
    udinDate: value?.udinDate?.trim() || '',
    caPartnerName: value?.caPartnerName?.trim() || '',
    caFirmName: value?.caFirmName?.trim() || '',
    sealAttachmentName: value?.sealAttachmentName?.trim() || '',
    sealAttachmentDataUrl: value?.sealAttachmentDataUrl?.trim() || '',
    sealOffsetX: clampSealOffsetPercent(value?.sealOffsetX, 82),
    sealOffsetY: clampSealOffsetPercent(value?.sealOffsetY, 50),
  }
}

function clampSealOffsetPercent(value: unknown, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(100, Math.max(0, parsed))
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
  printBanner,
  printHeadSpacer,
  swapAmountColumns = false,
  consolidatedBusinessColumns,
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
  printBanner?: ReactNode
  printHeadSpacer?: ReactNode
  swapAmountColumns?: boolean
  consolidatedBusinessColumns?: { id: string; name: string }[]
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

  const consolidatedMode = Boolean(consolidatedBusinessColumns && consolidatedBusinessColumns.length > 0)
  const businessColumnCount = consolidatedBusinessColumns?.length ?? 0
  const colSpan = consolidatedMode
    ? (showNoteColumn ? 2 : 1) + businessColumnCount + 1
    : showNoteColumn
      ? 6
      : 5
  const isBalanceSheetTable = wrapperClassName?.includes('balance-sheet') ?? false
  const useStatementColGroup = isBalanceSheetTable || consolidatedMode

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

  const amountHeaderCells = swapAmountColumns ? (
    <>
      <th className="statement-amount-col statement-prev-col">
        {renderColumnHeaderLabel(previousLabel, printPreviousLabel)}
      </th>
      <th className="statement-amount-col statement-curr-col">
        {renderColumnHeaderLabel(currentLabel, printCurrentLabel)}
      </th>
    </>
  ) : (
    <>
      <th className="statement-amount-col statement-curr-col">
        {renderColumnHeaderLabel(currentLabel, printCurrentLabel)}
      </th>
      <th className="statement-amount-col statement-prev-col">
        {renderColumnHeaderLabel(previousLabel, printPreviousLabel)}
      </th>
    </>
  )

  const renderAmountCells = (row: StatementLine, blankAmounts: boolean) =>
    swapAmountColumns ? (
      <>
        <td className="statement-amount-col statement-prev-col">
          {renderAmount(row.previous, 'prev', blankAmounts)}
        </td>
        <td className="statement-amount-col statement-curr-col">
          {renderAmount(row.current, 'curr', blankAmounts)}
        </td>
      </>
    ) : (
      <>
        <td className="statement-amount-col statement-curr-col">
          {renderAmount(row.current, 'curr', blankAmounts)}
        </td>
        <td className="statement-amount-col statement-prev-col">
          {renderAmount(row.previous, 'prev', blankAmounts)}
        </td>
      </>
    )

  const renderConsolidatedAmountCells = (row: StatementLine, blankAmounts: boolean) => {
    const businessValues = row.businessCurrentValues ?? {}
    const totalValue = blankAmounts
      ? row.current
      : consolidatedBusinessColumns!.reduce(
          (sum, business) => sum + (businessValues[business.id] ?? 0),
          0,
        )

    return (
      <>
        {consolidatedBusinessColumns!.map((business) => (
          <td
            key={business.id}
            className="statement-amount-col statement-business-col"
            data-business-id={business.id}
          >
            {renderAmount(businessValues[business.id] ?? 0, 'curr', blankAmounts)}
          </td>
        ))}
        <td className="statement-amount-col statement-total-col">
          {renderAmount(totalValue, 'curr', blankAmounts)}
        </td>
      </>
    )
  }

  const consolidatedHeaderCells = consolidatedBusinessColumns?.map((business) => (
    <th
      key={business.id}
      className="statement-amount-col statement-business-col"
      data-business-id={business.id}
      title={business.name}
    >
      <span className="statement-fy-label statement-fy-label--unified">{business.name}</span>
    </th>
  ))

  return (
    <div
      className={`statement-table-wrap${wrapperClassName ? ` ${wrapperClassName}` : ''}${
        consolidatedMode ? ' statement-table-wrap--consolidated' : ''
      }`}
    >
      <h3>{title}</h3>
      <div className="table-wrap statement-table-container">
        <table
          className={`statement-table${showNoteColumn ? ' has-note-col' : ''}${
            consolidatedMode ? ' statement-table--consolidated' : ''
          }`}
          style={
            consolidatedMode
              ? ({ '--consolidated-business-count': businessColumnCount } as CSSProperties)
              : undefined
          }
        >
          {useStatementColGroup && (
            <colgroup>
              <col className="bs-col-particular" />
              {showNoteColumn && <col className="bs-col-note" />}
              {consolidatedMode ? (
                <>
                  {consolidatedBusinessColumns!.map((business) => (
                    <col key={business.id} className="bs-col-business" data-business-id={business.id} />
                  ))}
                  <col className="bs-col-total" />
                </>
              ) : swapAmountColumns ? (
                <>
                  <col className="bs-col-prev" />
                  <col className="bs-col-curr" />
                </>
              ) : (
                <>
                  <col className="bs-col-curr" />
                  <col className="bs-col-prev" />
                </>
              )}
              {!consolidatedMode && (
                <>
                  <col className="bs-col-change" />
                  <col className="bs-col-pct" />
                </>
              )}
            </colgroup>
          )}
          <thead>
            {printHeadSpacer}
            {printBanner}
            <tr className="statement-head-row">
              <th className="statement-particular-col">Particulars</th>
              {showNoteColumn && <th className="statement-note-col">Note</th>}
              {consolidatedMode ? (
                <>
                  {consolidatedHeaderCells}
                  <th className="statement-amount-col statement-total-col">
                    <span className="statement-fy-label">Total</span>
                  </th>
                </>
              ) : (
                <>
                  {amountHeaderCells}
                  <th className="statement-variance-col statement-change-col">
                    <span className="statement-fy-label">Change</span>
                  </th>
                  <th className="statement-variance-col statement-pct-col">
                    <span className="statement-fy-label">% Change</span>
                  </th>
                </>
              )}
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
                  {consolidatedMode
                    ? renderConsolidatedAmountCells(row, blankAmounts)
                    : renderAmountCells(row, blankAmounts)}
                  {!consolidatedMode && renderVariance(change, pct, blankAmounts)}
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
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = parseFsTabParam(searchParams.get('tab'))
  const isConsolidatedView = isConsolidatedBusinessId(businessId)

  const [client, setClient] = useState<Client | null>(null)
  const [fsData, setFsData] = useState<FinancialStatementData | null>(null)
  const [consolidatedFsBundle, setConsolidatedFsBundle] = useState<ConsolidatedFsBundle | null>(null)
  const [ledgers, setLedgers] = useState<LedgerRecord[]>([])
  const [depreciationHistory, setDepreciationHistory] = useState<AssetDepreciationHistoryRow[]>([])
  const [priorDepClosingsByLedgerId, setPriorDepClosingsByLedgerId] = useState<Map<string, number>>(
    new Map(),
  )
  const [activeTab, setActiveTab] = useState<FsTab>(tabFromUrl ?? 'notes')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState('')
  const [gstRecoDbRefreshKey, setGstRecoDbRefreshKey] = useState(0)
  const [lastSavedGstReco, setLastSavedGstReco] = useState<GstRecoStatement | null>(null)
  const fsDataRef = useRef<FinancialStatementData | null>(null)
  const [previousYearNotes, setPreviousYearNotes] = useState<FsNotes | null>(null)
  const [previousYearSubAmounts, setPreviousYearSubAmounts] = useState<NoteSubAmounts | null>(null)
  const [previousYearPlAppropriationAmounts, setPreviousYearPlAppropriationAmounts] = useState<Record<
    string,
    NoteSubCell
  > | null>(null)
  const [previousYearLoans, setPreviousYearLoans] = useState<LoanRecord[] | null>(null)
  const [previousYearBankAccounts, setPreviousYearBankAccounts] = useState<BankAccountRecord[]>([])
  const [previousYearCashAdjustment, setPreviousYearCashAdjustment] = useState<CashAdjustment | null>(null)
  const [previousYearDerived, setPreviousYearDerived] = useState<FsDerivedState | null>(null)
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
  const [highlightedBankId, setHighlightedBankId] = useState<string | null>(null)
  const [openingBalanceLocks, setOpeningBalanceLocks] = useState<OpeningBalanceLocks | null>(null)
  const [caProfiles, setCaProfiles] = useState<CaProfile[]>([])
  const [cashAdjustConfirmOpen, setCashAdjustConfirmOpen] = useState(false)
  const [unlockConfirmationCode, setUnlockConfirmationCode] = useState('')
  const [quickEntryOpen, setQuickEntryOpen] = useState(false)
  const [quickEntryNoteKey, setQuickEntryNoteKey] = useState<keyof FsNotes>('capitalAccount')
  const [quickEntryNoteSearch, setQuickEntryNoteSearch] = useState('')
  const [quickEntryNoteMenuOpen, setQuickEntryNoteMenuOpen] = useState(false)
  const pendingScrollTargetRef = useRef<string | null>(null)

  useEffect(() => {
    fsDataRef.current = fsData
  }, [fsData])

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
    const nextTab = tabFromUrl ?? 'notes'
    setActiveTab((current) => (current === nextTab ? current : nextTab))
    if (!tabFromUrl) {
      setSearchParams({ tab: 'notes' }, { replace: true })
    }
  }, [tabFromUrl, clientId, fyId, businessId, setSearchParams])

  useEffect(() => {
    if (!highlightedNote) {
      return
    }

    const noteTab = getNoteSectionTabForNoteKey(highlightedNote.noteKey)
    if (activeTab !== noteTab) {
      return
    }

    const targetId =
      pendingScrollTargetRef.current ??
      (highlightedNote.noteSubId
        ? `note-sub-${highlightedNote.noteKey}-${highlightedNote.noteSubId}`
        : `note-row-${highlightedNote.noteKey}`)

    let cancelled = false
    let frame = 0
    const scrollToTarget = () => {
      if (cancelled) {
        return
      }
      const element = document.getElementById(targetId)
      if (element) {
        pendingScrollTargetRef.current = null
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
      if (frame++ < 50) {
        requestAnimationFrame(scrollToTarget)
      }
    }

    requestAnimationFrame(scrollToTarget)
    const fallbackTimer = window.setTimeout(() => {
      if (cancelled) {
        return
      }
      const element = document.getElementById(targetId)
      if (element) {
        pendingScrollTargetRef.current = null
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 250)

    const highlightTimer = window.setTimeout(() => setHighlightedNote(null), 2500)
    return () => {
      cancelled = true
      window.clearTimeout(fallbackTimer)
      window.clearTimeout(highlightTimer)
    }
  }, [activeTab, highlightedNote])

  useEffect(() => {
    if (activeTab !== 'balance-sheet' || !highlightedBsRow) {
      return
    }

    const targetId = pendingScrollTargetRef.current ?? highlightedBsRow
    let cancelled = false
    let frame = 0
    const scrollToTarget = () => {
      if (cancelled) {
        return
      }
      const element = document.getElementById(targetId)
      if (element) {
        pendingScrollTargetRef.current = null
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
      if (frame++ < 50) {
        requestAnimationFrame(scrollToTarget)
      }
    }

    requestAnimationFrame(scrollToTarget)
    const highlightTimer = window.setTimeout(() => setHighlightedBsRow(null), 2500)
    return () => {
      cancelled = true
      window.clearTimeout(highlightTimer)
    }
  }, [activeTab, highlightedBsRow])

  useEffect(() => {
    if (activeTab !== 'profit-loss' || !highlightedPlRow) {
      return
    }

    const targetId = pendingScrollTargetRef.current ?? highlightedPlRow
    let cancelled = false
    let frame = 0
    const scrollToTarget = () => {
      if (cancelled) {
        return
      }
      const element = document.getElementById(targetId)
      if (element) {
        pendingScrollTargetRef.current = null
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
      if (frame++ < 50) {
        requestAnimationFrame(scrollToTarget)
      }
    }

    requestAnimationFrame(scrollToTarget)
    const highlightTimer = window.setTimeout(() => setHighlightedPlRow(null), 2500)
    return () => {
      cancelled = true
      window.clearTimeout(highlightTimer)
    }
  }, [activeTab, highlightedPlRow])

  useEffect(() => {
    if (activeTab !== 'bank-account' || !highlightedBankId) {
      return
    }

    let cancelled = false
    const targetId = pendingScrollTargetRef.current ?? `bank-row-${highlightedBankId}`

    const scrollToTarget = () => {
      if (cancelled) {
        return
      }
      const element = document.getElementById(targetId)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        pendingScrollTargetRef.current = null
      }
    }

    requestAnimationFrame(scrollToTarget)
    const highlightTimer = window.setTimeout(() => setHighlightedBankId(null), 2500)
    return () => {
      cancelled = true
      window.clearTimeout(highlightTimer)
    }
  }, [activeTab, highlightedBankId])

  const switchFsTab = (tab: FsTab, options?: { scrollToTop?: boolean }) => {
    setActiveTab(tab)
    setSearchParams({ tab }, { replace: true })
    if (options?.scrollToTop !== false) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      })
    }
  }

  const navigateToNote = (noteKey: keyof FsNotes, noteSubId?: string) => {
    const targetId = noteSubId
      ? `note-sub-${noteKey}-${noteSubId}`
      : `note-row-${noteKey}`
    pendingScrollTargetRef.current = targetId
    setHighlightedNote({ noteKey, noteSubId })
    switchFsTab(getNoteSectionTabForNoteKey(noteKey), { scrollToTop: false })
  }

  const navigateToBalanceSheet = (noteKey: keyof FsNotes, noteSubId?: string) => {
    const targetId = balanceSheetRowId(noteKey, noteSubId)
    pendingScrollTargetRef.current = targetId
    setHighlightedBsRow(targetId)
    switchFsTab('balance-sheet', { scrollToTop: false })
  }

  const navigateToProfitLoss = (noteKey: keyof FsNotes, noteSubId?: string) => {
    const targetId = profitLossRowId(noteKey, noteSubId)
    pendingScrollTargetRef.current = targetId
    setHighlightedPlRow(targetId)
    switchFsTab('profit-loss', { scrollToTop: false })
  }

  const navigateToGstReco = () => {
    switchFsTab('gst-reco')
  }

  const navigateToBankAccount = (accountId?: string) => {
    if (accountId) {
      pendingScrollTargetRef.current = `bank-row-${accountId}`
      setHighlightedBankId(accountId)
    }
    switchFsTab('bank-account', { scrollToTop: false })
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
    const printNote = <span className="statement-note-print-value fs-print-only">{noteNo}</span>

    if (linksToPl) {
      return (
        <>
          <button
            type="button"
            className="statement-note-link fs-screen-only"
            onClick={() => navigateToProfitLoss(noteKey, noteSubId)}
            title="View on Profit & Loss"
          >
            {noteNo}
          </button>
          {printNote}
        </>
      )
    }

    if (linksToBs) {
      return (
        <>
          <button
            type="button"
            className="statement-note-link fs-screen-only"
            onClick={() => navigateToBalanceSheet(noteKey, noteSubId)}
            title="View on Balance Sheet"
          >
            {noteNo}
          </button>
          {printNote}
        </>
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
      setLastSavedGstReco(null)
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
      const fyMeta = clientData.financialYears?.find((item) => item.id === fyId)

      if (!fyMeta) {
        setClient(normalizedClient)
        setFsData(null)
        setLastSavedGstReco(null)
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
          setLastSavedGstReco(null)
          setError(
            'Consolidated statement is not applicable when only one business is active for this financial year.',
          )
          return
        }
      }

      const priorFy = findPreviousFinancialYear(clientData.financialYears || [], fyId)
      const priorFyMeta = priorFy
        ? clientData.financialYears?.find((item) => item.id === priorFy.id)
        : undefined

      const fetchFsForYear = async (
        targetFyId: string,
        targetFyMeta: typeof fyMeta,
      ): Promise<FinancialStatementData | null> => {
        try {
          if (isConsolidatedView) {
            const bundle = await loadConsolidatedFsBundle(
              clientId,
              targetFyId,
              clientData.businesses,
              targetFyMeta || { endYear: new Date().getFullYear(), closedBusinessIds: [] },
              (targetBusinessId) => fetchFsData(clientId, targetFyId, targetBusinessId),
            )
            if (targetFyId === fyId) {
              setConsolidatedFsBundle(bundle)
            }
            return bundle.merged
          }
          if (targetFyId === fyId) {
            setConsolidatedFsBundle(null)
          }
          return await fetchFsData(clientId, targetFyId, businessId)
        } catch {
          return null
        }
      }

      const [loadedDepreciationHistory, fsFetched, priorFsFetched] = await Promise.all([
        !isConsolidatedView
          ? fetchDepreciationHistory(clientId, businessId)
              .then((result) => result.history)
              .catch(() => [] as AssetDepreciationHistoryRow[])
          : Promise.resolve([] as AssetDepreciationHistoryRow[]),
        fetchFsForYear(fyId, fyMeta),
        priorFy
          ? fetchFsForYear(
              priorFy.id,
              priorFyMeta || {
                endYear: priorFy.endYear,
                closedBusinessIds: priorFy.closedBusinessIds,
              } as typeof fyMeta,
            )
          : Promise.resolve(null),
      ])

      setDepreciationHistory(loadedDepreciationHistory)
      const fs = fsFetched ?? createEmptyFsData(clientId, fyId, businessId)

      const snapshotChain: YearDisplaySnapshotChain = {
        financialYears: clientData.financialYears || [],
        ledgers: loadedLedgers,
        fetchFs: async (targetFyId, targetFy) => {
          const targetFyMeta = clientData.financialYears?.find((item) => item.id === targetFyId)
          return fetchFsForYear(
            targetFyId,
            targetFyMeta ||
              ({
                endYear: targetFy.endYear,
                closedBusinessIds: targetFy.closedBusinessIds,
              } as typeof fyMeta),
          )
        },
        displayCache: new Map(),
        preparedCache: new Map(),
        rawFsCache: new Map(),
      }
      if (priorFy && priorFsFetched) {
        snapshotChain.rawFsCache.set(priorFy.id, priorFsFetched)
      }

      let priorNotes: FsNotes | null = null
      let priorSubAmounts: NoteSubAmounts | null = null
      let priorLoans: LoanRecord[] | null = null
      let priorBankAccounts: BankAccountRecord[] = []
      let priorAdminLines: AdministrativeExpenseLine[] = []
      let priorFsPrepared: FinancialStatementData | null = null
      let priorPlAppropriationAmounts: Record<string, NoteSubCell> | null = null
      let previousYearDerivedSnapshot: FsDerivedState | null = null
      if (priorFy && priorFsFetched) {
        priorBankAccounts = normalizeBankAccounts(priorFsFetched.bankAccounts)
        try {
          const priorFs = priorFsFetched
          const priorFyStart = priorFyMeta?.startYear ?? new Date().getFullYear()
          const priorFyEnd = priorFyMeta?.endYear ?? priorFyStart + 1
          priorLoans = normalizeLoans(priorFs.loans, priorFs.repaymentSchedule, priorFyStart, priorFyEnd)
          priorAdminLines = reconcileAdministrativeExpenseLines(
            priorFs.administrativeExpenseLines,
            priorFs.noteSubAmounts,
            loadedLedgers,
          )
          const priorDedupedAdminExpense = deduplicateAdministrativeExpenseLines(
            priorAdminLines,
            priorFs.noteSubAmounts,
            loadedLedgers,
          )
          priorAdminLines = priorDedupedAdminExpense.lines
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
          const priorCogsExtraLines = normalizeCogsExtraLines(priorFs.cogsExtraLines)
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
            priorCogsExtraLines,
            loadedLedgers,
          )
          priorSub = migrateAdminExpenseSubAmounts(priorAdminLines, priorSub)
          priorSub = migrateOtherShortTermSubAmounts(priorOtherStLines, priorSub)
          priorSub = migrateManualNoteLineSubAmounts(priorManualLines, priorSub)
          priorSub = migrateCapitalAccountSubAmounts(priorCapitalLines, priorSub)
          priorSub = migrateCogsExtraSubAmounts(priorCogsExtraLines, priorSub)
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
            cogsExtraLines: priorCogsExtraLines,
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
              priorCogsExtraLines,
              loadedLedgers,
              null,
              {
                current: Number(priorFs.cashAdjustment?.current) || 0,
                previous: Number(priorFs.cashAdjustment?.previous) || 0,
              },
            ),
          )
          priorSubAmounts = priorSub
          previousYearDerivedSnapshot = await resolveYearDisplaySnapshot(priorFy.id, snapshotChain)
          priorFsPrepared = {
            ...priorFs,
            notes: priorNotes,
            noteBreakdowns: migrateNoteBreakdowns(priorFs.noteBreakdowns),
            noteSubAmounts: priorSub,
            administrativeExpenseLines: priorAdminLines,
            otherShortTermBorrowingLines: priorOtherStLines,
            manualNoteLines: priorManualLines,
            capitalAccountLines: priorCapitalLines,
            cogsExtraLines: priorCogsExtraLines,
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
          priorFsPrepared = priorFsPrepared ?? {
            ...priorFsFetched,
            bankAccounts: priorBankAccounts,
          }
          priorPlAppropriationAmounts = null
          previousYearDerivedSnapshot = null
          setPreviousYearPlAppropriationAmounts(null)
        }
      } else {
        setPreviousYearPlAppropriationAmounts(null)
        setPreviousYearDerived(null)
      }
      setPreviousYearDerived(previousYearDerivedSnapshot)
      setPreviousYearNotes(priorNotes)
      setPreviousYearSubAmounts(priorSubAmounts)
      setPreviousYearLoans(priorLoans)
      setPreviousYearBankAccounts(priorBankAccounts)
      setPreviousYearCashAdjustment(
        priorFsFetched ? normalizeCashAdjustment(priorFsFetched.cashAdjustment) : null,
      )
      const fyStart = fyMeta?.startYear ?? new Date().getFullYear()
      const fyEnd = fyMeta?.endYear ?? fyStart + 1
      let loans = normalizeLoans(fs.loans, fs.repaymentSchedule, fyStart, fyEnd)
      let administrativeExpenseLines = reconcileAdministrativeExpenseLines(
        fs.administrativeExpenseLines,
        fs.noteSubAmounts,
        loadedLedgers,
        priorAdminLines,
      )
      const dedupedAdminExpense = deduplicateAdministrativeExpenseLines(
        administrativeExpenseLines,
        fs.noteSubAmounts,
        loadedLedgers,
      )
      administrativeExpenseLines = dedupedAdminExpense.lines
      let noteSubAmounts = dedupedAdminExpense.noteSubAmounts
      let otherShortTermBorrowingLines = normalizeOtherShortTermBorrowingLines(
        fs.otherShortTermBorrowingLines,
        fs.noteSubAmounts,
      )
      let manualNoteLines = normalizeManualNoteLines(fs.manualNoteLines, fs.noteSubAmounts)
      let capitalAccountLines = normalizeCapitalAccountLines(
        fs.capitalAccountLines,
        fs.noteSubAmounts,
      )
      let cogsExtraLines = normalizeCogsExtraLines(fs.cogsExtraLines)
      const plAppropriationLines = normalizePlAppropriationLines(fs.plAppropriationLines)
      const plAppropriationAmounts = migratePlAppropriationAmounts(
        plAppropriationLines,
        fs.plAppropriationAmounts ?? {},
      )
      let bankAccounts = normalizeBankAccounts(fs.bankAccounts)
      noteSubAmounts = normalizeNoteSubAmounts(
        noteSubAmounts,
        migrateNoteBreakdowns(fs.noteBreakdowns),
        loans,
        administrativeExpenseLines,
        otherShortTermBorrowingLines,
        manualNoteLines,
        bankAccounts,
        capitalAccountLines,
        cogsExtraLines,
        loadedLedgers,
      )
      noteSubAmounts = migrateAdminExpenseSubAmounts(administrativeExpenseLines, noteSubAmounts)
      noteSubAmounts = migrateOtherShortTermSubAmounts(otherShortTermBorrowingLines, noteSubAmounts)
      noteSubAmounts = migrateManualNoteLineSubAmounts(manualNoteLines, noteSubAmounts)
      noteSubAmounts = migrateCapitalAccountSubAmounts(capitalAccountLines, noteSubAmounts)
      noteSubAmounts = migrateCogsExtraSubAmounts(cogsExtraLines, noteSubAmounts)

      const fyStartYearMap = new Map(
        (clientData.financialYears || []).map((item) => [item.id, item.startYear]),
      )

      let gstReco = normalizeGstReco(fs.gstReco)
      if (!isConsolidatedView && getGstTaxableSalesTotal(gstReco) === 0) {
        try {
          const { gstReco: gstRecoFromDb } = await fetchGstReco(clientId, fyId, businessId)
          const normalizedDbGst = normalizeGstReco(gstRecoFromDb)
          if (getGstTaxableSalesTotal(normalizedDbGst) > 0) {
            gstReco = normalizedDbGst
          }
        } catch {
          // fetchFsData already loads GST Reco; this is a fallback for legacy gaps.
        }
      }
      noteSubAmounts = applyGstSalesFromRecoToRevenue(noteSubAmounts, gstReco)
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
        cogsExtraLines,
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

      const isSavedYear = Boolean(fs.savedAt)

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
          fyStartYearById: new Map(
            (clientData.financialYears || []).map((item) => [item.id, item.startYear]),
          ),
        })
        const priorClosings = buildPriorDepClosingsByLedgerId(
          expandPriorScheduleWithHistory(
            priorFsPrepared.depreciationSchedule || [],
            loadedDepreciationHistory,
            priorFy.id,
          ),
        )
        setPriorDepClosingsByLedgerId(priorClosings)

        if (isSavedYear) {
          const hasPriorDep = Boolean(
            businessForCarry &&
              hasPriorYearDepreciationData(priorFsPrepared, priorFy.id, loadedDepreciationHistory),
          )
          nextOpeningLocks = buildOpeningBalanceLocksForLoadedYear({
            priorClosing,
            priorDepClosingsByLedgerId: priorClosings,
            depreciationSchedule: carriedDepreciationSchedule,
            administrativeExpenseLines,
            manualNoteLines,
            previousYearSubAmounts: priorSubAmounts,
            hasPriorYearDepreciation: hasPriorDep,
          })
        } else {
          const depLocks: OpeningBalanceLocks = {
            noteSubs: new Set(),
            loanIds: new Set(),
            bankIds: new Set(),
            depRowIds: new Set(),
            adminExpenseLineIds: new Set(),
            manualNoteLineIds: new Set(),
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
                cogsExtraLines,
              },
            })
            noteSubAmounts = carryResult.data.noteSubAmounts
            noteSubAmounts = applyOpeningStockLink(noteSubAmounts, priorSubAmounts)
            noteSubAmounts = applyClosingStockLink(noteSubAmounts)
            loans = carryResult.data.loans
            bankAccounts = carryResult.data.bankAccounts
            if (carryResult.loansCarriedForward) {
              try {
                loans = (await saveLoans(clientId, fyId, businessId, loans)).loans
              } catch {
                // Loan carry-forward remains in memory; user can save manually.
              }
            }
            carriedDepreciationSchedule = carryResult.data.depreciationSchedule
            carriedPreviousYearDepreciation = carryResult.data.previousYearDepreciation
            administrativeExpenseLines =
              carryResult.data.administrativeExpenseLines ?? administrativeExpenseLines
            otherShortTermBorrowingLines =
              carryResult.data.otherShortTermBorrowingLines ?? otherShortTermBorrowingLines
            manualNoteLines = carryResult.data.manualNoteLines ?? manualNoteLines
            capitalAccountLines = carryResult.data.capitalAccountLines ?? capitalAccountLines
            cogsExtraLines = carryResult.data.cogsExtraLines ?? cogsExtraLines
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

      if (priorSubAmounts && !isSavedYear) {
        noteSubAmounts = applyOpeningStockLink(noteSubAmounts, priorSubAmounts)
      }
      noteSubAmounts = applyClosingStockLink(noteSubAmounts)

      bankAccounts = deduplicateBankAccountsByAccountNumber(bankAccounts, fyStartYearMap)
      const currentFyMeta = (clientData.financialYears || []).find((item) => item.id === fyId)
      const currentFyStartYear = currentFyMeta?.startYear ?? 0
      if (currentFyStartYear > 0) {
        const closedLookup = unionBankAccountsForComparative(bankAccounts, priorBankAccounts)
        bankAccounts = filterBankAccountsForFy(
          bankAccounts,
          currentFyStartYear,
          fyStartYearMap,
          closedLookup,
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
        cogsExtraLines,
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
      setLastSavedGstReco(gstReco)
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
    setLoading(true)
    void load()
  }, [clientId, fyId, businessId])

  const fy = client?.financialYears?.find((item) => item.id === fyId)
  const priorFy = useMemo(() => {
    if (!client?.financialYears || !fyId) {
      return null
    }
    return findPreviousFinancialYear(client.financialYears, fyId)
  }, [client?.financialYears, fyId])
  const fyStartYearById = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of client?.financialYears ?? []) {
      map.set(item.id, item.startYear)
    }
    return map
  }, [client?.financialYears])
  const allKnownBankAccounts = useMemo(
    () => unionBankAccountsForComparative(fsData?.bankAccounts ?? [], previousYearBankAccounts),
    [fsData?.bankAccounts, previousYearBankAccounts],
  )
  const visibleBankAccounts = useMemo(() => {
    if (!fsData || !fy) {
      return []
    }
    const filtered = filterBankAccountsForFy(
      fsData.bankAccounts,
      fy.startYear,
      fyStartYearById,
      allKnownBankAccounts,
    )
    return deduplicateBankAccountsByAccountNumber(filtered, fyStartYearById)
  }, [fsData, fy, fyStartYearById, allKnownBankAccounts])
  const visiblePreviousYearBankAccounts = useMemo(() => {
    if (!priorFy) {
      return []
    }
    const priorFyMeta = client?.financialYears?.find((item) => item.id === priorFy.id)
    const priorStartYear = priorFyMeta?.startYear ?? priorFy.startYear
    return filterBankAccountsForFy(
      previousYearBankAccounts,
      priorStartYear,
      fyStartYearById,
      allKnownBankAccounts,
    )
  }, [previousYearBankAccounts, priorFy, client?.financialYears, fyStartYearById, allKnownBankAccounts])
  const udinEnabled = normalizeUdinDetails(fsData?.udinDetails).enabled
  const fsVisibleTabs = useMemo((): Array<[FsTab, string]> => {
    if (!fy) {
      return [['notes', 'Notes']]
    }
    const statementType = normalizeStatementType(fy.statementType)
    const baseTabs = isConsolidatedView
      ? buildFsTabOptions(statementType).filter(([tab]) => CONSOLIDATED_REPORT_TABS.includes(tab))
      : buildFsTabOptions(statementType)
    const tabs: Array<[FsTab, string]> = [...baseTabs]
    if (!isConsolidatedView) {
      tabs.push(['final-info', 'Final Info'])
    }
    if (!isConsolidatedView && udinEnabled) {
      tabs.push(['udin-details', 'UDIN Details'])
    }
    return tabs
  }, [fy, isConsolidatedView, udinEnabled])
  const resolvedActiveTab = useMemo((): FsTab => {
    return fsVisibleTabs.some(([tab]) => tab === activeTab)
      ? activeTab
      : (fsVisibleTabs[0]?.[0] ?? 'notes')
  }, [fsVisibleTabs, activeTab])
  const displayTab = resolvedActiveTab
  const printableTabSet = useMemo(
    () => new Set(fsVisibleTabs.filter(([tab]) => tab !== 'final-info').map(([tab]) => tab)),
    [fsVisibleTabs],
  )

  const tabHasPrintContentForPrint = useCallback(
    (tab: FsTab): boolean => {
      if (!fsData) {
        return false
      }
      const assets = getFixedAssetLedgers(ledgers)
      const udin = normalizeUdinDetails(fsData.udinDetails)
      switch (tab) {
        case 'depreciation':
          return assets.length > 0 && fsData.depreciationSchedule.length > 0
        case 'repayment':
          return fsData.loans.length > 0
        case 'bank-account':
          return fsData.bankAccounts.length > 0
        case 'udin-details':
          return Boolean(
            udin.enabled &&
              (udin.udinNumber?.trim() ||
                udin.caProfileId ||
                udin.caPartnerName?.trim() ||
                udin.caFirmName?.trim()),
          )
        default:
          return true
      }
    },
    [fsData, ledgers],
  )

  const printTitleForTabFn = useCallback(
    (tab: FsTab) => formatFsTabPrintTitle(tab, normalizeStatementType(fy?.statementType)),
    [fy?.statementType],
  )

  useEffect(() => {
    if (isConsolidatedView && !CONSOLIDATED_REPORT_TABS.includes(resolvedActiveTab)) {
      setActiveTab('balance-sheet')
    }
  }, [isConsolidatedView, resolvedActiveTab])

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
  const {
    printAll,
    printAllModalOpen,
    setPrintAllModalOpen,
    printAllSelection,
    setPrintAllSelection,
    printAllSelectedTabs,
    printAllSelectionError,
    setPrintAllSelectionError,
    printValueChange,
    setPrintValueChange,
    printPercentChange,
    setPrintPercentChange,
    printComparisonLayout,
    printableTabsInPrintOrder,
    hidePrintHeader,
    isNotesPrintOutput,
    isNotesOnlyPrintAll,
    isGstPrintOutput,
    isGstOnlyPrintAll,
    isBalanceSheetPrintOutput,
    isBalanceSheetOnlyPrintOutput,
    isNotesRelatedTab,
    mergedNoteSectionsForPrint,
    firstSelectedNoteSectionTab,
    shouldPrintMergedNotes,
    renderPrintHeadSpacer,
    renderPrintTableBanner,
    renderPrintSectionStationery,
    printTabExtraClass,
    handlePrint,
    togglePrintAllSelection,
    confirmPrintAll,
  } = useFinancialStatementPrint({
    printableTabSet,
    tabHasPrintContent: tabHasPrintContentForPrint,
    resolvedActiveTab,
    printTitleForTab: printTitleForTabFn,
    fy,
    client: client ?? ({ name: '', address: '', pin: '' } as Client),
    business: business ?? null,
    isConsolidatedView,
  })

  const udinDetailsForPrint = normalizeUdinDetails(fsData?.udinDetails)
  const selectedUdinCaForPrint = udinDetailsForPrint.caProfileId
    ? caProfiles.find((profile) => profile.id === udinDetailsForPrint.caProfileId) || null
    : null
  const effectivePrintCaProfileForHooks = selectedUdinCaForPrint
    ? {
        ...selectedUdinCaForPrint,
        udin: udinDetailsForPrint.udinNumber || selectedUdinCaForPrint.udin,
        sealSignatureName:
          udinDetailsForPrint.sealAttachmentName || selectedUdinCaForPrint.sealSignatureName,
        sealSignatureDataUrl:
          udinDetailsForPrint.sealAttachmentDataUrl || selectedUdinCaForPrint.sealSignatureDataUrl,
      }
    : EMPTY_CA_PROFILE
  const printUdinApplicableForHooks =
    !isConsolidatedView && udinDetailsForPrint.enabled && Boolean(udinDetailsForPrint.caProfileId)
  const hasPrintCaSealForHooks = Boolean(
    normalizeSealDataUrl(effectivePrintCaProfileForHooks.sealSignatureDataUrl),
  )

  const ensureCaSealForPrint = useCallback(async () => {
    if (!printUdinApplicableForHooks) {
      return true
    }
    if (hasPrintCaSealForHooks) {
      return true
    }
    await showActionAlert(
      'CA seal required',
      'Attach a CA seal in UDIN Details before printing documents.',
    )
    return false
  }, [hasPrintCaSealForHooks, printUdinApplicableForHooks])

  const onPrintCurrent = useCallback(async () => {
    if (!(await ensureCaSealForPrint())) {
      return
    }
    handlePrint('current')
  }, [ensureCaSealForPrint, handlePrint])

  const onPrintAll = useCallback(async () => {
    if (!(await ensureCaSealForPrint())) {
      return
    }
    handlePrint('all')
  }, [ensureCaSealForPrint, handlePrint])

  const onConfirmPrintAll = useCallback(async () => {
    if (!(await ensureCaSealForPrint())) {
      return
    }
    confirmPrintAll()
  }, [confirmPrintAll, ensureCaSealForPrint])

  const hasLoans = (fsData?.loans.length ?? 0) > 0
  const previousFyLabel = fy
    ? buildShortFyLabel(fy.startYear - 1, fy.endYear - 1)
    : 'Previous'
  const currentFyLabel = fy ? buildShortFyLabel(fy.startYear, fy.endYear) : 'Current'
  const balanceSheetCurrentColumnLabel = fy ? formatBalanceSheetColumnLabel(fy.endYear) : 'Current'
  const balanceSheetPreviousColumnLabel = fy ? formatBalanceSheetColumnLabel(fy.endYear - 1) : 'Previous'
  const balanceSheetCurrentLabel = fy ? formatBalanceSheetPrintColumnLabel(fy.endYear) : 'Current'
  const profitLossCurrentColumnLabel = fy ? formatProfitLossColumnLabelCompact(fy.endYear) : 'Current'
  const profitLossPreviousColumnLabel = fy ? formatProfitLossColumnLabelCompact(fy.endYear - 1) : 'Previous'
  const notesCurrentColumnLabel = profitLossCurrentColumnLabel
  const notesPreviousColumnLabel = profitLossPreviousColumnLabel
  const profitLossCurrentLabel = fy ? formatProfitLossColumnLabel(fy.endYear) : 'Current'

  const retainLoanSchedules =
    resolvedActiveTab === 'repayment' ||
    printAll ||
    Boolean(printAllSelectedTabs && printAllSelectedTabs.size > 0)

  const isTabMounted = (tab: FsTab) =>
    printAll ||
    displayTab === tab ||
    activeTab === tab ||
    tab === 'notes' ||
    isNoteSectionTab(tab) ||
    Boolean(printAllSelectedTabs?.has(tab))

  const deferredNoteSubAmounts = useDeferredValue(fsData?.noteSubAmounts)

  const noteSubAmountsForCalc = useMemo(() => {
    const base = deferredNoteSubAmounts ?? fsData?.noteSubAmounts
    if (!base) {
      return null
    }
    return withGstSalesOnNoteSubAmounts(base, fsData?.gstReco)
  }, [deferredNoteSubAmounts, fsData?.noteSubAmounts, fsData?.gstReco])

  const computedLoans = useMemo(() => {
    if (!fsData || !fy) {
      return []
    }
    return recomputeLoansForFy(fsData.loans, fy.startYear, fy.endYear, {
      retainSchedule: retainLoanSchedules,
    })
  }, [fsData?.loans, fy, retainLoanSchedules])

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
      closingBalance: loan.closingBalance,
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
    return partitionBankAccountsByClosing(visibleBankAccounts)
  }, [visibleBankAccounts])

  const noteCalcContext = useMemo(() => {
    if (!fsData || !fy) {
      return null
    }
    const merged = notesWithPreviousFromPriorFy(fsData.notes, previousYearNotes)
    const comparativeCashAdjustment = buildComparativeCashAdjustment(
      fsData.cashAdjustment,
      previousYearCashAdjustment,
    )
    return {
      notes: merged,
      noteBreakdowns: fsData.noteBreakdowns,
      noteSubAmounts: noteSubAmountsForCalc ?? fsData.noteSubAmounts,
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
      cogsExtraLines: fsData.cogsExtraLines ?? [],
      ledgers,
      plAppropriationTotal,
      bankAccounts: visibleBankAccounts,
      previousYearBankAccounts: visiblePreviousYearBankAccounts,
      cashAdjustment: comparativeCashAdjustment,
    }
  }, [
    fsData,
    fy,
    previousYearNotes,
    previousYearSubAmounts,
    previousYearCashAdjustment,
    deferredNoteSubAmounts,
    noteSubAmountsForCalc,
    loanCalcPayload,
    previousYearComputedLoans,
    plAppropriationTotal,
    visibleBankAccounts,
    visiblePreviousYearBankAccounts,
    ledgers,
  ])

  const fsDerived = useMemo(() => {
    if (!noteCalcContext || !fsData || !fy) {
      return null
    }
    return buildFsDerivedState({
      noteCalcContext,
      noteSubAmounts: noteSubAmountsForCalc ?? fsData.noteSubAmounts,
      previousYearSubAmounts,
      depreciationSchedule: fsData.depreciationSchedule,
      previousYearDepreciation: fsData.previousYearDepreciation,
      loans: fsData.loans,
      computedLoans: loanCalcPayload,
      administrativeExpenseLines: fsData.administrativeExpenseLines ?? [],
      previousYearComputedLoans,
      otherShortTermBorrowingLines: fsData.otherShortTermBorrowingLines ?? [],
      manualNoteLines: fsData.manualNoteLines ?? [],
      plAppropriationTotal,
      bankAccounts: visibleBankAccounts,
      previousYearBankAccounts: visiblePreviousYearBankAccounts,
      capitalAccountLines: fsData.capitalAccountLines ?? [],
      cogsExtraLines: fsData.cogsExtraLines ?? [],
      ledgers,
      openingBalanceLocks,
      cashAdjustment: buildComparativeCashAdjustment(fsData.cashAdjustment, previousYearCashAdjustment),
      fyStartYear: fy.startYear,
      fyEndYear: fy.endYear,
    })
  }, [
    noteCalcContext,
    fsData,
    fy,
    deferredNoteSubAmounts,
    noteSubAmountsForCalc,
    previousYearSubAmounts,
    previousYearCashAdjustment,
    loanCalcPayload,
    previousYearComputedLoans,
    plAppropriationTotal,
    visibleBankAccounts,
    visiblePreviousYearBankAccounts,
    ledgers,
    openingBalanceLocks,
  ])

  const displayDerived = useMemo(() => {
    if (!fsDerived) {
      return null
    }
    return mergeComparativeDerivedState(fsDerived, previousYearDerived)
  }, [fsDerived, previousYearDerived])

  const effectiveNotes = displayDerived?.effectiveNotes ?? null
  const computed = displayDerived?.computed ?? null
  const noteSubRowsMap = displayDerived?.noteSubRowsMap ?? null

  const noteCalcMap = useMemo(() => {
    if (!noteCalcContext || !effectiveNotes) {
      return null
    }
    return getNoteCalcMap(noteCalcContext, effectiveNotes)
  }, [noteCalcContext, effectiveNotes])

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

  const consolidatedBusinessColumns = useMemo(() => {
    if (!isConsolidatedView || !consolidatedFsBundle) {
      return undefined
    }
    return consolidatedBusinessColumnsFromBusinesses(consolidatedFsBundle.businesses)
  }, [isConsolidatedView, consolidatedFsBundle])

  const displayBalanceSheetLines = useMemo(() => {
    if (
      !isConsolidatedView ||
      !consolidatedBusinessColumns ||
      !consolidatedFsBundle ||
      !fy ||
      balanceSheetLines.length === 0
    ) {
      return balanceSheetLines
    }

    const perBusinessLines = consolidatedFsBundle.records.map((record) =>
      buildBalanceSheetLinesForFsRecord(record, fy, ledgers),
    )

    return buildConsolidatedStatementDisplayLines(
      balanceSheetLines,
      consolidatedBusinessColumns,
      perBusinessLines,
    )
  }, [
    balanceSheetLines,
    consolidatedBusinessColumns,
    consolidatedFsBundle,
    fy,
    isConsolidatedView,
    ledgers,
  ])

  const displayProfitLossLines = useMemo(() => {
    if (
      !isConsolidatedView ||
      !consolidatedBusinessColumns ||
      !consolidatedFsBundle ||
      !fy ||
      !computed?.profitAndLoss.length
    ) {
      return computed?.profitAndLoss ?? []
    }

    const perBusinessLines = consolidatedFsBundle.records.map((record) =>
      buildProfitLossLinesForFsRecord(record, fy, ledgers),
    )

    return buildConsolidatedStatementDisplayLines(
      computed.profitAndLoss,
      consolidatedBusinessColumns,
      perBusinessLines,
    )
  }, [
    computed?.profitAndLoss,
    consolidatedBusinessColumns,
    consolidatedFsBundle,
    fy,
    isConsolidatedView,
    ledgers,
  ])

  const consolidatedPerBusinessDerived = useMemo(() => {
    if (!isConsolidatedView || !consolidatedFsBundle || !fy) {
      return null
    }

    return consolidatedFsBundle.records.map((record) =>
      buildFsDerivedForFsRecord(record, fy, ledgers),
    )
  }, [consolidatedFsBundle, fy, isConsolidatedView, ledgers])

  const consolidatedNotesAmountColSpan = consolidatedBusinessColumns
    ? consolidatedBusinessColumns.length + 1
    : 0

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

  const consolidatedCashFlow = useMemo(() => {
    if (!retainLoanSchedules) {
      return []
    }
    return mergeCashFlowByYear(computedLoans)
  }, [computedLoans, retainLoanSchedules])

  const updateSubNote = (noteKey: keyof FsNotes, subId: string, value: string) => {
    if (!fsData) {
      return
    }

    if (
      isNoteSubCurrentYearReadOnly(
        noteKey,
        { id: subId, kind: 'entry' },
        {
          openingBalanceLocks,
          previousYearSubAmounts,
          linkGstSales: fsData.gstReco.linkSalesToRevenueNote,
        },
      )
    ) {
      return
    }

    if (
      noteKey === 'revenueFromOperations' &&
      subId === 'gst-sales'
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

  const addAdministrativeExpenseLine = (
    categoryId: string,
    options?: { skipAvailabilityCheck?: boolean },
  ) => {
    if (!fsData || !categoryId) {
      return
    }

    if (!options?.skipAvailabilityCheck) {
      const usedCategoryIds = (fsData.administrativeExpenseLines ?? []).map((line) => line.categoryId)
      const isAvailable = getUnusedAdminExpenseLedgers(ledgers, usedCategoryIds).some(
        (ledger) => ledger.id === categoryId,
      )
      if (!isAvailable) {
        return
      }
    }

    const lineId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
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
    if (!fsData || isAdminExpenseLineCategoryLocked(openingBalanceLocks, lineId)) {
      return
    }

    const usedByOther = (fsData.administrativeExpenseLines ?? []).some(
      (line) => line.id !== lineId && line.categoryId === categoryId,
    )
    if (usedByOther) {
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
    const subId = adminExpenseSubId(lineId)
    const resolvedSub = noteSubRowsMap?.otherAdministrativeExpenses?.find((row) => row.id === subId)

    if (
      !fsData ||
      isAdminExpenseLineCategoryLocked(openingBalanceLocks, lineId) ||
      !canRemoveAdministrativeExpenseLine(
        fsData.noteSubAmounts,
        lineId,
        resolvedSub,
        openingBalanceLocks,
      )
    ) {
      return
    }

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
    if (!fsData || isManualNoteLineCategoryLocked(openingBalanceLocks, noteKey, lineId)) {
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
    if (!fsData || isManualNoteLineCategoryLocked(openingBalanceLocks, noteKey, lineId)) {
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

  const defaultCogsLedgerId = (sign: CogsExtraLineSign) => {
    const groupLedgers = getLedgersForGroup(ledgers, 'costOfGoodsSold').filter(
      (ledger) => normalizeLedgerSign(ledger.sign) === sign,
    )
    return groupLedgers[0]?.id ?? (sign === 'add' ? 'direct-expenses' : 'others-less')
  }

  const addCogsExtraLine = () => {
    if (!fsData) {
      return
    }

    const lineId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
    const sign = 'add' as const
    const typeId = defaultCogsLedgerId(sign)
    const subId = cogsExtraLineSubId(lineId)

    setFsData({
      ...fsData,
      cogsExtraLines: [...(fsData.cogsExtraLines ?? []), { id: lineId, sign, typeId }],
      noteSubAmounts: {
        ...fsData.noteSubAmounts,
        costOfGoodsSold: {
          ...fsData.noteSubAmounts.costOfGoodsSold,
          [subId]: { current: 0, previous: 0 },
        },
      },
    })
    setSaveMessage('')
  }

  const updateCogsExtraLineSign = (lineId: string, sign: string) => {
    if (!fsData) {
      return
    }

    const normalizedSign = normalizeCogsExtraLineSign(sign)

    setFsData({
      ...fsData,
      cogsExtraLines: (fsData.cogsExtraLines ?? []).map((line) =>
        line.id === lineId
          ? {
              ...line,
              sign: normalizedSign,
              typeId: defaultCogsLedgerId(normalizedSign),
            }
          : line,
      ),
    })
    setSaveMessage('')
  }

  const updateCogsExtraLineType = (lineId: string, typeId: string) => {
    if (!fsData) {
      return
    }

    setFsData({
      ...fsData,
      cogsExtraLines: (fsData.cogsExtraLines ?? []).map((line) =>
        line.id === lineId ? { ...line, typeId } : line,
      ),
    })
    setSaveMessage('')
  }

  const removeCogsExtraLine = (lineId: string) => {
    if (!fsData) {
      return
    }

    const subId = cogsExtraLineSubId(lineId)
    const cogsSubs = { ...(fsData.noteSubAmounts.costOfGoodsSold ?? {}) }
    delete cogsSubs[subId]

    setFsData({
      ...fsData,
      cogsExtraLines: (fsData.cogsExtraLines ?? []).filter((line) => line.id !== lineId),
      noteSubAmounts: {
        ...fsData.noteSubAmounts,
        costOfGoodsSold: cogsSubs,
      },
    })
    setSaveMessage('')
  }

  const renderLedgerSelectOptions = (
    group: keyof FsNotes,
    sign?: CapitalAccountLineSign,
    options?: { disabledIds?: Set<string>; excludeUsedIds?: Set<string>; alwaysIncludeId?: string },
  ) => {
    let groupLedgers = getLedgersForGroup(ledgers, group)
    if (group === 'capitalAccount' && sign) {
      groupLedgers = groupLedgers.filter(
        (ledger) => normalizeLedgerSign(ledger.sign) === sign,
      )
    }
    if (options?.excludeUsedIds) {
      groupLedgers = groupLedgers.filter(
        (ledger) =>
          !options.excludeUsedIds!.has(ledger.id) || ledger.id === options.alwaysIncludeId,
      )
    }
    return groupLedgers.map((ledger) => (
      <option
        key={ledger.id}
        value={ledger.id}
        disabled={options?.disabledIds?.has(ledger.id)}
      >
        {ledger.name}
      </option>
    ))
  }

  const renderSubPreviousRef = (sub: ResolvedSubRow, noteKey?: keyof FsNotes) => (
    <>
      <div
        className={`note-prev-ref fs-screen-only${noteKey && (isAdminExpenseLine(noteKey, sub) || isManualShortTermLine(noteKey, sub) || isManualFinanceInterestLine(noteKey, sub) || isManualNoteLine(noteKey, sub) || isCapitalAccountDynamicLine(noteKey, sub) || isCogsExtraDynamicLine(noteKey, sub)) ? ' notes-admin-prev-ref' : ''}`}
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
    const isGstSalesRow = noteKey === 'revenueFromOperations' && sub.id === 'gst-sales'

    if (!sub.editable || isGstSalesRow) {
      const gstAmount =
        isGstSalesRow && fsData?.gstReco
          ? getGstTaxableSalesTotal(fsData.gstReco)
          : sub.current
      const scheduleHint =
        currentYearReadOnlyHint(noteKey, sub.id, sub.kind) ??
        (isGstSalesRow
          ? 'Auto: Taxable sales from GST Reco (Sales + Amended sales)'
          : undefined)
      return (
        <>
          <div
            className={`note-sub-auto fs-screen-only${sub.isAuto ? ' is-auto-calc' : ''}`}
            title={scheduleHint}
          >
            {gstAmount ? formatSubAmount(gstAmount, sub.kind) : '—'}
          </div>
          <span className="note-amount-print fs-print-only">
            {gstAmount ? formatSubAmount(gstAmount, sub.kind) : '—'}
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

  const renderEmptyNoteHeadCells = (hideVariance = false) => {
    if (consolidatedBusinessColumns && consolidatedPerBusinessDerived) {
      return (
        <>
          {consolidatedBusinessColumns.map((business) => (
            <td
              key={business.id}
              className="notes-amount-col notes-business-col notes-head-empty-col"
              aria-hidden="true"
            />
          ))}
          <td className="notes-amount-col notes-total-col notes-head-empty-col" aria-hidden="true" />
        </>
      )
    }

    return (
      <>
        <td className="notes-amount-col notes-curr-col notes-head-empty-col" aria-hidden="true" />
        <td className="notes-amount-col notes-prev-col notes-head-empty-col" aria-hidden="true" />
        {!hideVariance && (
          <>
            <td className="notes-variance-col notes-change-col notes-head-empty-col" aria-hidden="true" />
            <td className="notes-variance-col notes-pct-col notes-head-empty-col" aria-hidden="true" />
          </>
        )}
      </>
    )
  }

  const renderConsolidatedNoteValueCells = (noteKey: keyof FsNotes, sub: ResolvedSubRow) => {
    const businessValues = getConsolidatedNoteSubBusinessValues(
      consolidatedPerBusinessDerived!,
      consolidatedBusinessColumns!,
      noteKey,
      sub,
    )
    const total = Object.values(businessValues).reduce((sum, value) => sum + value, 0)

    return (
      <>
        {consolidatedBusinessColumns!.map((business) => {
          const value = businessValues[business.id] ?? 0
          return (
            <td key={business.id} className="notes-amount-col notes-business-col">
              <span className="note-amount-print">
                {value ? formatSubAmount(value, sub.kind) : '—'}
              </span>
            </td>
          )
        })}
        <td className="notes-amount-col notes-total-col">
          <span className="note-amount-print">
            {total ? formatSubAmount(total, sub.kind) : '—'}
          </span>
        </td>
      </>
    )
  }

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
            onClick={() => switchFsTab('repayment')}
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
      const hasStBankAccounts = visibleBankAccounts.some(
        (account) => account.accountType === 'cc' || account.accountType === 'od',
      )
      return (
        <div className="notes-main-label-row notes-schedule-header-row">
          <div className="notes-revenue-header">
            <span className="notes-revenue-title">{field.label}</span>
            <div className={`notes-gst-link-bar notes-schedule-link-bar${hasStLoans ? ' is-linked' : ''}`}>
              {hasStLoans && (
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
                onClick={() => switchFsTab('repayment')}
                title="Open Loan Repayment Schedule"
              >
                Repayment Schedule
                <span className="notes-gst-open-arrow" aria-hidden="true">
                  →
                </span>
              </button>
              {hasStBankAccounts && (
                <button
                  type="button"
                  className="notes-gst-open-btn"
                  onClick={() => navigateToBankAccount()}
                  title="Open Bank Accounts"
                >
                  Bank Accounts
                  <span className="notes-gst-open-arrow" aria-hidden="true">
                    →
                  </span>
                </button>
              )}
            </div>
          </div>
          <button
            type="button"
            className="notes-add-round-btn notes-add-round-btn-st"
            onClick={addOtherShortTermBorrowingLine}
            title="Add other short-term borrowing"
            aria-label="Add other short-term borrowing"
          >
            +
          </button>
        </div>
      )
    }

    if (field.key === 'cashAtBank') {
      const hasCashBankAccounts = visibleBankAccounts.some(
        (account) => account.accountType === 'current' || account.accountType === 'savings',
      )
      if (!hasCashBankAccounts) {
        return field.label
      }
      return (
        <div className="notes-main-label-row notes-schedule-header-row">
          <div className="notes-revenue-header">
            <span className="notes-revenue-title">{field.label}</span>
            <div className="notes-gst-link-bar notes-schedule-link-bar is-linked">
              <span className="notes-gst-linked-badge" title="Balances linked from Bank Account tab">
                Linked
              </span>
              <button
                type="button"
                className="notes-gst-open-btn"
                onClick={() => navigateToBankAccount()}
                title="Open Bank Accounts"
              >
                Bank Accounts
                <span className="notes-gst-open-arrow" aria-hidden="true">
                  →
                </span>
              </button>
            </div>
          </div>
        </div>
      )
    }

    if (field.key === 'otherAdministrativeExpenses') {
      const usedCategoryIds = (fsData?.administrativeExpenseLines ?? []).map((line) => line.categoryId)
      return (
        <div className="notes-main-label-row">
          <span>{field.label}</span>
          <AdminExpenseLedgerPicker
            ledgers={ledgers}
            usedCategoryIds={usedCategoryIds}
            onSelect={(categoryId) =>
              addAdministrativeExpenseLine(categoryId, { skipAvailabilityCheck: true })
            }
            onLedgersUpdated={setLedgers}
          />
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

    if (field.key === 'costOfGoodsSold') {
      return (
        <div className="notes-main-label-row">
          <span>{field.label}</span>
          <button
            type="button"
            className="notes-add-round-btn notes-add-round-btn-cogs"
            onClick={addCogsExtraLine}
            title="Add COGS line (Add or Less)"
            aria-label="Add COGS line"
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
      if (isConsolidatedView) {
        return field.label
      }

      const gstTaxableSales = getGstTaxableSalesTotal(fsData!.gstReco)

      return (
        <div className="notes-revenue-header">
          <span className="notes-revenue-title">{field.label}</span>
          <div className={`notes-gst-link-bar${gstTaxableSales > 0 ? ' is-linked' : ''}`}>
            {gstTaxableSales > 0 && (
              <span
                className="notes-gst-linked-badge"
                title={`GST Reco taxable sales: ${formatAmount(gstTaxableSales)}`}
              >
                GST Sales {formatAmount(gstTaxableSales)}
              </span>
            )}
            <button
              type="button"
              className="notes-gst-open-btn"
              onClick={(event) => {
                event.stopPropagation()
                navigateToGstReco()
              }}
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
    const storedCategoryId = line?.categoryId ?? ''
    const categoryId = storedCategoryId
      ? resolveAdminExpenseCategoryId(ledgers, storedCategoryId)
      : defaultLedgerIdForGroup(ledgers, 'otherAdministrativeExpenses')
    const categoryLocked = isAdminExpenseLineCategoryLocked(openingBalanceLocks, lineId)
    const usedCategoryIds = new Set(
      (fsData?.administrativeExpenseLines ?? [])
        .filter((item) => item.id !== lineId)
        .map((item) => resolveAdminExpenseCategoryId(ledgers, item.categoryId)),
    )
    const hasLedgerOption = getLedgersForGroup(ledgers, 'otherAdministrativeExpenses').some(
      (ledger) => ledger.id === categoryId,
    )
    const canRemove = canRemoveAdministrativeExpenseLine(
      fsData?.noteSubAmounts,
      lineId,
      sub,
      openingBalanceLocks,
    )

    return (
      <div className="notes-admin-field">
        <span className="notes-admin-field-marker" aria-hidden="true" />
        <div className="notes-admin-select-wrap">
          <select
            className="notes-admin-category-select"
            value={categoryId}
            title={
              categoryLocked
                ? `${resolveAdminExpenseLabel(ledgers, categoryId)} — carried from previous year`
                : resolveAdminExpenseLabel(ledgers, categoryId)
            }
            disabled={categoryLocked}
            onChange={(event) => updateAdministrativeExpenseCategory(lineId, event.target.value)}
          >
            {!hasLedgerOption && isLegacyAdminCategoryId(categoryId) ? (
              <option value={categoryId}>{resolveAdminExpenseLabel(ledgers, categoryId)}</option>
            ) : null}
            {renderLedgerSelectOptions('otherAdministrativeExpenses', undefined, {
              excludeUsedIds: usedCategoryIds,
              alwaysIncludeId: categoryId,
            })}
          </select>
        </div>
        {canRemove ? (
          <button
            type="button"
            className="notes-admin-remove-btn"
            onClick={() => removeAdministrativeExpenseLine(lineId)}
            title="Remove expense line"
            aria-label="Remove expense line"
          >
            ×
          </button>
        ) : null}
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
    const categoryLocked = isManualNoteLineCategoryLocked(openingBalanceLocks, noteKey, lineId)

    return (
      <div className="notes-admin-field">
        <span className="notes-admin-field-marker notes-manual-marker" aria-hidden="true" />
        <div className="notes-admin-select-wrap">
          <select
            className="notes-admin-category-select"
            value={typeId}
            title={
              categoryLocked
                ? `${resolveManualNoteLineLabel(ledgers, noteKey, typeId)} — carried from previous year`
                : resolveManualNoteLineLabel(ledgers, noteKey, typeId)
            }
            disabled={categoryLocked}
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
          disabled={categoryLocked}
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

  const renderCogsExtraLineLabel = (sub: ResolvedSubRow) => {
    const lineId = sub.id.replace('cogs-line-', '')
    const line = fsData?.cogsExtraLines?.find((item) => item.id === lineId)
    const sign = normalizeCogsExtraLineSign(line?.sign)
    const typeId = line?.typeId ?? defaultCogsLedgerId(sign)
    const groupLedgers = getLedgersForGroup(ledgers, 'costOfGoodsSold').filter(
      (ledger) => normalizeLedgerSign(ledger.sign) === sign,
    )

    return (
      <div className="notes-admin-field notes-cogs-field">
        <span className="notes-admin-field-marker notes-cogs-marker" aria-hidden="true" />
        <div className="notes-admin-select-wrap notes-cogs-sign-wrap">
          <select
            className="notes-admin-category-select notes-cogs-sign-select"
            value={sign}
            title={sign === 'add' ? 'Add value' : 'Less value'}
            onChange={(event) => updateCogsExtraLineSign(lineId, event.target.value)}
          >
            <option value="add">Add</option>
            <option value="less">Less</option>
          </select>
        </div>
        <div className="notes-admin-select-wrap">
          <select
            className="notes-admin-category-select"
            value={typeId}
            onChange={(event) => updateCogsExtraLineType(lineId, event.target.value)}
          >
            {groupLedgers.length > 0
              ? renderLedgerSelectOptions('costOfGoodsSold', sign)
              : getCogsExtraLineTypes(sign).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
          </select>
        </div>
        <button
          type="button"
          className="notes-admin-remove-btn"
          onClick={() => removeCogsExtraLine(lineId)}
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
            onClick={() => switchFsTab('repayment')}
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
    const consolidatedNotesMode = Boolean(
      consolidatedBusinessColumns && consolidatedPerBusinessDerived,
    )
    const trailingColSpan = consolidatedNotesMode
      ? consolidatedNotesAmountColSpan
      : hideVariance
        ? 3
        : 5
    const subRows = noteSubRowsMap?.[noteKey] ?? []
    const isAdminNote = noteKey === 'otherAdministrativeExpenses'
    const isFinanceNote = noteKey === 'financeCost'
    const isLongTermNote = noteKey === 'longTermBorrowings'
    const isShortTermNote = noteKey === 'shortTermBorrowings'
    const isCapitalNote = noteKey === 'capitalAccount'
    const isCogsNote = noteKey === 'costOfGoodsSold'
    const isMultiLineNote = isManualNoteLineKey(noteKey)
    const hasAdminLines = (fsData?.administrativeExpenseLines?.length ?? 0) > 0
    const hasLongTermLoans =
      (fsData?.loans.some((loan) => loan.loanType === 'long-term') ?? false) ||
      (previousYearLoans?.some((loan) => loan.loanType === 'long-term') ?? false)
    const hasShortTermLoans =
      (fsData?.loans.some((loan) => loan.loanType === 'short-term') ?? false) ||
      (previousYearLoans?.some((loan) => loan.loanType === 'short-term') ?? false)
    const hasManualStLines = (fsData?.otherShortTermBorrowingLines?.length ?? 0) > 0
    const hasPriorNoteSubData = subRows.some(
      (sub) => sub.kind !== 'header' && sub.previous !== 0,
    )
    const hasManualNoteLines = (fsData?.manualNoteLines ?? []).some((line) => line.noteKey === noteKey)
    const hasCapitalLines = (fsData?.capitalAccountLines?.length ?? 0) > 0
    const hasCogsExtraLines = (fsData?.cogsExtraLines?.length ?? 0) > 0

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
            onClick={() => switchFsTab('repayment')}
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
      if (isCogsExtraDynamicLine(noteKey, sub)) {
        return renderCogsExtraLineLabel(sub)
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
      if (noteKey === 'revenueFromOperations' && sub.id === 'gst-sales') {
        return (
          <div className="notes-gst-sales-label">
            <span>{sub.label}</span>
            <button
              type="button"
              className="gst-note-link-btn notes-gst-ref-link-btn"
              onClick={(event) => {
                event.stopPropagation()
                navigateToGstReco()
              }}
              title="Open GST Reco sheet"
            >
              View GST Reco
            </button>
          </div>
        )
      }
      if (
        (noteKey === 'cashAtBank' || noteKey === 'shortTermBorrowings') &&
        sub.kind === 'auto' &&
        (sub.id.startsWith('bank-') || sub.id.startsWith('bank-st-'))
      ) {
        const accountId = parseBankAccountIdFromSubId(sub.id)
        if (accountId) {
          return (
            <button
              type="button"
              className="notes-repayment-link-btn"
              onClick={() => navigateToBankAccount(accountId)}
              title="Open Bank Account"
            >
              {sub.label}
            </button>
          )
        }
      }
      return sub.label
    }

    return (
      <>
        {isLongTermNote && !hasLongTermLoans && !hasPriorNoteSubData && (
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
        {isShortTermNote && !hasShortTermLoans && !hasManualStLines && !hasPriorNoteSubData && (
          <tr className="notes-st-empty-row">
            <td className="notes-sno-col" />
            <td className="notes-particular-col notes-st-empty-hint" colSpan={trailingColSpan}>
              Add short-term loans in the <strong>Repayment Schedule</strong> tab for schedule-based
              borrowings, or click <span className="notes-admin-empty-plus">+</span> for other
              borrowings (add ledgers in <strong>Ledger</strong> for dropdown options)
            </td>
          </tr>
        )}
        {isAdminNote && !hasAdminLines && !hasPriorNoteSubData && (
          <tr className="notes-admin-empty-row">
            <td className="notes-sno-col" />
            <td className="notes-particular-col notes-admin-empty-hint" colSpan={trailingColSpan}>
              Click <span className="notes-admin-empty-plus">+</span> to search and add an expense
              line — type a new name to create it in <strong>Ledger</strong> automatically
            </td>
          </tr>
        )}
        {isMultiLineNote && !hasManualNoteLines && !hasPriorNoteSubData && (
          <tr className="notes-manual-empty-row">
            <td className="notes-sno-col" />
            <td className="notes-particular-col notes-manual-empty-hint" colSpan={trailingColSpan}>
              Click <span className="notes-admin-empty-plus">+</span> to add a line item (add ledgers
              in <strong>Ledger</strong> for dropdown options)
            </td>
          </tr>
        )}
        {isCapitalNote && !hasCapitalLines && !hasPriorNoteSubData && (
          <tr className="notes-capital-empty-row">
            <td className="notes-sno-col" />
            <td className="notes-particular-col notes-capital-empty-hint" colSpan={trailingColSpan}>
              Click <span className="notes-admin-empty-plus">+</span> to add Add / Less lines (add
              ledgers in <strong>Ledger</strong> for dropdown options)
            </td>
          </tr>
        )}
        {isCogsNote && !hasCogsExtraLines && !hasPriorNoteSubData && (
          <tr className="notes-cogs-empty-row">
            <td className="notes-sno-col" />
            <td className="notes-particular-col notes-cogs-empty-hint" colSpan={trailingColSpan}>
              Click <span className="notes-admin-empty-plus">+</span> to add extra COGS lines (add
              ledgers in <strong>Ledger</strong> under Cost of Goods Sold for dropdown options)
            </td>
          </tr>
        )}
        {subRows
          .filter(
            (sub) =>
              sub.id !== 'cash-flow-adjustment' || sub.current !== 0 || sub.previous !== 0,
          )
          .map((sub) => {
          if (sub.kind === 'subtotal') {
            return null
          }

          const isAdminLine = isAdminExpenseLine(noteKey, sub)
          const isManualStLine = isManualShortTermLine(noteKey, sub)
          const isManualLine = isManualNoteLine(noteKey, sub)
          const isCapitalLine = isCapitalAccountDynamicLine(noteKey, sub)
          const isCogsLine = isCogsExtraDynamicLine(noteKey, sub)
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
            isCogsLine ? 'notes-cogs-line-row' : '',
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
              {consolidatedNotesMode ? (
                renderConsolidatedNoteValueCells(noteKey, sub)
              ) : (
                <>
                  <td className="notes-amount-col notes-curr-col">
                    {renderSubCurrentCell(noteKey, sub)}
                  </td>
                  <td className="notes-amount-col notes-prev-col">
                    {renderSubPreviousRef(sub, noteKey)}
                  </td>
                  {!hideVariance && renderSubVarianceCells(sub)}
                </>
              )}
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
    const deduped = deduplicateBankAccountsByAccountNumber(bankAccounts, fyStartYearById)
    setFsData((current) => (current ? { ...current, bankAccounts: deduped } : current))
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
    if (account && !canDeleteBankAccount(account)) {
      setError(
        'Cannot delete this bank account — figures exist in one or more financial years.',
      )
      return
    }
    const confirmed = await confirmDelete({
      itemLabel: account?.bankName || 'this bank account',
      extraMessage: 'This removes the bank from all financial years.',
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

  const updateGstReco = (gstReco: GstRecoStatement) => {
    setFsData((prev) => {
      if (!prev) {
        return prev
      }

      const noteSubAmounts = applyGstSalesFromRecoToRevenue(prev.noteSubAmounts, gstReco)
      return { ...prev, gstReco, noteSubAmounts }
    })
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

    const workingData = options?.dataOverride || fsDataRef.current || fsData

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

      const reconciledAdminLines = reconcileAdministrativeExpenseLines(
        workingData.administrativeExpenseLines,
        workingData.noteSubAmounts,
        ledgers,
      )
      const dedupedAdminForSave = deduplicateAdministrativeExpenseLines(
        reconciledAdminLines,
        workingData.noteSubAmounts,
        ledgers,
      )
      const adminLinesForSave = dedupedAdminForSave.lines
      const otherStLinesForSave = normalizeOtherShortTermBorrowingLines(
        workingData.otherShortTermBorrowingLines,
        workingData.noteSubAmounts,
      )
      const manualLinesForSave = normalizeManualNoteLines(
        workingData.manualNoteLines,
        workingData.noteSubAmounts,
      )
      const capitalLinesForSave = normalizeCapitalAccountLines(
        workingData.capitalAccountLines,
        workingData.noteSubAmounts,
      )
      const cogsExtraLinesForSave = normalizeCogsExtraLines(workingData.cogsExtraLines)
      const bankAccountsForSave = normalizeBankAccounts(workingData.bankAccounts)
      const gstRecoForSave = (() => {
        let next = normalizeGstReco(workingData.gstReco)
        if (getGstTaxableSalesTotal(next) === 0 && lastSavedGstReco) {
          const prior = normalizeGstReco(lastSavedGstReco)
          if (getGstTaxableSalesTotal(prior) > 0) {
            next = prior
          }
        }
        return next
      })()
      let noteSubAmountsForSave = buildCompleteNoteSubAmounts(
        dedupedAdminForSave.noteSubAmounts,
        migrateNoteBreakdowns(workingData.noteBreakdowns),
        workingData.loans,
        adminLinesForSave,
        otherStLinesForSave,
        manualLinesForSave,
        bankAccountsForSave,
        capitalLinesForSave,
        cogsExtraLinesForSave,
        ledgers,
      )
      noteSubAmountsForSave = applyGstSalesFromRecoToRevenue(noteSubAmountsForSave, gstRecoForSave)
      noteSubAmountsForSave = applyClosingStockLink(noteSubAmountsForSave)

      const payload: FinancialStatementData = {
        ...workingData,
        notes: notesForSave,
        noteSubAmounts: noteSubAmountsForSave,
        administrativeExpenseLines: adminLinesForSave,
        otherShortTermBorrowingLines: otherStLinesForSave,
        manualNoteLines: manualLinesForSave,
        capitalAccountLines: capitalLinesForSave,
        cogsExtraLines: cogsExtraLinesForSave,
        bankAccounts: bankAccountsForSave,
        gstReco: gstRecoForSave,
        depreciationSchedule: prunedDepreciationSchedule,
        statementSnapshot,
        finalizationInfo: nextFinalization,
        ...(unlockCode ? { unlockConfirmationCode: unlockCode } : {}),
      }
      const saved = await saveFsData(clientId, fyId, businessId, payload)
      const savedReconciledAdminLines = reconcileAdministrativeExpenseLines(
        saved.administrativeExpenseLines,
        saved.noteSubAmounts,
        ledgers,
      )
      const savedAdminLines = deduplicateAdministrativeExpenseLines(
        savedReconciledAdminLines,
        saved.noteSubAmounts,
        ledgers,
      ).lines
      const savedOtherStLines = normalizeOtherShortTermBorrowingLines(
        saved.otherShortTermBorrowingLines,
        saved.noteSubAmounts,
      )
      const savedManualLines = normalizeManualNoteLines(saved.manualNoteLines, saved.noteSubAmounts)
      const savedCapitalLines = normalizeCapitalAccountLines(
        saved.capitalAccountLines,
        saved.noteSubAmounts,
      )
      const savedCogsExtraLines = normalizeCogsExtraLines(saved.cogsExtraLines)
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
        savedCogsExtraLines,
        ledgers,
      )
      savedSubAmounts = migrateAdminExpenseSubAmounts(savedAdminLines, savedSubAmounts)
      savedSubAmounts = migrateOtherShortTermSubAmounts(savedOtherStLines, savedSubAmounts)
      savedSubAmounts = migrateManualNoteLineSubAmounts(savedManualLines, savedSubAmounts)
      savedSubAmounts = migrateCapitalAccountSubAmounts(savedCapitalLines, savedSubAmounts)
      savedSubAmounts = migrateCogsExtraSubAmounts(savedCogsExtraLines, savedSubAmounts)
      savedSubAmounts = applyOpeningStockLink(savedSubAmounts, previousYearSubAmounts)
      savedSubAmounts = applyClosingStockLink(savedSubAmounts)
      const savedGstRecoFromServer = normalizeGstReco(saved.gstReco)
      const savedGstReco =
        getGstTaxableSalesTotal(savedGstRecoFromServer) > 0
          ? savedGstRecoFromServer
          : gstRecoForSave
      savedSubAmounts = applyGstSalesFromRecoToRevenue(savedSubAmounts, savedGstReco)

      const nextState = {
        ...saved,
        notes: migrateNotes(saved.notes as Parameters<typeof migrateNotes>[0]),
        noteBreakdowns: migrateNoteBreakdowns(saved.noteBreakdowns),
        noteSubAmounts: savedSubAmounts,
        administrativeExpenseLines: savedAdminLines,
        otherShortTermBorrowingLines: savedOtherStLines,
        manualNoteLines: savedManualLines,
        capitalAccountLines: savedCapitalLines,
        cogsExtraLines: savedCogsExtraLines,
        plAppropriationLines: savedPlLines,
        plAppropriationAmounts: savedPlAmounts,
        depreciationSchedule: normalizeDepreciationSchedule(saved.depreciationSchedule || []),
        previousYearDepreciation: normalizePreviousYearDepreciation(saved.previousYearDepreciation),
        loans: workingData.loans,
        gstReco: savedGstReco,
        bankAccounts: normalizeBankAccounts(saved.bankAccounts),
        cashAdjustment: normalizeCashAdjustment(saved.cashAdjustment),
        udinDetails: normalizeUdinDetails(saved.udinDetails),
        finalizationInfo: normalizeFinalizationInfo(saved.finalizationInfo),
        savedAt: saved.savedAt || new Date().toISOString(),
      }

      setFsData(nextState)
      setLastSavedGstReco(savedGstReco)
      setSavedFingerprint(fsDataFingerprint(nextState))
      setGstRecoDbRefreshKey((value) => value + 1)
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

  const handleStatementTypeChange = async (nextType: string) => {
    if (!fy || isFsReadOnly || isConsolidatedView) {
      return
    }

    if (isDirty) {
      const saveFirst = await confirmProceed({
        title: 'Unsaved changes',
        message: 'Save your note changes before changing the statement type?',
        confirmButtonText: 'Save and continue',
      })
      if (!saveFirst) {
        return
      }
      const saved = await handleSave({ skipConfirm: true })
      if (!saved) {
        return
      }
    }

    await updateGlobalFinancialYearStatementType(fy.id, nextType)
    const updated = await reloadClient()
    if (updated) {
      setClient(updated)
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

  const renderNotesTableHead = () => (
    <thead>
      {renderPrintHeadSpacer('notes', consolidatedBusinessColumns ? 2 + consolidatedNotesAmountColSpan : 6)}
      {renderPrintTableBanner('notes', consolidatedBusinessColumns ? 2 + consolidatedNotesAmountColSpan : 6)}
      <tr className="notes-head-row">
        <th className="notes-sno-col">Note</th>
        <th className="notes-particular-col">Particulars</th>
        {consolidatedBusinessColumns ? (
          <>
            {consolidatedBusinessColumns.map((business) => (
              <th
                key={business.id}
                className="notes-amount-col notes-business-col"
                data-business-id={business.id}
                title={business.name}
              >
                <span className="notes-fy-label statement-fy-label--unified">{business.name}</span>
              </th>
            ))}
            <th className="notes-amount-col notes-total-col">
              <span className="notes-fy-label statement-fy-label--unified">Total</span>
            </th>
          </>
        ) : (
          <>
            <th className="notes-amount-col notes-curr-col">
              <span className="notes-fy-label statement-fy-label--unified">{notesCurrentColumnLabel}</span>
            </th>
            <th className="notes-amount-col notes-prev-col">
              <span className="notes-fy-label statement-fy-label--unified">{notesPreviousColumnLabel}</span>
            </th>
            <th className="notes-variance-col notes-change-col">
              <span className="notes-fy-label">Change</span>
              <span className="notes-fy-hint">vs last year</span>
            </th>
            <th className="notes-variance-col notes-pct-col">
              <span className="notes-fy-label">% Change</span>
              <span className="notes-fy-hint">vs last year</span>
            </th>
          </>
        )}
      </tr>
    </thead>
  )

  const renderSingleNoteTable = (field: (typeof NOTE_FIELDS)[number]) => (
    <div key={field.key} className="table-wrap notes-table-wrap notes-print-note-unit">
      <table
        className={`data-table notes-table${consolidatedBusinessColumns ? ' notes-table--consolidated' : ''}`}
        style={
          consolidatedBusinessColumns
            ? ({
                '--consolidated-business-count': consolidatedBusinessColumns.length,
              } as CSSProperties)
            : undefined
        }
      >
        {renderNotesTableColGroup()}
        {renderNotesTableHead()}
        <tbody className="fs-print-note-block">
          <tr
            id={`note-row-${field.key}`}
            className={`notes-main-row notes-main-row-header${field.key === 'longTermBorrowings' ? ' notes-main-row-lt' : ''}${field.key === 'otherAdministrativeExpenses' ? ' notes-main-row-admin' : ''}${field.key === 'shortTermBorrowings' ? ' notes-main-row-st' : ''}${field.key === 'financeCost' ? ' notes-main-row-finance' : ''}${field.key === 'capitalAccount' ? ' notes-main-row-capital' : ''}${field.key === 'costOfGoodsSold' ? ' notes-main-row-cogs' : ''}${field.key === 'revenueFromOperations' ? ' notes-main-row-revenue' : ''}${isManualNoteLineKey(field.key) ? ' notes-main-row-manual' : ''}${
              highlightedNote?.noteKey === field.key && !highlightedNote.noteSubId
                ? ' notes-row-highlight'
                : ''
            }`}
          >
            <td className="notes-sno-col">{renderNoteNumberLink(field.key, field.noteNo)}</td>
            <td className="notes-particular-col notes-main-label">{renderMainNoteLabel(field)}</td>
            {renderEmptyNoteHeadCells()}
          </tr>
          {renderNoteSubRows(field.key)}
        </tbody>
      </table>
    </div>
  )

  const renderNotesTableFieldRows = (fields: typeof NOTE_FIELDS) =>
    fields.map((field) => renderSingleNoteTable(field))

  const renderNotesTableColGroup = () => (
    <colgroup>
      <col className="notes-sno-col" />
      <col className="notes-particular-col" />
      {consolidatedBusinessColumns ? (
        <>
          {consolidatedBusinessColumns.map((business) => (
            <col key={business.id} className="notes-business-col" data-business-id={business.id} />
          ))}
          <col className="notes-total-col" />
        </>
      ) : (
        <>
          <col className="notes-amount-col notes-curr-col" />
          <col className="notes-amount-col notes-prev-col" />
          <col className="notes-variance-col notes-change-col" />
          <col className="notes-variance-col notes-pct-col" />
        </>
      )}
    </colgroup>
  )

  const renderNotesSectionTable = (
    section: (typeof NOTES_TABLE_SECTIONS)[number],
    _options: { showTableHead?: boolean } = {},
  ) => (
    <div className="notes-tables-stack notes-print-notes-stack">
      {renderNotesTableFieldRows(getNoteFieldsForTableSection(section))}
    </div>
  )

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
  const visibleTabs = fsVisibleTabs

  const printTitleForTab = (tab: FsTab) => formatFsTabPrintTitle(tab, statementType)

  const tabLabelFor = (tab: FsTab) => {
    if (tab === 'notes') {
      return `${visibleTabs.find(([visibleTab]) => visibleTab === 'notes')?.[1] ?? printTitleForTab('notes')} (all parts)`
    }
    return visibleTabs.find(([visibleTab]) => visibleTab === tab)?.[1] ?? printTitleForTab(tab)
  }

  const printReportKind: 'balance-sheet' | 'profit-loss' | 'notes' | 'other' =
    resolvedActiveTab === 'balance-sheet'
      ? 'balance-sheet'
      : resolvedActiveTab === 'profit-loss'
        ? 'profit-loss'
        : isNotesRelatedTab(resolvedActiveTab)
          ? 'notes'
          : 'other'

  const tabPanelClass = (tab: FsTab) =>
    `panel fs-tab-panel${displayTab === tab ? ' is-active' : ''}${printTabExtraClass(tab)}`

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
    const consolidatedBalanceSheetExport = isConsolidatedView && consolidatedBusinessColumns
    const balanceSheetExportLines = consolidatedBalanceSheetExport
      ? displayBalanceSheetLines
      : balanceSheetLines
    const balanceSheetExportHeaders = consolidatedBalanceSheetExport
      ? ['Particular', 'Note', ...consolidatedBusinessColumns!.map((item) => item.name), 'Total']
      : ['Particular', 'Note', currentFyLabel, previousFyLabel]
    const balanceSheetExportRows = balanceSheetExportLines.map((line) => {
      if (consolidatedBalanceSheetExport) {
        if (line.isHeader || line.isSubHeader || line.isSpacer) {
          return [line.label, '', ...consolidatedBusinessColumns!.map(() => ''), '']
        }
        return [
          line.label,
          line.noteNo || '',
          ...consolidatedBusinessColumns!.map((item) => line.businessCurrentValues?.[item.id] ?? 0),
          line.current,
        ]
      }
      return [line.label, line.noteNo || '', line.current, line.previous]
    })

    sections.push(renderSection('Balance Sheet', balanceSheetExportHeaders, balanceSheetExportRows))

    const consolidatedStatementExport =
      isConsolidatedView && consolidatedBusinessColumns && consolidatedPerBusinessDerived
    const profitLossExportLines = consolidatedStatementExport
      ? displayProfitLossLines
      : computed.profitAndLoss
    const profitLossExportHeaders = consolidatedStatementExport
      ? ['Particular', 'Note', ...consolidatedBusinessColumns!.map((item) => item.name), 'Total']
      : ['Particular', 'Note', currentFyLabel, previousFyLabel]
    const profitLossExportRows = profitLossExportLines.map((line) => {
      if (consolidatedStatementExport) {
        if (line.isHeader || line.isSubHeader || line.isSpacer) {
          return [line.label, '', ...consolidatedBusinessColumns!.map(() => ''), '']
        }
        return [
          line.label,
          line.noteNo || '',
          ...consolidatedBusinessColumns!.map((item) => line.businessCurrentValues?.[item.id] ?? 0),
          line.current,
        ]
      }
      return [line.label, line.noteNo || '', line.current, line.previous]
    })

    sections.push(renderSection('Profit & Loss', profitLossExportHeaders, profitLossExportRows))

    if (noteSubRowsMap) {
      const noteRows: Array<Array<string | number>> = []
      for (const field of NOTE_FIELDS) {
        const subs = noteSubRowsMap[field.key] ?? []
        for (const sub of subs) {
          if (sub.kind === 'header') {
            continue
          }
          if (consolidatedStatementExport) {
            const businessValues = getConsolidatedNoteSubBusinessValues(
              consolidatedPerBusinessDerived!,
              consolidatedBusinessColumns!,
              field.key,
              sub,
            )
            const total = Object.values(businessValues).reduce((sum, value) => sum + value, 0)
            noteRows.push([
              field.noteNo,
              sub.label,
              ...consolidatedBusinessColumns!.map((item) => businessValues[item.id] ?? 0),
              total,
            ])
          } else {
            noteRows.push([
              field.noteNo,
              sub.label,
              sub.current,
              sub.previous,
              calcValueChange(sub.current, sub.previous),
              calcPercentChange(sub.current, sub.previous) ?? 0,
            ])
          }
        }
      }
      sections.push(
        renderSection(
          notesLabel,
          consolidatedStatementExport
            ? ['Note', 'Particulars', ...consolidatedBusinessColumns!.map((item) => item.name), 'Total']
            : ['Note', 'Particulars', notesCurrentColumnLabel, notesPreviousColumnLabel, 'Change', '% Change'],
          noteRows,
          2,
        ),
      )
    }

    const businessHeaderHtml = buildExportBusinessHeaderHtml(
      client,
      business ?? null,
      isConsolidatedView,
      escapeHtml,
    )
    const exportReportPeriod = fy ? formatPrintReportPeriod('notes', fy) : ''

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
            .header { margin-bottom: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; text-align: center; }
            .header h1 { margin: 0 0 8px; font-size: 18px; text-transform: uppercase; letter-spacing: 0.04em; }
            .export-business-header { margin: 0 0 12px; }
            .export-entity-name { margin: 0 0 6px; font-size: 20px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
            .export-subline { margin: 0 0 4px; color: #334155; font-size: 12px; }
            .export-report-title { margin: 10px 0 4px; font-size: 14px; font-weight: 700; text-transform: uppercase; }
            .export-report-period { margin: 0; color: #475569; font-size: 12px; text-transform: uppercase; }
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
            ${businessHeaderHtml}
            <h1>${escapeHtml(formatFinancialStatementPageTitle(statementType))}</h1>
            ${exportReportPeriod ? `<p class="export-report-period">${escapeHtml(exportReportPeriod)}</p>` : ''}
            <p class="export-report-period">FY: ${escapeHtml(fy?.label || '—')}</p>
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
      ...buildExportBusinessHeaderLines(client, business ?? null, isConsolidatedView).map((line) => [line]),
      [formatFinancialStatementPageTitle(statementType)],
      [`FY: ${fy?.label || '—'}`],
      [],
    ]

    const pushSection = (title: string, headers: string[], sectionRows: Array<Array<string | number>>) => {
      rows.push([title], headers, ...sectionRows, [])
    }

    const consolidatedBalanceSheetExport = isConsolidatedView && consolidatedBusinessColumns
    const balanceSheetExportLines = consolidatedBalanceSheetExport
      ? displayBalanceSheetLines
      : balanceSheetLines
    const balanceSheetExportHeaders = consolidatedBalanceSheetExport
      ? ['Particular', 'Note', ...consolidatedBusinessColumns!.map((item) => item.name), 'Total']
      : ['Particular', 'Note', currentFyLabel, previousFyLabel]
    const balanceSheetExportRows = balanceSheetExportLines.map((line) => {
      if (consolidatedBalanceSheetExport) {
        if (line.isHeader || line.isSubHeader || line.isSpacer) {
          return [line.label, '', ...consolidatedBusinessColumns!.map(() => ''), '']
        }
        return [
          line.label,
          line.noteNo || '',
          ...consolidatedBusinessColumns!.map((item) =>
            num(line.businessCurrentValues?.[item.id] ?? 0),
          ),
          num(line.current),
        ]
      }
      return [line.label, line.noteNo || '', num(line.current), num(line.previous)]
    })

    pushSection('Balance Sheet', balanceSheetExportHeaders, balanceSheetExportRows)

    const consolidatedStatementExport =
      isConsolidatedView && consolidatedBusinessColumns && consolidatedPerBusinessDerived
    const profitLossExportLines = consolidatedStatementExport
      ? displayProfitLossLines
      : computed.profitAndLoss
    const profitLossExportHeaders = consolidatedStatementExport
      ? ['Particular', 'Note', ...consolidatedBusinessColumns!.map((item) => item.name), 'Total']
      : ['Particular', 'Note', currentFyLabel, previousFyLabel]
    const profitLossExportRows = profitLossExportLines.map((line) => {
      if (consolidatedStatementExport) {
        if (line.isHeader || line.isSubHeader || line.isSpacer) {
          return [line.label, '', ...consolidatedBusinessColumns!.map(() => ''), '']
        }
        return [
          line.label,
          line.noteNo || '',
          ...consolidatedBusinessColumns!.map((item) =>
            num(line.businessCurrentValues?.[item.id] ?? 0),
          ),
          num(line.current),
        ]
      }
      return [line.label, line.noteNo || '', num(line.current), num(line.previous)]
    })

    pushSection('Profit & Loss', profitLossExportHeaders, profitLossExportRows)

    if (noteSubRowsMap) {
      const noteRows: Array<Array<string | number>> = []
      for (const field of NOTE_FIELDS) {
        const subs = noteSubRowsMap[field.key] ?? []
        for (const sub of subs) {
          if (sub.kind === 'header') {
            continue
          }
          if (consolidatedStatementExport) {
            const businessValues = getConsolidatedNoteSubBusinessValues(
              consolidatedPerBusinessDerived!,
              consolidatedBusinessColumns!,
              field.key,
              sub,
            )
            const total = Object.values(businessValues).reduce((sum, value) => sum + value, 0)
            noteRows.push([
              field.noteNo,
              sub.label,
              ...consolidatedBusinessColumns!.map((item) => num(businessValues[item.id] ?? 0)),
              num(total),
            ])
          } else {
            const change = calcValueChange(sub.current, sub.previous)
            const pct = calcPercentChange(sub.current, sub.previous)
            noteRows.push([
              field.noteNo,
              sub.label,
              num(sub.current),
              num(sub.previous),
              num(change),
              pct === null ? '' : `${pct.toFixed(1)}%`,
            ])
          }
        }
      }
      pushSection(
        notesLabel,
        consolidatedStatementExport
          ? ['Note', 'Particulars', ...consolidatedBusinessColumns!.map((item) => item.name), 'Total']
          : ['Note', 'Particulars', notesCurrentColumnLabel, notesPreviousColumnLabel, 'Change', '% Change'],
        noteRows,
      )
    }

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

  const persistUdinDetails = async (nextUdinDetails: UdinDetails) => {
    if (!clientId || !fyId || !businessId || !fsData) {
      return false
    }

    const saved = await saveUdinDetails(clientId, fyId, businessId, nextUdinDetails)
    const normalized = normalizeUdinDetails(saved.udinDetails)
    const nextState = {
      ...fsData,
      udinDetails: normalized,
    }
    setFsData(nextState)
    setSavedFingerprint(fsDataFingerprint(nextState))
    return true
  }

  const onUdinSealAttachmentChange = async (file: File | null) => {
    if (!fsData || isFsReadOnly) {
      return
    }

    if (!file) {
      if (!udinDetails.sealAttachmentDataUrl && !udinDetails.sealAttachmentName) {
        return
      }

      const confirmed = await confirmProceed({
        title: 'Remove CA seal attachment?',
        message: 'This will remove the attached seal from UDIN details.',
        confirmButtonText: 'Yes, remove',
      })
      if (!confirmed) {
        return
      }

      setSaving(true)
      setSaveMessage('')
      try {
        const nextUdinDetails = normalizeUdinDetails({
          ...fsData.udinDetails,
          sealAttachmentName: '',
          sealAttachmentDataUrl: '',
        })
        await persistUdinDetails(nextUdinDetails)
        setSaveMessage('CA seal attachment removed.')
        await showUpdatedAlert(
          'CA seal attachment',
          '<p>The seal attachment has been removed from UDIN details.</p>',
        )
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Failed to remove CA seal attachment.')
      } finally {
        setSaving(false)
      }
      return
    }

    const confirmed = await confirmProceed({
      title: 'Save CA seal attachment?',
      message: `Attach "${file.name}" and save it to the database for this financial statement?`,
      confirmButtonText: 'Yes, save',
    })
    if (!confirmed) {
      return
    }

    const reader = new FileReader()
    reader.onload = async () => {
      setSaving(true)
      setSaveMessage('')
      try {
        const nextUdinDetails = normalizeUdinDetails({
          ...fsData.udinDetails,
          sealAttachmentName: file.name,
          sealAttachmentDataUrl: String(reader.result || ''),
        })
        await persistUdinDetails(nextUdinDetails)
        setSaveMessage('CA seal attachment saved.')
        await showUpdatedAlert(
          'CA seal attachment',
          `<p><strong>${file.name}</strong> has been saved to UDIN details.</p>`,
        )
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Failed to save CA seal attachment.')
      } finally {
        setSaving(false)
      }
    }
    reader.onerror = () => setSaveMessage('Could not read the CA seal attachment file.')
    reader.readAsDataURL(file)
  }

  const selectedUdinCa = udinDetails.caProfileId
    ? caProfiles.find((profile) => profile.id === udinDetails.caProfileId) || null
    : null
  const effectivePrintCaProfile = selectedUdinCa
    ? {
        ...selectedUdinCa,
        udin: udinDetails.udinNumber || selectedUdinCa.udin,
        sealSignatureName:
          udinDetails.sealAttachmentName || selectedUdinCa.sealSignatureName,
        sealSignatureDataUrl:
          udinDetails.sealAttachmentDataUrl || selectedUdinCa.sealSignatureDataUrl,
      }
    : EMPTY_CA_PROFILE
  const printUdinDate = udinDetails.caProfileId ? udinDetails.udinDate : ''
  const printUdinApplicable = !isConsolidatedView && udinDetails.enabled && Boolean(udinDetails.caProfileId)
  const printUdinNumber = udinDetails.udinNumber || effectivePrintCaProfile.udin
  const hasPrintCaSeal = Boolean(normalizeSealDataUrl(effectivePrintCaProfile.sealSignatureDataUrl))
  const showPrintCaSigning =
    printUdinApplicable && hasPrintCaSeal && Boolean(effectivePrintCaProfile.id)
  const printClientSignatoryName =
    client.name?.trim() || (isConsolidatedView ? client.name : business?.name || client.name)
  const isUdinDetailsSelectedInPrintAll = Boolean(
    printAll && printAllSelectedTabs?.has('udin-details'),
  )
  const shouldRenderPrintUdinClosing =
    printAll &&
    udinDetails.enabled &&
    Boolean(udinDetails.caProfileId) &&
    isUdinDetailsSelectedInPrintAll
  const shouldUsePerPartCaSignoff =
    showPrintCaSigning && (printAll || resolvedActiveTab !== 'udin-details')

  const shouldRenderPrintPartCaSignoff = (
    tab: FsTab,
    options?: { force?: boolean },
  ) => {
    if (!showPrintCaSigning) {
      return false
    }
    if (tab === 'udin-details' || tab === 'final-info') {
      return false
    }

    if (options?.force) {
      return true
    }

    if (printAll) {
      return !printTabExtraClass(tab).includes('fs-print-tab-skip')
    }

    if (tab === 'notes') {
      return resolvedActiveTab === 'notes'
    }

    return resolvedActiveTab === tab
  }

  const renderPrintPartSignoff = (tab: FsTab, options?: { force?: boolean }) => {
    if (!shouldRenderPrintPartCaSignoff(tab, options)) {
      return null
    }

    const signoffClass =
      tab === 'balance-sheet' ? 'fs-print-ca-signoff--balance-sheet' : 'fs-print-ca-signoff--section'

    return (
      <div className="fs-print-part-signoff fs-print-only">
        {renderUdinSignBanner({ className: signoffClass })}
      </div>
    )
  }

  const onUdinSealPositionChange = async (offsetX: number, offsetY: number) => {
    if (!fsData || isFsReadOnly) {
      return
    }

    const nextUdinDetails = normalizeUdinDetails({
      ...fsData.udinDetails,
      sealOffsetX: offsetX,
      sealOffsetY: offsetY,
    })

    try {
      await persistUdinDetails(nextUdinDetails)
      setSaveMessage('Seal position saved.')
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Failed to save seal position.')
    }
  }

  const udinBannerClientName = isConsolidatedView
    ? client?.name?.trim() || ''
    : client?.name?.trim() || business?.name?.trim() || ''

  const renderUdinSignBanner = (options?: { editable?: boolean; className?: string }) => (
    <FsUdinSignBanner
      caProfile={effectivePrintCaProfile}
      clientName={udinBannerClientName}
      udinNumber={udinDetails.udinNumber || effectivePrintCaProfile.udin}
      udinDate={printUdinDate}
      sealOffsetX={udinDetails.sealOffsetX}
      sealOffsetY={udinDetails.sealOffsetY}
      editable={options?.editable}
      onSealPositionChange={
        options?.editable && !isFsReadOnly ? onUdinSealPositionChange : undefined
      }
      className={options?.className}
    />
  )

  const renderPrintUdinBlock = () => (
    <div className="fs-udin-print-block fs-print-only">
      <div className="fs-udin-print-summary">
        <p className="fs-udin-print-line">
          <span className="fs-udin-print-label">CA Name</span>
          <span className="fs-udin-print-value">
            {selectedUdinCa?.partnerName || udinDetails.caPartnerName || '—'}
          </span>
        </p>
        <p className="fs-udin-print-line">
          <span className="fs-udin-print-label">Firm Name</span>
          <span className="fs-udin-print-value">
            {selectedUdinCa?.firmName || udinDetails.caFirmName || '—'}
          </span>
        </p>
        <p className="fs-udin-print-line">
          <span className="fs-udin-print-label">UDIN Number</span>
          <span className="fs-udin-print-value">
            {udinDetails.udinNumber || effectivePrintCaProfile.udin || '—'}
          </span>
        </p>
        <p className="fs-udin-print-line">
          <span className="fs-udin-print-label">UDIN Date</span>
          <span className="fs-udin-print-value">
            {printUdinDate ? formatUdinDatePrint(printUdinDate) : '—'}
          </span>
        </p>
      </div>
      {renderUdinSignBanner({ className: 'fs-print-ca-signoff--tab' })}
    </div>
  )

  const renderNotesPrintSectionBlock = (section: (typeof NOTES_TABLE_SECTIONS)[number]) => (
    <div key={section.id} className="fs-notes-print-section-block">
      {renderNotesTableFieldRows(getNoteFieldsForTableSection(section))}
    </div>
  )

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
      className={`print-page fs-page ${printComparisonLayout}${isConsolidatedView ? ' fs-page--consolidated-readonly' : ''}${isFsFinalLocked ? ' fs-page--edit-locked' : ''}${printAll ? ' fs-print-all' : ''}${isNotesPrintOutput ? ' fs-print-notes-section' : ''}${isNotesOnlyPrintAll ? ' fs-print-notes-only' : ''}${isGstPrintOutput ? ' fs-print-gst-section' : ''}${isGstOnlyPrintAll ? ' fs-print-gst-only' : ''}${isBalanceSheetPrintOutput ? ' fs-print-balance-sheet' : ''}${isBalanceSheetOnlyPrintOutput ? ' fs-print-balance-sheet-only' : ''}${!printAll && resolvedActiveTab === 'udin-details' ? ' fs-print-udin-section' : ''}${!printAll && resolvedActiveTab === 'profit-loss' ? ' fs-print-report-profit-loss' : ''} fs-page--cash-adjust-banner`}
    >
      <FsPrintLayout
        documentTitle={formatFinancialStatementPageTitle(statementType)}
        client={client}
        business={business ?? null}
        isConsolidated={isConsolidatedView}
        fy={fy}
        activeTabLabel={printTitleForTab(resolvedActiveTab)}
        reportKind={printReportKind}
        printAll={printAll}
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
                    switchFsTab('gst-reco')
                  }
                }}
                disabled={isFsReadOnly}
              />
              <span>UDIN</span>
            </label>
          )}
          <label className="fs-print-option" title="Show value change column when printing">
            <input
              type="checkbox"
              checked={printValueChange}
              onChange={(event) => setPrintValueChange(event.target.checked)}
            />
            <span>Value change in print</span>
          </label>
          <label className="fs-print-option" title="Show % change column when printing">
            <input
              type="checkbox"
              checked={printPercentChange}
              onChange={(event) => setPrintPercentChange(event.target.checked)}
            />
            <span>% change in print</span>
          </label>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => void onPrintCurrent()}
            title="Open the print dialog for the current section"
          >
            Print
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => void onPrintAll()}
            title="Select sections and open the print dialog"
          >
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
          onStatementTypeChange={handleStatementTypeChange}
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
            className={displayTab === tab ? 'tab active' : 'tab'}
            onClick={() => switchFsTab(tab)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="fs-print-body fs-print-statement-format">
      {isTabMounted('notes') && printableTabSet.has('notes') && (
        <section
          className={`${tabPanelClass('notes')}${shouldPrintMergedNotes && !printAll ? ' fs-print-tab-skip' : ''}`}
          data-fs-tab="notes"
          data-print-title={printTitleForTab('notes')}
        >
          <h2>{notesLabel}</h2>
          <p className="hint">
            {isConsolidatedView ? (
              'Consolidated view shows each business in its own column with a Total column summing all businesses.'
            ) : (
              <>
                Notes are grouped into four sections. Open a section tab below to enter {currentFyLabel}{' '}
                figures. {previousFyLabel} amounts are shown for reference. Click a <strong>Note</strong>{' '}
                number to jump to the {balanceSheetLabel} (1–18) or {profitLossLabel} (19–24).
              </>
            )}
          </p>

          <div className="notes-section-nav">
            {NOTES_TABLE_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className="notes-section-nav-card"
                onClick={() => switchFsTab(section.tabId)}
              >
                <span className="notes-section-nav-range">{section.rangeLabel}</span>
                <span className="notes-section-nav-title">{section.title}</span>
                <span className="notes-section-nav-action">Open section →</span>
              </button>
            ))}
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

      {shouldPrintMergedNotes && mergedNoteSectionsForPrint.length > 0 ? (
        <section
          key="notes-merged-print"
          className={`${tabPanelClass(printAll ? (firstSelectedNoteSectionTab ?? 'notes') : 'notes')} fs-notes-section-tab-panel fs-notes-print-merged${!printAll && resolvedActiveTab === 'notes' ? ' fs-notes-print-merged--overview' : ''}`}
          data-fs-tab="notes"
          data-print-title={printTitleForTab('notes')}
        >
          {renderPrintSectionStationery('notes')}
          <div className="fs-print-part-shell">
            <div className="notes-tables-stack notes-print-notes-stack fs-print-part-body">
              {mergedNoteSectionsForPrint.map((section) => renderNotesPrintSectionBlock(section))}
            </div>
            {renderPrintPartSignoff(firstSelectedNoteSectionTab ?? 'notes', { force: true })}
          </div>
        </section>
      ) : (
        NOTES_TABLE_SECTIONS.map((section) =>
          isTabMounted(section.tabId) && printableTabSet.has(section.tabId) ? (
            <section
              key={section.id}
              className={`${tabPanelClass(section.tabId)} fs-notes-section-tab-panel`}
              data-fs-tab="notes"
              data-note-section={section.id}
              data-print-title={printTitleForTab(section.tabId)}
            >
              <h2>
                {notesLabel} — {section.title}
              </h2>
              <p className="hint">
                {isConsolidatedView ? (
                  'Consolidated view shows each business in its own column with a Total column summing all businesses.'
                ) : (
                  <>
                    {section.rangeLabel}: enter {currentFyLabel} figures below. {previousFyLabel} amounts are
                    for reference.
                  </>
                )}
              </p>

              {renderPrintSectionStationery(section.tabId)}

              <div className="fs-print-part-shell">
                <div className="fs-print-part-body">{renderNotesSectionTable(section)}</div>
                {renderPrintPartSignoff(section.tabId)}
              </div>
            </section>
          ) : null,
        )
      )}

      {isTabMounted('balance-sheet') && printableTabSet.has('balance-sheet') && fy && (
        <section
          className={tabPanelClass('balance-sheet')}
          data-fs-tab="balance-sheet"
          data-print-title={printTitleForTab('balance-sheet')}
        >
          <p className="hint">
            {isConsolidatedView ? (
              'Consolidated view shows each business in its own column with a Total column summing all businesses.'
            ) : (
              <>
                Layout per balance sheet format. Click any <strong>Note</strong> number to open the matching note for
                entry.
              </>
            )}
          </p>
          {renderPrintSectionStationery('balance-sheet')}
          <div className="fs-print-part-shell">
            <div className="fs-balance-sheet-print-body fs-print-part-body">
            <StatementTable
              title={`${balanceSheetLabel} — ${balanceSheetCurrentLabel}`}
              lines={displayBalanceSheetLines}
              wrapperClassName="statement-table-wrap--balance-sheet"
              currentLabel={balanceSheetCurrentColumnLabel}
              previousLabel={balanceSheetPreviousColumnLabel}
              showNoteColumn
              useStatementAmountFormat
              onNoteNavigate={navigateToNote}
              highlightedRowId={highlightedBsRow}
              printHeadSpacer={renderPrintHeadSpacer('balance-sheet')}
              printBanner={renderPrintTableBanner('balance-sheet')}
              consolidatedBusinessColumns={consolidatedBusinessColumns}
            />
            </div>
            {renderPrintPartSignoff('balance-sheet')}
          </div>
        </section>
      )}

      {isTabMounted('profit-loss') && printableTabSet.has('profit-loss') && fy && (
        <section
          className={tabPanelClass('profit-loss')}
          data-fs-tab="profit-loss"
          data-print-title={printTitleForTab('profit-loss')}
        >
          <p className="hint">
            {isConsolidatedView ? (
              'Consolidated view shows each business in its own column with a Total column summing all businesses.'
            ) : (
              <>
                Click any <strong>Note</strong> number to open the matching note for entry.
              </>
            )}
          </p>
          {renderPrintSectionStationery('profit-loss')}
          <div className="fs-print-part-shell">
          <div className="fs-profit-loss-print-body fs-print-part-body">
          <StatementTable
            title={`${profitLossLabel} — ${profitLossCurrentLabel}`}
            lines={displayProfitLossLines}
            wrapperClassName="statement-table-wrap--profit-loss"
            currentLabel={profitLossCurrentColumnLabel}
            previousLabel={profitLossPreviousColumnLabel}
            showNoteColumn
            useStatementAmountFormat
            onNoteNavigate={navigateToNote}
            highlightedRowId={highlightedPlRow}
            printHeadSpacer={renderPrintHeadSpacer('profit-loss')}
            printBanner={renderPrintTableBanner('profit-loss')}
            consolidatedBusinessColumns={consolidatedBusinessColumns}
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
                  <col className="pl-col-curr" />
                  <col className="pl-col-prev" />
                  <col className="pl-col-change" />
                  <col className="pl-col-pct" />
                </colgroup>
                <thead>
                  <tr className="pl-appr-head-row">
                    <th className="pl-appr-particular-col">Particular</th>
                    <th className="pl-appr-amount-col pl-appr-curr-col">
                      <span className="notes-fy-label">{profitLossCurrentColumnLabel}</span>
                    </th>
                    <th className="pl-appr-amount-col pl-appr-prev-col">
                      <span className="notes-fy-label">{profitLossPreviousColumnLabel}</span>
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
                        <td className="pl-appr-amount-col pl-appr-prev-col">
                          <div
                            className="note-prev-ref notes-admin-prev-ref"
                            title={`${previousFyLabel} — reference only`}
                          >
                            {previousRef ? formatAmount(previousRef) : '—'}
                          </div>
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
                    <td className="pl-appr-amount-col pl-appr-curr-col pl-appr-total-value">
                      {plAppropriationTotal.current
                        ? formatAmount(plAppropriationTotal.current)
                        : '—'}
                    </td>
                    <td className="pl-appr-amount-col pl-appr-prev-col pl-appr-total-value">
                      {plAppropriationTotal.previous
                        ? formatAmount(plAppropriationTotal.previous)
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
          {renderPrintPartSignoff('profit-loss')}
          </div>
        </section>
      )}

      {isTabMounted('depreciation') && printableTabSet.has('depreciation') && (
        <section
          className={tabPanelClass('depreciation')}
          data-fs-tab="depreciation"
          data-print-title={printTitleForTab('depreciation')}
        >
          {renderPrintSectionStationery('depreciation')}
          <div className="fs-print-part-shell">
          <div className="fs-print-part-body">
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
                  {renderPrintHeadSpacer('depreciation')}
                  {renderPrintTableBanner('depreciation')}
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
                    {!isFsReadOnly && <td className="dep-actions-col" aria-hidden="true" />}
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
                    {!isFsReadOnly && <td className="dep-actions-col" aria-hidden="true" />}
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
          </div>
          {renderPrintPartSignoff('depreciation')}
          </div>
        </section>
      )}

      {isTabMounted('repayment') && printableTabSet.has('repayment') && (
        <section
          className={tabPanelClass('repayment')}
          data-fs-tab="repayment"
          data-print-title={printTitleForTab('repayment')}
        >
          {renderPrintSectionStationery('repayment')}
          <div className="fs-print-part-shell">
          <div className="fs-print-part-body">
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
                    {loan.monthlySchedule.length > 0 ? (
                      <div className={`loan-emi-schedule${expanded ? ' is-expanded' : ''}`}>
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
                      </div>
                    ) : expanded ? (
                      <p className="loan-emi-empty">No EMI rows generated for this financial year.</p>
                    ) : null}
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
          </div>
          {renderPrintPartSignoff('repayment')}
          </div>
        </section>
      )}

      {isTabMounted('bank-account') && printableTabSet.has('bank-account') && (
        <section
          className={tabPanelClass('bank-account')}
          data-fs-tab="bank-account"
          data-print-title={printTitleForTab('bank-account')}
        >
          {renderPrintSectionStationery('bank-account')}
          <div className="fs-print-part-shell">
          <div className="fs-print-part-body">
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

          {visibleBankAccounts.length === 0 ? (
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
                  <col className="bank-col-started" />
                  <col className="bank-col-amount" />
                  <col className="bank-col-amount" />
                  <col className="bank-col-amount" />
                  <col className="bank-col-amount" />
                  <col className="bank-col-amount bank-col-interest" />
                  <col className="bank-col-closing" />
                  <col className="bank-col-closing" />
                </colgroup>
                <thead>
                  {renderPrintHeadSpacer('bank-account')}
                  {renderPrintTableBanner('bank-account')}
                  <tr>
                    <th className="bank-col-name">Bank Name</th>
                    <th className="bank-col-number">A/c No.</th>
                    <th className="bank-col-type">Type</th>
                    <th className="bank-col-status">Status</th>
                    <th className="bank-col-started">Started FY</th>
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
                  {visibleBankAccounts.map((account) => {
                    const debitClosing = getDebitClosingAmount(account.closingBalance)
                    const creditClosing = getCreditClosingAmount(account.closingBalance)
                    const isClosed = !isBankAccountActive(account)
                    const isHighlighted = highlightedBankId === account.id
                    const showCloseHint = shouldOfferCloseBankAccount(account)
                    return (
                      <tr
                        key={account.id}
                        id={`bank-row-${account.id}`}
                        className={`bank-data-row${isClosed ? ' bank-data-row-closed' : ''}${isHighlighted ? ' bank-row-highlight' : ''}`}
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
                                title={
                                  showCloseHint
                                    ? 'Edit bank — set Status to Closed to stop in later years'
                                    : 'Edit bank details'
                                }
                                aria-label="Edit bank"
                              >
                                ✎
                              </button>
                              {canDeleteBankAccount(account) ? (
                              <button
                                type="button"
                                className="bank-icon-btn bank-icon-btn-danger"
                                onClick={() => void deleteBank(account.id)}
                                title="Delete bank account from all years"
                                aria-label="Delete bank"
                              >
                                ×
                              </button>
                              ) : null}
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
                                ? 'Closed — will not appear in later financial years'
                                : showCloseHint
                                  ? 'Has figures in one or more years — use Edit → Closed to stop in later years'
                                  : 'Active — appears in this and later financial years until closed'
                            }
                          >
                            {getBankAccountStatusLabel(account.status)}
                          </span>
                        </td>
                        <td className="bank-col-started">
                          <span
                            className="bank-started-fy"
                            title="Financial year from which this account appears in statements"
                          >
                            {formatBankAccountStartedFyLabel(
                              account,
                              client?.financialYears ?? [],
                              account.startedInFyId || fyId,
                            )}
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
                    <td colSpan={5} className="bank-total-label">
                      Total
                    </td>
                    <td className="bank-col-amount">
                      {formatAmount(sumBankAccountColumn(visibleBankAccounts, 'openingBalance'))}
                    </td>
                    <td className="bank-col-amount bank-col-debit bank-total-value">
                      {formatAmount(sumBankAccountColumn(visibleBankAccounts, 'debit'))}
                    </td>
                    <td className="bank-col-amount bank-col-credit bank-total-value">
                      {formatAmount(sumBankAccountColumn(visibleBankAccounts, 'credit'))}
                    </td>
                    <td className="bank-col-amount">
                      {formatAmount(sumBankAccountColumn(visibleBankAccounts, 'bankCharge'))}
                    </td>
                    <td className="bank-col-amount">
                      {formatAmount(sumBankAccountColumn(visibleBankAccounts, 'interest'))}
                    </td>
                    <td className="bank-col-amount bank-col-closing bank-col-debit bank-total-value">
                      {formatAmount(sumBankDebitClosingBalances(visibleBankAccounts))}
                    </td>
                    <td className="bank-col-amount bank-col-closing bank-col-credit bank-total-value">
                      {formatAmount(sumBankCreditClosingBalances(visibleBankAccounts))}
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
                          {formatAmount(sumBankCreditClosingBalances(visibleBankAccounts))}
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
                          {formatAmount(sumBankDebitClosingBalances(visibleBankAccounts))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            </>
          )}
          </div>
          {renderPrintPartSignoff('bank-account')}
          </div>
        </section>
      )}

      {isTabMounted('gst-reco') && printableTabSet.has('gst-reco') && (
        <section
          className={tabPanelClass('gst-reco')}
          data-fs-tab="gst-reco"
          data-print-title={printTitleForTab('gst-reco')}
        >
        {renderPrintSectionStationery('gst-reco')}
        <div className="fs-print-part-shell">
        <div className="fs-print-part-body">
        <GstRecoTab
          gstReco={fsData.gstReco}
          savedGstReco={lastSavedGstReco ?? undefined}
          fyLabel={currentFyLabel}
          clientId={clientId}
          businessId={businessId}
          fyId={fyId}
          salesFromBooks={
            effectiveNotes?.revenueFromOperations.current ??
            fsData.notes.revenueFromOperations.current
          }
          gstSalesInNote={getGstTaxableSalesTotal(fsData.gstReco)}
          dbRefreshKey={gstRecoDbRefreshKey}
          fsSavedAt={fsData.savedAt ?? undefined}
          onOpenRevenueNote={() => navigateToNote('revenueFromOperations')}
          onChange={updateGstReco}
          printHeadSpacer={(colSpan) => renderPrintHeadSpacer('gst-reco', colSpan)}
          printBanner={(colSpan) => renderPrintTableBanner('gst-reco', colSpan)}
        />
        </div>
        {renderPrintPartSignoff('gst-reco')}
        </div>
        </section>
      )}
      {isTabMounted('udin-details') && printableTabSet.has('udin-details') && (
        <section
          className={`${tabPanelClass('udin-details')}${shouldRenderPrintUdinClosing ? ' fs-print-tab-skip' : ''}`}
          data-fs-tab="udin-details"
          data-print-title={printTitleForTab('udin-details')}
        >
          {renderPrintSectionStationery('udin-details')}
          {!printAll && udinDetails.enabled && udinDetails.caProfileId ? (
            <div className="fs-print-part-shell">
              <div className="fs-print-part-body">{renderPrintUdinBlock()}</div>
            </div>
          ) : null}
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
                  const nextPatch: Partial<UdinDetails> = {
                    caProfileId: event.target.value,
                    caPartnerName: profile?.partnerName || '',
                    caFirmName: profile?.firmName || '',
                  }
                  if (
                    profile &&
                    !udinDetails.sealAttachmentDataUrl &&
                    !udinDetails.sealAttachmentName
                  ) {
                    nextPatch.sealAttachmentName = profile.sealSignatureName || ''
                    nextPatch.sealAttachmentDataUrl = profile.sealSignatureDataUrl || ''
                  }
                  updateUdinDetails(nextPatch)
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
            <label>
              CA Seal attachment
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(event) => {
                  void onUdinSealAttachmentChange(event.target.files?.[0] ?? null)
                  event.target.value = ''
                }}
                disabled={isFsReadOnly || saving}
              />
              {udinDetails.sealAttachmentName ? (
                <span className="fs-udin-file-name">{udinDetails.sealAttachmentName}</span>
              ) : selectedUdinCa?.sealSignatureName ? (
                <span className="fs-udin-file-hint">
                  Using seal from CA profile: {selectedUdinCa.sealSignatureName}
                </span>
              ) : (
                <span className="fs-udin-file-hint">Attach seal image for print (PNG, JPG, etc.)</span>
              )}
            </label>
          </div>

          {udinDetails.enabled && udinDetails.caProfileId && (
            <div className="fs-udin-banner-editor">
              <h3>Document sign-off banner</h3>
              <p className="hint">
                This banner prints directly below each part&apos;s content table — on the same page
                when the part fits one page, or on the last page when the part spans multiple pages.
                Attach a seal image before printing. Drag the seal anywhere inside the banner to
                adjust its position.
              </p>
              {renderUdinSignBanner({ editable: !isFsReadOnly })}
            </div>
          )}
        </section>
      )}
      {shouldRenderPrintUdinClosing && (
        <section
          className="fs-print-udin-closing fs-print-only"
          data-fs-tab="udin-details"
          data-print-title={printTitleForTab('udin-details')}
        >
          {renderPrintSectionStationery('udin-details')}
          <div className="fs-print-part-shell">
          <div className="fs-print-part-body">
          {renderPrintUdinBlock()}
          </div>
          </div>
        </section>
      )}
      </div>

      {!shouldUsePerPartCaSignoff && (
        <PrintFooter
          clientName={printClientSignatoryName}
          showCaSigning={showPrintCaSigning}
          caProfile={effectivePrintCaProfile}
          udinNumber={printUdinNumber}
          udinDate={printUdinDate}
          sealOffsetX={udinDetails.sealOffsetX}
          sealOffsetY={udinDetails.sealOffsetY}
          variant={showPrintCaSigning ? 'ca' : 'client'}
        />
      )}

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
                      <th>{currentFyLabel}</th>
                      <th>{previousFyLabel}</th>
                      <th>Change</th>
                      <th>% Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finalInfoSummaryRows.map((row) => (
                      <tr key={row.label}>
                        <td>{row.label}</td>
                        <td>{formatAmount(row.current)}</td>
                        <td>{formatAmount(row.previous)}</td>
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
          financialYears={client?.financialYears ?? []}
          existingAccounts={fsData.bankAccounts}
          allBusinessAccounts={allKnownBankAccounts}
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
              <button type="button" className="primary-btn" onClick={() => void onConfirmPrintAll()}>
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
                      <th className="fs-qe-col-amount">{notesCurrentColumnLabel}</th>
                      <th className="fs-qe-col-amount">{notesPreviousColumnLabel}</th>
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
