/**
 * 表格时间戳列内容宽度（创建时间 / 更新时间等）。
 * 需完整显示 `YYYY-MM-DD HH:mm:ss`（含 cell 内边距）。
 * 实际列宽请用 `useTableColWidth().datetimeColWidth`（会按中/英表头再加宽）。
 */
export const TABLE_DATETIME_CONTENT_WIDTH = 188

/**
 * 创建人 / 更新人列内容下限（完整显示常见账号如 superAdmin，含 cell 内边距）。
 * 实际列宽请用 `useTableColWidth().auditUserColWidth`。
 */
export const TABLE_AUDIT_USER_CONTENT_MIN = 132

/** 名称类列内容下限（客户名、大厦名、房间名、联系人名等） */
export const TABLE_NAME_COL_CONTENT_MIN = 200

/** 长文本列内容下限（需求内容、备注、提示等） */
export const TABLE_LONG_TEXT_COL_CONTENT_MIN = 240

/** 地址类列内容下限 */
export const TABLE_ADDRESS_COL_CONTENT_MIN = 280

/** @deprecated 请改用 useTableColWidth().datetimeColWidth */
export const TABLE_DATETIME_COL_WIDTH = TABLE_DATETIME_CONTENT_WIDTH
