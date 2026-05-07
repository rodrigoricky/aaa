import { Fragment } from 'react';
import type { QuantityAdjustmentDocument } from '../services/quantity-adjustments.service';

export const quantityAdjustmentPrintStyles = `
  @page {
    size: 8.5in 5.5in;
    margin: 0.2in 0.24in;
  }

  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
  }

  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    font-size: 10px;
    line-height: 1.12;
    letter-spacing: 0;
    -webkit-font-smoothing: none;
    text-rendering: geometricPrecision;
  }

  .qa-print-sheet,
  .qa-print-sheet * {
    box-sizing: border-box;
  }

  .qa-print-sheet {
    width: 100%;
    min-height: 5.1in;
    margin: 0;
    color: #000;
    background: #fff;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10px;
    line-height: 1.12;
    letter-spacing: 0;
    display: flex;
    flex-direction: column;
  }

  .qa-print-header {
    display: grid;
    grid-template-columns: 1fr 2.25in;
    align-items: start;
  }

  .qa-print-store,
  .qa-print-title {
    margin: 0;
  }

  .qa-print-store {
    font-size: 13px;
    font-weight: 700;
    line-height: 1.05;
  }

  .qa-print-title {
    margin-top: 1px;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.05;
  }

  .qa-print-date-block {
    justify-self: end;
    min-width: 2.2in;
    margin-top: 13px;
    font-size: 10.5px;
    line-height: 1.25;
  }

  .qa-print-date-line {
    display: flex;
    gap: 5px;
    white-space: nowrap;
  }

  .qa-print-date-label {
    min-width: 0.78in;
  }

  .qa-print-number-row {
    margin-top: 4px;
    margin-bottom: 12px;
    font-size: 11px;
    line-height: 1.1;
    white-space: nowrap;
  }

  .qa-print-number-value {
    display: inline-block;
    min-width: 1.35in;
    padding: 0 3px 1px;
    border-bottom: 1px solid #000;
  }

  .qa-print-label {
    font-weight: 700;
  }

  .qa-print-number-red {
    color: #c00000;
    font-weight: 700;
  }

  .qa-print-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin: 0;
    flex: none;
  }

  .qa-print-table,
  .qa-print-table th,
  .qa-print-table td {
    border: 1px solid #000;
  }

  .qa-print-table th {
    height: 17px;
    padding: 1px 3px;
    font-size: 10px;
    font-weight: 700;
    line-height: 1.05;
    background: #fff;
    text-align: left;
    vertical-align: middle;
  }

  .qa-print-table td {
    padding: 1px 3px;
    font-size: 10px;
    line-height: 1.05;
    vertical-align: middle;
  }

  .qa-print-table .ta-center {
    text-align: center;
  }

  .qa-print-table .ta-right {
    text-align: right;
  }

  .qa-print-line-number {
    text-align: center;
    vertical-align: middle;
  }

  .qa-print-qty {
    text-align: center;
    vertical-align: middle;
  }

  .qa-print-item-row td {
    height: 17px;
  }

  .qa-print-reason-row td {
    height: 13px;
    padding: 0 3px;
    font-size: 9px;
    line-height: 1.05;
  }

  .qa-print-reason-label {
    text-align: right;
    font-style: normal;
    white-space: nowrap;
  }

  .qa-print-reason-text {
    font-style: italic;
    overflow-wrap: anywhere;
  }

  .qa-print-footer {
    margin-top: 11px;
    padding-top: 0;
    font-size: 10.5px;
    font-weight: 400;
    line-height: 1.2;
  }

  .qa-print-footer-line {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 0.35in;
    min-height: 18px;
    align-items: end;
  }

  .qa-print-footer-line + .qa-print-footer-line {
    margin-top: 4px;
  }

  .qa-print-footer-field {
    white-space: nowrap;
  }

  .qa-print-footer-right {
    justify-self: start;
  }

  .qa-print-preview-shell {
    display: flex;
    justify-content: center;
    padding: 12px;
    background: #fff;
    overflow: auto;
  }

  .qa-print-preview-sheet {
    width: 8.5in;
    min-height: 5.5in;
    padding: 0.2in 0.24in;
    background: #fff;
    box-shadow: 0 0 0 1px #000;
  }

  @media print {
    .qa-print-preview-shell {
      display: block;
      padding: 0;
      background: #fff;
      overflow: visible;
    }

    .qa-print-preview-sheet {
      width: auto;
      min-height: 0;
      padding: 0;
      box-shadow: none;
    }
  }
`;

function formatDate(value: string | null | undefined) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
}

