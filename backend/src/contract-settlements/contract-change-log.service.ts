import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

type Db = Prisma.TransactionClient | PrismaService

export type AppendChangeLogInput = {
  contractId: string
  changeType: string
  fieldPath?: string
  before?: unknown
  after?: unknown
  refType?: string
  refId?: string
  summary?: string
  actorId?: string | null
}

function toJsonText(v: unknown) {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

@Injectable()
export class ContractChangeLogService {
  constructor(private readonly prisma: PrismaService) {}

  async append(input: AppendChangeLogInput, db?: Db) {
    const client = db ?? this.prisma
    return client.contractChangeLog.create({
      data: {
        contractId: input.contractId,
        changeType: (input.changeType || '').trim() || 'update',
        fieldPath: (input.fieldPath || '').trim(),
        beforeJson: toJsonText(input.before),
        afterJson: toJsonText(input.after),
        refType: (input.refType || '').trim(),
        refId: (input.refId || '').trim(),
        summary: (input.summary || '').trim(),
        createdById: input.actorId || null,
      },
    })
  }
}
