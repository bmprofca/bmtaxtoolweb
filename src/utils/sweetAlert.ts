import Swal from 'sweetalert2'

export const SWAL_CONFIRM_COLOR = '#2563eb'
export const SWAL_DANGER_COLOR = '#dc2626'

const SwalApp = Swal.mixin({
  // Must render above FS Quick Entry / live banners (z-index 1200–1400)
  target: 'body',
  heightAuto: false,
  customClass: {
    container: 'swal2-container--app-top',
  },
})

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function confirmProceed(options: {
  title: string
  message: string
  confirmButtonText?: string
}): Promise<boolean> {
  const result = await SwalApp.fire({
    icon: 'question',
    title: options.title,
    text: options.message,
    showCancelButton: true,
    confirmButtonText: options.confirmButtonText || 'Yes, continue',
    cancelButtonText: 'Cancel',
    confirmButtonColor: SWAL_CONFIRM_COLOR,
    cancelButtonColor: '#6b7280',
  })

  return result.isConfirmed
}

export async function confirmSave(options: {
  action: 'add' | 'edit'
  itemLabel: string
}): Promise<boolean> {
  const result = await SwalApp.fire({
    icon: 'question',
    title: options.action === 'add' ? 'Add Record?' : 'Save Changes?',
    html: `<p>Are you sure you want to ${
      options.action === 'add' ? 'add' : 'save changes to'
    } <strong>${escapeHtml(options.itemLabel)}</strong>?</p>`,
    showCancelButton: true,
    confirmButtonText: options.action === 'add' ? 'Yes, add' : 'Yes, save',
    cancelButtonText: 'Cancel',
    confirmButtonColor: SWAL_CONFIRM_COLOR,
    cancelButtonColor: '#6b7280',
  })

  return result.isConfirmed
}

export async function confirmDelete(options: {
  itemLabel: string
  extraMessage?: string
}): Promise<boolean> {
  const result = await SwalApp.fire({
    icon: 'warning',
    title: 'Are you sure?',
    html: `<p>Delete <strong>${escapeHtml(options.itemLabel)}</strong>?</p>${
      options.extraMessage
        ? `<p style="margin-top:0.5rem;color:#6b7280;font-size:0.92rem">${escapeHtml(options.extraMessage)}</p>`
        : ''
    }`,
    showCancelButton: true,
    confirmButtonText: 'Yes, delete',
    cancelButtonText: 'Cancel',
    confirmButtonColor: SWAL_DANGER_COLOR,
    cancelButtonColor: '#6b7280',
  })

  return result.isConfirmed
}

export async function confirmRestore(options: { itemLabel: string }): Promise<boolean> {
  const result = await SwalApp.fire({
    icon: 'question',
    title: 'Restore Record?',
    html: `<p>Restore <strong>${escapeHtml(options.itemLabel)}</strong>?</p>`,
    showCancelButton: true,
    confirmButtonText: 'Yes, restore',
    cancelButtonText: 'Cancel',
    confirmButtonColor: SWAL_CONFIRM_COLOR,
    cancelButtonColor: '#6b7280',
  })

  return result.isConfirmed
}

export async function confirmCaStatusChange(options: {
  itemLabel: string
  nextStatus: 'active' | 'inactive'
}): Promise<boolean> {
  const isActive = options.nextStatus === 'active'
  const result = await SwalApp.fire({
    icon: 'question',
    title: isActive ? 'Activate CA?' : 'Deactivate CA?',
    html: `<p>Set <strong>${escapeHtml(options.itemLabel)}</strong> as <strong>${
      isActive ? 'Active' : 'Inactive'
    }</strong>?</p>${
      isActive
        ? '<p style="margin-top:0.5rem;color:#6b7280;font-size:0.92rem">Active CAs appear in the financial statement UDIN assignment list.</p>'
        : '<p style="margin-top:0.5rem;color:#6b7280;font-size:0.92rem">Inactive CAs will be hidden from new UDIN assignments.</p>'
    }`,
    showCancelButton: true,
    confirmButtonText: isActive ? 'Yes, activate' : 'Yes, deactivate',
    cancelButtonText: 'Cancel',
    confirmButtonColor: isActive ? '#16a34a' : SWAL_DANGER_COLOR,
    cancelButtonColor: '#6b7280',
  })

  return result.isConfirmed
}

export async function showCaStatusAlert(options: {
  itemLabel: string
  status: 'active' | 'inactive'
}) {
  const isActive = options.status === 'active'
  await SwalApp.fire({
    icon: 'success',
    title: isActive ? 'CA Activated' : 'CA Deactivated',
    html: `<p><strong>${escapeHtml(options.itemLabel)}</strong> is now <strong style="color:${
      isActive ? '#166534' : '#64748b'
    }">${isActive ? 'Active' : 'Inactive'}</strong>.</p>`,
    confirmButtonText: 'OK',
    confirmButtonColor: isActive ? '#16a34a' : SWAL_CONFIRM_COLOR,
  })
}

export async function confirmFinancialYearStatusChange(options: {
  itemLabel: string
  nextStatus: 'active' | 'inactive'
}): Promise<boolean> {
  const isActive = options.nextStatus === 'active'
  const result = await SwalApp.fire({
    icon: 'question',
    title: isActive ? 'Activate Financial Year?' : 'Deactivate Financial Year?',
    html: `<p>Set <strong>${escapeHtml(options.itemLabel)}</strong> as <strong>${
      isActive ? 'Active' : 'Inactive'
    }</strong>?</p>${
      isActive
        ? '<p style="margin-top:0.5rem;color:#6b7280;font-size:0.92rem">Active years appear in financial statement reports and year selectors.</p>'
        : '<p style="margin-top:0.5rem;color:#6b7280;font-size:0.92rem">Inactive years are hidden from financial statement reports and year selectors.</p>'
    }`,
    showCancelButton: true,
    confirmButtonText: isActive ? 'Yes, activate' : 'Yes, deactivate',
    cancelButtonText: 'Cancel',
    confirmButtonColor: isActive ? '#16a34a' : SWAL_DANGER_COLOR,
    cancelButtonColor: '#6b7280',
  })

  return result.isConfirmed
}

