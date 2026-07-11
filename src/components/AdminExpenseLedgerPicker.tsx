import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import type { LedgerRecord } from '../types/ledger'
import {
  findDuplicateLedger,
  getLedgersForGroup,
  getUnusedAdminExpenseLedgers,
  normalizeLedgers,
} from '../utils/ledgerUtils'
import { createLedger, fetchLedgers, invalidateLedgersCache } from '../api/ledger'
import './AdminExpenseLedgerPicker.css'

interface AdminExpenseLedgerPickerProps {
  ledgers: LedgerRecord[]
  usedCategoryIds: string[]
  onSelect: (categoryId: string) => void
  onLedgersUpdated: (ledgers: LedgerRecord[]) => void
}

const PANEL_WIDTH = 352
const VIEWPORT_PADDING = 12

function normalizeSearch(value: string) {
  return value.trim().toLowerCase()
}

export function AdminExpenseLedgerPicker({
  ledgers,
  usedCategoryIds,
  onSelect,
  onLedgersUpdated,
}: AdminExpenseLedgerPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})

  const unusedLedgers = useMemo(
    () => getUnusedAdminExpenseLedgers(ledgers, usedCategoryIds),
    [ledgers, usedCategoryIds],
  )

  const allAdminLedgers = useMemo(
    () => getLedgersForGroup(ledgers, 'otherAdministrativeExpenses'),
    [ledgers],
  )

  const usedIdSet = useMemo(() => new Set(usedCategoryIds), [usedCategoryIds])

  const normalizedQuery = normalizeSearch(query)

  const filteredUnusedLedgers = useMemo(() => {
    if (!normalizedQuery) {
      return unusedLedgers
    }
    return unusedLedgers.filter((ledger) =>
      ledger.name.toLowerCase().includes(normalizedQuery),
    )
  }, [unusedLedgers, normalizedQuery])

  const usedMatches = useMemo(() => {
    if (!normalizedQuery) {
      return []
    }
    return allAdminLedgers.filter(
      (ledger) =>
        usedIdSet.has(ledger.id) && ledger.name.toLowerCase().includes(normalizedQuery),
    )
  }, [allAdminLedgers, normalizedQuery, usedIdSet])

  const exactUnusedMatch = useMemo(
    () =>
      unusedLedgers.find((ledger) => ledger.name.trim().toLowerCase() === normalizedQuery),
    [unusedLedgers, normalizedQuery],
  )

  const exactUsedMatch = useMemo(
    () =>
      allAdminLedgers.find(
        (ledger) =>
          usedIdSet.has(ledger.id) && ledger.name.trim().toLowerCase() === normalizedQuery,
      ),
    [allAdminLedgers, normalizedQuery, usedIdSet],
  )

  const exactLedgerExists = useMemo(
    () =>
      allAdminLedgers.find((ledger) => ledger.name.trim().toLowerCase() === normalizedQuery),
    [allAdminLedgers, normalizedQuery],
  )

  const exactDuplicateUnused = useMemo(() => {
    if (!normalizedQuery) {
      return undefined
    }
    const duplicate = findDuplicateLedger(ledgers, {
      id: '',
      name: query.trim(),
      group: 'otherAdministrativeExpenses',
    })
    if (!duplicate || usedIdSet.has(duplicate.id)) {
      return undefined
    }
    return duplicate
  }, [ledgers, normalizedQuery, query, usedIdSet])

  const canCreateFromQuery = Boolean(
    normalizedQuery &&
      !exactUnusedMatch &&
      !exactUsedMatch &&
      !exactDuplicateUnused &&
      !findDuplicateLedger(ledgers, {
        id: '',
        name: query.trim(),
        group: 'otherAdministrativeExpenses',
      }),
  )

  const showCreateAction = canCreateFromQuery
  const showUseExistingAction = Boolean(exactDuplicateUnused)
  const trimmedQuery = query.trim()

  const updatePanelPosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) {
      return
    }

    const rect = trigger.getBoundingClientRect()
    const width = Math.min(PANEL_WIDTH, window.innerWidth - VIEWPORT_PADDING * 2)
    const panelHeight = panelRef.current?.offsetHeight ?? 320

    let left = rect.left
    if (left + width > window.innerWidth - VIEWPORT_PADDING) {
      left = window.innerWidth - VIEWPORT_PADDING - width
    }
    left = Math.max(VIEWPORT_PADDING, left)

    let top = rect.bottom + 8
    if (top + panelHeight > window.innerHeight - VIEWPORT_PADDING) {
      top = Math.max(VIEWPORT_PADDING, rect.top - panelHeight - 8)
    }

    setPanelStyle({
      position: 'fixed',
      top,
      left,
      width,
      zIndex: 10050,
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      return
    }

    updatePanelPosition()

    const handleReposition = () => {
      updatePanelPosition()
    }

    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)

    return () => {
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [
    open,
    query,
    error,
    filteredUnusedLedgers.length,
    usedMatches.length,
    showCreateAction,
    showUseExistingAction,
    updatePanelPosition,
  ])

  useEffect(() => {
    if (!open) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (containerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return
      }
      setOpen(false)
      setQuery('')
      setError('')
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        setQuery('')
        setError('')
      }
    }

    const timeoutId = window.setTimeout(() => {
      searchInputRef.current?.focus()
    }, 0)

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      window.clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const closePicker = () => {
    setOpen(false)
    setQuery('')
    setError('')
  }

  const handleSelect = (categoryId: string) => {
    onSelect(categoryId)
    closePicker()
  }

  const handleCreateLedger = async () => {
    const name = trimmedQuery
    if (!name || creating) {
      return
    }

    if (exactDuplicateUnused) {
      handleSelect(exactDuplicateUnused.id)
      return
    }

    const duplicate = findDuplicateLedger(ledgers, {
      id: '',
      name,
      group: 'otherAdministrativeExpenses',
    })

    if (duplicate) {
      if (!usedIdSet.has(duplicate.id)) {
        handleSelect(duplicate.id)
        return
      }
      setError(`"${duplicate.name}" is already in this statement.`)
      return
    }

    setCreating(true)
    setError('')

    try {
      invalidateLedgersCache()
      const result = await createLedger({
        name,
        group: 'otherAdministrativeExpenses',
        sign: 'add',
      })

      const fresh = await fetchLedgers({ fresh: true })
      const normalized = normalizeLedgers(fresh.ledgers)
      onLedgersUpdated(normalized)

      if (usedIdSet.has(result.ledger.id)) {
        setError(`"${result.ledger.name}" is already in this statement.`)
        return
      }

      handleSelect(result.ledger.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add ledger')
    } finally {
      setCreating(false)
    }
  }

  const panel = open ? (
    <div
      ref={panelRef}
      className="admin-expense-picker-panel admin-expense-picker-panel--floating"
      style={panelStyle}
      role="dialog"
      aria-label="Add administrative expense"
    >
      <div className="admin-expense-picker-header">
        <span className="admin-expense-picker-title">Add expense line</span>
        <span className="admin-expense-picker-subtitle">Note 23 · Other Administrative Expenses</span>
      </div>

      <div className="admin-expense-picker-search">
        <span className="admin-expense-picker-search-icon" aria-hidden="true">
          ⌕
        </span>
        <input
          ref={searchInputRef}
          type="search"
          className="admin-expense-picker-search-input"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setError('')
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && showCreateAction) {
              event.preventDefault()
              void handleCreateLedger()
            }
          }}
          placeholder="Search or type a new expense name..."
          autoComplete="off"
        />
      </div>

      {error ? <p className="admin-expense-picker-error">{error}</p> : null}

      <div className="admin-expense-picker-results" role="listbox">
        {filteredUnusedLedgers.length > 0 ? (
          <div className="admin-expense-picker-section">
            {!normalizedQuery ? (
              <p className="admin-expense-picker-section-label">Available ledgers</p>
            ) : null}
            {filteredUnusedLedgers.map((ledger) => (
              <button
                key={ledger.id}
                type="button"
                role="option"
                className="admin-expense-picker-option"
                onClick={() => handleSelect(ledger.id)}
              >
                <span className="admin-expense-picker-option-name">{ledger.name}</span>
              </button>
            ))}
          </div>
        ) : null}

        {usedMatches.length > 0 ? (
          <div className="admin-expense-picker-section">
            <p className="admin-expense-picker-section-label">Already in this statement</p>
            {usedMatches.map((ledger) => (
              <div key={ledger.id} className="admin-expense-picker-option is-disabled">
                <span className="admin-expense-picker-option-name">{ledger.name}</span>
                <span className="admin-expense-picker-badge">Added</span>
              </div>
            ))}
          </div>
        ) : null}

        {showUseExistingAction && exactDuplicateUnused ? (
          <button
            type="button"
            className="admin-expense-picker-create admin-expense-picker-create--existing"
            onClick={() => handleSelect(exactDuplicateUnused.id)}
          >
            <span className="admin-expense-picker-create-icon" aria-hidden="true">
              ✓
            </span>
            <span className="admin-expense-picker-create-text">
              Use existing ledger &quot;{exactDuplicateUnused.name}&quot;
            </span>
          </button>
        ) : null}

        {showCreateAction ? (
          <button
            type="button"
            className="admin-expense-picker-create"
            onClick={() => void handleCreateLedger()}
            disabled={creating}
          >
            <span className="admin-expense-picker-create-icon" aria-hidden="true">
              +
            </span>
            <span className="admin-expense-picker-create-text">
              {creating ? 'Adding to ledger...' : `Add "${trimmedQuery}" to Ledger`}
            </span>
          </button>
        ) : null}

        {!filteredUnusedLedgers.length &&
        !usedMatches.length &&
        !showCreateAction &&
        normalizedQuery ? (
          <p className="admin-expense-picker-empty">
            {exactLedgerExists && exactUsedMatch
              ? `"${exactUsedMatch.name}" is already in this statement.`
              : 'No matching ledgers found.'}
          </p>
        ) : null}

        {!normalizedQuery && !unusedLedgers.length ? (
          <p className="admin-expense-picker-hint">
            All existing categories are in use. Type a name above to create a new ledger item.
          </p>
        ) : null}
      </div>
    </div>
  ) : null

  return (
    <div
      className={`admin-expense-picker${open ? ' is-open' : ''}`}
      ref={containerRef}
    >
      <button
        ref={triggerRef}
        type="button"
        className="notes-add-round-btn admin-expense-picker-trigger"
        onClick={() => setOpen((current) => !current)}
        title="Add administrative expense"
        aria-label="Add administrative expense"
        aria-expanded={open}
      >
        +
      </button>

      {typeof document !== 'undefined' && panel
        ? createPortal(panel, document.body)
        : null}
    </div>
  )
}
