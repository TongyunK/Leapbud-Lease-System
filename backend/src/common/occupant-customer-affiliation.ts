import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/** 结束该使用者所有「当前有效」归属记录 */
export async function closeOpenAffiliations(
  tx: Tx,
  occupantId: string,
  actorId: string | null,
  at: Date = new Date(),
) {
  await tx.occupantCustomerAffiliation.updateMany({
    where: { occupantId, endedAt: null },
    data: { endedAt: at, endedById: actorId },
  });
}

/** 若尚无未结束记录，则为使用者开启对客户的归属 */
export async function ensureOpenAffiliation(
  tx: Tx,
  occupantId: string,
  customerId: string,
  actorId: string | null,
  startedAt: Date = new Date(),
) {
  const existing = await tx.occupantCustomerAffiliation.findFirst({
    where: { occupantId, customerId, endedAt: null },
    select: { id: true },
  });
  if (existing) return existing;
  return tx.occupantCustomerAffiliation.create({
    data: {
      occupantId,
      customerId,
      startedAt,
      createdById: actorId,
    },
    select: { id: true },
  });
}

/**
 * 将使用者归属切换到新客户（或解除归属）。
 * - 结束旧的 open 记录
 * - 清空其他客户上指向此人的 primaryOccupantId
 * - 若 newCustomerId 有值则开启新归属记录
 * 不负责更新 occupants.customer_id（由调用方一并写入）。
 */
export async function rebindOccupantAffiliation(
  tx: Tx,
  opts: {
    occupantId: string;
    previousCustomerId: string | null | undefined;
    newCustomerId: string | null;
    actorId: string | null;
  },
): Promise<void> {
  const prev = opts.previousCustomerId ?? null;
  const next = opts.newCustomerId;
  if (prev === next) {
    if (next) {
      await ensureOpenAffiliation(tx, opts.occupantId, next, opts.actorId);
    }
    return;
  }

  const now = new Date();
  await closeOpenAffiliations(tx, opts.occupantId, opts.actorId, now);

  await tx.customer.updateMany({
    where: {
      primaryOccupantId: opts.occupantId,
      ...(next ? { id: { not: next } } : {}),
    },
    data: { primaryOccupantId: null },
  });

  if (next) {
    await ensureOpenAffiliation(tx, opts.occupantId, next, opts.actorId, now);
  }
}
