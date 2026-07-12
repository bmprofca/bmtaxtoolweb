import FsPrintCaSignOff from '../components/FsPrintCaSignOff'
import type { CaProfile } from '../types/caProfile'

interface SignatureBlockProps {
  variant: 'client' | 'ca'
  clientName?: string
  caProfile?: CaProfile
  udinNumber?: string
  udinDate?: string
  sealOffsetX?: number
  sealOffsetY?: number
  className?: string
}

function SignatureBlock({
  variant,
  clientName,
  caProfile,
  udinNumber,
  udinDate,
  sealOffsetX,
  sealOffsetY,
  className = '',
}: SignatureBlockProps) {
  if (variant === 'ca' && caProfile) {
    return (
      <FsPrintCaSignOff
        caProfile={caProfile}
        clientName={clientName}
        udinNumber={udinNumber}
        udinDate={udinDate}
        sealOffsetX={sealOffsetX}
        sealOffsetY={sealOffsetY}
        className={`print-signature print-signature--ca${className ? ` ${className}` : ''}`}
      />
    )
  }

  return (
    <div className={`print-signature print-signature--client fs-print-footer-right${className ? ` ${className}` : ''}`}>
      <div className="print-signature__line fs-print-sign-area" />
      <p className="print-signature__name fs-print-footer-strong">{clientName}</p>
      <p className="print-signature__label fs-print-footer-line">Authorised Signatory</p>
    </div>
  )
}

export default SignatureBlock
