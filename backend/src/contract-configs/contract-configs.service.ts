import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContractConfigType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContractConfigDto, UpdateContractConfigDto } from './dto/contract-config.dto';
import {
  KEY_DEPOSIT_CODES,
  contractConfigAuditInclude,
  isContractConfigType,
  toContractConfigDto,
} from './contract-config.mapper';
import { runBatchRemove } from '../common/batch-delete';

const PROTECTED_KEY_CODES = new Set<string>([
  KEY_DEPOSIT_CODES.door,
  KEY_DEPOSIT_CODES.mailbox,
]);

@Injectable()
export class ContractConfigsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: { type?: string; activeOnly?: boolean }) {
    const where: Prisma.ContractConfigOptionWhereInput = {};
    if (params.type && isContractConfigType(params.type)) {
      where.type = params.type;
    }
    if (params.activeOnly) where.active = true;

    const rows = await this.prisma.contractConfigOption.findMany({
      where,
      include: contractConfigAuditInclude,
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });
    return rows.map(toContractConfigDto);
  }

  async findOne(id: string) {
    const row = await this.prisma.contractConfigOption.findUnique({
      where: { id },
      include: contractConfigAuditInclude,
    });
    if (!row) throw new NotFoundException(`Config ${id} not found`);
    return toContractConfigDto(row);
  }

  async create(dto: CreateContractConfigDto, actor = '') {
    const label = (dto.label ?? '').trim();
    if (!label) throw new BadRequestException('Label is required');

    const code = this.resolveCode(dto.type, dto.code, label);
    if (dto.type === ContractConfigType.keyDeposit && dto.unitPrice == null) {
      throw new BadRequestException('unitPrice is required for keyDeposit');
    }

    const actorId = actor || null;
    try {
      const row = await this.prisma.contractConfigOption.create({
        data: {
          type: dto.type,
          code,
          label,
          unitPrice: dto.type === ContractConfigType.keyDeposit ? dto.unitPrice ?? null : null,
          sortOrder: dto.sortOrder ?? 0,
          active: dto.active ?? true,
          createdById: actorId,
          updatedById: actorId,
        },
        include: contractConfigAuditInclude,
      });
      return toContractConfigDto(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('code already exists for this type');
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateContractConfigDto, actor = '') {
    const existing = await this.prisma.contractConfigOption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Config ${id} not found`);

    const nextCode =
      dto.code !== undefined ? this.resolveCode(existing.type, dto.code, dto.label || existing.label) : undefined;

    if (
      existing.type === ContractConfigType.keyDeposit &&
      PROTECTED_KEY_CODES.has(existing.code) &&
      nextCode &&
      nextCode !== existing.code
    ) {
      throw new BadRequestException('Cannot change code of system key deposit item');
    }

    try {
      const row = await this.prisma.contractConfigOption.update({
        where: { id },
        data: {
          label: dto.label?.trim() || undefined,
          code: nextCode,
          unitPrice:
            existing.type === ContractConfigType.keyDeposit
              ? dto.unitPrice !== undefined
                ? dto.unitPrice
                : undefined
              : null,
          sortOrder: dto.sortOrder,
          active: dto.active,
          ...(actor ? { updatedById: actor } : {}),
        },
        include: contractConfigAuditInclude,
      });
      return toContractConfigDto(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('code already exists for this type');
      }
      throw e;
    }
  }

  async remove(id: string) {
    const existing = await this.prisma.contractConfigOption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Config ${id} not found`);
    if (
      existing.type === ContractConfigType.keyDeposit &&
      PROTECTED_KEY_CODES.has(existing.code)
    ) {
      throw new BadRequestException('System key deposit items cannot be deleted');
    }
    await this.prisma.contractConfigOption.delete({ where: { id } });
    return { success: true };
  }

  async removeMany(ids: string[]) {
    return runBatchRemove(ids, (id) => this.remove(id));
  }

  /** 数量 × 配置单价 → 按金金额 */
  async calcKeyDeposits(doorKeyQty?: number | null, mailboxKeyQty?: number | null) {
    const rows = await this.prisma.contractConfigOption.findMany({
      where: {
        type: ContractConfigType.keyDeposit,
        code: { in: [KEY_DEPOSIT_CODES.door, KEY_DEPOSIT_CODES.mailbox] },
      },
    });
    const door = rows.find((r) => r.code === KEY_DEPOSIT_CODES.door);
    const mailbox = rows.find((r) => r.code === KEY_DEPOSIT_CODES.mailbox);
    const dq = Math.max(0, Math.floor(Number(doorKeyQty ?? 0) || 0));
    const mq = Math.max(0, Math.floor(Number(mailboxKeyQty ?? 0) || 0));
    const doorPrice = door?.unitPrice != null ? Number(door.unitPrice.toString()) : 0;
    const mailboxPrice = mailbox?.unitPrice != null ? Number(mailbox.unitPrice.toString()) : 0;
    return {
      doorKeyQty: dq,
      mailboxKeyQty: mq,
      doorKeyDeposit: roundMoney(dq * doorPrice),
      mailboxKeyDeposit: roundMoney(mq * mailboxPrice),
      doorUnitPrice: doorPrice,
      mailboxUnitPrice: mailboxPrice,
    };
  }

  async activePeriodTypeLabels(): Promise<string[]> {
    const rows = await this.prisma.contractConfigOption.findMany({
      where: { type: ContractConfigType.periodType, active: true },
      select: { label: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return rows.map((r) => r.label);
  }

  async usagePeriodLabels(): Promise<Set<string>> {
    const rows = await this.prisma.contractConfigOption.findMany({
      where: { type: ContractConfigType.periodType, code: 'usage' },
      select: { label: true },
    });
    const set = new Set(rows.map((r) => r.label).filter(Boolean));
    set.add('使用期');
    return set;
  }

  private resolveCode(type: ContractConfigType, code: string | undefined, label: string) {
    const trimmed = (code ?? '').trim();
    if (trimmed) return trimmed;
    const base = label
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^\w\u4e00-\u9fff-]/g, '')
      .slice(0, 24);
    const fallback = `opt_${Date.now().toString(36)}`;
    // keyDeposit 新建若无码，加前缀避免与系统项冲突
    if (type === ContractConfigType.keyDeposit) {
      return base ? `key_${base}` : fallback;
    }
    return base || fallback;
  }
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}
