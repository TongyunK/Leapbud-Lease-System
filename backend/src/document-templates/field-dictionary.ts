export type DocumentFieldDef = {
  /** 模板占位键名 */
  key: string;
  /** 中文说明（短） */
  label: string;
  /** 是否为循环（数组）字段 */
  loop: boolean;
  /** 用法示例／补充说明 */
  note?: string;
  /** 旧键或已不推荐；新模板请改用推荐键，仍兼容旧模板 */
  deprecated?: boolean;
};

/** 办公室服务协议（agreement）可填充字段说明 */
export const AGREEMENT_FIELD_DICTIONARY: DocumentFieldDef[] = [
  { key: 'contractCode', label: '合約編號', loop: false },
  { key: 'startDate', label: '合約開始日期', loop: false },
  { key: 'endDate', label: '合約到期日期', loop: false },
  {
    key: 'monthlyRent',
    label: '月租（兩位小數，無千分位）',
    loop: false,
    note: '純數字金額，如 9538.00',
  },
  {
    key: 'monthlyRentAmount',
    label: '月租金額（千分位）',
    loop: false,
    note: '模板示例：合約期內每月費用 HKD$ {monthlyRentAmount}(每{paymentCycleMonths}個月付一次款)',
  },
  { key: 'monthlyRentText', label: '月租（中文大寫）', loop: false },
  {
    key: 'monthlyRentLine',
    label: '服務月費整句',
    loop: false,
    deprecated: true,
    note: '舊字段。新模板請改用 monthlyRentAmount + paymentCycleMonths',
  },
  { key: 'paymentCycle', label: '繳費週期', loop: false, note: '如：年繳、月繳' },
  {
    key: 'paymentCycleMonths',
    label: '繳費月數',
    loop: false,
    note: '數字：月繳 1／季繳 3／半年繳 6／年繳 12／1 年半 18／2 年 24',
  },
  {
    key: 'paymentCyclePayText',
    label: '繳費說明整句',
    loop: false,
    deprecated: true,
    note: '舊字段，如「每12個月付一次款」。新模板請用 paymentCycleMonths 自行組句',
  },
  {
    key: 'electricityRate',
    label: '電費／度（純數字）',
    loop: false,
    note: '如 1.20',
  },
  {
    key: 'electricity',
    label: '電費單價（含 $ 號）',
    loop: false,
    note: '如 $1.20。模板可寫：---NIL--- 跟前約 (以每度電 {electricity} 計)',
  },
  { key: 'roomDeposit', label: '房間按金（無千分位）', loop: false },
  {
    key: 'roomDepositAmount',
    label: '房間按金（千分位）',
    loop: false,
    note: '如 9,538.00',
  },
  { key: 'bookingDeposit', label: '已收訂金', loop: false },
  { key: 'miscDeposit', label: '雜項按金（無千分位）', loop: false },
  {
    key: 'miscDepositAmount',
    label: '雜項按金（千分位）',
    loop: false,
    note: '如 2,000.00',
  },
  {
    key: 'serviceDepositLine',
    label: '服務保證金表達式',
    loop: false,
    note: '房間按金 + 雜項按金。右格寫 {serviceDepositLine} → $ 9,538.00 + $ 2,000.00',
  },
  {
    key: 'serviceDepositAmount',
    label: '服務保證金合計（千分位）',
    loop: false,
    note: '房間按金 + 雜項按金',
  },
  {
    key: 'doorKeyQty',
    label: '房門匙數量',
    loop: false,
    note: '模板示例：{doorKeyQty} 支 (按金${doorKeyUnitPrice} 每支)',
  },
  { key: 'doorKeyUnitPrice', label: '房門匙單價', loop: false, note: '配置值，如 100' },
  { key: 'doorKeyDeposit', label: '房門匙按金合計', loop: false },
  {
    key: 'mailboxKeyQty',
    label: '信箱匙數量',
    loop: false,
    note: '模板示例：{mailboxKeyQty} 支 (按金${mailboxKeyUnitPrice} 每支)',
  },
  {
    key: 'mailboxKeyUnitPrice',
    label: '信箱匙單價',
    loop: false,
    note: '配置值，如 100',
  },
  { key: 'mailboxKeyDeposit', label: '信箱匙按金合計', loop: false },
  { key: 'remark', label: '合約備註', loop: false },
  { key: 'leaseType', label: '租賃方式', loop: false },
  { key: 'customerCode', label: '客戶編號', loop: false },
  { key: 'customerName', label: '客戶名稱', loop: false },
  { key: 'companyNameZh', label: '公司名稱（中文）', loop: false },
  { key: 'companyNameEn', label: '公司名稱（英文）', loop: false },
  { key: 'businessRegNo', label: '商業登記號碼', loop: false },
  { key: 'businessNature', label: '業務性質', loop: false },
  { key: 'occupantName', label: '使用者姓名', loop: false },
  { key: 'occupantMobile', label: '使用者手提電話', loop: false },
  { key: 'occupantPhone', label: '使用者聯絡電話', loop: false },
  { key: 'occupantEmail', label: '使用者電郵', loop: false },
  { key: 'occupantFax', label: '使用者傳真', loop: false },
  { key: 'occupantAddress', label: '使用者通訊地址', loop: false },
  { key: 'occupantIdCardNo', label: '使用者身份證號碼', loop: false },
  { key: 'roomCode', label: '房間編號', loop: false },
  {
    key: 'roomName',
    label: '房間名稱（不含末尾「室」）',
    loop: false,
    note: '模板寫：{roomName} 室 → 05A 室',
  },
  { key: 'buildingName', label: '大廈名稱', loop: false },
  { key: 'buildingAddress', label: '大廈地址（中文）', loop: false },
  { key: 'buildingAddressEn', label: '大廈地址（英文）', loop: false },
  {
    key: 'periodsLines',
    label: '合約期多行文本（推薦）',
    loop: false,
    note: '左格「合約期」，右格只寫 {periodsLines}；自動換行且末尾無空行',
  },
  {
    key: 'periods',
    label: '合約期循環（進階）',
    loop: true,
    deprecated: true,
    note: '循環內軟換行易在末尾多一空行；單元格多行請改用 periodsLines',
  },
  { key: 'periodCount', label: '合約期段數', loop: false },
  {
    key: 'periodsSummary',
    label: '合約期摘要',
    loop: false,
    note: '多段用分號拼接',
  },
];

