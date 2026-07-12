import type { PrintTableProps } from './types'

const variantClass: Record<NonNullable<PrintTableProps['variant']>, string> = {
  statement: 'print-table--statement statement-table',
  notes: 'print-table--notes notes-table data-table',
  schedule: 'print-table--schedule schedule-table data-table',
  data: 'print-table--data data-table',
}

function PrintTable({ children, className = '', variant = 'data' }: PrintTableProps) {
  return (
    <div className={`print-table-wrap table-wrap${className ? ` ${className}` : ''}`}>
      <table className={`print-table ${variantClass[variant]}`}>{children}</table>
    </div>
  )
}

export default PrintTable
