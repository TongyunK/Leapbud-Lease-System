export type DocumentFieldDef = {
  /** 模板占位键名 */
  key: string;
  /** 中文说明 */
  label: string;
  /** 是否为循环（数组）字段 */
  loop: boolean;
};

/** 办公室服务协议（agreement）可填充字段说明 */
export const AGREEMENT_FIELD_DICTIONARY: DocumentFieldDef[] = [
  { key: 'contractCode', label: '合约编号', loop: false },
  { key: 'startDate', label: '合约开始日期', loop: false },
  { key: 'endDate', label: '合约到期日期', loop: false },
  { key: 'monthlyRent', label: '月租（两位小数，无千分位）', loop: false },
  {
    key: 'monthlyRentAmount',
    label:
      '月租金额（千分位）。模板示例：合約期內每月費用 HKD$ {monthlyRentAmount}(每{paymentCycleMonths}個月付一次款)',
    loop: false,
  },
  { key: 'monthlyRentText', label: '月租（中文大写）', loop: false },
  {
    key: 'monthlyRentLine',
    label: '服务月费整句（旧；新模板请用 monthlyRentAmount + paymentCycleMonths）',
    loop: false,
  },
  { key: 'paymentCycle', label: '缴费周期（如 年繳）', loop: false },
  {
    key: 'paymentCycleMonths',
    label: '缴费月数（数字：月繳1 / 季繳3 / 半年繳6 / 年繳12 / 1年半18 / 2年24）',
    loop: false,
  },
  { key: 'paymentCyclePayText', label: '缴费说明整句（旧；如 每12個月付一次款）', loop: false },
  { key: 'electricityRate', label: '电费/度（纯数字，如 1.20）', loop: false },
  {
    key: 'electricity',
    label:
      '电费单价（含$号，如 $1.20）。模板可写：---NIL--- 跟前約 (以每度電 {electricity} 計)',
    loop: false,
  },
  { key: 'roomDeposit', label: '房间按金（无千分位）', loop: false },
  { key: 'roomDepositAmount', label: '房间按金（千分位，如 9,538.00）', loop: false },
  { key: 'bookingDeposit', label: '订金', loop: false },
  { key: 'miscDeposit', label: '杂项按金（无千分位）', loop: false },
  { key: 'miscDepositAmount', label: '杂项按金（千分位，如 2,000.00）', loop: false },
  {
    key: 'serviceDepositLine',
    label:
      '服务保证金表达式（房间按金+杂项按金）。模板右格写 {serviceDepositLine} → $ 9,538.00 + $ 2,000.00',
    loop: false,
  },
  {
    key: 'serviceDepositAmount',
    label: '服务保证金合计（千分位：房间按金+杂项按金）',
    loop: false,
  },
  {
    key: 'doorKeyQty',
    label: '房门匙数量。模板示例：{doorKeyQty} 支 (按金${doorKeyUnitPrice} 每支)',
    loop: false,
  },
  { key: 'doorKeyUnitPrice', label: '房门匙单价（配置，如 100）', loop: false },
  { key: 'doorKeyDeposit', label: '房门匙按金合计', loop: false },
  {
    key: 'mailboxKeyQty',
    label: '信箱匙数量。模板示例：{mailboxKeyQty} 支 (按金${mailboxKeyUnitPrice} 每支)',
    loop: false,
  },
  { key: 'mailboxKeyUnitPrice', label: '信箱匙单价（配置，如 100）', loop: false },
  { key: 'mailboxKeyDeposit', label: '信箱匙按金合计', loop: false },
  { key: 'remark', label: '合约备注', loop: false },
  { key: 'leaseType', label: '租赁方式', loop: false },
  { key: 'customerCode', label: '客户编号', loop: false },
  { key: 'customerName', label: '客户名称', loop: false },
  { key: 'companyNameZh', label: '公司名称（中文）', loop: false },
  { key: 'companyNameEn', label: '公司名称（英文）', loop: false },
  { key: 'businessRegNo', label: '商业登记号码', loop: false },
  { key: 'businessNature', label: '业务性质', loop: false },
  { key: 'occupantName', label: '使用者姓名', loop: false },
  { key: 'occupantMobile', label: '使用者手提电话', loop: false },
  { key: 'occupantPhone', label: '使用者联络电话', loop: false },
  { key: 'occupantEmail', label: '使用者电邮', loop: false },
  { key: 'occupantFax', label: '使用者传真', loop: false },
  { key: 'occupantAddress', label: '使用者通讯地址', loop: false },
  { key: 'occupantIdCardNo', label: '使用者身份证号码', loop: false },
  { key: 'roomCode', label: '房间编号', loop: false },
  {
    key: 'roomName',
    label: '房间名称（不含末尾「室」）。模板写：{roomName} 室 → 05A 室',
    loop: false,
  },
  { key: 'buildingName', label: '大厦名称', loop: false },
  { key: 'buildingAddress', label: '大厦地址（中文）', loop: false },
  { key: 'buildingAddressEn', label: '大厦地址（英文）', loop: false },
  {
    key: 'periodsLines',
    label:
      '合约期多行文本（推荐：左格「合約期」，右格只写 {periodsLines}；自动换行且末尾无空行）',
    loop: false,
  },
  {
    key: 'periods',
    label: '合约期循环（进阶；循环内软换行会导致最后多一空行，单元格多行请改用 periodsLines）',
    loop: true,
  },
  { key: 'periodCount', label: '合约期段数', loop: false },
  { key: 'periodsSummary', label: '合约期摘要（多段用分号拼接）', loop: false },
];

