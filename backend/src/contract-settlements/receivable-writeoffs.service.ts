import { Injectable } from '@nestjs/common'
import {
  Prisma,
  ReceivableWriteoffDirection,
} from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { dec, nextWriteoffCode, round2 } from './settlement-code.util'

type Db = Prisma.TransactionClient | PrismaService

export type CreateWriteoffInput = {
  receivableId: string
  amount: number
  direction?: ReceivableWriteoffDirection
  reasonType: string
  writeoffDate: Date
  settlementId?: string | null
  settlementItemId?: string | null
  receiptId?: string | null
  remark?: string
  actorId?: string | null
}

@Injectable()
export class ReceivableWriteoffsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateWriteoffInput, db?: Db) {
    const client = db ?? this.prisma
    const amount = round2(Math.max(0, Number(input.amount) || 0))
    if (amount <= 0.009) return null

    const writeoffCode = await nextWriteoffCode(client)
    const actorId = input.actorId || null
    return client.receivableWriteoff.create({
      data: {
        writeoffCode,
        receivableId: input.receivableId,
        amount: dec(amount),
        direction: input.direction ?? ReceivableWriteoffDirection.reduce,
        reasonType: (input.reasonType || '').trim(),
        settlementId: input.settlementId || null,
        settlementItemId: input.settlementItemId || null,
        receiptId: input.receiptId || null,
        writeoffDate: input.writeoffDate,
        remark: (input.remark || '').trim(),
        createdById: actorId,
        updatedById: actorId,
      },
    })
  }

  async createMany(inputs: CreateWriteoffInput[], db?: Db) {
    const rows = []
    for (const input of inputs) {
      const row = await this.create(input, db)
      if (row) rows.push(row)
    }
    return rows
  }
}
