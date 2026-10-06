import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NumberingBizKey, NumberingResetCycle, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNumberingRuleDto, UpdateNumberingRuleDto } from './dto/numbering-rule.dto';
import { numberingRuleAuditInclude, toNumberingRuleDto } from './numbering-rule.mapper';
import { runBatchRemove } from '../common/batch-delete';
import {
  NUMBERING_DEFAULTS,
  periodKeyOf,
  renderNumberingFormat,
} from './numbering-format.util';

export type NextCodeOptions = {
  /** 业务表是否已占用该编号 */
  isTaken?: (code: string) => Promise<boolean>;
  /** 批量导入时内存中已占用的编号（小写） */
  reserved?: { has(key: string): boolean };
};

@Injectable()
export class NumberingRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: { activeOnly?: boolean }) {
    const where: Prisma.NumberingRuleWhereInput = {};
    if (params.activeOnly) where.active = true;

    const rows = await this.prisma.numberingRule.findMany({
      where,
      include: numberingRuleAuditInclude,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toNumberingRuleDto);
  }

  async findOne(id: string) {
    const row = await this.prisma.numberingRule.findUnique({
      where: { id },
      include: numberingRuleAuditInclude,
    });
    if (!row) throw new NotFoundException(`Numbering rule ${id} not found`);
    return toNumberingRuleDto(row);
  }

  async create(dto: CreateNumberingRuleDto, actor = '') {
    const name = dto.name.trim();
    const format = dto.format.trim();
    if (!name) throw new BadRequestException('Name is required');
    if (!format) throw new BadRequestException('Format is required');
    if (!format.includes('%d') && !/%0\d+d/.test(format)) {
      throw new BadRequestException('Format must include a sequence token such as %04d');
    }
    const actorId = actor || null;
    const startValue = dto.startValue ?? 1;

    try {
      const row = await this.prisma.numberingRule.create({
        data: {
          name,
          format,
          bizKey: dto.bizKey ?? null,
          startValue,
          resetCycle: dto.resetCycle ?? NumberingResetCycle.none,
          currentSeq: startValue - 1,
          periodKey: '',
          active: dto.active ?? true,
          sortOrder: dto.sortOrder ?? 0,
          createdById: actorId,
          updatedById: actorId,
        },
        include: numberingRuleAuditInclude,
      });
      return toNumberingRuleDto(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Business key「${dto.bizKey}」already exists`);
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateNumberingRuleDto, actor = '') {
    const existing = await this.prisma.numberingRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Numbering rule ${id} not found`);

    const format = dto.format !== undefined ? dto.format.trim() : undefined;
    if (format !== undefined) {
      if (!format) throw new BadRequestException('Format is required');
      if (!format.includes('%d') && !/%0\d+d/.test(format)) {
        throw new BadRequestException('Format must include a sequence token such as %04d');
      }
    }

    try {
      const row = await this.prisma.numberingRule.update({
        where: { id },
        data: {
          name: dto.name !== undefined ? dto.name.trim() : undefined,
          format,
          bizKey: dto.bizKey === undefined ? undefined : dto.bizKey,
          startValue: dto.startValue,
          resetCycle: dto.resetCycle,
          sortOrder: dto.sortOrder,
          active: dto.active,
          ...(actor ? { updatedById: actor } : {}),
        },
        include: numberingRuleAuditInclude,
      });
      return toNumberingRuleDto(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Business key「${dto.bizKey}」already exists`);
      }
      throw e;
    }
  }

  async remove(id: string) {
    const existing = await this.prisma.numberingRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Numbering rule ${id} not found`);
    await this.prisma.numberingRule.delete({ where: { id } });
    return { success: true };
  }

  async removeMany(ids: string[]) {
    return runBatchRemove(ids, (id) => this.remove(id));
  }

  /** 将序号重置为起始值之前（下次生成从 startValue 开始） */
  async reset(id: string, actor = '') {
    const existing = await this.prisma.numberingRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Numbering rule ${id} not found`);

    const row = await this.prisma.numberingRule.update({
      where: { id },
      data: {
        currentSeq: existing.startValue - 1,
        periodKey: '',
        ...(actor ? { updatedById: actor } : {}),
      },
      include: numberingRuleAuditInclude,
    });
    return toNumberingRuleDto(row);
  }

  /**
   * 按业务键生成下一个编号；无规则或停用时回退到默认格式。
   * 通过 isTaken / reserved 跳过冲突编号。
   */
  async nextCode(bizKey: NumberingBizKey, options?: NextCodeOptions): Promise<string> {
    const now = new Date();
    const defaults = NUMBERING_DEFAULTS[bizKey];

    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.numberingRule.findUnique({ where: { bizKey } });
      const useRule = rule && rule.active;

      const format = useRule ? rule.format : defaults.format;
      const startValue = useRule ? rule.startValue : defaults.startValue;
      const resetCycle = useRule ? rule.resetCycle : defaults.resetCycle;
      let currentSeq = useRule ? rule.currentSeq : startValue - 1;
      let periodKey = useRule ? rule.periodKey : '';

      const nextPeriod = periodKeyOf(now, resetCycle);
      if (resetCycle !== NumberingResetCycle.none && nextPeriod !== periodKey) {
        currentSeq = startValue - 1;
        periodKey = nextPeriod;
      }

      let seq = currentSeq + 1;
      let code = renderNumberingFormat(format, now, seq);
      let guard = 0;
      while (
        (options?.reserved?.has(code.toLowerCase()) ||
          (options?.isTaken ? await options.isTaken(code) : false)) &&
        guard < 10000
      ) {
        seq += 1;
        code = renderNumberingFormat(format, now, seq);
        guard += 1;
      }
      if (guard >= 10000) {
        throw new ConflictException(`Unable to allocate numbering for ${bizKey}`);
      }

      if (useRule && rule) {
        await tx.numberingRule.update({
          where: { id: rule.id },
          data: { currentSeq: seq, periodKey },
        });
      }

      return code;
    });
  }
}
