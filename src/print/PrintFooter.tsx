import SignatureBlock from './SignatureBlock'
import type { PrintFooterProps } from './types'

function PrintFooter({
  clientName,
  showCaSigning = false,
  caProfile,
  udinNumber,
  udinDate,
  sealOffsetX,
  sealOffsetY,
  variant = 'client',
}: PrintFooterProps) {
  const useCa = showCaSigning && variant === 'ca' && caProfile

  return (
    <footer
      className={`print-footer fs-print-footer fs-print-only${
        useCa ? ' print-footer--ca fs-print-footer--ca-signoff' : ' print-footer--client fs-print-footer--client-only'
      }`}
    >
      <div className="print-footer__inner fs-print-footer-inner">
        {useCa ? (
          <SignatureBlock
            variant="ca"
            caProfile={caProfile}
            clientName={clientName}
            udinNumber={udinNumber}
            udinDate={udinDate}
            sealOffsetX={sealOffsetX}
            sealOffsetY={sealOffsetY}
            className="fs-print-ca-signoff--footer"
          />
        ) : (
          <SignatureBlock variant="client" clientName={clientName} />
        )}
      </div>
    </footer>
  )
}

export default PrintFooter
