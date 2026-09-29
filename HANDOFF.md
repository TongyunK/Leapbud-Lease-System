# HANDOFF — Leapbud 单据模板 / 协议列印 PDF

> 写给**无上下文**的新会话。仓库：`Leapbud-Lease-System`。日期参考：2026-09-22～23。

---

## 1. 我们在做什么任务

核心业务：**协议 Word 模板填模 → LibreOffice 转 PDF → 浏览器新标签预览/列印**。

近期用户诉求与演进：

| 阶段 | 诉求 |
|------|------|
| 性能 | LibreOffice 慢；误导文案「首次转换需要数秒」；要最终 PDF 版式（不要浏览器 docx-preview 近似） |
| 交互 | 预览打开后**不要**自动弹出打印 |
| 文件名 | 另存为应为「合约编号-客户名称.pdf」（避免 blob UUID 文件名） |
| 数据模型 | 单据模板去掉所属大厦/大厦默认；改由**大厦绑定**模板 ID，一模板多大厦共用 |
| 模板语法 | `{roomName}` 可否多处填写 → **可以**（注意是花括号，不是 `${}`） |
| 版式问题 | 转 PDF 后「第二页后面多一空白页」——用户否认是末尾空段问题，称五页内容+四个分页符正确，**仅第 2 页后多空白** |

并行小改：单据模板表「模板名称」列窄一点、「模板檔案」列宽一点。

---

## 2. 已经完成了什么

### 2.1 PDF 转换与预览链路（可用）

- **后端** `backend/src/document-templates/pdf-convert.util.ts`
  - LibreOffice 常驻监听（端口 2002）+ UNO（`backend/scripts/lo-uno-convert.py`）优先转换；失败回退 `--convert-to pdf`
  - 监听进程 `detached`，避免 Nest watch 重启每次冷启动
  - 内存 + 磁盘 PDF 缓存（`%TEMP%/leapbud-pdf-cache`）
  - 启动 `warmUpLibreOffice()`（在 `DocumentTemplatesService` 构造里）

- **协议列印** `agreement-print.service.ts`
  - 稳定缓存键：`print:{contractId}:{templateId}:{tplUpdatedAt}:{dataHash}`
  - 文件名：`{合约编号}-{客户名称}.pdf`（非法字符替换）

- **预览文件名（关键）**  
  blob URL 的「另存为」永远是 UUID。已改为：
  1. `POST .../prints/agreement/preview-ticket`（需登录）生成短时票据并缓存 PDF
  2. 新标签打开 `GET .../prints/agreement/view/:ticket/:fileName`（**无鉴权**，UUID 即密钥）
  3. `Content-Disposition` + URL 末段文件名 → 另存为正确名称  
  相关：`pdf-preview-ticket.util.ts`、`agreement-preview.controller.ts`

- **前端** `frontend/src/api/document-templates.ts`
  - 预览走票据 URL；悬停/打开详情 `prefetchAgreementPdfApi` 预热
  - `autoPrint` 默认 **false**（不再自动打印）
  - 加载文案中性（无「首次转换」）

- **曾引入又撤回**：`docx-preview` 浏览器渲染（用户要最终 PDF 效果）——依赖已卸，`docxPreview.ts` 已删。

### 2.2 模板存储与大厦绑定（已落地）

- 磁盘路径：`uploads/document-templates/{templateId}/{fileName}`（**允许同名文件**多模板）
- Migration：`backend/prisma/migrations/20260918160000_building_bind_document_templates/`
  - 去掉 `document_templates.building_id` / `is_building_default`
  - 大厦改为 `agreement_template_id` / `invoice_template_id` / `receipt_template_id` FK
- 打印解析：客户 `agreementTemplateId` 覆盖 → 否则房间所属大厦绑定的协议模板
- 前端：单据模板页无大厦字段；大厦表单下拉绑定模板 + 预览

### 2.3 其它已修

