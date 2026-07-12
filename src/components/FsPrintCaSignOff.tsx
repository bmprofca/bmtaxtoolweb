import { useEffect } from 'react'
import type { CaProfile } from '../types/caProfile'
import FsUdinSignBanner from './FsUdinSignBanner'
import './FsPrintCaSignOff.css'

interface FsPrintCaSignOffProps {
  caProfile: CaProfile
  clientName?: string
  udinNumber?: string
  udinDate?: string
  sealOffsetX?: number
  sealOffsetY?: number
  className?: string
}

export function normalizeSealDataUrl(value?: string) {
  const trimmed = value?.trim() || ''
  if (!trimmed) {
    return ''
  }
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:') || /^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  if (trimmed.startsWith('/9j/')) {
    return `data:image/jpeg;base64,${trimmed}`
  }
  if (trimmed.startsWith('R0lGOD')) {
    return `data:image/gif;base64,${trimmed}`
  }
  return `data:image/png;base64,${trimmed}`
}

export function formatUdinDatePrint(value?: string) {
  if (!value) {
    return ''
  }
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  const day = String(parsed.getDate()).padStart(2, '0')
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const year = parsed.getFullYear()
  return `${day}.${month}.${year}`
}

export function formatCaNamePrint(partnerName: string) {
  const trimmed = partnerName.trim()
  if (!trimmed) {
    return ''
  }
  return /^ca\b/i.test(trimmed) ? trimmed.toUpperCase() : `CA ${trimmed.toUpperCase()}`
}

export function formatFrnPrint(frnNumber: string) {
  const trimmed = frnNumber.trim()
  if (!trimmed) {
    return ''
  }
  return /^frn/i.test(trimmed) ? trimmed : `FRN.${trimmed}`
}

function FsPrintCaSignOff({
  caProfile,
  clientName,
  udinNumber,
  udinDate,
  sealOffsetX,
  sealOffsetY,
  className,
}: FsPrintCaSignOffProps) {
  const sealDataUrl = normalizeSealDataUrl(caProfile.sealSignatureDataUrl)
  const firmName = caProfile.firmName?.trim() || ''
  const partnerName = formatCaNamePrint(caProfile.partnerName || '')
  const frn = formatFrnPrint(caProfile.frnNumber || '')
  const place = caProfile.place?.trim() || ''
  const formattedDate = formatUdinDatePrint(udinDate)
  const udin = udinNumber?.trim() || caProfile.udin?.trim() || ''
  const hasDetails = Boolean(
    firmName || partnerName || frn || place || formattedDate || udin || clientName?.trim(),
  )

  useEffect(() => {
    if (!sealDataUrl) {
      return
    }

    const preload = new Image()
    preload.src = sealDataUrl

    const ensureSealReady = () => {
      if (!preload.complete) {
        preload.src = sealDataUrl
      }
    }

    window.addEventListener('beforeprint', ensureSealReady)
    return () => window.removeEventListener('beforeprint', ensureSealReady)
  }, [sealDataUrl])

  if (!hasDetails && !sealDataUrl) {
    return null
  }

  return (
    <FsUdinSignBanner
      caProfile={caProfile}
      clientName={clientName}
      udinNumber={udinNumber}
      udinDate={udinDate}
      sealOffsetX={sealOffsetX}
      sealOffsetY={sealOffsetY}
      className={className}
    />
  )
}

export default FsPrintCaSignOff
