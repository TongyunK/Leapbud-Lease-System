/** 功能按钮权限目录（启动时同步到 permissions 表） */

export type PermissionAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'import'
  | 'batchDelete';

export type PermissionModuleDef = {
  module: string;
  /** 繁中模块名 */
  moduleName: string;
  sortOrder: number;
  /** 是否默认授权给普通 user 角色（系统管理类为 false） */
  defaultGrant?: boolean;
};

export type PermissionDef = {
  code: string;
  module: string;
  action: PermissionAction;
  name: string;
  sortOrder: number;
};

export const PERMISSION_MODULES: PermissionModuleDef[] = [
  // —— 业务 ——
  { module: 'buildings', moduleName: '大廈', sortOrder: 10, defaultGrant: true },
  { module: 'rooms', moduleName: '房間', sortOrder: 20, defaultGrant: true },
  { module: 'customers', moduleName: '客戶', sortOrder: 30, defaultGrant: true },
  { module: 'customerRequirements', moduleName: '客戶需求', sortOrder: 40, defaultGrant: true },
  { module: 'occupants', moduleName: '使用者', sortOrder: 50, defaultGrant: true },
  { module: 'contracts', moduleName: '合約', sortOrder: 60, defaultGrant: true },
  { module: 'contractPeriods', moduleName: '合約期', sortOrder: 70, defaultGrant: true },
  { module: 'leaseTerminations', moduleName: '退租', sortOrder: 80, defaultGrant: true },
  { module: 'contractOtherFees', moduleName: '合約其他費用', sortOrder: 90, defaultGrant: true },
  { module: 'depositDeductions', moduleName: '按金扣除事項', sortOrder: 95, defaultGrant: true },
  { module: 'depositRefunds', moduleName: '按金退還', sortOrder: 100, defaultGrant: true },
  { module: 'invoices', moduleName: '發票', sortOrder: 110, defaultGrant: true },
  { module: 'invoiceServiceDetails', moduleName: '發票服務明細', sortOrder: 120, defaultGrant: true },
  { module: 'receivables', moduleName: '應收', sortOrder: 130, defaultGrant: true },
  { module: 'receipts', moduleName: '收據', sortOrder: 140, defaultGrant: true },
  // —— 配置 / 系统 ——
  { module: 'contractConfigs', moduleName: '合約配置', sortOrder: 200, defaultGrant: false },
  { module: 'roomConfigs', moduleName: '房間配置', sortOrder: 210, defaultGrant: false },
  { module: 'roomTypes', moduleName: '房間類型', sortOrder: 220, defaultGrant: false },
  { module: 'customerSources', moduleName: '客戶來源', sortOrder: 230, defaultGrant: false },
  { module: 'documentTemplates', moduleName: '單據模板', sortOrder: 240, defaultGrant: false },
  { module: 'numberingRules', moduleName: '自動編號', sortOrder: 250, defaultGrant: false },
  { module: 'systemSettings', moduleName: '系統設置', sortOrder: 255, defaultGrant: false },
  { module: 'scheduledJobs', moduleName: '定時任務', sortOrder: 256, defaultGrant: false },
  { module: 'users', moduleName: '用戶', sortOrder: 260, defaultGrant: false },
  { module: 'roles', moduleName: '角色', sortOrder: 270, defaultGrant: false },
  { module: 'menus', moduleName: '菜單', sortOrder: 280, defaultGrant: false },
];

const ACTION_LABEL: Record<PermissionAction, string> = {
  create: '新增',
  update: '編輯',
  delete: '刪除',
  import: '導入',
  batchDelete: '批量刪除',
};

/** 个别模块动作文案（权限码不变；客户需求：跟进/取消） */
const ACTION_LABEL_BY_MODULE: Partial<Record<string, Partial<Record<PermissionAction, string>>>> = {
  customerRequirements: {
    update: '跟進',
    delete: '取消',
    batchDelete: '批量取消',
  },
  systemSettings: {
    update: '保存',
  },
  scheduledJobs: {
    update: '編輯/運行',
  },
};

const ACTIONS: PermissionAction[] = [
  'create',
  'update',
  'delete',
  'import',
  'batchDelete',
];

function actionLabel(module: string, action: PermissionAction): string {
  return ACTION_LABEL_BY_MODULE[module]?.[action] || ACTION_LABEL[action];
}

export const PERMISSION_CATALOG: PermissionDef[] = PERMISSION_MODULES.flatMap((m) =>
  ACTIONS.map((action, idx) => ({
    code: `${m.module}:${action}`,
    module: m.module,
    action,
    name: `${actionLabel(m.module, action)}${m.moduleName}`,
    sortOrder: m.sortOrder * 10 + idx,
  })),
);

/** 普通角色默认授予：业务模块的新增 + 编辑（不含系统管理） */
export const DEFAULT_USER_PERMISSION_CODES: string[] = PERMISSION_MODULES.filter(
  (m) => m.defaultGrant !== false,
).flatMap((m) => [`${m.module}:create`, `${m.module}:update`]);
