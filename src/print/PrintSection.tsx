import type { PrintSectionProps } from './types'

function PrintSection({
  children,
  className = '',
  breakBefore = false,
  tabId,
  printTitle,
}: PrintSectionProps) {
  const attrs: Record<string, string> = {}
  if (tabId) {
    attrs['data-fs-tab'] = tabId
  }
  if (printTitle) {
    attrs['data-print-title'] = printTitle
  }

  return (
    <section
      className={`print-section fs-tab-panel${breakBefore ? ' print-section--break fs-print-section-break' : ''}${
        className ? ` ${className}` : ''
      }`}
      {...attrs}
    >
      {children}
    </section>
  )
}

export default PrintSection