function formatQuantity(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '';
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function formatSignedQuantity(value: number | null | undefined) {
  const formatted = formatQuantity(value);
  if (!formatted || formatted === '0') {
    return formatted;
  }

  return typeof value === 'number' && value > 0 ? `+${formatted}` : formatted;
}

function safeText(value: string | null | undefined, fallback = '-') {
  const text = value?.trim();
  return text ? text : fallback;
}

function getPrintType(documentData: QuantityAdjustmentDocument) {
  const refType = safeText(documentData.refType, '').toUpperCase();
  return refType === 'DM' || refType === 'CM' ? refType : 'QA';
}

function stripRepeatedPrefix(value: string, prefix: string) {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return value.replace(new RegExp(`^${escapedPrefix}\\s*[-:]?\\s*`, 'i'), '').trim();
}

function splitLastNumberRun(value: string) {
  const match = value.match(/^(.*?)(\d+)(\D*)$/);
  if (!match) {
    return { before: value, number: '', after: '' };
  }

  return {
    before: match[1],
    number: match[2],
    after: match[3],
  };
}

function getPrintNumber(documentData: QuantityAdjustmentDocument) {
  const type = getPrintType(documentData);
  const source = type === 'QA' ? safeText(documentData.qaNo, '') : safeText(documentData.refNo, '');
  const displayValue = type === 'QA' ? source : `${type} ${stripRepeatedPrefix(source, type) || source}`;
  const parts = splitLastNumberRun(displayValue);

  return {
    label: `${type} No.:`,
    ...parts,
  };
}

export default function QuantityAdjustmentPrintDocument({
  documentData,
  preview = false,
}: {
  documentData: QuantityAdjustmentDocument;
  preview?: boolean;
}) {
  const printNumber = getPrintNumber(documentData);
  const encodedBy = safeText(documentData.createdBy, '');
  const checkedBy = safeText(documentData.updatedBy, '');
  const postedBy = safeText(documentData.postedBy, '');
  const content = (
    <div className="qa-print-sheet">
      <div className="qa-print-header">
        <div>
          <p className="qa-print-store">G&amp;P Convenience Store</p>
          <p className="qa-print-title">QUANTITY ADJUSTMENTS</p>
        </div>

        <div className="qa-print-date-block">
          <div className="qa-print-date-line">
            <span className="qa-print-label qa-print-date-label">Create Date:</span>
            <span>{formatDate(documentData.createdAt ?? documentData.transDate)}</span>
          </div>
          <div className="qa-print-date-line">
            <span className="qa-print-label qa-print-date-label">Posted Date:</span>
            <span>{formatDate(documentData.postedAt)}</span>
          </div>
        </div>
      </div>

      <div className="qa-print-number-row">
        <span className="qa-print-label">{printNumber.label}</span>{' '}
        <span className="qa-print-number-value">
          {printNumber.before}
          {printNumber.number ? (
            <span className="qa-print-number-red">{printNumber.number}</span>
          ) : null}
          {printNumber.after}
        </span>
      </div>

      <table className="qa-print-table">
        <colgroup>
          <col style={{ width: '5%' }} />
          <col style={{ width: '25%' }} />
          <col style={{ width: '47%' }} />
          <col style={{ width: '11.5%' }} />
          <col style={{ width: '11.5%' }} />
        </colgroup>
        <thead>
          <tr>
            <th className="ta-center">#</th>
            <th>Barcode</th>
            <th>Item Description</th>
            <th className="ta-center">Adjust Qty</th>
            <th className="ta-center">Final Qty</th>
          </tr>
        </thead>
        <tbody>
          {documentData.lines.slice(0, 8).map((line, index) => (
            <Fragment key={line.id}>
              <tr className="qa-print-item-row">
                <td className="qa-print-line-number" rowSpan={2}>
                  {index + 1}
                </td>
                <td>{safeText(line.itemcode, '')}</td>
                <td>{safeText(line.itemname, '')}</td>
                <td className="qa-print-qty">{formatSignedQuantity(line.adjustQty)}</td>
                <td className="qa-print-qty">{formatQuantity(line.newQty)}</td>
              </tr>
              <tr className="qa-print-reason-row">
                <td className="qa-print-reason-label">Reason:</td>
                <td className="qa-print-reason-text" colSpan={3}>
                  {safeText(line.itemRemark, '-')}
                </td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>

      <div className="qa-print-footer">
        <div className="qa-print-footer-line">
          <div className="qa-print-footer-field">
            <span className="qa-print-label">Encoded by:</span> {encodedBy}
          </div>
          <div />
        </div>
        <div className="qa-print-footer-line">
          <div className="qa-print-footer-field">
            <span className="qa-print-label">Checked by:</span> {checkedBy}
          </div>
          <div className="qa-print-footer-field qa-print-footer-right">
            <span className="qa-print-label">Posted by:</span> {postedBy}
          </div>
        </div>
      </div>
    </div>
  );

  if (!preview) {
    return (
      <>
        <style>{quantityAdjustmentPrintStyles}</style>
        {content}
      </>
    );
  }

  return (
    <>
      <style>{quantityAdjustmentPrintStyles}</style>
      <div className="qa-print-preview-shell">
        <div className="qa-print-preview-sheet">{content}</div>
      </div>
    </>
  );
}