/** 发票（invoice）可填充字段说明；兼容旧系统 ${inv_*} 键名（模板内写 {inv_No}） */
export const INVOICE_FIELD_DICTIONARY: DocumentFieldDef[] = [
  { key: 'inv_No', label: '发票编号（旧键；等同 invoiceCode）', loop: false },
  { key: 'invoiceCode', label: '发票编号', loop: false },
  { key: 'inv_date', label: '发票日期 DD/MM/YYYY（旧键；等同 invoiceDate）', loop: false },
  { key: 'invoiceDate', label: '发票日期（DD/MM/YYYY）', loop: false },
  { key: 'inv_dueDate', label: '收款期限 DD/MM/YYYY（旧键；等同 paymentDueDate）', loop: false },
  { key: 'paymentDueDate', label: '收款期限（DD/MM/YYYY）', loop: false },
  { key: 'customerName', label: '客户名称', loop: false },
  { key: 'clientname', label: '客户名称（旧键别名，Payment Advice 区常用）', loop: false },
  { key: 'customerCode', label: '客户编号', loop: false },
  { key: 'roomName', label: '房间名称（不含末尾「室」）', loop: false },
  { key: 'roomNo', label: '房间编号（旧键；等同 roomCode）', loop: false },
  { key: 'roomCode', label: '房间编号', loop: false },
  { key: 'address', label: '大厦地址（优先英文 addressEn）', loop: false },
  { key: 'buildingName', label: '大厦名称', loop: false },
  { key: 'buildingAddress', label: '大厦地址（中文）', loop: false },
  { key: 'buildingAddressEn', label: '大厦地址（英文）', loop: false },
  { key: 'contractCode', label: '合约编号', loop: false },
  { key: 'invoiceType', label: '发票类型', loop: false },
  { key: 'description', label: '发票描述', loop: false },
  {
    key: 'inv_subtotal',
    label: '小计（千分位；有明细则明细合计，否则发票金额）',
    loop: false,
  },
  { key: 'inv_total', label: '发票合计 HKD（千分位；等同 amount）', loop: false },
  { key: 'inv_amountDue', label: '应付金额（千分位；等同 inv_total）', loop: false },
  { key: 'amount', label: '开票金额（千分位）', loop: false },
  { key: 'subtotal', label: '小计（千分位）', loop: false },
  { key: 'FPSID', label: 'FPS 收款标识（旧键；等同 fpsId）', loop: false },
  { key: 'fpsId', label: 'FPS 收款标识（取自大厦）', loop: false },
  {
    key: 'accountName',
    label: '银行户名（旧键；等同 bankAccountHolder，取自大厦）',
    loop: false,
  },
  { key: 'bankAccountHolder', label: '银行户名（取自大厦）', loop: false },
  { key: 'account', label: '银行账户（旧键；等同 bankAccount，取自大厦）', loop: false },
  { key: 'bankAccount', label: '银行账户（取自大厦）', loop: false },
  {
    key: 'post',
    label: '支票付款说明/寄送（旧键；等同 chequePaymentBy，取自大厦）',
    loop: false,
  },
  { key: 'chequePaymentBy', label: '支票付款说明（取自大厦）', loop: false },
  {
    key: 'payment_advice',
    label: 'Payment Advice 收款地址块（旧键；等同 paymentAdvice，取自大厦）',
    loop: false,
  },
  { key: 'paymentAdvice', label: 'Payment Advice（取自大厦）', loop: false },
  {
    key: 'items',
    label:
      '明细循环（来自发票「服务细节」；无细节时回退为 1 行开票金额）。表内同一行：首格 {#items}{description}，次格 {quantity}，再次 {unitPrice}，末格 {amount}{/items}',
    loop: true,
  },
  { key: 'itemCount', label: '明细行数（含无细节时的回退行）', loop: false },
  { key: 'notes', label: '发票备注（业务说明）', loop: false },
  { key: 'remark', label: '备注', loop: false },
  { key: 'whatsappNumber', label: 'WhatsApp 号码', loop: false },
  { key: 'status', label: '发票状态', loop: false },
];

