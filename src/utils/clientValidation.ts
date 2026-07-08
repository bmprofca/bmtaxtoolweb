const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/

export function normalizePan(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

export function formatPanInput(value: string): string {
  const raw = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  let result = ''

  for (const char of raw) {
    if (result.length >= 10) {
      break
    }

    const position = result.length
    if (position < 5) {
      if (/[A-Z]/.test(char)) {
        result += char
      }
    } else if (position < 9) {
      if (/[0-9]/.test(char)) {
        result += char
      }
    } else if (/[A-Z]/.test(char)) {
      result += char
    }
  }

  return result
}

export function isValidPan(pan: string): boolean {
  return PAN_PATTERN.test(normalizePan(pan))
}

export function getPanValidationMessage(pan: string): string | null {
  const normalized = normalizePan(pan)

  if (!normalized) {
    return 'PAN is required'
  }

  if (normalized.length !== 10) {
    return 'PAN must be exactly 10 characters'
  }

  if (!/^[A-Z]{5}/.test(normalized)) {
    return 'First 5 characters must be letters (A–Z)'
  }

  if (!/^[A-Z]{5}[0-9]{4}/.test(normalized)) {
    return 'Next 4 characters must be digits (0–9)'
  }

  if (!PAN_PATTERN.test(normalized)) {
    return 'Last character must be a letter (A–Z)'
  }

  return null
}

export const PAN_FORMAT_HINT = 'AAAAA9999A — 5 letters, 4 digits, 1 letter'
