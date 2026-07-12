import { useEffect, useRef, useState } from 'react'
import type { CaProfile } from '../types/caProfile'
import {
  formatCaNamePrint,
  formatFrnPrint,
  formatUdinDatePrint,
  normalizeSealDataUrl,
} from './FsPrintCaSignOff'
import './FsUdinSignBanner.css'

export const DEFAULT_SEAL_OFFSET_X = 82
export const DEFAULT_SEAL_OFFSET_Y = 50

export function clampSealOffset(value: unknown, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(100, Math.max(0, parsed))
}

interface FsUdinSignBannerProps {
  caProfile: CaProfile
  clientName?: string
  udinNumber?: string
  udinDate?: string
  sealOffsetX?: number
  sealOffsetY?: number
  editable?: boolean
  onSealPositionChange?: (offsetX: number, offsetY: number) => void
  className?: string
}

function FsUdinSignBanner({
  caProfile,
  clientName = '',
  udinNumber,
  udinDate,
  sealOffsetX = DEFAULT_SEAL_OFFSET_X,
  sealOffsetY = DEFAULT_SEAL_OFFSET_Y,
  editable = false,
  onSealPositionChange,
  className = '',
}: FsUdinSignBannerProps) {
  const bannerBodyRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [localOffset, setLocalOffset] = useState({
    x: clampSealOffset(sealOffsetX, DEFAULT_SEAL_OFFSET_X),
    y: clampSealOffset(sealOffsetY, DEFAULT_SEAL_OFFSET_Y),
  })

  const sealDataUrl = normalizeSealDataUrl(caProfile.sealSignatureDataUrl)
  const firmName = caProfile.firmName?.trim() || ''
  const partnerName = formatCaNamePrint(caProfile.partnerName || '')
  const frn = formatFrnPrint(caProfile.frnNumber || '')
  const membershipNumber = caProfile.membershipNumber?.trim() || ''
  const mrnLine = membershipNumber ? `MRN : ${membershipNumber}` : ''
  const place = caProfile.place?.trim() || ''
  const formattedDate = formatUdinDatePrint(udinDate)
  const udin = udinNumber?.trim() || caProfile.udin?.trim() || ''
  const clientSignatoryName = clientName.trim()
  const hasDetails = Boolean(
    firmName ||
      partnerName ||
      frn ||
      mrnLine ||
      place ||
      formattedDate ||
      udin ||
      clientSignatoryName,
  )

  useEffect(() => {
    setLocalOffset({
      x: clampSealOffset(sealOffsetX, DEFAULT_SEAL_OFFSET_X),
      y: clampSealOffset(sealOffsetY, DEFAULT_SEAL_OFFSET_Y),
    })
  }, [sealOffsetX, sealOffsetY])

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

  const getOffsetFromPointer = (clientX: number, clientY: number) => {
    const body = bannerBodyRef.current
    if (!body) {
      return null
    }

    const rect = body.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return null
    }

    return {
      x: clampSealOffset(((clientX - rect.left) / rect.width) * 100, localOffset.x),
      y: clampSealOffset(((clientY - rect.top) / rect.height) * 100, localOffset.y),
    }
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!editable || !sealDataUrl) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    const nextOffset = getOffsetFromPointer(event.clientX, event.clientY)
    if (nextOffset) {
      setLocalOffset(nextOffset)
    }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!editable || !dragging) {
      return
    }

    const nextOffset = getOffsetFromPointer(event.clientX, event.clientY)
    if (nextOffset) {
      setLocalOffset(nextOffset)
    }
  }

  const finishDrag = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!editable || !dragging) {
      return
    }

    const nextOffset = getOffsetFromPointer(event.clientX, event.clientY)
    const resolved = nextOffset || localOffset
    if (nextOffset) {
      setLocalOffset(nextOffset)
    }

    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    onSealPositionChange?.(resolved.x, resolved.y)
  }

  if (!hasDetails && !sealDataUrl) {
    return null
  }

  return (
    <div
      className={`fs-udin-sign-banner${editable ? ' fs-udin-sign-banner--editable' : ''}${
        className ? ` ${className}` : ''
      }`}
    >
      <div
        ref={bannerBodyRef}
        className="fs-udin-sign-banner-body"
        aria-label={editable ? 'Drag seal anywhere inside the banner' : undefined}
      >
        <div className="fs-udin-sign-banner-text">
          {firmName && <p className="fs-udin-sign-banner-firm">{firmName}</p>}
          {frn && <p className="fs-udin-sign-banner-frn">{frn}</p>}
          {(partnerName || mrnLine) && (
            <div className="fs-udin-sign-banner-ca-block">
              {partnerName && <p className="fs-udin-sign-banner-name">{partnerName}</p>}
              {mrnLine && <p className="fs-udin-sign-banner-line">{mrnLine}</p>}
            </div>
          )}
          {(place || formattedDate || udin) && (
            <div className="fs-udin-sign-banner-meta">
              {place && <p className="fs-udin-sign-banner-line">Place : {place.toUpperCase()}</p>}
              {formattedDate && <p className="fs-udin-sign-banner-line">DATE : {formattedDate}</p>}
              {udin && <p className="fs-udin-sign-banner-line">UDIN : {udin}</p>}
            </div>
          )}
        </div>

        {clientSignatoryName ? (
          <div className="fs-udin-sign-banner-client">
            <div className="fs-print-sign-area fs-udin-sign-banner-client-line" aria-hidden="true" />
            <p className="fs-udin-sign-banner-client-name">{clientSignatoryName}</p>
            <p className="fs-udin-sign-banner-client-label">Authorised Signatory</p>
          </div>
        ) : null}

        {editable && !sealDataUrl && (
          <p className="fs-udin-sign-banner-seal-placeholder">Attach a CA seal, then drag it anywhere in this banner</p>
        )}

        {sealDataUrl && (
          <img
            src={sealDataUrl}
            alt={caProfile.sealSignatureName || 'Seal and signature'}
            className={`fs-udin-sign-banner-seal${dragging ? ' fs-udin-sign-banner-seal--dragging' : ''}`}
            style={{
              left: `${localOffset.x}%`,
              top: `${localOffset.y}%`,
            }}
            decoding="sync"
            loading="eager"
            draggable={false}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
          />
        )}
      </div>
      {editable && sealDataUrl && (
        <p className="fs-udin-sign-banner-hint">Drag the seal anywhere inside the banner to adjust its position.</p>
      )}
    </div>
  )
}

export default FsUdinSignBanner