- 导出函数名必须带 `*Api` 后缀（曾改丢导致「大厦信息 / 单据模板」菜单点不动）
- Vite `dependencies optimized / reloading`：**不是 bug**，开发期首次用到 Element Plus 样式的正常预构建

---

## 3. 当前卡在哪

### 空白页问题（未结案）

- **现象**：用户模板  
  `backend/uploads/document-templates/cmu5bpbzk0001mdkkrzk9mkzk/合约通用.docx`  
  转 PDF 后，**仅第 2 页后面多一页几乎空白**（仅页眉 leapbud logo），其它页正常。
- **用户纠正**：五个内容页应对四个分页符；不是「全文末尾多空页」那种简单情况。
- **已查**：docx 内有 **4 个** `<w:br w:type="page"/>`；末尾签名后有空段落；但用户说问题位置是「第二页后」，需按**第 2 个分页符前后**再查，或对比 **Word 预览 vs LibreOffice 分页差异**。
- **中断**：用 PowerShell + 内联 `node -e` 分析被中断；已写脚本但未必跑完：  
  `backend/scripts/inspect-docx-pages.mjs`  
  （依赖先把 docx 解压到 `%TEMP%/leapbud-docx-inspect/out/word/document.xml`）

### 合约页大厦胶囊筛选（未完成）

- 用户曾要求合约信息页做成与房间信息页一样的大厦 pill 筛选。
- 已调研 `RoomListView` 的 `building-chips-*` + `filters.buildingId`；合约列表 API **尚无** `buildingIds` 过滤；`Building` DTO **尚无** `contractCount`。
- **未提交实现**（会话被空白页/其它话题打断）。

---

## 4. 下一步计划（建议优先级）

1. **空白页**
   - 重新解压 `合约通用.docx`，跑通 `inspect-docx-pages.mjs`，盯死 **第 2 个分页符** 前后是否有：空段落、双分页、表格强制换页、段前分页等。
   - 同机对比：Word 打印预览页数 vs 本系统 PDF 页数；若仅 LO 多一页 → 属转换引擎版式差，再考虑 LO 参数或让用户改模板结构。
   - **不要**未经确认就在后端「智能删分页」——易破坏合法五页结构。

2. **合约大厦筛选**（若用户仍要）
   - Backend：`contracts` list 支持 `buildingIds`（经 `room.buildingId`）。
   - Building 列表带 `contractCount`（或专用 stats），芯片显示 `全部 (n)` / `大厦名 (n)`。
   - Frontend：`ContractListView` 复用 `admin-page-head--with-chips` + 全局 `style.css` 里已有 `.building-chips-*`。

3. **运维提醒**：改 Prisma 后若 `prisma generate` EPERM，多半是 backend 占用 `query_engine`；需用户重启 backend 后再 generate。

---

## 5. 踩过的坑（绝对不要再踩）

### 编码 / 写文件（Windows）

- **禁止**用 PowerShell `Set-Content` / `Out-File` / `>` 回写 `.vue/.ts/.md` 等（会毁掉 UTF-8）。
- 改源码用编辑工具；批量用独立 `.mjs` + `fs` utf8，或 Python `encoding='utf-8'`。
- 仓库规则：`.cursor/rules/utf8-powershell.mdc`。

### PDF / LibreOffice

- **`--accept` 监听 ≠ `--convert-to` 自动复用**；必须用 UNO（LO 自带 `python.exe` + `lo-uno-convert.py`）才明显加速二次转换。
- **不要**再推 docx-preview 当「最终 PDF」——用户明确拒绝近似版式。
- **blob: URL 无法带 Content-Disposition 文件名**；另存为正确名必须用带文件名的 HTTP 预览 URL（已实现的 ticket 方案）。
- 前端「首次转换需要数秒」是**写死文案**，不是性能真相；勿再写回去。
- `autoPrint` 默认关；调用处勿再传 `autoPrint: true`。

### API / 前端导出

- `document-templates.ts` 导出必须叫 `createDocumentTemplateApi` / `updateDocumentTemplateApi` / `deleteDocumentTemplateApi` / `batchDeleteDocumentTemplatesApi`。曾改成无 `Api` 后缀 → 懒加载失败 → **大厦/单据模板菜单无反应**。

