import { useEffect } from 'react'
import type { CaProfile } from '../types/caProfile'
import './FsPrintCaSignOff.css'

interface FsPrintCaSignOffProps {
  caProfile: CaProfile
  udinNumber?: string
  udinDate?: string
  className?: string
}

function normalizeSealDataUrl(value?: string) {
  const trimmed = value?.trim() || ''
  if (!trimmed) {
    return ''
  }
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:') || /^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  return `data:image/png;base64,${trimmed}`
}

function formatUdinDatePrint(value?: string) {
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

function formatCaName(partnerName: string) {
  const trimmed = partnerName.trim()
  if (!trimmed) {
    return ''
  }
  return /^ca\b/i.test(trimmed) ? trimmed.toUpperCase() : `CA ${trimmed.toUpperCase()}`
}

function formatFrn(frnNumber: string) {
  const trimmed = frnNumber.trim()
  if (!trimmed) {
    return ''
  }
  return /^frn/i.test(trimmed) ? trimmed : `FRN.${trimmed}`
}

function FsPrintCaSignOff({ caProfile, udinNumber, udinDate, className }: FsPrintCaSignOffProps) {
  const sealDataUrl = normalizeSealDataUrl(caProfile.sealSignatureDataUrl)
  const firmName = caProfile.firmName?.trim() || ''
  const partnerName = formatCaName(caProfile.partnerName || '')
  const frn = formatFrn(caProfile.frnNumber || '')
  const place = caProfile.place?.trim() || ''
  const formattedDate = formatUdinDatePrint(udinDate)
  const udin = udinNumber?.trim() || caProfile.udin?.trim() || ''
  const hasDetails = Boolean(firmName || partnerName || frn || place || formattedDate || udin)

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
    <div className={`fs-print-ca-signoff${className ? ` ${className}` : ''}`} aria-hidden="true">
      <div className="fs-print-ca-signoff-left">
        <p className="fs-print-ca-signoff-mark">sd/-</p>
        {firmName && <p className="fs-print-ca-signoff-firm">{firmName}</p>}
        {partnerName && <p className="fs-print-ca-signoff-name">{partnerName}</p>}
        {frn && <p className="fs-print-ca-signoff-line">{frn}</p>}
        {place && <p className="fs-print-ca-signoff-line">Place : {place.toUpperCase()}</p>}
        {formattedDate && <p className="fs-print-ca-signoff-line">DATE : {formattedDate}</p>}
        {udin && <p className="fs-print-ca-signoff-line">UDIN : {udin}</p>}
      </div>
      {sealDataUrl && (
        <div className="fs-print-ca-signoff-right">
          <img
            src={sealDataUrl}
            alt={caProfile.sealSignatureName || 'Seal and signature'}
            className="fs-print-ca-signoff-seal"
            decoding="sync"
            loading="eager"
          />
        </div>
      )}
    </div>
  )
}

export default FsPrintCaSignOff
