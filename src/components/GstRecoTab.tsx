import type { GstInputTaxRow, GstRecoStatement, GstTaxTriple } from '../types/gst'
import { computeGstReco, isInputRowEditable } from '../utils/gstCalculator'
import { formatAmount } from '../utils/fsCalculator'
import './GstRecoTab.css'

interface GstRecoTabProps {
  gstReco: GstRecoStatement
  fyLabel: string
  salesFromBooks?: number
  onOpenRevenueNote?: () => void
  onChange: (data: GstRecoStatement) => void
}

function AmountInput({
  value,
  onChange,
}: {
  value: number
  onChange: (value: string) => void
}) {
  return (
    <input
      type="number"
      className="gst-amount-input"
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder="0"
    />
  )
}

function TaxCells({
  values,
  readOnly,
  onChange,
}: {
  values: GstTaxTriple
  readOnly?: boolean
  onChange?: (field: keyof GstTaxTriple, value: string) => void
}) {
  const fields: (keyof GstTaxTriple)[] = ['igst', 'cgst', 'sgst']
  return (
    <>
      {fields.map((field) => (
        <td key={field} className={!readOnly && onChange ? 'gst-input-cell' : undefined}>
          {readOnly || !onChange ? (
            <span className="gst-readonly-cell">{formatAmount(values[field])}</span>
          ) : (
            <input
              type="number"
              className="gst-amount-input"
              value={values[field] || ''}
              onChange={(event) => onChange(field, event.target.value)}
              placeholder="0"
            />
          )}
        </td>
      ))}
    </>
  )
}