export async function showFinancialYearStatusAlert(options: {
  itemLabel: string
  status: 'active' | 'inactive'
}) {
  const isActive = options.status === 'active'
  await SwalApp.fire({
    icon: 'success',
    title: isActive ? 'Financial Year Activated' : 'Financial Year Deactivated',
    html: `<p><strong>${escapeHtml(options.itemLabel)}</strong> is now <strong style="color:${
      isActive ? '#166534' : '#64748b'
    }">${isActive ? 'Active' : 'Inactive'}</strong>.</p>`,
    confirmButtonText: 'OK',
    confirmButtonColor: isActive ? '#16a34a' : SWAL_CONFIRM_COLOR,
  })
}

export async function promptPassword(options: {
  title: string
  itemLabel?: string
  confirmButtonText?: string
}): Promise<string | null> {
  const result = await SwalApp.fire({
    title: options.title,
    html: options.itemLabel
      ? `<p>Enter password to continue for <strong>${escapeHtml(options.itemLabel)}</strong></p>`
      : undefined,
    input: 'password',
    inputPlaceholder: 'Enter password',
    inputAttributes: {
      autocapitalize: 'off',
      autocorrect: 'off',
    },
    showCancelButton: true,
    confirmButtonText: options.confirmButtonText || 'Confirm',
    confirmButtonColor: SWAL_DANGER_COLOR,
    cancelButtonText: 'Cancel',
    cancelButtonColor: '#6b7280',
  })

  if (!result.isConfirmed) {
    return null
  }

  return String(result.value || '')
}

export async function promptConfirmationCode(options: {
  title: string
  itemLabel: string
}): Promise<string | null> {
  const result = await SwalApp.fire({
    title: options.title,
    html: `<p>Enter confirmation code to delete <strong>${escapeHtml(options.itemLabel)}</strong></p>`,
    input: 'password',
    inputPlaceholder: 'Enter confirmation code',
    inputAttributes: {
      autocapitalize: 'off',
      autocorrect: 'off',
    },
    showCancelButton: true,
    confirmButtonText: 'Delete',
    confirmButtonColor: SWAL_DANGER_COLOR,
    cancelButtonText: 'Cancel',
    cancelButtonColor: '#6b7280',
  })

  if (!result.isConfirmed) {
    return null
  }

  return String(result.value || '')
}

export async function promptUnlockConfirmationCode(options: {
  itemLabel: string
}): Promise<string | null> {
  const result = await SwalApp.fire({
    icon: 'warning',
    title: 'Unlock Statement?',
    html: `<p>Enter confirmation code to unlock <strong>${escapeHtml(options.itemLabel)}</strong> for edits.</p>`,
    input: 'password',
    inputPlaceholder: 'Enter confirmation code',
    inputAttributes: {
      autocapitalize: 'off',
      autocorrect: 'off',
    },
    showCancelButton: true,
    confirmButtonText: 'Unlock',
    confirmButtonColor: SWAL_DANGER_COLOR,
    cancelButtonText: 'Cancel',
    cancelButtonColor: '#6b7280',
  })

  if (!result.isConfirmed) {
    return null
  }

  return String(result.value || '').trim()
}

export async function showAddedAlert(itemLabel: string, detailsHtml?: string) {
  await SwalApp.fire({
    icon: 'success',
    title: 'Added Successfully',
    html: detailsHtml
      ? `<p style="margin:0 0 0.75rem"><strong>${escapeHtml(itemLabel)}</strong> has been added.</p>${detailsHtml}`
      : `<p><strong>${escapeHtml(itemLabel)}</strong> has been added successfully.</p>`,
    confirmButtonText: 'OK',
    confirmButtonColor: SWAL_CONFIRM_COLOR,
  })
}

export async function showUpdatedAlert(itemLabel: string, detailsHtml?: string) {
  await SwalApp.fire({
    icon: 'success',
    title: 'Updated Successfully',
    html: detailsHtml
      ? `<p style="margin:0 0 0.75rem"><strong>${escapeHtml(itemLabel)}</strong> has been updated.</p>${detailsHtml}`
      : `<p><strong>${escapeHtml(itemLabel)}</strong> has been updated successfully.</p>`,
    confirmButtonText: 'OK',
    confirmButtonColor: SWAL_CONFIRM_COLOR,
  })
}

export async function showDeletedAlert(itemLabel: string, softDeleted = false) {
  await SwalApp.fire({
    icon: 'success',
    title: 'Deleted Successfully',
    html: `<p><strong>${escapeHtml(itemLabel)}</strong> has been deleted${
      softDeleted ? ' and can be restored later' : ''
    }.</p>`,
    confirmButtonText: 'OK',
    confirmButtonColor: SWAL_CONFIRM_COLOR,
  })
}

export async function showRestoredAlert(itemLabel: string) {
  await SwalApp.fire({
    icon: 'success',
    title: 'Restored Successfully',
    html: `<p><strong>${escapeHtml(itemLabel)}</strong> has been restored.</p>`,
    confirmButtonText: 'OK',
    confirmButtonColor: SWAL_CONFIRM_COLOR,
  })
}

export async function showActionAlert(title: string, message: string) {
  await SwalApp.fire({
    icon: 'success',
    title,
    text: message,
    confirmButtonText: 'OK',
    confirmButtonColor: SWAL_CONFIRM_COLOR,
  })
}