/** 发票（invoice）可填充字段说明；兼容旧系统 ${inv_*} 键名（模板内写 {inv_No}） */
export const INVOICE_FIELD_DICTIONARY: DocumentFieldDef[] = [
  {
    key: 'invoiceCode',
    label: '發票編號',
    loop: false,
  },
  {
    key: 'inv_No',
    label: '發票編號（舊鍵）',
    loop: false,
    deprecated: true,
    note: '等同 invoiceCode',
  },
  {
    key: 'invoiceDate',
    label: '發票日期',
    loop: false,
    note: '格式 DD/MM/YYYY',
  },
  {
    key: 'inv_date',
    label: '發票日期（舊鍵）',
    loop: false,
    deprecated: true,
    note: '等同 invoiceDate，格式 DD/MM/YYYY',
  },
  {
    key: 'paymentDueDate',
    label: '收款期限',
    loop: false,
    note: '格式 DD/MM/YYYY',
  },
  {
    key: 'inv_dueDate',
    label: '收款期限（舊鍵）',
    loop: false,
    deprecated: true,
    note: '等同 paymentDueDate，格式 DD/MM/YYYY',
  },
  { key: 'customerName', label: '客戶名稱', loop: false },
  {
    key: 'clientname',
    label: '客戶名稱（舊鍵別名）',
    loop: false,
    deprecated: true,
    note: 'Payment Advice 區常用；等同 customerName',
  },
  { key: 'customerCode', label: '客戶編號', loop: false },
  {
    key: 'roomName',
    label: '房間名稱（不含末尾「室」）',
    loop: false,
  },
  { key: 'roomCode', label: '房間編號', loop: false },
  {
    key: 'roomNo',
    label: '房間編號（舊鍵）',
    loop: false,
    deprecated: true,
    note: '等同 roomCode',
  },
  {
    key: 'address',
    label: '大廈地址',
    loop: false,
    note: '優先英文 addressEn',
  },
  { key: 'buildingName', label: '大廈名稱', loop: false },
  { key: 'buildingAddress', label: '大廈地址（中文）', loop: false },
  { key: 'buildingAddressEn', label: '大廈地址（英文）', loop: false },
  { key: 'contractCode', label: '合約編號', loop: false },
  { key: 'invoiceType', label: '發票類型', loop: false },
  { key: 'description', label: '發票描述', loop: false },
  {
    key: 'amount',
    label: '開票金額（千分位）',
    loop: false,
  },
  {
    key: 'subtotal',
    label: '小計（千分位）',
    loop: false,
  },
  {
    key: 'inv_subtotal',
    label: '小計（舊鍵）',
    loop: false,
    deprecated: true,
    note: '千分位；有明細則明細合計，否則發票金額',
  },
  {
    key: 'inv_total',
    label: '發票合計 HKD（舊鍵）',
    loop: false,
    deprecated: true,
    note: '千分位；等同 amount',
  },
  {
    key: 'inv_amountDue',
    label: '應付金額（舊鍵）',
    loop: false,
    deprecated: true,
    note: '千分位；等同 inv_total / amount',
  },
  { key: 'fpsId', label: 'FPS 收款標識', loop: false, note: '取自大廈' },
  {
    key: 'FPSID',
    label: 'FPS 收款標識（舊鍵）',
    loop: false,
    deprecated: true,
    note: '等同 fpsId',
  },
  {
    key: 'bankAccountHolder',
    label: '銀行戶名',
    loop: false,
    note: '取自大廈',
  },
  {
    key: 'accountName',
    label: '銀行戶名（舊鍵）',
    loop: false,
    deprecated: true,
    note: '等同 bankAccountHolder',
  },
  { key: 'bankAccount', label: '銀行賬戶', loop: false, note: '取自大廈' },
  {
    key: 'account',
    label: '銀行賬戶（舊鍵）',
    loop: false,
    deprecated: true,
    note: '等同 bankAccount',
  },
  {
    key: 'chequePaymentBy',
    label: '支票付款說明',
    loop: false,
    note: '取自大廈',
  },
  {
    key: 'post',
    label: '支票付款說明（舊鍵）',
    loop: false,
    deprecated: true,
    note: '等同 chequePaymentBy',
  },
  {
    key: 'paymentAdvice',
    label: 'Payment Advice',
    loop: false,
    note: '取自大廈',
  },
  {
    key: 'payment_advice',
    label: 'Payment Advice（舊鍵）',
    loop: false,
    deprecated: true,
    note: '等同 paymentAdvice',
  },
  {
    key: 'items',
    label: '明細循環',
    loop: true,
    note:
      '來自發票「服務細節」；無細節時回退為 1 行開票金額。同一行：首格 {#items}{description}，次格 {quantity}，再次 {unitPrice}，末格 {amount}{/items}',
  },
  {
    key: 'itemCount',
    label: '明細行數',
    loop: false,
    note: '含無細節時的回退行',
  },
  { key: 'notes', label: '發票備註（業務說明）', loop: false },
  { key: 'remark', label: '備註', loop: false },
  { key: 'whatsappNumber', label: 'WhatsApp 號碼', loop: false },
  { key: 'status', label: '發票狀態', loop: false },
];