function GstRecoTab({ gstReco, fyLabel, salesFromBooks, onOpenRevenueNote, onChange }: GstRecoTabProps) {
  const computed = computeGstReco(gstReco)

  const updateSales = (field: keyof GstRecoStatement['sales'], value: string) => {
    onChange({
      ...gstReco,
      sales: {
        ...gstReco.sales,
        [field]: Number(value) || 0,
      },
    })
  }

  const totalTaxableSales = n(gstReco.sales.sales) + n(gstReco.sales.amendedSales)

  function n(v: number) {
    return Number.isFinite(v) ? v : 0
  }

  const updateOutward = (field: keyof GstRecoStatement['outwardTaxPaid'], value: string) => {
    onChange({
      ...gstReco,
      outwardTaxPaid: {
        ...gstReco.outwardTaxPaid,
        [field]: Number(value) || 0,
      },
    })
  }

  const updateInputRow = (index: number, field: keyof GstTaxTriple, value: string) => {
    const rows = gstReco.inputTax.rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, [field]: Number(value) || 0 } : row,
    )
    onChange({ ...gstReco, inputTax: { ...gstReco.inputTax, rows } })
  }

  const updateInputMeta = (patch: Partial<GstRecoStatement['inputTax']>) => {
    onChange({ ...gstReco, inputTax: { ...gstReco.inputTax, ...patch } })
  }

  const updateSimpleRecoTriple = (
    tripleField: keyof Pick<
      GstRecoStatement['simpleReco'],
      'itcClaimedIn3bThisFy' | 'itcPrevYearClaimedThisYear' | 'itcAsPer2b'
    >,
    taxField: keyof GstTaxTriple,
    value: string,
  ) => {
    onChange({
      ...gstReco,
      simpleReco: {
        ...gstReco.simpleReco,
        [tripleField]: {
          ...gstReco.simpleReco[tripleField],
          [taxField]: Number(value) || 0,
        },
      },
    })
  }

  const updateClosingFromNotes = (field: keyof GstTaxTriple, value: string) => {
    onChange({
      ...gstReco,
      inputTax: {
        ...gstReco.inputTax,
        closingFromNotes: {
          ...gstReco.inputTax.closingFromNotes,
          [field]: Number(value) || 0,
        },
      },
    })
  }

  const particularClass = (type: GstInputTaxRow['type']) => {
    if (type === 'opening' || type === 'closing' || type === 'itc-year-sl1-to-6') return 'is-summary'
    if (type === 'reversed-fixed-assets' || type === 'used-for-liability') return 'is-deduction'
    if (type === 'manual-adjustment') return 'is-manual'
    return 'is-addition'
  }

  const renderInputRow = (row: GstInputTaxRow, index: number) => {
    const isClosing = row.type === 'closing'
    const isSl1To6Summary = row.type === 'itc-year-sl1-to-6'
    const isLinkedLiability = row.type === 'used-for-liability'
    const editable = isInputRowEditable(row.type, gstReco.inputTax.linkClosingToNotes)
    const displayValues = isClosing
      ? computed.inputTax.closing
      : isSl1To6Summary
        ? computed.inputTax.itcSl1To6
        : isLinkedLiability
          ? computed.inputTax.itcUsedForLiability
          : { igst: row.igst, cgst: row.cgst, sgst: row.sgst }

    return (
      <tr
        key={row.id}
        className={
          isClosing
            ? 'gst-closing-row'
            : isSl1To6Summary
              ? 'gst-itc-sl-summary-row'
              : isLinkedLiability
                ? 'gst-itc-linked-row'
                : undefined
        }
      >
        <td className="gst-sno-cell">{index + 1}</td>
        <td className={`gst-itc-particular particulars-col ${particularClass(row.type)}`}>{row.particular}</td>
        {isClosing ? (
          gstReco.inputTax.linkClosingToNotes ? (
            <TaxCells values={gstReco.inputTax.closingFromNotes} onChange={updateClosingFromNotes} />
          ) : (
            <TaxCells values={displayValues} readOnly />
          )
        ) : isSl1To6Summary || isLinkedLiability ? (
          <TaxCells values={displayValues} readOnly />
        ) : editable ? (
          <TaxCells values={displayValues} onChange={(field, value) => updateInputRow(index, field, value)} />
        ) : (
          <TaxCells values={displayValues} readOnly />
        )}
      </tr>
    )
  }

  const updateSalesLink = (linked: boolean) => {
    onChange({ ...gstReco, linkSalesToRevenueNote: linked })
  }

  return (
    <section className="panel gst-reco-panel">
      <h2>GST Reconciliation Statement</h2>
      <p className="hint">
        GST annual return reconciliation for FY {fyLabel} — sales & output tax, tax payment, input
        tax ledger and simple reco.
      </p>

      {gstReco.linkSalesToRevenueNote ? (
        <p className="gst-books-hint gst-books-hint--linked">
          <strong>Linked to Note 19 (Revenue from Operation).</strong> Taxable sales (
          {formatAmount(totalTaxableSales)}) flow to the P&amp;L note automatically.
          {onOpenRevenueNote && (
            <>
              {' '}
              <button
                type="button"
                className="gst-note-link-btn"
                onClick={(event) => {
                  event.preventDefault()
                  onOpenRevenueNote?.()
                }}
              >
                View Note 19
              </button>
            </>
          )}
        </p>
      ) : (
        salesFromBooks !== undefined &&
        salesFromBooks > 0 && (
          <p className="gst-books-hint">
            Sales as per books (Note 19): <strong>{formatAmount(salesFromBooks)}</strong>
            {totalTaxableSales > 0 && salesFromBooks !== totalTaxableSales && (
              <span className="gst-books-diff">
                {' '}
                (GST Reco taxable sales: {formatAmount(totalTaxableSales)})
              </span>
            )}
          </p>
        )
      )}

      {/* 1. Sales & Output GST */}
      <div className="gst-reco-section">
        <div className="gst-section-header">
          <h3>1. Sales & GST on Sales (Output Tax)</h3>
          <label className="gst-sales-link-toggle" title="Link taxable sales to Note 19">
            <input
              type="checkbox"
              checked={Boolean(gstReco.linkSalesToRevenueNote)}
              onChange={(event) => updateSalesLink(event.target.checked)}
              aria-label="Link sales to Note 19"
            />
          </label>
        </div>
        <div className="table-wrap">
          <table className="data-table gst-simple-table">
            <thead>
              <tr>
                <th>Particulars</th>
                <th>Taxable Value</th>
                <th>IGST</th>
                <th>CGST</th>
                <th>SGST</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Sales / Turnover</td>
                <td className="gst-input-cell">
                  <AmountInput value={gstReco.sales.sales} onChange={(v) => updateSales('sales', v)} />
                </td>
                <td className="gst-input-cell">
                  <AmountInput value={gstReco.sales.igst} onChange={(v) => updateSales('igst', v)} />
                </td>
                <td className="gst-input-cell">
                  <AmountInput value={gstReco.sales.cgst} onChange={(v) => updateSales('cgst', v)} />
                </td>
                <td className="gst-input-cell">
                  <AmountInput value={gstReco.sales.sgst} onChange={(v) => updateSales('sgst', v)} />
                </td>
              </tr>
              <tr>
                <td>Amended sales (with tax liability)</td>
                <td className="gst-input-cell">
                  <AmountInput
                    value={gstReco.sales.amendedSales}
                    onChange={(v) => updateSales('amendedSales', v)}
                  />
                </td>
                <td className="gst-input-cell">
                  <AmountInput
                    value={gstReco.sales.amendedIgst}
                    onChange={(v) => updateSales('amendedIgst', v)}
                  />
                </td>
                <td className="gst-input-cell">
                  <AmountInput
                    value={gstReco.sales.amendedCgst}
                    onChange={(v) => updateSales('amendedCgst', v)}
                  />
                </td>
                <td className="gst-input-cell">
                  <AmountInput
                    value={gstReco.sales.amendedSgst}
                    onChange={(v) => updateSales('amendedSgst', v)}
                  />
                </td>
              </tr>
              <tr className="schedule-total-row">
                <td>
                  <strong>Total Output Tax</strong>
                </td>
                <td>{formatAmount(totalTaxableSales)}</td>
                <td>{formatAmount(computed.outputTax.igst)}</td>
                <td>{formatAmount(computed.outputTax.cgst)}</td>
                <td>{formatAmount(computed.outputTax.sgst)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Outward tax payment */}
      <div className="gst-reco-section">
        <h3>2. Payment of Outward Tax Liability</h3>
        <p className="gst-section-note">
          ITC is inter-usable: IGST credit can pay IGST, CGST and SGST liability; CGST credit can pay
          CGST and IGST; SGST credit can pay SGST and IGST. CGST and SGST credits cannot be used
          against each other.
        </p>
        <div className="table-wrap">
          <table className="data-table gst-simple-table gst-payment-matrix">
            <thead>
              <tr>
                <th>ITC Credit / Payment</th>
                <th>Toward IGST liability</th>
                <th>Toward CGST liability</th>
                <th>Toward SGST liability</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Output tax liability (from sales)</td>
                <TaxCells values={computed.outwardTax.outputTax} readOnly />
              </tr>
              <tr>
                <td>IGST credit used</td>
                <td className="gst-input-cell">
                  <AmountInput
                    value={gstReco.outwardTaxPaid.igstCreditToIgst}
                    onChange={(v) => updateOutward('igstCreditToIgst', v)}
                  />
                </td>
                <td className="gst-input-cell">
                  <AmountInput
                    value={gstReco.outwardTaxPaid.igstCreditToCgst}
                    onChange={(v) => updateOutward('igstCreditToCgst', v)}
                  />
                </td>
                <td className="gst-input-cell">
                  <AmountInput
                    value={gstReco.outwardTaxPaid.igstCreditToSgst}
                    onChange={(v) => updateOutward('igstCreditToSgst', v)}
                  />
                </td>
              </tr>
              <tr>
                <td>CGST credit used</td>
                <td className="gst-input-cell">
                  <AmountInput
                    value={gstReco.outwardTaxPaid.cgstCreditToIgst}
                    onChange={(v) => updateOutward('cgstCreditToIgst', v)}
                  />
                </td>
                <td className="gst-input-cell">
                  <AmountInput
                    value={gstReco.outwardTaxPaid.cgstCreditToCgst}
                    onChange={(v) => updateOutward('cgstCreditToCgst', v)}
                  />
                </td>
                <td className="gst-na-cell" title="CGST credit cannot be used for SGST liability">
                  —
                </td>
              </tr>
              <tr>
                <td>SGST credit used</td>
                <td className="gst-input-cell">
                  <AmountInput
                    value={gstReco.outwardTaxPaid.sgstCreditToIgst}
                    onChange={(v) => updateOutward('sgstCreditToIgst', v)}
                  />
                </td>
                <td className="gst-na-cell" title="SGST credit cannot be used for CGST liability">
                  —
                </td>
                <td className="gst-input-cell">
                  <AmountInput
                    value={gstReco.outwardTaxPaid.sgstCreditToSgst}
                    onChange={(v) => updateOutward('sgstCreditToSgst', v)}
                  />
                </td>
              </tr>
              <tr>
                <td>Paid in cash</td>
                <td className="gst-input-cell">
                  <AmountInput
                    value={gstReco.outwardTaxPaid.cashIgst}
                    onChange={(v) => updateOutward('cashIgst', v)}
                  />
                </td>
                <td className="gst-input-cell">
                  <AmountInput
                    value={gstReco.outwardTaxPaid.cashCgst}
                    onChange={(v) => updateOutward('cashCgst', v)}
                  />
                </td>
                <td className="gst-input-cell">
                  <AmountInput
                    value={gstReco.outwardTaxPaid.cashSgst}
                    onChange={(v) => updateOutward('cashSgst', v)}
                  />
                </td>
              </tr>
              <tr className="gst-subtotal-row">
                <td>Total paid toward liability</td>
                <TaxCells values={computed.outwardTax.totalPaidTowardLiability} readOnly />
              </tr>
              <tr className="gst-subtotal-row gst-linked-row">
                <td>
                  Total ITC credit utilised
                  <span className="gst-link-note"> → linked to ITC sheet S.No 8</span>
                </td>
                <td>{formatAmount(computed.outwardTax.itcCreditUsed.igst)}</td>
                <td>{formatAmount(computed.outwardTax.itcCreditUsed.cgst)}</td>
                <td>{formatAmount(computed.outwardTax.itcCreditUsed.sgst)}</td>
              </tr>
              <tr
                className={`schedule-total-row${
                  computed.outwardTax.balanceLiability.igst !== 0 ||
                  computed.outwardTax.balanceLiability.cgst !== 0 ||
                  computed.outwardTax.balanceLiability.sgst !== 0
                    ? ' has-balance'
                    : ''
                }`}
              >
                <td>
                  <strong>Balance liability remaining</strong>
                </td>
                <TaxCells values={computed.outwardTax.balanceLiability} readOnly />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Input tax sheet */}
      <div className="gst-reco-section">
        <div className="gst-section-header">
          <h3>3. Input Tax (ITC) Sheet</h3>
          <label className="gst-checkbox-label">
            <input
              type="checkbox"
              checked={gstReco.inputTax.linkClosingToNotes}
              onChange={(e) => updateInputMeta({ linkClosingToNotes: e.target.checked })}
            />
            Link closing ITC to Notes (manual entry)
          </label>
        </div>
        <div className="table-wrap">
          <table className="data-table gst-simple-table gst-itc-table">
            <colgroup>
              <col className="gst-itc-col-sno" />
              <col className="gst-itc-col-particular" />
              <col className="gst-itc-col-tax" />
              <col className="gst-itc-col-tax" />
              <col className="gst-itc-col-tax" />
            </colgroup>
            <thead>
              <tr>
                <th>S.No</th>
                <th className="particulars-col">Particulars</th>
                <th>IGST</th>
                <th>CGST</th>
                <th>SGST</th>
              </tr>
            </thead>
            <tbody>
              {gstReco.inputTax.rows.map((row, index) => renderInputRow(row, index))}
            </tbody>
          </table>
        </div>
        {!gstReco.inputTax.linkClosingToNotes && (
          <p className="gst-calc-hint">
            Closing ITC (S.No 10) is auto-calculated from S.No 7 (rows 1–6) − S.No 8 + S.No 9
            (manual adjustment).
          </p>
        )}
      </div>

      {/* 4. Simple reco */}
      <div className="gst-reco-section gst-simple-reco">
        <h3>4. Simple Reconciliation</h3>

        <h4 className="gst-reco-subtitle">ITC claimed in GSTR-3B — FY {fyLabel}</h4>
        <div className="table-wrap">
          <table className="data-table gst-simple-table gst-reco-simple-table">
            <thead>
              <tr>
                <th>Particulars</th>
                <th>IGST</th>
                <th>CGST</th>
                <th>SGST</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="gst-reco-particular">
                  ITC claimed in GSTR-3B (FY {fyLabel})
                </td>
                <TaxCells
                  values={gstReco.simpleReco.itcClaimedIn3bThisFy}
                  onChange={(field, value) => updateSimpleRecoTriple('itcClaimedIn3bThisFy', field, value)}
                />
              </tr>
              <tr>
                <td className="gst-reco-particular is-less">Less: ITC of previous year claimed in this year</td>
                <TaxCells
                  values={gstReco.simpleReco.itcPrevYearClaimedThisYear}
                  onChange={(field, value) =>
                    updateSimpleRecoTriple('itcPrevYearClaimedThisYear', field, value)
                  }
                />
              </tr>
              <tr className="gst-formula-row">
                <td className="gst-reco-particular is-equals">
                  ITC of this year claimed in this year (=)
                </td>
                <TaxCells values={computed.simpleReco.itcThisYearClaimedIn3b} readOnly />
              </tr>
              <tr>
                <td className="gst-reco-particular is-less">
                  Less: ITC of this year (as per S.No 7, Section 3)
                </td>
                <TaxCells values={computed.simpleReco.itcSl1To6} readOnly />
              </tr>
              <tr>
                <td colSpan={4} className="gst-calc-hint gst-sl-hint">
                  S.No 7 = Opening (1) + Purchases (2) + Expenses (3) + RCM (4) + Capital goods (5) −
                  Reversed fixed assets (6). Closing ITC is S.No 10. Full schedule total (S.No 8–9
                  adjustments): IGST {formatAmount(computed.simpleReco.itcAsPerSchedule.igst)}, CGST{' '}
                  {formatAmount(computed.simpleReco.itcAsPerSchedule.cgst)}, SGST{' '}
                  {formatAmount(computed.simpleReco.itcAsPerSchedule.sgst)}.
                </td>
              </tr>
              <tr className="gst-closing-row">
                <td className="gst-reco-particular is-equals">
                  <strong>To be claimed / adjusted in next year (=)</strong>
                </td>
                <TaxCells values={computed.simpleReco.claimInNextYear} readOnly />
              </tr>
            </tbody>
          </table>
        </div>

        <h4 className="gst-reco-subtitle">Comparison — GSTR-2B vs GSTR-3B (current year ITC)</h4>
        <div className="table-wrap">
          <table className="data-table gst-simple-table gst-reco-simple-table">
            <thead>
              <tr>
                <th>Particulars</th>
                <th>IGST</th>
                <th>CGST</th>
                <th>SGST</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="gst-reco-particular">ITC as per GSTR-2B (current year)</td>
                <TaxCells
                  values={gstReco.simpleReco.itcAsPer2b}
                  onChange={(field, value) => updateSimpleRecoTriple('itcAsPer2b', field, value)}
                />
              </tr>
              <tr>
                <td className="gst-reco-particular">ITC of this year claimed in GSTR-3B</td>
                <TaxCells values={computed.simpleReco.itcThisYearClaimedIn3b} readOnly />
              </tr>
              <tr className="gst-diff-row">
                <td className="gst-reco-particular">Difference (2B − 3B current year)</td>
                <TaxCells values={computed.simpleReco.diff2bVs3b} readOnly />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

export default GstRecoTab
