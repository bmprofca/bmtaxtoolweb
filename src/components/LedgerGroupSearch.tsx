import { useEffect, useMemo, useRef, useState } from 'react'
import type { FsNotes } from '../types/fs'
import { getLedgerGroupOptions } from '../utils/ledgerUtils'
import './LedgerGroupSearch.css'

interface LedgerGroupSearchProps {
  value: keyof FsNotes | ''
  onChange: (group: keyof FsNotes | '') => void
  disabled?: boolean
  allowAll?: boolean
  allLabel?: string
  compact?: boolean
}

function formatGroupOption(option: ReturnType<typeof getLedgerGroupOptions>[number]) {
  return `Note ${option.noteNo}: ${option.label}`
}

export function LedgerGroupSearch({
  value,
  onChange,
  disabled,
  allowAll = false,
  allLabel = 'All Groups',
  compact = false,
}: LedgerGroupSearchProps) {
  const options = useMemo(() => getLedgerGroupOptions(), [])
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = options.find((item) => item.group === value)

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) {
      return options
    }

    return options.filter((option) => {
      const haystack = [
        option.label,
        option.section,
        String(option.noteNo),
        option.group,
        formatGroupOption(option),
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedQuery)
    })
  }, [options, query])

  useEffect(() => {
    if (!open) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        setQuery('')
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

  const handleSelect = (group: keyof FsNotes | '') => {
    onChange(group)
    setOpen(false)
    setQuery('')
  }

  const showAllOption =
    allowAll &&
    (!query.trim() ||
      allLabel.toLowerCase().includes(query.trim().toLowerCase()) ||
      'all groups'.includes(query.trim().toLowerCase()))

  return (
    <div
      className={`ledger-group-search${open ? ' is-open' : ''}${
        compact ? ' ledger-group-search-compact' : ''
      }`}
      ref={containerRef}
    >
      <button
        type="button"
        className="ledger-group-search-trigger"
        onClick={() => !disabled && setOpen((current) => !current)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="ledger-group-search-trigger-text">
          {allowAll && value === '' ? (
            <span className="ledger-group-search-label">{allLabel}</span>
          ) : selected ? (
            <>
              <span className="ledger-group-search-note">Note {selected.noteNo}</span>
              <span className="ledger-group-search-label">{selected.label}</span>
              {!compact && (
                <span className="ledger-group-search-section">{selected.section}</span>
              )}
            </>
          ) : (
            'Select ledger group'
          )}
        </span>
        <span className="ledger-group-search-chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="ledger-group-search-panel" role="listbox">
          <div className="ledger-group-search-field">
            <span className="ledger-group-search-icon" aria-hidden="true">
              ⌕
            </span>
            <input
              ref={searchInputRef}
              type="search"
              className="ledger-group-search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by note, label, or section..."
              autoComplete="off"
            />
          </div>

          <div className="ledger-group-search-results">
            {showAllOption && (
              <button
                type="button"
                role="option"
                aria-selected={value === ''}
                className={`ledger-group-search-option${value === '' ? ' is-selected' : ''}`}
                onClick={() => handleSelect('')}
              >
                <span className="ledger-group-search-option-main">
                  <span className="ledger-group-search-label">{allLabel}</span>
                </span>
                {!compact && (
                  <span className="ledger-group-search-section">Show ledgers from every group</span>
                )}
              </button>
            )}
            {filteredOptions.length === 0 && !showAllOption ? (
              <p className="ledger-group-search-empty">No groups match your search.</p>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = option.group === value

                return (
                  <button
                    key={option.group}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`ledger-group-search-option${isSelected ? ' is-selected' : ''}`}
                    onClick={() => handleSelect(option.group)}
                  >
                    <span className="ledger-group-search-option-main">
                      <span className="ledger-group-search-note">Note {option.noteNo}</span>
                      <span className="ledger-group-search-label">{option.label}</span>
                    </span>
                    {!compact && (
                      <span className="ledger-group-search-section">{option.section}</span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
