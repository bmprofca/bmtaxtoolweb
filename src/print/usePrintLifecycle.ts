import { useEffect } from 'react'

interface PrintLifecycleOptions {
  documentTitle?: string
  onBeforePrint?: () => void
  onAfterPrint?: () => void
}

export function usePrintLifecycle({
  documentTitle,
  onBeforePrint,
  onAfterPrint,
}: PrintLifecycleOptions) {
  useEffect(() => {
    const previousTitle = document.title

    const handleBeforePrint = () => {
      if (documentTitle) {
        document.title = documentTitle
      }
      onBeforePrint?.()
    }

    const handleAfterPrint = () => {
      document.title = previousTitle
      onAfterPrint?.()
    }

    window.addEventListener('beforeprint', handleBeforePrint)
    window.addEventListener('afterprint', handleAfterPrint)

    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint)
      window.removeEventListener('afterprint', handleAfterPrint)
    }
  }, [documentTitle, onAfterPrint, onBeforePrint])
}
