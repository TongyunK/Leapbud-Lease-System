import * as fs from 'fs'
import * as path from 'path'
import PizZip from 'pizzip'

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

function esc(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 单行段落；preserveSpace 用于占位符两侧空格 */
function p(text: string, opts?: { bold?: boolean; center?: boolean; size?: number; color?: string }) {
  const size = opts?.size ?? 21 // 半磅，21≈10.5pt
  const bold = opts?.bold ? '<w:b/>' : ''
  const color = opts?.color ? `<w:color w:val="${opts.color}"/>` : ''
  const jc = opts?.center ? '<w:jc w:val="center"/>' : ''
  return `<w:p>
  <w:pPr>${jc}<w:spacing w:after="60"/></w:pPr>
  <w:r>
    <w:rPr>${bold}${color}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:rFonts w:ascii="Microsoft JhengHei" w:eastAsia="Microsoft JhengHei" w:hAnsi="Microsoft JhengHei"/></w:rPr>
    <w:t xml:space="preserve">${esc(text)}</w:t>
  </w:r>
</w:p>`
}

function cell(
  text: string,
  opts?: {
    width: number
    shade?: string
    bold?: boolean
    vMerge?: 'restart' | 'continue'
    gridSpan?: number
  },
) {
  const shade = opts?.shade
    ? `<w:shd w:val="clear" w:color="auto" w:fill="${opts.shade}"/>`
    : ''
  const vMerge = opts?.vMerge ? `<w:vMerge w:val="${opts.vMerge}"/>` : ''
  const gridSpan = opts?.gridSpan ? `<w:gridSpan w:val="${opts.gridSpan}"/>` : ''
  return `<w:tc>
  <w:tcPr>
    <w:tcW w:w="${opts?.width ?? 2000}" w:type="dxa"/>
    ${gridSpan}${vMerge}${shade}
    <w:tcBorders>
      <w:top w:val="single" w:sz="4" w:color="666666"/>
      <w:left w:val="single" w:sz="4" w:color="666666"/>
      <w:bottom w:val="single" w:sz="4" w:color="666666"/>
      <w:right w:val="single" w:sz="4" w:color="666666"/>
    </w:tcBorders>
  </w:tcPr>
  ${p(text, { bold: opts?.bold, size: 18 })}
</w:tc>`
}

function row(cells: string) {
  return `<w:tr>${cells}</w:tr>`
}

function table(rowsXml: string, totalWidth = 9000) {
  return `<w:tbl>
  <w:tblPr>
    <w:tblW w:w="${totalWidth}" w:type="dxa"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:color="666666"/>
      <w:left w:val="single" w:sz="4" w:color="666666"/>
      <w:bottom w:val="single" w:sz="4" w:color="666666"/>
      <w:right w:val="single" w:sz="4" w:color="666666"/>
      <w:insideH w:val="single" w:sz="4" w:color="666666"/>
      <w:insideV w:val="single" w:sz="4" w:color="666666"/>
    </w:tblBorders>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="2200"/><w:gridCol w:w="2300"/><w:gridCol w:w="2200"/><w:gridCol w:w="2300"/>
  </w:tblGrid>
  ${rowsXml}
</w:tbl>`
}

function pageBreak() {
  return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`
}

/**
 * 生成接近「辦公室服務協議」纸质版式的样例 docx（含占位符与 periods 循环行）。
 */
export function buildAgreementSampleDocx(): Buffer {
  const L = 2200
  const R = 2300
  const gray = 'E8E8E8'
  const green = '2E7D32'

  const cover = [
    p('leapbud', { bold: true, center: true, size: 28, color: green }),
    p(''),
    // 标题条
    table(
      row(
        cell('辦公室服務協議（樣例模板 · 可改版後上傳）', {
          width: 9000,
          shade: green,
          bold: true,
          gridSpan: 4,
        }),
      ),
    ),
    p(''),
    p('協議簽訂日期：{startDate}　　顧客號碼：{customerCode}'),
    p(''),
    table(
      row(
        cell('辦公室資料地址', { width: L, shade: gray, bold: true }) +
          cell('{buildingAddress}', { width: L + R + R, gridSpan: 3 }),
      ),
    ),
    p(''),
    table(
      [
        row(
          cell('一、申請公司資料', {
            width: 9000,
            shade: gray,
            bold: true,
            gridSpan: 4,
          }),
        ),
        row(
          cell('工作室 / 房間', { width: L, shade: gray, bold: true }) +
            cell('{roomCode} {roomName}', { width: R }) +
            cell('合約編號', { width: L, shade: gray, bold: true }) +
            cell('{contractCode}', { width: R }),
        ),
        row(
          cell('公司名稱（中文）', { width: L, shade: gray, bold: true }) +
            cell('{companyNameZh}', { width: L + R + R, gridSpan: 3 }),
        ),
        row(
          cell('公司名稱（英文）', { width: L, shade: gray, bold: true }) +
            cell('{companyNameEn}', { width: L + R + R, gridSpan: 3 }),
        ),
        row(
          cell('商業登記號碼', { width: L, shade: gray, bold: true }) +
            cell('{businessRegNo}', { width: R }) +
            cell('業務性質', { width: L, shade: gray, bold: true }) +
            cell('{businessNature}', { width: R }),
        ),
      ].join(''),
    ),
    p(''),
    table(
      [
        row(
          cell('二、使用者資料', {
            width: 9000,
            shade: gray,
            bold: true,
            gridSpan: 4,
          }),
        ),
        row(
          cell('使用者姓名', { width: L, shade: gray, bold: true }) +
            cell('{occupantName}', { width: R }) +
            cell('手機電話', { width: L, shade: gray, bold: true }) +
            cell('{occupantMobile}', { width: R }),
        ),
        row(
          cell('香港身份證/護照', { width: L, shade: gray, bold: true }) +
            cell('{occupantIdCardNo}', { width: R }) +
            cell('電話', { width: L, shade: gray, bold: true }) +
            cell('{occupantPhone}', { width: R }),
        ),
        row(
          cell('E-MAIL', { width: L, shade: gray, bold: true }) +
            cell('{occupantEmail}', { width: R }) +
            cell('傳真', { width: L, shade: gray, bold: true }) +
            cell('{occupantFax}', { width: R }),
        ),
        row(
          cell('通訊地址', { width: L, shade: gray, bold: true }) +
            cell('{occupantAddress}', { width: L + R + R, gridSpan: 3 }),
        ),
      ].join(''),
    ),
    p(''),
    table(
      [
        row(
          cell('三、收費詳情 / 協議詳情', {
            width: 9000,
            shade: gray,
            bold: true,
            gridSpan: 4,
          }),
        ),
        // 循环行：整行复制。{#periods} 必须在首格、{/periods} 在末格，且先开后闭
        row(
          cell('{#periods}{label}', { width: L, shade: gray, bold: true }) +
            cell('{text}{/periods}', { width: L + R + R, gridSpan: 3 }),
        ),
        row(
          cell('服務月費', { width: L, shade: gray, bold: true }) +
            cell(
              '合約期內每月費用 HKD$ {monthlyRentAmount}(每{paymentCycleMonths}個月付一次款)',
              {
                width: L + R + R,
                gridSpan: 3,
              },
            ),
        ),
        row(
          cell('服務保證金', { width: L, shade: gray, bold: true }) +
            cell('{serviceDepositLine}', { width: L + R + R, gridSpan: 3 }),
        ),
        row(
          cell('訂金', { width: L, shade: gray, bold: true }) +
            cell('HKD$ {bookingDeposit}', { width: R }) +
            cell('雜項按金', { width: L, shade: gray, bold: true }) +
            cell('HKD$ {miscDeposit}', { width: R }),
        ),
        row(
          cell('房門匙', { width: L, shade: gray, bold: true }) +
            cell('{doorKeyQty} 支 (按金${doorKeyUnitPrice} 每支)', { width: R }) +
            cell('信箱匙', { width: L, shade: gray, bold: true }) +
            cell('{mailboxKeyQty} 支 (按金${mailboxKeyUnitPrice} 每支)', { width: R }),
        ),
        row(
          cell('單位通訊地址（中）', { width: L, shade: gray, bold: true }) +
            cell('{buildingAddress}', { width: L + R + R, gridSpan: 3 }),
        ),
        row(
          cell('單位通訊地址（英）', { width: L, shade: gray, bold: true }) +
            cell('{buildingAddressEn}', { width: L + R + R, gridSpan: 3 }),
        ),
        row(
          cell('備註', { width: L, shade: gray, bold: true }) +
            cell('{remark}', { width: L + R + R, gridSpan: 3 }),
        ),
      ].join(''),
    ),
    p(''),
    p('（以下為條款頁；正式模板可用「分節符」做不同頁眉，本樣例用分頁符示意）', {
      size: 16,
      color: '888888',
    }),
  ].join('')

  const terms = [
    pageBreak(),
    p('條款和條件', { bold: true, size: 32 }),
    p(
      '本協議由供應商（下稱「供應商」）與客戶（顧客號碼：{customerCode}，公司：{companyNameZh}）訂立。以下為樣例條款正文，請替換為貴司正式條款。',
    ),
    p(''),
    p('1. 本協議性質', { bold: true }),
    p(
      '1.1　本協議構成雙方就辦公室服務之完整約定。房間：{roomCode} {roomName}；大廈：{buildingName}。',
    ),
    p('1.2　服務期間以系統合約期為準（見首頁循環「合約期」行，或匯總：{periodsSummary}）。'),
    p('1.3　月費參考：{monthlyRentText}（HKD$ {monthlyRent}）。'),
    p(''),
    p('2. 服務與義務', { bold: true }),
    p('2.1　供應商按協議提供約定之辦公室相關服務。'),
    p('2.2　客戶應按時繳付費用，並遵守大廈管理規定。'),
    p('2.3　……（請在 Word 中自行擴充條款；中間頁會隨正文自動換頁）'),
    p(''),
    p('（條款頁可繼續加長；導出時自動分頁。）', { size: 16, color: '888888' }),
  ].join('')

  const signature = [
    pageBreak(),
    p('簽署頁', { bold: true, size: 28, center: true }),
    p(''),
    p('客戶確認已閱讀並同意本協議全部條款（含首頁收費詳情與條款和條件）。'),
    p(''),
    table(
      [
        row(
          cell('供應商', { width: 4500, shade: gray, bold: true, gridSpan: 2 }) +
            cell('使用者或授權人', {
              width: 4500,
              shade: gray,
              bold: true,
              gridSpan: 2,
            }),
        ),
        row(
          cell('名稱', { width: L, shade: gray, bold: true }) +
            cell('{buildingName} / Leapbud', { width: R }) +
            cell('姓名', { width: L, shade: gray, bold: true }) +
            cell('{occupantName}', { width: R }),
        ),
        row(
          cell('簽署及蓋印', { width: L, shade: gray, bold: true }) +
            cell('\n\n\n', { width: R }) +
            cell('簽署及蓋印', { width: L, shade: gray, bold: true }) +
            cell('\n\n\n', { width: R }),
        ),
        row(
          cell('日期', { width: L, shade: gray, bold: true }) +
            cell('{startDate}', { width: R }) +
            cell('日期', { width: L, shade: gray, bold: true }) +
            cell('', { width: R }),
        ),
      ].join(''),
    ),
  ].join('')

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W_NS}">
  <w:body>
    ${cover}
    ${terms}
    ${signature}
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
  zip.folder('_rels')!.file('.rels', rels)
  zip.folder('word')!.file('document.xml', documentXml)
  return zip.generate({ type: 'nodebuffer' }) as Buffer
}

/** 将样例写入磁盘（供仓库 docs / 本地打开参考） */
export function writeAgreementSampleDocxTo(filePath: string) {
  const buf = buildAgreementSampleDocx()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, buf)
  return filePath
}
