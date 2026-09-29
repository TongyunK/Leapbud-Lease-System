import PizZip from 'pizzip'

function esc(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function p(
  text: string,
  opts?: { bold?: boolean; size?: number; right?: boolean },
) {
  const size = opts?.size ?? 20
  const bold = opts?.bold ? '<w:b/>' : ''
  const jc = opts?.right ? '<w:jc w:val="right"/>' : ''
  return `<w:p>
  <w:pPr>${jc}<w:spacing w:after="80"/></w:pPr>
  <w:r>
    <w:rPr>${bold}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:rFonts w:ascii="Arial" w:eastAsia="Microsoft JhengHei" w:hAnsi="Arial"/></w:rPr>
    <w:t xml:space="preserve">${esc(text)}</w:t>
  </w:r>
</w:p>`
}

function lineField(label: string, valueKey: string) {
  return `${p(label, { bold: true, size: 18 })}${p(`{${valueKey}}`, { size: 20 })}`
}

/**
 * 收据样例 docx：占位符与旧系统键名一致（{date}/{payer}/{amount}/{paymentNumber}）。
 * 印章/公司地址 Logo 请在 Word 中静态插入（旧 ${dp1|img_*} 不适用于 docxtemplater）。
 */
export function buildReceiptSampleDocx(): Buffer {
  const body = [
    p('OFFICIAL RECEIPT 正式收據', { bold: true, size: 28 }),
    p('Date: {date}', { right: true, size: 20 }),
    p(''),
    lineField('Received from 茲收到', 'payer'),
    lineField('Total Amount 金額  HK$', 'amount'),
    lineField('In payment of 該款繳付', 'paymentNumber'),
    lineField('Cash 現金 / By Cheque 支票號碼(付款銀行)', 'cashCheque'),
    p(''),
    p('HK$ {amount}', { bold: true, size: 24 }),
    p(''),
    p('（頁腳可放公司地址與印章靜態圖）', { size: 16 }),
    p('Receipt: {receiptCode}  Invoice: {invoiceCode}', { size: 16 }),
  ].join('')

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body}
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
  zip.file('_rels/.rels', rels)
  zip.file('word/document.xml', documentXml)
  return zip.generate({ type: 'nodebuffer' }) as Buffer
}
