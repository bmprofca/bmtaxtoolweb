import type { LoanYearCashFlow } from '../types/loan'
import { formatAmount } from '../utils/fsCalculator'
import './LoanCashFlowTable.css'

interface LoanCashFlowTableProps {
  title?: string
  rows: LoanYearCashFlow[]
  compact?: boolean
}

function LoanCashFlowTable({ title, rows, compact }: LoanCashFlowTableProps) {
  if (rows.length === 0) {
    return null
  }

  const totals = rows.reduce(
    (acc, row) => ({
      interestPaid: acc.interestPaid + row.interestPaid,
      principalPaid: acc.principalPaid + row.principalPaid,
      totalPaid: acc.totalPaid + row.totalPaid,
    }),
    { interestPaid: 0, principalPaid: 0, totalPaid: 0 },
  )

  return (
    <div className={`loan-cashflow-block${compact ? ' compact' : ''}`}>
      {title && <h4>{title}</h4>}
      <div className="table-wrap">
        <table className="loan-cashflow-table">
          <thead>
            <tr>
              <th>Year</th>
              <th>Interest Paid</th>
              <th>Principal Paid</th>
              <th>Total Cash Outflow</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.year}>
                <td>{row.year}</td>
                <td>{formatAmount(row.interestPaid)}</td>
                <td>{formatAmount(row.principalPaid)}</td>
                <td>{formatAmount(row.totalPaid)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>
                <strong>Total</strong>
              </td>
              <td>
                <strong>{formatAmount(totals.interestPaid)}</strong>
              </td>
              <td>
                <strong>{formatAmount(totals.principalPaid)}</strong>
              </td>
              <td>
                <strong>{formatAmount(totals.totalPaid)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

export default LoanCashFlowTable