### 模板与数据模型

- 占位符是 **`{field}`**（docxtemplater），同一字段可多处使用；不是 `${field}`。
- 模板文件唯一性按 **templateId 目录**，不要再按全局文件名互斥报「文件名已被模板使用」。
- 大厦模板绑定在 **Building.*TemplateId**；`DocumentTemplate` 上不要再加 `buildingId` / `isBuildingDefault`。
- 删模板前检查客户引用 + 大厦绑定，勿静默清空导致打印 400。

### 进程 / 服务

- 规则：**不要主动重启** backend/frontend；由用户自行刷新/重启。
- Prisma generate 失败 EPERM → 先停占用的 Node/Nest，再 generate。

### 调查空白页时

- 不要只看文档末尾空段就下定论；用户已否定「整篇末尾空页」叙事，聚焦 **page 2 → page 3 边界**。
- 内联 `node -e` + PowerShell 复杂引号极易翻车；用仓库内 `.mjs` 文件执行。

---

## 6. 关键路径速查

| 用途 | 路径 |
|------|------|
| PDF 转换 | `backend/src/document-templates/pdf-convert.util.ts` |
| UNO 脚本 | `backend/scripts/lo-uno-convert.py` |
| 填模 | `backend/src/document-templates/docx-fill.util.ts` |
| 协议数据/打印 | `backend/src/document-templates/agreement-print.service.ts` |
| 预览票据 | `pdf-preview-ticket.util.ts` + `agreement-preview.controller.ts` |
| 模板 CRUD | `document-templates.service.ts` |
| 前端预览 API | `frontend/src/api/document-templates.ts` |
| 字段字典 | `backend/src/document-templates/field-dictionary.ts` |
| 问题模板样例 | `backend/uploads/document-templates/cmu5bpbzk0001mdkkrzk9mkzk/合约通用.docx` |
| 分页排查脚本 | `backend/scripts/inspect-docx-pages.mjs` |
| 房间大厦胶囊（可抄） | `frontend/src/views/room-mgmt/RoomListView.vue` + `frontend/src/style.css`（`.building-chips-*`） |
| 合约列表（待加胶囊） | `frontend/src/views/contract-mgmt/ContractListView.vue` |

---

## 7. 一句话状态

**协议 PDF 列印主链路已可用且偏快；大厦↔模板绑定已改完。当前未完成：① 合约通用模板「第 2 页后空白页」根因；② 合约列表大厦筛选胶囊。**

---

# HANDOFF — 关联字段点击打开详情抽屉（全链路下钻）

> **日期**：2026-09-29  
> **对话窗口**：[`关联字段详情抽屉`](95396268-2481-4424-9dd2-57b6ab6cfe80)（agent transcript：`95396268-2481-4424-9dd2-57b6ab6cfe80`）  
> **写给**：完全没有上下文的新会话。仓库：`Leapbud-Lease-System`。  
> **说明**：本文档追加在既有「单据模板 / 协议列印」交接之后；两段任务独立，勿混。

---

## A. 我们在做什么任务

用户要求：

> 检查所有关联字段，都需要实现点击左侧弹出详情抽屉页；**包括抽屉页中显示的内容里的关联字段**，也要可以继续点击查看详情抽屉。

即：列表列 FK、详情抽屉内 FK、数量胶囊（CountListPill）、Related 列表抽屉里的主行与**次级**关联列，全部应可下钻到对应实体的详情抽屉（通常从左侧 / LTR 弹出）。

本会话还叠加了此前同窗口未提交的周边改动（发票/收据列印、表头筛选 UX、侧栏宽度等），但**本交接聚焦关联下钻**。

---

## B. 已经完成了什么

### B.1 统一枢纽：`RelatedEntityDrawers.vue`

路径：`frontend/src/components/RelatedEntityDrawers.vue`