/** 收据（receipt）可填充字段；兼容旧系统 ${date}/${payer}/${amount}/${paymentNumber} */
export const RECEIPT_FIELD_DICTIONARY: DocumentFieldDef[] = [
  {
    key: 'paymentDate',
    label: '收款日期',
    loop: false,
    note: '格式 DD/MM/YYYY',
  },
  {
    key: 'paymentDateLong',
    label: '收款日期（英文長格式）',
    loop: false,
    note: '如 25 September 2026；等同 date',
  },
  {
    key: 'date',
    label: '收款日期（舊鍵）',
    loop: false,
    deprecated: true,
    note: '英文長格式；等同 paymentDateLong',
  },
  { key: 'customerName', label: '客戶名稱', loop: false },
  {
    key: 'payer',
    label: '付款人／客戶名稱（舊鍵）',
    loop: false,
    deprecated: true,
    note: '等同 customerName',
  },
  { key: 'customerCode', label: '客戶編號', loop: false },
  {
    key: 'amount',
    label: '收款金額（千分位）',
    loop: false,
    note: '無幣種符號；模板可寫 HK$ {amount}',
  },
  { key: 'amountRaw', label: '收款金額（無千分位）', loop: false },
  { key: 'receiptCode', label: '收據編號', loop: false },
  {
    key: 'paymentNumber',
    label: '該款繳付（舊鍵）',
    loop: false,
    deprecated: true,
    note: '優先 #發票編號，無發票時用 #收據編號',
  },
  {
    key: 'invoiceCode',
    label: '所屬發票編號',
    loop: false,
    note: '無 # 前綴',
  },
  { key: 'contractCode', label: '所屬合約編號', loop: false },
  { key: 'receivableCode', label: '所屬應收編號', loop: false },
  { key: 'paymentMethod', label: '收款方式', loop: false },
  {
    key: 'cashCheque',
    label: 'Cash／支票行',
    loop: false,
    deprecated: true,
    note: '舊模板手寫位；現金或支票時填收款方式，否則空',
  },
  { key: 'remark', label: '備註', loop: false },
  { key: 'roomCode', label: '房間編號', loop: false },
  {
    key: 'roomName',
    label: '房間名稱（不含末尾「室」）',
    loop: false,
  },
  { key: 'buildingName', label: '大廈名稱', loop: false },
  { key: 'buildingAddress', label: '大廈地址（中文）', loop: false },
  { key: 'buildingAddressEn', label: '大廈地址（英文）', loop: false },
  { key: 'companyNameZh', label: '客戶公司名稱（中文）', loop: false },
  { key: 'companyNameEn', label: '客戶公司名稱（英文）', loop: false },
];

export function getFieldDictionary(type: string): DocumentFieldDef[] {
  if (type === 'agreement') return AGREEMENT_FIELD_DICTIONARY;
  if (type === 'invoice') return INVOICE_FIELD_DICTIONARY;
  if (type === 'receipt') return RECEIPT_FIELD_DICTIONARY;
  return [];
}
