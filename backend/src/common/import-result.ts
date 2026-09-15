/** 导入单条问题（跳过 / 未匹配 / 失败） */
export type ImportIssueStatus = 'skipped' | 'unlinked' | 'failed';

export type ImportIssue = {
  status: ImportIssueStatus;
  /** 中文原因说明 */
  reason: string;
  /** 关键定位字段（合约编号、房间编号等） */
  keys?: Record<string, string>;
};

export type ImportBatchStats = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  unlinked?: number;
  issues?: ImportIssue[];
};

/** 过滤空值，组装 keys */
export function importIssueKeys(
  fields: Record<string, string | number | null | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) out[k] = s;
  }
  return out;
}

export function pushImportIssue(
  issues: ImportIssue[],
  status: ImportIssueStatus,
  reason: string,
  keys?: Record<string, string | number | null | undefined>,
) {
  issues.push({
    status,
    reason,
    keys: keys ? importIssueKeys(keys) : undefined,
  });
}