/** 收据（receipt）可填充字段；兼容旧系统 ${date}/${payer}/${amount}/${paymentNumber} */
export const RECEIPT_FIELD_DICTIONARY: DocumentFieldDef[] = [
  { key: 'date', label: '收款日期（旧键；英文长格式，如 25 September 2026）', loop: false },
  { key: 'paymentDateLong', label: '收款日期（英文长格式，等同 date）', loop: false },
  { key: 'paymentDate', label: '收款日期（DD/MM/YYYY）', loop: false },
  { key: 'payer', label: '付款人／客户名称（旧键；等同 customerName）', loop: false },
  { key: 'customerName', label: '客户名称', loop: false },
  { key: 'customerCode', label: '客户编号', loop: false },
  {
    key: 'amount',
    label: '收款金额（千分位，无币种符号；模板可写 HK$ {amount}）',
    loop: false,
  },
  { key: 'amountRaw', label: '收款金额（无千分位）', loop: false },
  {
    key: 'paymentNumber',
    label: '該款繳付（旧键；优先 #发票编号，无发票时用 #收据编号）',
    loop: false,
  },
  { key: 'receiptCode', label: '收据编号', loop: false },
  { key: 'invoiceCode', label: '所属发票编号（无 # 前缀）', loop: false },
  { key: 'contractCode', label: '所属合约编号', loop: false },
  { key: 'receivableCode', label: '所属应收编号', loop: false },
  { key: 'paymentMethod', label: '收款方式', loop: false },
  {
    key: 'cashCheque',
    label: 'Cash/支票行（旧模板手写位；现金或支票时填收款方式，否则空）',
    loop: false,
  },
  { key: 'remark', label: '备注', loop: false },
  { key: 'roomCode', label: '房间编号', loop: false },
  { key: 'roomName', label: '房间名称（不含末尾「室」）', loop: false },
  { key: 'buildingName', label: '大厦名称', loop: false },
  { key: 'buildingAddress', label: '大厦地址（中文）', loop: false },
  { key: 'buildingAddressEn', label: '大厦地址（英文）', loop: false },
  {
    key: 'companyNameZh',
    label: '客户公司名称（中文）',
    loop: false,
  },
  {
    key: 'companyNameEn',
    label: '客户公司名称（英文）',
    loop: false,
  },
];

export function getFieldDictionary(type: string): DocumentFieldDef[] {
  if (type === 'agreement') return AGREEMENT_FIELD_DICTIONARY;
  if (type === 'invoice') return INVOICE_FIELD_DICTIONARY;
  if (type === 'receipt') return RECEIPT_FIELD_DICTIONARY;
  return [];
}