- 集中托管客户 / 房间 / 楼宇 / 需求 / 入住人 / 合约 / 发票 / 应收 / 收据 / 合约期 / 退租 / 其他费用（含按金扣除 ns）/ 按金退还 / 发票服务明细 的详情抽屉 + 各类 `Related*` 列表抽屉。
- 详情抽屉内 `@open-*`（FK + 数量胶囊）全部接到 hub 内方法，可继续下钻。
- Related 列表打开详情时改为走 `openXxxSide(id)` **重新 fetch**，保证有完整 count 等字段（不要只塞列表行对象）。
- `defineExpose` 已包含：  
  `openCustomerSide` / `openRoomSide` / `openBuildingSide` / `openRequirementSide` /  
  `openContractSide` / `openInvoiceSide` / `openReceivableSide` / `openReceiptSide` /  
  `openPeriodSide` / `openTerminationSide` / `openOtherFeeSide` / `openDepositRefundSide` /  
  `openServiceDetailSide`

### B.2 业务 ListView 接线模式

业务列表页保留**本页主实体**的 DetailDrawer；嵌套实体打开改为：

```ts
await relationDrawers.value?.openContractSide(id) // 及其它 open*Side
```

并挂 `<RelatedEntityDrawers ref="relationDrawers" />`。

已按此处理（或已对齐）的页面包括但不限于：

- 客户 / 入住人 / 需求 / 楼宇 / 房间  
- 合约 / 合约期 / 退租 / 其他费用 / 按金扣除  
- 发票 / 应收 / 收据 / 按金退还 / 发票服务明细  

示例已落地：

- `ContractOtherFeeListView` / `DepositDeductionListView`：列表 `terminationCode` 可点 → `openTerminationSide`
- `ContractListView` / `CustomerListView` / `InvoiceListView` 等：Related 列表里点开明细走 hub

### B.3 Related 列表「次级 FK 列」可点（本会话后半段补齐）

| 组件 | 可点次级列 | emit |
|------|------------|------|
| `RelatedContractsDrawer` | 客户名、房间编号 | `openCustomer` / `openRoom` |
| `RelatedPeriodsDrawer` | 房间编号 | `openRoom` |
| `RelatedReceiptsDrawer` | 合约 / 发票 / 应收编号 | `openContract` / `openInvoice` / `openReceivable` |
| `RelatedInvoicesDrawer` | 合约编号 | `openContract` |
| `RelatedReceivablesDrawer` | 发票 / 合约编号 | `openInvoice` / `openContract` |
| `RelatedOtherFeesDrawer` | 退租编号 | `openTermination` |
| `RelatedTerminationsDrawer` | 合约 / 房间编号 | `openContract` / `openRoom` |

Hub 与主要 ListView（Customer / Room / Contract / Invoice / DepositRefund / Requirement 等）已接上对应 `@open-*`。

### B.4 其它同会话相关但非本交接主题（有改动未单独交接）

工作区 `git status` 里还有大量未提交改动，可能含：收据列印、合约未保存草稿预览、侧栏变窄、表头筛选清除 ✕ / facet 选项不收缩、筛选搜索框样式等。新会话若只做「关联下钻」，请先 `git diff` / `git status` 分清范围，**不要把无关 diff 一并 commit**。

---

## C. 当前卡在哪 / 未尽事项

1. **未提交**：关联下钻相关前端改动仍在工作区，**用户未要求 commit**。新会话不要擅自提交。
2. **Related 列表仍可增强（非必须）**：
   - `RelatedDepositRefundsDrawer` 等若只有主编号列、无次级 customer/room/contract 列，按「从非合约上下文打开是否需要」再补。
   - `LeaseTermination.relatedDepositRefund` 多为自由文本无 `*Id`，**不必**硬做成抽屉链接。
3. **销售经理 / 用户账号**：一般不做业务实体详情抽屉（N/A）。
4. **预存在的 vue-tsc 噪音**（非本任务引入）：多处 `tableRef` unused、`@row-click` 与 Element Plus `TableColumnCtx | null` 类型不匹配、`DefaultRow` 传参等。修关联下钻时**不要顺手大扫除**除非用户要求。
5. **旧 HANDOFF 未结案项仍在**：协议模板「第 2 页后空白页」、合约列表大厦筛选胶囊——与本任务无关。

