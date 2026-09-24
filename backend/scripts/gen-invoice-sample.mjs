import fs from 'fs'
import path from 'path'
import PizZip from 'pizzip'

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

function esc(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function p(text, opts = {}) {
  const size = opts.size ?? 20
  const bold = opts.bold ? '<w:b/>' : ''
  const color = opts.color ? `<w:color w:val="${opts.color}"/>` : ''
  const jc = opts.center
    ? '<w:jc w:val="center"/>'
    : opts.right
      ? '<w:jc w:val="right"/>'
      : ''
  return `<w:p>
  <w:pPr>${jc}<w:spacing w:after="40"/></w:pPr>
  <w:r>
    <w:rPr>${bold}${color}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:rFonts w:ascii="Arial" w:eastAsia="Microsoft JhengHei" w:hAnsi="Arial"/></w:rPr>
    <w:t xml:space="preserve">${esc(text)}</w:t>
  </w:r>
</w:p>`
}

function cell(text, opts = {}) {
  const shade = opts.shade
    ? `<w:shd w:val="clear" w:color="auto" w:fill="${opts.shade}"/>`
    : ''
  const gridSpan = opts.gridSpan ? `<w:gridSpan w:val="${opts.gridSpan}"/>` : ''
  const jc =
    opts.align === 'center'
      ? '<w:jc w:val="center"/>'
      : opts.align === 'right'
        ? '<w:jc w:val="right"/>'
        : ''
  const size = opts.size ?? 18
  const bold = opts.bold ? '<w:b/>' : ''
  return `<w:tc>
  <w:tcPr>
    <w:tcW w:w="${opts.width ?? 2000}" w:type="dxa"/>
    ${gridSpan}${shade}
    <w:tcBorders>
      <w:top w:val="single" w:sz="4" w:color="999999"/>
      <w:left w:val="single" w:sz="4" w:color="999999"/>
      <w:bottom w:val="single" w:sz="4" w:color="999999"/>
      <w:right w:val="single" w:sz="4" w:color="999999"/>
    </w:tcBorders>
  </w:tcPr>
  <w:p>
    <w:pPr>${jc}<w:spacing w:after="20"/></w:pPr>
    <w:r>
      <w:rPr>${bold}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:rFonts w:ascii="Arial" w:eastAsia="Microsoft JhengHei" w:hAnsi="Arial"/></w:rPr>
      <w:t xml:space="preserve">${esc(text)}</w:t>
    </w:r>
  </w:p>
</w:tc>`
}

function row(cells) {
  return `<w:tr>${cells}</w:tr>`
}

function table(rowsXml, totalWidth = 9360, cols = [2340, 2340, 2340, 2340]) {
  const grid = cols.map((w) => `<w:gridCol w:w="${w}"/>`).join('')
  return `<w:tbl>
  <w:tblPr>
    <w:tblW w:w="${totalWidth}" w:type="dxa"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:color="999999"/>
      <w:left w:val="single" w:sz="4" w:color="999999"/>
      <w:bottom w:val="single" w:sz="4" w:color="999999"/>
      <w:right w:val="single" w:sz="4" w:color="999999"/>
      <w:insideH w:val="single" w:sz="4" w:color="999999"/>
      <w:insideV w:val="single" w:sz="4" w:color="999999"/>
    </w:tblBorders>
  </w:tblPr>
  <w:tblGrid>${grid}</w:tblGrid>
  ${rowsXml}
</w:tbl>`
}

function buildInvoiceSampleDocx() {
  const gray = 'F2F2F2'
  const W = 9360
  const cDesc = 4200
  const cQty = 1200
  const cUnit = 1800
  const cAmt = 2160

  const invoiceBlock = [
    p('INVOICE', { bold: true, size: 48 }),
    p(''),
    table(
      [
        row(
          cell('{customerName}({roomNo})', { width: W / 2, gridSpan: 2, size: 20, bold: true }) +
            cell('Invoice Date: {inv_date}', {
              width: W / 2,
              gridSpan: 2,
              size: 18,
              align: 'right',
            }),
        ),
        row(
          cell('{address}', { width: W / 2, gridSpan: 2, size: 18 }) +
            cell('Invoice Number: {inv_No}', {
              width: W / 2,
              gridSpan: 2,
              size: 18,
              align: 'right',
            }),
        ),
      ].join(''),
      W,
    ),
    p(''),
    table(
      [
        row(
          cell('Description', { width: cDesc, shade: gray, bold: true }) +
            cell('Quantity', { width: cQty, shade: gray, bold: true, align: 'center' }) +
            cell('Unit Price', { width: cUnit, shade: gray, bold: true, align: 'right' }) +
            cell('Amount HKD', { width: cAmt, shade: gray, bold: true, align: 'right' }),
        ),
        row(
          cell('{#items}{description}', { width: cDesc }) +
            cell('{quantity}', { width: cQty, align: 'center' }) +
            cell('{unitPrice}', { width: cUnit, align: 'right' }) +
            cell('{amount}{/items}', { width: cAmt, align: 'right' }),
        ),
        row(
          cell('', { width: cDesc + cQty, gridSpan: 2 }) +
            cell('Subtotal', { width: cUnit, shade: gray, bold: true, align: 'right' }) +
            cell('{inv_subtotal}', { width: cAmt, align: 'right', bold: true }),
        ),
        row(
          cell('', { width: cDesc + cQty, gridSpan: 2 }) +
            cell('Invoice Total HKD', {
              width: cUnit,
              shade: gray,
              bold: true,
              align: 'right',
            }) +
            cell('{inv_total}', { width: cAmt, align: 'right', bold: true }),
        ),
      ].join(''),
      W,
      [cDesc, cQty, cUnit, cAmt],
    ),
    p(''),
    p('Due Date: {inv_dueDate}', { bold: true, size: 20 }),
    p(''),
    p('Payment Methods:', { bold: true, size: 20 }),
    p('1. FPS ID: {FPSID}'),
    p('2. Account:'),
    p('   {accountName}'),
    p('   {account}'),
    p('3. Cheque Payment By Post:'),
    p('   {post}'),
    p(''),
    p('— — — — — — — — — — — — — — — — — — — — — — — —', {
      center: true,
      color: '888888',
      size: 16,
    }),
    p(''),
  ].join('')

  const adviceBlock = [
    p('PAYMENT ADVICE', { bold: true, size: 36 }),
    p(''),
    table(
      [
        row(
          cell('To:', { width: 1400, shade: gray, bold: true }) +
            cell('{payment_advice}', { width: 3400 }) +
            cell('Customer', { width: 1800, shade: gray, bold: true }) +
            cell('{clientname}', { width: 2760 }),
        ),
        row(
          cell('', { width: 4800, gridSpan: 2 }) +
            cell('Invoice Number', { width: 1800, shade: gray, bold: true }) +
            cell('{inv_No}', { width: 2760 }),
        ),
        row(
          cell('', { width: 4800, gridSpan: 2 }) +
            cell('Amount Due', { width: 1800, shade: gray, bold: true }) +
            cell('{inv_amountDue}', { width: 2760 }),
        ),
        row(
          cell('', { width: 4800, gridSpan: 2 }) +
            cell('Due Date', { width: 1800, shade: gray, bold: true }) +
            cell('{inv_dueDate}', { width: 2760 }),
        ),
        row(
          cell('', { width: 4800, gridSpan: 2 }) +
            cell('Amount Enclosed', { width: 1800, shade: gray, bold: true }) +
            cell('', { width: 2760 }),
        ),
      ].join(''),
      W,
      [1400, 3400, 1800, 2760],
    ),
    p(''),
    p('Enter the amount you are paying above', { size: 16, color: '666666' }),
    p(''),
    p(
      'Hint: use {inv_No} not ${inv_No}. Line items: {#items}...{/items}.',
      { size: 15, color: '888888' },
    ),
  ].join('')

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W_NS}">
  <w:body>
    ${invoiceBlock}
    ${adviceBlock}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360"/>
    </w:sectPr>
  </w:body>
</w:document>`

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

  const zip = new PizZip()
  zip.file('[Content_Types].xml', contentTypes)
  zip.folder('_rels').file('.rels', rels)
  zip.folder('word').file('document.xml', documentXml)
  return zip.generate({ type: 'nodebuffer' })
}

const out = path.join(process.cwd(), 'uploads', 'samples', 'invoice-sample.docx')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, buildInvoiceSampleDocx())
console.log(out)
