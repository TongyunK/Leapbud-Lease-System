# 工程师：简道云 JSON 全量业务导入

> **仅工程师使用。** 业务用户日常请继续用系统内 **Excel 导入/导出**（与本系统字段一致，不会有新旧 ID 对不上的问题）。

## 为什么需要两套导入

| 方式 | 谁用 | 作用 |
|------|------|------|
| **Excel**（系统 UI） | 业务用户 | 按本系统数据结构增改数据 |
| **JSON**（本脚本） | 工程师 | 从旧系统（简道云）全量迁移；用 `_id` → `legacyId` 串起一对多关系 |

旧系统服务细节/应收等关联的是发票 **`_id`**，不是发票编号；约一半发票甚至没有编号。因此必须先写入 `legacyId`，再挂子表。

## 数据目录

默认读取仓库根目录：

```
data/
  1.房间管理/*.export.json
  2.客户管理/*.export.json
  3.合约管理/*.export.json
  4.财务管理/*.export.json
```

## 推荐操作顺序

在 `backend` 目录执行。

### 1. 备份数据库

自行 `pg_dump` 或快照，再继续。

### 2. 同步旧用户 → 本系统 User.legacyId（先于业务导入）

旧 JSON 里「客户经理 / 销售经理 / 创建人」存的是简道云用户 `_id`。需先用 `data/userList.xlsx` 把这些 `_id` 写到本系统用户上：

```powershell
node scripts/json-import/sync-users-legacy.mjs --dry-run
node scripts/json-import/sync-users-legacy.mjs
# 本系统没有的旧账号（如 Voc）可一并创建，默认密码 Import123!
node scripts/json-import/sync-users-legacy.mjs --create-missing
```

匹配规则：按 Excel「名称 / 用户」对本系统 `account` / `displayName`；`Admin` → `admin`。本步骤**不清空**用户表。

### 3. 清空业务表（保留用户/角色/菜单/单据模板）

```powershell
node scripts/json-import/wipe-business-data.mjs --confirm
```

可先：

```powershell
node scripts/json-import/wipe-business-data.mjs --confirm --dry-run
```

### 4. 全量导入（可先 dry-run）

```powershell
node scripts/json-import/import-all.mjs --dry-run
node scripts/json-import/import-all.mjs
```

按阶段试跑：

```powershell
node scripts/json-import/import-all.mjs --only=rooms
node scripts/json-import/import-all.mjs --only=customers
node scripts/json-import/import-all.mjs --only=contracts
node scripts/json-import/import-all.mjs --only=finance
```

### 5. 导入顺序（脚本内部已按此执行）

1. 大厦 → 房间配置 → 房间  
2. 客户（含客户经理）→ 使用者 → 客户需求（含销售经理）  
3. 合约（含销售经理）→ 合约期 → 退租 → 借出产品(其他费用)  
4. 按金退还 → **发票（含销售经理 / legacyId）** → **服务细节** → 应收 → 收据  

未覆盖（暂无对应模型或非本次重点）：大厦配置明细、会议室短租、收据明细。

### 6. 无业务编号时的处理

- **发票**：旧系统待开票尚未赋号时编号为空；JSON 导入**保持空白**（`invoice_code` 可空），**不**生成 `INV…` 占位码。  
- 其它实体（客户/合约等）若缺编号，仍可用 `LEGACY` 风格码生成唯一值，业务日后可用 Excel 改成正式编号。

## 与 Excel 的边界

- **不要**让业务用户跑本目录脚本。  
- Excel 导入**不写**、也**不依赖** `legacyId`。  
- 迁移完成后，日常维护以 Excel / 系统页面为准。

## 相关字段

各业务表已有可选唯一字段 `legacy_id`（Prisma：`legacyId`），专供本迁移。发票上该字段注释亦说明服务细节 JSON 按此关联。

## 故障排查

- 某阶段 `unlinked` 很高：检查上一阶段是否导入成功（父表 `legacyId` 是否存在）；`--only=` 分段跑时必须先跑完依赖阶段。  
- 发票大量 `unlinked`：多为无合约（如会议室短租）或导出缺合约；有合约但缺房间时脚本会从合约回填房间。  
- 服务细节 `unlinked`：对应发票因无合约被跳过，属连带跳过。  
- 文件找不到：确认 `data/1.`～`4.` 目录名与 JSON 文件名含「大廈 / 房間 / 客戶 / 合約 / 發票 / 服務細節」等关键字。  
- Prisma Client 报未知字段：在 `backend` 执行 `npx prisma generate`（改 schema/migration 后）。

## 预期量级（参考本次导出）

| 实体 | 约可导入 | 约跳过 |
|------|----------|--------|
| 大厦 / 房间 | 8 / 348 | 0 |
| 客户 / 使用者 | 491 / 499 | 少 |
| 合约 | 599 | 0 |
| 发票 | ~8420 | ~1230（多无合约） |
| 服务细节 | ~9800 | ~1900（挂在被跳过发票上） |
| 应收 / 收据 | ~4100 / ~3900 | 少 |

正式写入前务必先 `--dry-run` 核对数量。