---

## D. 下一步计划（建议新会话按序做）

1. 人工点验：客户 → 合约 → 发票 → 应收 → 收据 → 再点回合约/客户；Related 列表点次级 FK；其他费用/按金扣除的 `terminationCode`。
2. 若用户要提交：只 stage 关联下钻相关文件（`RelatedEntityDrawers`、`Related*`、各 `*ListView`、相关 `*DetailDrawer`），排除 `dist/` 与无关列印/CSS 若用户未要求一并提交。
3. 可选清理：ListView 里因改走 hub 而残留的未使用 import / 本地 nested DetailDrawer 状态（本会话已清大部分，以 `vue-tsc` / IDE 为准再扫一遍）。
4. 不要主动重启 dev server（仓库规则）。

---

## E. 踩过的坑（绝对不要再踩）

### 编码 / 改文件（仓库红线）

- **禁止**用 PowerShell `Set-Content` / `Out-File` / `>` / `Get-Content -Raw` 再写回 `.vue/.ts` 等源文件（UTF-8 会被毁掉）。
- 批量改文件：用编辑工具，或独立 `.mjs` + `fs.readFileSync/writeFileSync(..., 'utf8')`。本会话曾写临时 cleanup 脚本，用完已删；需要时再写，**不要**用复杂 `node -e "..."` 内联塞进 PowerShell。

### 关联下钻架构

- **嵌套详情必须走 hub**（`relationDrawers.openXxxSide`）。在 ListView 本地再挂一套 DetailDrawer 却不接 `@open-*`，会出现「第一层能点、抽屉里 FK 点不动」。
- Related 列表点开行时要用 **`openXxxSide(id)` fetch 全量**，不要 `relatedX.value = row` 只塞列表行（count 胶囊会缺数据）。
- `openOtherFeeSide(id, ns)` 的 `ns`：`'contractOtherFee' | 'depositDeduction'`。退租下打开按金扣除列表要用 `depositDeduction`。
- 按金退还编号字段是 **`refundCode`**，不是 `depositRefundCode`（hub 的 title-context 曾写错过）。

### 产品 / 交互约定

- 弹窗默认居中可拖：`App.vue` / `main.ts` 已全局配置，新增 `el-dialog` **不必**重复写 `align-center` / `draggable`。
- **不要主动重启** backend / frontend。
- 表格列宽必须用 `useTableColWidth`（`codeColW` / `textColW` / `statusColW` 等），编号列加 `col-code`。
- 日期/时间列：排序 + `date-range` 筛选（既有规则）。

### Prisma（若本任务扩到后端）

- 新字段必须有中文 `///` + migration `COMMENT ON`（本任务前端为主，一般不动 schema）。

---

## F. 关键路径速查（关联下钻）

| 用途 | 路径 |
|------|------|
| 全局关联枢纽 | `frontend/src/components/RelatedEntityDrawers.vue` |
| Related 列表组件 | `frontend/src/components/Related*.vue` |
| 各实体详情抽屉 | `frontend/src/components/*DetailDrawer.vue` |
| 样式 `.fk-link` | `frontend/src/style.css`（搜 `fk-link`） |
| 参考接线（合约） | `frontend/src/views/contract-mgmt/ContractListView.vue` |
| 参考接线（客户） | `frontend/src/views/customer-mgmt/CustomerListView.vue` |
| 退租编号列表 FK | `ContractOtherFeeListView` / `DepositDeductionListView` |

---

## G. 一句话状态（本任务）

**关联字段 → 左侧详情抽屉 → 抽屉内继续下钻的主链路与 Related 次级 FK 已基本打通；改动未提交。新会话优先人工回归点验，再按用户要求选择性 commit；勿与上方「协议 PDF 空白页」任务搅在一起。**
