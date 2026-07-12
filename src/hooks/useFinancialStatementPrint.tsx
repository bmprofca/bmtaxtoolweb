import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import FsPrintSectionStationery from '../components/FsPrintSectionStationery'
import FsPrintTableBannerRow, {
  FsPrintHeadSpacerRow,
  FsPrintStationeryTable,
} from '../components/FsPrintTableBannerRow'
import type { Client, FinancialYear } from '../types'
import type { PrintBusinessInfo } from '../print/types'
import { formatPrintReportPeriod } from '../utils/financialYear'
import { isNoteSectionTab, NOTE_SECTION_TAB_IDS, NOTES_TABLE_SECTIONS } from '../utils/fsDefaults'

export type FsPrintTab =
  | 'balance-sheet'
  | 'profit-loss'
  | 'notes'
  | (typeof NOTE_SECTION_TAB_IDS)[number]
  | 'depreciation'
  | 'repayment'
  | 'bank-account'
  | 'gst-reco'
  | 'final-info'
  | 'udin-details'

export const PRINT_ALL_TAB_ORDER: FsPrintTab[] = [
  'balance-sheet',
  'profit-loss',
  'notes',
  ...NOTE_SECTION_TAB_IDS,
  'depreciation',
  'bank-account',
  'repayment',
  'gst-reco',
  'udin-details',
]

/**
 * Print All: each section opens with client details + report title (section stationery).
 * Single-section print: client + title in FsPrintLayout page header.
 */
