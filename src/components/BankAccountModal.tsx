import { useEffect, useMemo, useState } from 'react'
import { saveBankAccounts } from '../api/fs'
import type { FinancialYear } from '../types'
import type { BankAccountFormInput, BankAccountRecord } from '../types/bankAccount'
import { BANK_ACCOUNT_STATUSES, BANK_ACCOUNT_TYPES } from '../types/bankAccount'
import {
  createEmptyBankAccountForm,
  createBankAccountFromForm,
  findDuplicateBankAccountByNumber,
  formatBankAccountDuplicateError,
  formatBankAccountStartedFyLabel,
  normalizeBankAccountTypeId,
  unionBankAccountsForComparative,
} from '../utils/bankAccount'
import { sortFinancialYears } from '../utils/financialYear'
import { confirmSave, showAddedAlert, showUpdatedAlert } from '../utils/sweetAlert'
import './BankAccountModal.css'

interface BankAccountModalProps {
  title: string
  clientId: string
  fyId: string
  businessId: string
  financialYears: FinancialYear[]
  existingAccounts: BankAccountRecord[]
  allBusinessAccounts?: BankAccountRecord[]
  account?: BankAccountRecord | null
  onClose: () => void
  onSaved: (bankAccounts: BankAccountRecord[]) => void
}

function BankAccountModal({
  title,
  clientId,
  fyId,
  businessId,
  financialYears,
  existingAccounts,
  allBusinessAccounts,
  account,
  onClose,
  onSaved,
}: BankAccountModalProps) {
  const sortedFinancialYears = useMemo(
    () => sortFinancialYears(financialYears),
    [financialYears],
  )
  const currentFy = sortedFinancialYears.find((item) => item.id === fyId)
  const eligibleStartFys = useMemo(
    () =>
      sortedFinancialYears.filter(
        (item) => !currentFy || item.startYear <= currentFy.startYear,
      ),
    [sortedFinancialYears, currentFy],
  )

  const [form, setForm] = useState<BankAccountFormInput>(() =>
    account
      ? {
          bankName: account.bankName,
          accountNumber: account.accountNumber,
          accountType: account.accountType,
          status: account.status,
          startedInFyId: account.startedInFyId || fyId,
        }
      : createEmptyBankAccountForm(fyId),
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    setForm(
      account
        ? {
            bankName: account.bankName,
            accountNumber: account.accountNumber,
            accountType: account.accountType,
            status: account.status,
            startedInFyId: account.startedInFyId || fyId,
          }
        : createEmptyBankAccountForm(fyId),
    )
    setSaveError('')
  }, [account, fyId])

  const updateField = (field: keyof BankAccountFormInput, value: string) => {
    setForm((current) => ({
      ...current,
      [field]:
        field === 'accountType'
          ? normalizeBankAccountTypeId(value)
          : field === 'status'
            ? (value === 'closed' ? 'closed' : 'active')
            : value,
    }))
  }

  const handleSave = async () => {
    if (!form.bankName.trim() || saving || !form.startedInFyId) {
      return
    }

    const confirmed = await confirmSave({
      action: account ? 'edit' : 'add',
      itemLabel: form.bankName.trim(),
    })
    if (!confirmed) {
      return
    }

    const nextAccount = createBankAccountFromForm(form, account, fyId)
    const duplicatePool = unionBankAccountsForComparative(
      existingAccounts,
      allBusinessAccounts ?? [],
    )
    const duplicate = findDuplicateBankAccountByNumber(duplicatePool, nextAccount)
    if (duplicate) {
      setSaveError(formatBankAccountDuplicateError(nextAccount.accountNumber, duplicate))
      return
    }

    const exists = existingAccounts.some((item) => item.id === nextAccount.id)
    const bankAccounts = exists
      ? existingAccounts.map((item) =>
          item.id === nextAccount.id
            ? { ...nextAccount, hasEntries: item.hasEntries }
            : item,
        )
      : [...existingAccounts, nextAccount]

    setSaving(true)
    setSaveError('')

    try {
      const { bankAccounts: savedBankAccounts } = await saveBankAccounts(
        clientId,
        fyId,
        businessId,
        bankAccounts,
      )
      onSaved(savedBankAccounts)
      onClose()

      if (exists) {
        await showUpdatedAlert(nextAccount.bankName)
      } else {
        await showAddedAlert(nextAccount.bankName)
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save bank account')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bank-account-modal" onClick={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        <p className="bank-account-modal-subtitle">
          Enter bank details. The account is saved immediately. Opening balance, debit, credit and
          charges are entered in the table after saving. The account appears in financial statements
          from the selected start financial year until closed.
        </p>

        {saveError && <div className="alert bank-account-modal-error">{saveError}</div>}

        <div className="bank-account-form-grid">
          <label className="bank-account-form-span">
            Bank Name
            <input
              type="text"
              value={form.bankName}
              onChange={(event) => updateField('bankName', event.target.value)}
              placeholder="e.g. State Bank of India"
              autoFocus
              disabled={saving}
            />
          </label>

          <label>
            Account Number
            <input
              type="text"
              value={form.accountNumber}
              onChange={(event) => updateField('accountNumber', event.target.value)}
              placeholder="Account number"
              disabled={saving}
            />
          </label>

          <label>
            Type of Account
            <select
              value={form.accountType}
              onChange={(event) => updateField('accountType', event.target.value)}
              disabled={saving}
            >
              {BANK_ACCOUNT_TYPES.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>

          {!account ? (
            <label className="bank-account-form-span">
              Started in Financial Year
              <select
                value={form.startedInFyId}
                onChange={(event) => updateField('startedInFyId', event.target.value)}
                disabled={saving}
              >
                {eligibleStartFys.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <span className="bank-account-status-hint bank-account-start-hint">
                The account will appear in this FY and later years in the Bank Account tab and linked
                notes.
              </span>
            </label>
          ) : (
            <label className="bank-account-form-span">
              Started in Financial Year
              <input
                type="text"
                value={formatBankAccountStartedFyLabel(account, sortedFinancialYears)}
                readOnly
                className="bank-account-readonly-input"
              />
            </label>
          )}

          {account && (
            <label className="bank-account-form-span">
              Status
              <select
                value={form.status}
                onChange={(event) => updateField('status', event.target.value)}
                disabled={saving}
              >
                {BANK_ACCOUNT_STATUSES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              {account.hasEntries && form.status === 'active' && (
                <span className="bank-account-status-hint">
                  This account has figures in one or more financial years. Deleting is not allowed.
                  Set status to <strong>Closed</strong> in the year you want to stop using it — it will
                  not appear in later years.
                </span>
              )}
              {form.status === 'closed' && (
                <span className="bank-account-status-hint">
                  Closed accounts stay visible in this financial year only and will not appear in later
                  years.
                </span>
              )}
            </label>
          )}
        </div>

        <div className="bank-account-modal-actions">
          <button type="button" className="secondary-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => void handleSave()}
            disabled={!form.bankName.trim() || !form.startedInFyId || saving}
          >
            {saving ? 'Saving…' : account ? 'Update Bank' : 'Add Bank'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default BankAccountModal
