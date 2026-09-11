/** 导入时优先选用的「在租/签约」类合约状态（含旧系统写法） */
const PREFERRED_CONTRACT_STATUSES = new Set([
  '租賃中',
  '租赁中',
  '租用中',
  '簽約中',
  '签约中',
  '已簽約',
  '已签约',
  '交吉中',
]);

export type ContractByRoomCandidate = {
  id: string;
  contractCode: string;
  status: string;
  startDate: Date | null;
  createdAt: Date;
  roomId: string;
  customerId: string;
  customer?: {
    id: string;
    name: string;
    companyNameZh?: string | null;
    companyNameEn?: string | null;
  } | null;
};

function customerNameKeys(c: NonNullable<ContractByRoomCandidate['customer']>): string[] {
  return [c.name, c.companyNameZh, c.companyNameEn]
    .map((x) => (x ?? '').trim().toLowerCase())
    .filter(Boolean);
}

/**
 * 从同一房间的多份合约中挑一份：
 * - 可选 customerName（匹配客户 name / 公司中英名）；匹配到多个不同客户 → 视为 ambiguous，返回 null
 * - 优先「租用中/签约中」等活跃状态，否则取全部
 * - 再按 startDate、createdAt 取最新
 * - 0 条 → null
 */
export function pickContractFromRoomCandidates(
  contracts: ContractByRoomCandidate[],
  customerName?: string | null,
): ContractByRoomCandidate | null {
  let list = contracts.slice();
  const name = (customerName ?? '').trim().toLowerCase();
  if (name) {
    const matched = list.filter((c) => {
      const cust = c.customer;
      if (!cust) return false;
      return customerNameKeys(cust).includes(name);
    });
    const customerIds = [...new Set(matched.map((c) => c.customerId))];
    if (customerIds.length === 0) return null;
    if (customerIds.length > 1) return null; // ambiguous customer
    list = matched;
  }
  if (!list.length) return null;

  const preferred = list.filter((c) => PREFERRED_CONTRACT_STATUSES.has(c.status));
  const pool = preferred.length ? preferred : list;
  pool.sort((a, b) => {
    const aStart = a.startDate?.getTime() ?? 0;
    const bStart = b.startDate?.getTime() ?? 0;
    if (aStart !== bStart) return bStart - aStart;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  return pool[0] ?? null;
}

/** Prisma select 片段：按房间解析合约时使用 */
export const contractByRoomSelect = {
  id: true,
  contractCode: true,
  status: true,
  startDate: true,
  createdAt: true,
  roomId: true,
  customerId: true,
  customer: {
    select: {
      id: true,
      name: true,
      companyNameZh: true,
      companyNameEn: true,
    },
  },
} as const;