export function useFinancialStatementPrint({
  printableTabSet,
  tabHasPrintContent,
  resolvedActiveTab,
  printTitleForTab,
  fy,
  client,
  business,
  isConsolidatedView,
}: {
  printableTabSet: Set<FsPrintTab>
  tabHasPrintContent: (tab: FsPrintTab) => boolean
  resolvedActiveTab: FsPrintTab
  printTitleForTab: (tab: FsPrintTab) => string
  fy: FinancialYear | null | undefined
  client: Client
  business: PrintBusinessInfo | null
  isConsolidatedView: boolean
}) {
  const [printAll, setPrintAll] = useState(false)
  const [printAllModalOpen, setPrintAllModalOpen] = useState(false)
  const [printAllSelection, setPrintAllSelection] = useState<Set<FsPrintTab>>(new Set())
  const [printAllSelectedTabs, setPrintAllSelectedTabs] = useState<Set<FsPrintTab> | null>(null)
  const [printAllSelectionError, setPrintAllSelectionError] = useState('')
  const [printValueChange, setPrintValueChange] = useState(false)
  const [printPercentChange, setPrintPercentChange] = useState(false)

  const printComparisonLayout = useMemo(() => {
    if (printValueChange && printPercentChange) return 'fs-print-cols-both'
    if (printValueChange) return 'fs-print-cols-change'
    if (printPercentChange) return 'fs-print-cols-pct'
    return 'fs-print-cols-none'
  }, [printValueChange, printPercentChange])

  const printableTabsInPrintOrder = useMemo(
    () => PRINT_ALL_TAB_ORDER.filter((tab) => printableTabSet.has(tab) && tabHasPrintContent(tab)),
    [printableTabSet, tabHasPrintContent],
  )

  const selectedPrintTabsInOrder = useMemo(
    () =>
      printAllSelectedTabs
        ? printableTabsInPrintOrder.filter((tab) => printAllSelectedTabs.has(tab))
        : printableTabsInPrintOrder,
    [printAllSelectedTabs, printableTabsInPrintOrder],
  )

  const firstPrintableTabInAll = selectedPrintTabsInOrder[0]

  const isNotesRelatedTab = useCallback((tab: FsPrintTab) => tab === 'notes' || isNoteSectionTab(tab), [])

  const hidePrintHeader = printAll

  const isNotesPrintOutput =
    (!printAll && isNotesRelatedTab(resolvedActiveTab)) ||
    (printAll && Boolean(printAllSelectedTabs?.has('notes'))) ||
    (printAll && NOTE_SECTION_TAB_IDS.some((tab) => printAllSelectedTabs?.has(tab)))

  const isNotesOnlyPrintAll =
    printAll &&
    (Boolean(printAllSelectedTabs?.has('notes')) ||
      NOTE_SECTION_TAB_IDS.some((tab) => printAllSelectedTabs?.has(tab))) &&
    selectedPrintTabsInOrder.every((tab) => isNotesRelatedTab(tab))

  const isGstPrintOutput = !printAll && resolvedActiveTab === 'gst-reco'

  const isGstOnlyPrintAll =
    printAll &&
    Boolean(printAllSelectedTabs?.has('gst-reco')) &&
    selectedPrintTabsInOrder.every((tab) => tab === 'gst-reco')

  const isBalanceSheetPrintOutput =
    (!printAll && resolvedActiveTab === 'balance-sheet') ||
    (printAll && Boolean(printAllSelectedTabs?.has('balance-sheet')))

  const isBalanceSheetOnlyPrintOutput =
    (!printAll && resolvedActiveTab === 'balance-sheet') ||
    (printAll &&
      Boolean(printAllSelectedTabs?.has('balance-sheet')) &&
      selectedPrintTabsInOrder.length === 1 &&
      selectedPrintTabsInOrder[0] === 'balance-sheet')

  const isTabSelectedForPrint = useCallback(
    (tab: FsPrintTab) =>
      printableTabSet.has(tab) && tabHasPrintContent(tab) && (!printAllSelectedTabs || printAllSelectedTabs.has(tab)),
    [printableTabSet, printAllSelectedTabs, tabHasPrintContent],
  )

  const selectedNoteSectionsInPrintOrder = useMemo(
    () => NOTES_TABLE_SECTIONS.filter((section) => isTabSelectedForPrint(section.tabId as FsPrintTab)),
    [isTabSelectedForPrint],
  )

  const firstSelectedNoteSectionTab = selectedPrintTabsInOrder.find((tab) => isNoteSectionTab(tab))

  /** Continuous merged notes: Print All with sections selected, or Print Current on Notes overview. */
  const shouldPrintMergedNotes =
    (printAll && selectedNoteSectionsInPrintOrder.length > 0) ||
    (!printAll && resolvedActiveTab === 'notes')

  const shouldMergeNotesSectionsForPrintAll = shouldPrintMergedNotes

  const mergedNoteSectionsForPrint = useMemo(() => {
    if (!printAll && resolvedActiveTab === 'notes') {
      return NOTES_TABLE_SECTIONS
    }
    return selectedNoteSectionsInPrintOrder
  }, [printAll, resolvedActiveTab, selectedNoteSectionsInPrintOrder])

  const resolveNotesPrintTitle = useCallback(() => printTitleForTab('notes'), [printTitleForTab])

  const shouldRenderNotesTableStationery = useCallback(
    (tab: FsPrintTab) =>
      printAll && !isNotesOnlyPrintAll && shouldPrintMergedNotes && tab === 'notes',
    [isNotesOnlyPrintAll, printAll, shouldPrintMergedNotes],
  )

  const printReportKindForTab = useCallback(
    (tab: FsPrintTab): 'balance-sheet' | 'profit-loss' | 'notes' | 'other' => {
      if (tab === 'balance-sheet') return 'balance-sheet'
      if (tab === 'profit-loss') return 'profit-loss'
      if (tab === 'notes' || isNoteSectionTab(tab)) return 'notes'
      return 'other'
    },
    [],
  )

  const showClientDetailsInSectionHeader = useCallback((_tab?: FsPrintTab) => printAll, [printAll])

  const shouldRenderSectionStationery = useCallback(() => Boolean(fy) && printAll, [fy, printAll])

  const shouldRenderPrintTableBanner = useCallback(() => false, [])

  const shouldRenderPrintHeadSpacer = useCallback(() => false, [])

  const renderPrintHeadSpacer = useCallback(
    (_tab: FsPrintTab, colSpan = 1) => {
      if (!shouldRenderPrintHeadSpacer()) return null
      return <FsPrintHeadSpacerRow colSpan={colSpan} />
    },
    [shouldRenderPrintHeadSpacer],
  )

  const renderPrintTableBanner = useCallback(
    (tab: FsPrintTab, colSpan = 1) => {
      if (!shouldRenderPrintTableBanner() || !fy) return null
      const title = tab === 'notes' ? resolveNotesPrintTitle() : printTitleForTab(tab)
      return (
        <FsPrintTableBannerRow
          colSpan={colSpan}
          client={client}
          business={business}
          isConsolidated={isConsolidatedView}
          title={title}
          period={formatPrintReportPeriod(printReportKindForTab(tab), fy)}
          showClientDetails={showClientDetailsInSectionHeader(tab)}
        />
      )
    },
    [
      business,
      client,
      fy,
      isConsolidatedView,
      printReportKindForTab,
      printTitleForTab,
      resolveNotesPrintTitle,
      shouldRenderPrintTableBanner,
      showClientDetailsInSectionHeader,
    ],
  )

  const renderPrintStationeryBlock = useCallback(
    (tab: FsPrintTab): ReactNode => {
      const spacer = renderPrintHeadSpacer(tab)
      const banner = renderPrintTableBanner(tab)
      if (!spacer && !banner) return null
      return (
        <FsPrintStationeryTable>
          {spacer}
          {banner}
        </FsPrintStationeryTable>
      )
    },
    [renderPrintHeadSpacer, renderPrintTableBanner],
  )

  const renderPrintSectionStationery = useCallback(
    (tab: FsPrintTab) => {
      if (!shouldRenderSectionStationery() || !fy) return null
      return (
        <FsPrintSectionStationery
          client={client}
          business={business}
          isConsolidated={isConsolidatedView}
          title={printTitleForTab(tab)}
          period={formatPrintReportPeriod(printReportKindForTab(tab), fy)}
          showClientDetails={showClientDetailsInSectionHeader(tab)}
        />
      )
    },
    [
      business,
      client,
      fy,
      isConsolidatedView,
      printReportKindForTab,
      printTitleForTab,
      shouldRenderSectionStationery,
      showClientDetailsInSectionHeader,
    ],
  )

  const printTabExtraClass = useCallback(
    (tab: FsPrintTab) => {
      if (!printAll) return ''
      if (
        tab === 'final-info' ||
        !printableTabSet.has(tab) ||
        !tabHasPrintContent(tab) ||
        (printAllSelectedTabs && !printAllSelectedTabs.has(tab))
      ) {
        return ' fs-print-tab-skip'
      }
      if (tab === 'notes' && firstSelectedNoteSectionTab) {
        return ' fs-print-tab-skip'
      }
      if (shouldMergeNotesSectionsForPrintAll && isNoteSectionTab(tab) && tab !== firstSelectedNoteSectionTab) {
        return ' fs-print-tab-skip'
      }
      if (tab !== firstPrintableTabInAll) {
        return ' fs-print-section-break'
      }
      return ''
    },
    [
      firstPrintableTabInAll,
      firstSelectedNoteSectionTab,
      printAll,
      printAllSelectedTabs,
      printableTabSet,
      shouldMergeNotesSectionsForPrintAll,
      tabHasPrintContent,
    ],
  )

  useEffect(() => {
    const onAfterPrint = () => {
      setPrintAll(false)
      setPrintAllSelectedTabs(null)
    }
    window.addEventListener('afterprint', onAfterPrint)
    return () => window.removeEventListener('afterprint', onAfterPrint)
  }, [])

  const runPrintOutput = useCallback(() => {
    window.print()
  }, [])

  const handlePrint = useCallback(
    (mode: 'current' | 'all') => {
      if (mode === 'all') {
        setPrintAllSelection(new Set(printableTabsInPrintOrder))
        setPrintAllSelectionError('')
        setPrintAllModalOpen(true)
        return
      }
      setPrintAll(false)
      setPrintAllSelectedTabs(null)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => runPrintOutput())
      })
    },
    [printableTabsInPrintOrder, runPrintOutput],
  )

  const expandNotesHubSelection = useCallback((selection: Set<FsPrintTab>) => {
    const expanded = new Set(selection)
    if (expanded.has('notes')) {
      NOTE_SECTION_TAB_IDS.forEach((sectionTab) => expanded.add(sectionTab))
    }
    return expanded
  }, [])

  const togglePrintAllSelection = useCallback((tab: FsPrintTab) => {
    setPrintAllSelection((current) => {
      const next = new Set(current)
      if (tab === 'notes') {
        if (next.has('notes')) {
          next.delete('notes')
          NOTE_SECTION_TAB_IDS.forEach((sectionTab) => next.delete(sectionTab))
        } else {
          next.add('notes')
          NOTE_SECTION_TAB_IDS.forEach((sectionTab) => next.add(sectionTab))
        }
        return next
      }
      if (isNoteSectionTab(tab)) {
        if (next.has(tab)) {
          next.delete(tab)
          next.delete('notes')
        } else {
          next.add(tab)
          if (NOTE_SECTION_TAB_IDS.every((sectionTab) => next.has(sectionTab))) {
            next.add('notes')
          }
        }
        return next
      }
      if (next.has(tab)) {
        next.delete(tab)
      } else {
        next.add(tab)
      }
      return next
    })
    setPrintAllSelectionError('')
  }, [])

  const confirmPrintAll = useCallback(() => {
    if (printAllSelection.size === 0) {
      setPrintAllSelectionError('Select at least one section to print.')
      return
    }
    setPrintAllSelectedTabs(expandNotesHubSelection(printAllSelection))
    setPrintAll(true)
    setPrintAllModalOpen(false)
    setPrintAllSelectionError('')
    requestAnimationFrame(() => {
      requestAnimationFrame(() => runPrintOutput())
    })
  }, [expandNotesHubSelection, printAllSelection, runPrintOutput])

  return {
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
    selectedPrintTabsInOrder,
    firstPrintableTabInAll,
    hidePrintHeader,
    isNotesPrintOutput,
    isNotesOnlyPrintAll,
    isGstPrintOutput,
    isGstOnlyPrintAll,
    isBalanceSheetPrintOutput,
    isBalanceSheetOnlyPrintOutput,
    isNotesRelatedTab,
    isTabSelectedForPrint,
    selectedNoteSectionsInPrintOrder,
    mergedNoteSectionsForPrint,
    firstSelectedNoteSectionTab,
    shouldMergeNotesSectionsForPrintAll,
    shouldPrintMergedNotes,
    shouldRenderNotesTableStationery,
    resolveNotesPrintTitle,
    renderPrintHeadSpacer,
    renderPrintTableBanner,
    renderPrintStationeryBlock,
    renderPrintSectionStationery,
    printTabExtraClass,
    handlePrint,
    togglePrintAllSelection,
    confirmPrintAll,
  }
}
