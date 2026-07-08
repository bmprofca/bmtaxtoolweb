import { useEffect, useState } from 'react'
import type { BankAccountFormInput, BankAccountRecord } from '../types/bankAccount'
import { BANK_ACCOUNT_TYPES } from '../types/bankAccount'
import {
  createEmptyBankAccountForm,
  normalizeBankAccountTypeId,
} from '../utils/bankAccount'
import { confirmSave } from '../utils/sweetAlert'
import './BankAccountModal.css'

interface BankAccountModalProps {
  title: string
  account?: BankAccountRecord | null
  onClose: () => void
  onSave: (form: BankAccountFormInput) => void
}

function BankAccountModal({ title, account, onClose, onSave }: BankAccountModalProps) {
  const [form, setForm] = useState<BankAccountFormInput>(() =>
    account
      ? {
          bankName: account.bankName,
          accountNumber: account.accountNumber,
          accountType: account.accountType,
        }
      : createEmptyBankAccountForm(),
  )

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
    if (!form.bankName.trim()) {
      return
    }

    const confirmed = await confirmSave({
      action: account ? 'edit' : 'add',
      itemLabel: form.bankName.trim(),
    })
    if (!confirmed) {
      return
    }

    onSave(form)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bank-account-modal" onClick={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        <p className="bank-account-modal-subtitle">
          Enter bank details. Opening balance, debit, credit and charges are entered in the
          table after saving.
        </p>

        <div className="bank-account-form-grid">
          <label className="bank-account-form-span">
            Bank Name
            <input
              type="text"
              value={form.bankName}
              onChange={(event) => updateField('bankName', event.target.value)}
              placeholder="e.g. State Bank of India"
              autoFocus
            />
          </label>

          <label>
            Account Number
            <input
              type="text"
              value={form.accountNumber}
              onChange={(event) => updateField('accountNumber', event.target.value)}
              placeholder="Account number"
            />
          </label>

          <label>
            Type of Account
            <select
              value={form.accountType}
              onChange={(event) => updateField('accountType', event.target.value)}
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
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={handleSave}
            disabled={!form.bankName.trim()}
          >
            {account ? 'Update Bank' : 'Add Bank'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default BankAccountModal
