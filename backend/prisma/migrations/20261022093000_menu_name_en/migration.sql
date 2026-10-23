-- 菜单英文名称：与中文 name 并列，随系统语言切换展示
ALTER TABLE "menus" ADD COLUMN "name_en" TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN "menus"."name" IS '中文显示名称（繁中）';
COMMENT ON COLUMN "menus"."name_en" IS '英文显示名称';
COMMENT ON COLUMN "menus"."name_key" IS 'i18n 键（如 menu.users；英文名未填时作兜底）';

-- 按已有 name_key 回填英文名（与前端 menu.* 文案对齐）
UPDATE "menus" SET "name_en" = CASE "name_key"
  WHEN 'menu.roomMgmt' THEN 'Room Management'
  WHEN 'menu.buildings' THEN 'Buildings'
  WHEN 'menu.rooms' THEN 'Rooms'
  WHEN 'menu.customerMgmt' THEN 'Customers'
  WHEN 'menu.customers' THEN 'Customer list'
  WHEN 'menu.occupants' THEN 'Occupants'
  WHEN 'menu.customerRequirements' THEN 'Requirements'
  WHEN 'menu.contractMgmt' THEN 'Contracts'
  WHEN 'menu.contracts' THEN 'Contract list'
  WHEN 'menu.contractConfigs' THEN 'Contract settings'
  WHEN 'menu.contractPeriods' THEN 'Contract periods'
  WHEN 'menu.leaseTerminations' THEN 'Lease terminations'
  WHEN 'menu.contractOtherFees' THEN 'Other contract fees'
  WHEN 'menu.financeMgmt' THEN 'Finance'
  WHEN 'menu.depositDeductions' THEN 'Deposit deductions'
  WHEN 'menu.depositRefunds' THEN 'Deposit refunds'
  WHEN 'menu.invoices' THEN 'Invoices'
  WHEN 'menu.invoiceServiceDetails' THEN 'Service details'
  WHEN 'menu.receivables' THEN 'Receivables'
  WHEN 'menu.receipts' THEN 'Receipts'
  WHEN 'menu.system' THEN 'System'
  WHEN 'menu.users' THEN 'Users'
  WHEN 'menu.roles' THEN 'Roles'
  WHEN 'menu.menus' THEN 'Menus'
  WHEN 'menu.roomConfigs' THEN 'Room configs'
  WHEN 'menu.roomTypes' THEN 'Room types'
  WHEN 'menu.customerSources' THEN 'Customer sources'
  WHEN 'menu.documentTemplates' THEN 'Document templates'
  WHEN 'menu.autoNumbering' THEN 'Auto numbering'
  ELSE "name_en"
END
WHERE COALESCE(TRIM("name_key"), '') <> '' AND COALESCE(TRIM("name_en"), '') = '';
