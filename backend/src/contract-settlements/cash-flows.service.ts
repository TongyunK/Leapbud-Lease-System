import { Injectable } from '@nestjs/common'
import {
  CashFlowDirection,
  CashFlowSourceType,
  Prisma,
} from '@prisma/client'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { dec, nextCashFlowCode, round2 } from './settlement-code.util'

type Db = Prisma.TransactionClient | PrismaService

export type RecordCashFlowInput = {
  direction: CashFlowDirection
  amount: number
  flowDate: Date
  paymentMethod?: string
  sourceType: CashFlowSourceType
  sourceId: string
  contractId?: string | null
  customerId: string
  receiptId?: string | null
  refundOrderId?: string | null
  remark?: string
  actorId?: string | null
}

@Injectable()
export class CashFlowsService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordCashFlowInput, db?: Db) {
    const client = db ?? this.prisma
    const amount = round2(Math.max(0, Number(input.amount) || 0))
    if (amount <= 0.009) return null

    // 收据入账／作废冲销：按 source 幂等；退款出账每次新建
    if (input.sourceType === CashFlowSourceType.receipt) {
      const existing = await client.cashFlow.findFirst({
        where: {
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          direction: input.direction,
        },
        select: { id: true, flowCode: true },
      })
      if (existing) return existing
    }

    const flowCode = await nextCashFlowCode(client)
    const actorId = input.actorId || null
    return client.cashFlow.create({
      data: {
        flowCode,
        direction: input.direction,
        amount: dec(amount),
        flowDate: input.flowDate,
        paymentMethod: (input.paymentMethod || '').trim(),
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        contractId: input.contractId || null,
        customerId: input.customerId,
        receiptId: input.receiptId || null,
        refundOrderId: input.refundOrderId || null,
        remark: (input.remark || '').trim(),
        createdById: actorId,
        updatedById: actorId,
      },
      select: { id: true, flowCode: true },
    })
  }

  /** 收据有效入账 */
  async recordReceiptIn(
    params: {
      receiptId: string
      amount: number
      flowDate: Date
      paymentMethod?: string
      contractId?: string | null
      customerId: string
      remark?: string
      actorId?: string | null
    },
    db?: Db,
  ) {
    return this.record(
      {
        direction: CashFlowDirection.in,
        amount: params.amount,
        flowDate: params.flowDate,
        paymentMethod: params.paymentMethod,
        sourceType: CashFlowSourceType.receipt,
        sourceId: params.receiptId,
        contractId: params.contractId,
        customerId: params.customerId,
        receiptId: params.receiptId,
        remark: params.remark || '收据入账',
        actorId: params.actorId,
      },
      db,
    )
  }

  /**
   * 同步收据入账金额（定金合并加收等会改同一收据金额）。
   * 已有 in 流水则更新金额；没有则新建。
   */
  async syncReceiptInAmount(
    params: {
      receiptId: string
      amount: number
      flowDate: Date
      paymentMethod?: string
      contractId?: string | null
      customerId: string
      remark?: string
      actorId?: string | null
    },
    db?: Db,
  ) {
    const client = db ?? this.prisma
    const amount = round2(Math.max(0, Number(params.amount) || 0))
    const existing = await client.cashFlow.findFirst({
      where: {
        sourceType: CashFlowSourceType.receipt,
        sourceId: params.receiptId,
        direction: CashFlowDirection.in,
      },
    })
    if (existing) {
      if (amount <= 0.009) {
        await client.cashFlow.delete({ where: { id: existing.id } })
        return null
      }
      return client.cashFlow.update({
        where: { id: existing.id },
        data: {
          amount: dec(amount),
          flowDate: params.flowDate,
          paymentMethod: (params.paymentMethod || '').trim() || existing.paymentMethod,
          remark: (params.remark || existing.remark || '收据入账').trim(),
          updatedById: params.actorId || null,
        },
        select: { id: true, flowCode: true },
      })
    }
    return this.recordReceiptIn(params, db)
  }

  /** 退款单打款出账（每次一条；sourceId 为独立幂等键） */
  async recordRefundOut(
    params: {
      refundOrderId: string
      amount: number
      flowDate: Date
      paymentMethod?: string
      contractId?: string | null
      customerId: string
      remark?: string
      actorId?: string | null
      /** 可选幂等键；省略则每次新生成 */
      sourceId?: string
    },
    db?: Db,
  ) {
    return this.record(
      {
        direction: CashFlowDirection.out,
        amount: params.amount,
        flowDate: params.flowDate,
        paymentMethod: params.paymentMethod,
        sourceType: CashFlowSourceType.refund_order,
        sourceId: params.sourceId?.trim() || randomUUID(),
        contractId: params.contractId,
        customerId: params.customerId,
        refundOrderId: params.refundOrderId,
        remark: params.remark || '退款打款',
        actorId: params.actorId,
      },
      db,
    )
  }

}
