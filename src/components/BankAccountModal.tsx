import { useEffect, useState } from 'react'
import { saveBankAccounts } from '../api/fs'
import type { BankAccountFormInput, BankAccountRecord } from '../types/bankAccount'
import { BANK_ACCOUNT_TYPES } from '../types/bankAccount'
import {
  createEmptyBankAccountForm,
  createBankAccountFromForm,
  normalizeBankAccountTypeId,
} from '../utils/bankAccount'
import { confirmSave, showAddedAlert, showUpdatedAlert } from '../utils/sweetAlert'
import './BankAccountModal.css'

interface BankAccountModalProps {
  title: string
  clientId: string
  fyId: string
  businessId: string
  existingAccounts: BankAccountRecord[]
  account?: BankAccountRecord | null
  onClose: () => void
  onSaved: (bankAccounts: BankAccountRecord[]) => void
}

function BankAccountModal({
  title,
  clientId,
  fyId,
  businessId,
  existingAccounts,
  account,
  onClose,
  onSaved,
}: BankAccountModalProps) {
  const [form, setForm] = useState<BankAccountFormInput>(() =>
    account
      ? {
          bankName: account.bankName,
          accountNumber: account.accountNumber,
          accountType: account.accountType,
        }
      : createEmptyBankAccountForm(),
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
          }
        : createEmptyBankAccountForm(),
    )
    setSaveError('')
  }, [account])

  const updateField = (field: keyof BankAccountFormInput, value: string) => {
    setForm((current) => ({
      ...current,
      [field]:
        field === 'accountType'
          ? normalizeBankAccountTypeId(value)
          : value,
    }))
  }

  const handleSave = async () => {
    if (!form.bankName.trim() || saving) {
      return
    }

    const confirmed = await confirmSave({
      action: account ? 'edit' : 'add',
      itemLabel: form.bankName.trim(),
    })
    if (!confirmed) {
      return
    }

    const nextAccount = createBankAccountFromForm(form, account)
    const exists = existingAccounts.some((item) => item.id === nextAccount.id)
    const bankAccounts = exists
      ? existingAccounts.map((item) => (item.id === nextAccount.id ? nextAccount : item))
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
          charges are entered in the table after saving.
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
        </div>

        <div className="bank-account-modal-actions">
          <button type="button" className="secondary-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => void handleSave()}
            disabled={!form.bankName.trim() || saving}
          >
            {saving ? 'Saving…' : account ? 'Update Bank' : 'Add Bank'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default BankAccountModal
