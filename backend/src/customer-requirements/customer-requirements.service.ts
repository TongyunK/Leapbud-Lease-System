import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NumberingBizKey, Prisma, RoomConfigType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BuildingAccessService } from '../building-access/building-access.service';
import { NumberingRulesService } from '../numbering-rules/numbering-rules.service';
import {
  CreateCustomerRequirementDto,
  ImportCustomerRequirementsDto,
  UpdateCustomerRequirementDto,
} from './dto/customer-requirement.dto';
import {
  customerRequirementInclude,
  toCustomerRequirementDto,
} from './customer-requirement.mapper';
import { actorLabelsOrEmpty } from '../common/audit';
import { requirementStatusFromContractStatuses } from '../common/requirement-contract-status';
import {
  dateRangeFilter,
  paginateArgs,
  parsePage,
  parsePageSize,
  parseSortDir,
} from '../common/pagination';
import {
  numberFieldInOrEmpty,
  splitEmptyFilter,
  stringFieldInOrEmpty,
} from '../common/column-filter';
import { runBatchRemove } from '../common/batch-delete';
import { pushImportIssue, type ImportIssue } from '../common/import-result';

const ALLOWED_STATUSES = new Set(['未跟進', '跟進中', '已簽約', '已取消']);

/** 兼容简体/英文状态文案 */
const STATUS_ALIASES: Record<string, string> = {
  未跟進: '未跟進',
  未跟进: '未跟進',
  pending: '未跟進',
  open: '未跟進',
  跟進中: '跟進中',
  跟进中: '跟進中',
  following: '跟進中',
  'following up': '跟進中',
  已簽約: '已簽約',
  已签约: '已簽約',
  signed: '已簽約',
  已取消: '已取消',
  cancelled: '已取消',
  canceled: '已取消',
};

const ALLOWED_RENTAL_TYPES = new Set(['long', 'short']);

/** 兼容中英文需求类型文案 */
const RENTAL_TYPE_ALIASES: Record<string, string> = {
  long: 'long',
  longterm: 'long',
  'long-term': 'long',
  'long term': 'long',
  長租: 'long',
  长租: 'long',
  short: 'short',
  shortterm: 'short',
  'short-term': 'short',
  'short term': 'short',
  短租: 'short',
};

function s(v: string | null | undefined) {
  return (v ?? '').trim();
}

function parseDateOnly(v: string | null | undefined): Date | null {
  const raw = s(v);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new BadRequestException('requirementDate must be YYYY-MM-DD');
  }
  return new Date(`${raw}T00:00:00.000Z`);
}

function nullId(v: string | null | undefined): string | null {
  const t = s(v);
  return t || null;
}

@Injectable()
export class CustomerRequirementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numberingRules: NumberingRulesService,
    private readonly access: BuildingAccessService,
  ) {}

  async findAll(params: {
    keyword?: string;
    status?: string;
    statuses?: string[];
    rentalTypes?: string[];
    customerId?: string;
    customerNames?: string[];
    salesManagers?: string[];
    requirementCodes?: string[];
    leaseDurations?: string[];
    budgets?: string[];
    sizeConfigLabels?: string[];
    acConfigLabels?: string[];
    windowConfigLabels?: string[];
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    requirementDateFrom?: string;
    requirementDateTo?: string;
    requirementDateEmpty?: boolean;
    createdAtFrom?: string;
    createdAtTo?: string;
    createdAtEmpty?: boolean;
    createdBys?: string[];
    page?: number;
    pageSize?: number;
  }) {
    const page = parsePage(params.page);
    const pageSize = parsePageSize(params.pageSize);
    const where = this.buildListWhere(params);
    await this.access.constrain(where, 'viaCustomer');

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.customerRequirement.count({ where }),
      this.prisma.customerRequirement.findMany({
        where,
        include: customerRequirementInclude,
        orderBy: this.buildListOrderBy(params.sortBy, params.sortDir),
        ...paginateArgs(page, pageSize),
      }),
    ]);

    return {
      items: rows.map(toCustomerRequirementDto),
      total,
      page,
      pageSize: pageSize ?? total,
    };
  }

  private buildListWhere(params: {
    keyword?: string;
    status?: string;
    statuses?: string[];
    rentalTypes?: string[];
    customerId?: string;
    customerNames?: string[];
    salesManagers?: string[];
    requirementCodes?: string[];
    leaseDurations?: string[];
    budgets?: string[];
    sizeConfigLabels?: string[];
    acConfigLabels?: string[];
    windowConfigLabels?: string[];
    requirementDateFrom?: string;
    requirementDateTo?: string;
    requirementDateEmpty?: boolean;
    createdAtFrom?: string;
    createdAtTo?: string;
    createdAtEmpty?: boolean;
    createdBys?: string[];
  }): Prisma.CustomerRequirementWhereInput {
    const where: Prisma.CustomerRequirementWhereInput = {};
    const and: Prisma.CustomerRequirementWhereInput[] = [];

    if (params.customerId) where.customerId = params.customerId;

    const statusClause = stringFieldInOrEmpty('status', [
      ...(params.statuses || []),
      ...(params.status?.trim() ? [params.status.trim()] : []),
    ]);
    if (statusClause) and.push(statusClause as Prisma.CustomerRequirementWhereInput);

    const { values: rentalTypeRaw, includeEmpty: includeEmptyRental } = splitEmptyFilter(
      params.rentalTypes,
    );
    const rentalTypes = [
      ...new Set(
        rentalTypeRaw
          .map((v) => this.tryNormalizeRentalType(v))
          .filter((v): v is string => Boolean(v)),
      ),
    ];
    if (rentalTypes.length || includeEmptyRental) {
      const or: Prisma.CustomerRequirementWhereInput[] = [];
      if (rentalTypes.length === 1) or.push({ rentalType: rentalTypes[0] });
      else if (rentalTypes.length > 1) or.push({ rentalType: { in: rentalTypes } });
      if (includeEmptyRental) {
        or.push({ rentalType: '' });
      }
      and.push(or.length === 1 ? or[0]! : { OR: or });
    }

    const customerNameClause = stringFieldInOrEmpty('name', params.customerNames);
    if (customerNameClause) {
      and.push({ customer: customerNameClause } as Prisma.CustomerRequirementWhereInput);
    }

    const salesManagerClause = actorLabelsOrEmpty('salesManager', params.salesManagers);
    if (salesManagerClause) {
      and.push(salesManagerClause as Prisma.CustomerRequirementWhereInput);
    }

    const createdByClause = actorLabelsOrEmpty('createdBy', params.createdBys);
    if (createdByClause) {
      and.push(createdByClause as Prisma.CustomerRequirementWhereInput);
    }

    const requirementCodeClause = stringFieldInOrEmpty(
      'requirementCode',
      params.requirementCodes,
    );
    if (requirementCodeClause) {
      and.push(requirementCodeClause as Prisma.CustomerRequirementWhereInput);
    }

    const leaseDurationClause = stringFieldInOrEmpty('leaseDuration', params.leaseDurations);
    if (leaseDurationClause) {
      and.push(leaseDurationClause as Prisma.CustomerRequirementWhereInput);
    }

    const budgetClause = numberFieldInOrEmpty('budget', params.budgets, { nullable: true });
    if (budgetClause) and.push(budgetClause as Prisma.CustomerRequirementWhereInput);

    const sizeLabelClause = stringFieldInOrEmpty('label', params.sizeConfigLabels);
    if (sizeLabelClause) {
      and.push({ sizeConfig: sizeLabelClause } as Prisma.CustomerRequirementWhereInput);
    }
    const acLabelClause = stringFieldInOrEmpty('label', params.acConfigLabels);
    if (acLabelClause) {
      and.push({ acConfig: acLabelClause } as Prisma.CustomerRequirementWhereInput);
    }
    const windowLabelClause = stringFieldInOrEmpty('label', params.windowConfigLabels);
    if (windowLabelClause) {
      and.push({ windowConfig: windowLabelClause } as Prisma.CustomerRequirementWhereInput);
    }

    const keyword = s(params.keyword);
    if (keyword) {
      and.push({
        OR: [
          { requirementCode: { contains: keyword, mode: 'insensitive' } },
          { content: { contains: keyword, mode: 'insensitive' } },
          { remark: { contains: keyword, mode: 'insensitive' } },
          { leaseDuration: { contains: keyword, mode: 'insensitive' } },
          { customer: { name: { contains: keyword, mode: 'insensitive' } } },
          { customer: { customerCode: { contains: keyword, mode: 'insensitive' } } },
          { salesManagerUser: { account: { contains: keyword, mode: 'insensitive' } } },
          { salesManagerUser: { displayName: { contains: keyword, mode: 'insensitive' } } },
        ],
      });
    }

    if (params.requirementDateEmpty) {
      and.push({ id: '__no_match__' });
    } else {
      const requirementDate = dateRangeFilter(
        params.requirementDateFrom,
        params.requirementDateTo,
      );
      if (requirementDate) where.requirementDate = requirementDate;
    }

    if (params.createdAtEmpty) {
      and.push({ id: '__no_match__' });
    } else {
      const createdAt = dateRangeFilter(params.createdAtFrom, params.createdAtTo, true);
      if (createdAt) where.createdAt = createdAt;
    }

    if (and.length) where.AND = and;
    return where;
  }

  private buildListOrderBy(
    sortBy?: string,
    sortDir?: 'asc' | 'desc',
  ): Prisma.CustomerRequirementOrderByWithRelationInput[] {
    const dir = parseSortDir(sortDir) ?? 'asc';
    const key = s(sortBy);
    if (key === 'requirementCode') return [{ requirementCode: dir }];
    if (key === 'customerName') {
      return [{ customer: { name: dir } }, { requirementDate: 'desc' }];
    }
    if (key === 'salesManager') {
      return [
        { salesManagerUser: { displayName: dir } },
        { salesManagerUser: { account: dir } },
        { requirementDate: 'desc' },
      ];
    }
    if (key === 'requirementDate') return [{ requirementDate: dir }];
    if (key === 'status') return [{ status: dir }, { requirementDate: 'desc' }];
    if (key === 'rentalType') return [{ rentalType: dir }, { requirementDate: 'desc' }];
    if (key === 'leaseDuration') return [{ leaseDuration: dir }];
    if (key === 'budget') return [{ budget: dir }];
    if (key === 'sizeConfigLabel') {
      return [{ sizeConfig: { label: dir } }, { requirementDate: 'desc' }];
    }
    if (key === 'acConfigLabel') {
      return [{ acConfig: { label: dir } }, { requirementDate: 'desc' }];
    }
    if (key === 'windowConfigLabel') {
      return [{ windowConfig: { label: dir } }, { requirementDate: 'desc' }];
    }
    if (key === 'contractCount') return [{ contracts: { _count: dir } }, { requirementDate: 'desc' }];
    if (key === 'createdAt') return [{ createdAt: dir }];
    if (key === 'updatedAt') return [{ updatedAt: dir }];
    if (key === 'createdBy') {
      return [
        { createdByUser: { displayName: dir } },
        { createdByUser: { account: dir } },
        { createdAt: 'desc' },
      ];
    }
    return [{ requirementDate: 'desc' }, { createdAt: 'desc' }];
  }

  async findOne(id: string) {
    const row = await this.prisma.customerRequirement.findUnique({
      where: { id },
      include: customerRequirementInclude,
    });
    if (!row) throw new NotFoundException(`Customer requirement ${id} not found`);
    await this.access.assertCustomerId(row.customerId);
    return toCustomerRequirementDto(row);
  }

  private async nextRequirementCode(reserved?: { has(key: string): boolean }) {
    return this.numberingRules.nextCode(NumberingBizKey.customerRequirement, {
      reserved,
      isTaken: async (code) =>
        !!(await this.prisma.customerRequirement.findFirst({
          where: { requirementCode: code },
          select: { id: true },
        })),
    });
  }

  /** 预览下一个需求编号（不占用序号；保存时仍重新分配） */
  async previewRequirementCode() {
    const code = await this.numberingRules.previewCode(NumberingBizKey.customerRequirement, {
      isTaken: async (c) =>
        !!(await this.prisma.customerRequirement.findFirst({
          where: { requirementCode: c },
          select: { id: true },
        })),
    });
    return { code };
  }

  private async assertCustomer(customerId: string) {
    const c = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!c) throw new BadRequestException('Invalid customerId');
  }

  private async assertUser(userId: string | null) {
    if (!userId) return;
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!u) throw new BadRequestException('Invalid salesManagerId');
  }

  private async assertConfig(id: string | null, type: RoomConfigType, field: string) {
    if (!id) return;
    const row = await this.prisma.roomConfigOption.findUnique({
      where: { id },
      select: { id: true, type: true },
    });
    if (!row || row.type !== type) {
      throw new BadRequestException(`Invalid ${field}`);
    }
  }

  private normalizeStatus(status?: string) {
    const raw = s(status) || '未跟進';
    const v = STATUS_ALIASES[raw] || STATUS_ALIASES[raw.toLowerCase()] || raw;
    if (!ALLOWED_STATUSES.has(v)) {
      throw new BadRequestException(`status must be one of: ${[...ALLOWED_STATUSES].join(' / ')}`);
    }
    return v;
  }

  /**
   * 按关联合约重算需求状态：
   * 无合约→未跟進；签约中→跟進中；租赁中及后续→已簽約；仅取消→已取消。
   */
  async recomputeStatusFromContracts(
    requirementId: string | null | undefined,
    actorId?: string | null,
    tx?: Prisma.TransactionClient,
  ) {
    const id = s(requirementId);
    if (!id) return;
    const db = tx ?? this.prisma;
    const contracts = await db.contract.findMany({
      where: { requirementId: id },
      select: { status: true },
    });
    const next = requirementStatusFromContractStatuses(contracts.map((c) => c.status));
    await db.customerRequirement.update({
      where: { id },
      data: {
        status: next,
        ...(actorId ? { updatedById: actorId } : {}),
      },
    });
  }

  private tryNormalizeStatus(status?: string): string | null {
    try {
      return this.normalizeStatus(status);
    } catch {
      return null;
    }
  }

  private normalizeRentalType(rentalType?: string) {
    const raw = s(rentalType) || 'long';
    const v =
      RENTAL_TYPE_ALIASES[raw] ||
      RENTAL_TYPE_ALIASES[raw.toLowerCase()] ||
      raw.toLowerCase();
    if (!ALLOWED_RENTAL_TYPES.has(v)) {
      throw new BadRequestException(
        `rentalType must be one of: ${[...ALLOWED_RENTAL_TYPES].join(' / ')}`,
      );
    }
    return v;
  }

  private tryNormalizeRentalType(rentalType?: string): string | null {
    const raw = s(rentalType);
    if (!raw) return null;
    try {
      return this.normalizeRentalType(raw);
    } catch {
      return null;
    }
  }

  private tryParseDateOnly(v: string | null | undefined): Date | null | undefined {
    const raw = s(v);
    if (!raw) return null;
    try {
      return parseDateOnly(raw);
    } catch {
      return undefined;
    }
  }

  async create(dto: CreateCustomerRequirementDto, actor = '') {
    const customerId = s(dto.customerId);
    if (!customerId) throw new BadRequestException('customerId is required');
    await this.assertCustomer(customerId);

    const salesManagerId = nullId(dto.salesManagerId);
    await this.assertUser(salesManagerId);

    const sizeConfigId = nullId(dto.sizeConfigId);
    const acConfigId = nullId(dto.acConfigId);
    const windowConfigId = nullId(dto.windowConfigId);
    await this.assertConfig(sizeConfigId, RoomConfigType.size, 'sizeConfigId');
    await this.assertConfig(acConfigId, RoomConfigType.ac, 'acConfigId');
    await this.assertConfig(windowConfigId, RoomConfigType.window, 'windowConfigId');

    const requirementCode = s(dto.requirementCode) || (await this.nextRequirementCode());
    const actorId = actor || null;

    try {
      const row = await this.prisma.customerRequirement.create({
        data: {
          requirementCode,
          customerId,
          salesManagerId,
          requirementDate: parseDateOnly(dto.requirementDate),
          status: this.normalizeStatus(dto.status),
          rentalType: this.normalizeRentalType(dto.rentalType),
          leaseDuration: s(dto.leaseDuration),
          budget: dto.budget == null ? null : dto.budget,
          content: s(dto.content),
          remark: s(dto.remark),
          attachment: s(dto.attachment),
          sizeConfigId,
          acConfigId,
          windowConfigId,
          createdById: actorId,
          updatedById: actorId,
        },
        include: customerRequirementInclude,
      });
      return toCustomerRequirementDto(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Requirement code「${requirementCode}」already exists`);
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateCustomerRequirementDto, actor = '') {
    const existing = await this.prisma.customerRequirement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Customer requirement ${id} not found`);

    if (dto.customerId !== undefined) {
      const customerId = s(dto.customerId);
      if (!customerId) throw new BadRequestException('customerId is required');
      await this.assertCustomer(customerId);
    }

    const salesManagerId =
      dto.salesManagerId !== undefined ? nullId(dto.salesManagerId) : undefined;
    if (salesManagerId !== undefined) await this.assertUser(salesManagerId);

    const sizeConfigId = dto.sizeConfigId !== undefined ? nullId(dto.sizeConfigId) : undefined;
    const acConfigId = dto.acConfigId !== undefined ? nullId(dto.acConfigId) : undefined;
    const windowConfigId =
      dto.windowConfigId !== undefined ? nullId(dto.windowConfigId) : undefined;
    if (sizeConfigId !== undefined) {
      await this.assertConfig(sizeConfigId, RoomConfigType.size, 'sizeConfigId');
    }
    if (acConfigId !== undefined) {
      await this.assertConfig(acConfigId, RoomConfigType.ac, 'acConfigId');
    }
    if (windowConfigId !== undefined) {
      await this.assertConfig(windowConfigId, RoomConfigType.window, 'windowConfigId');
    }

    try {
      const row = await this.prisma.customerRequirement.update({
        where: { id },
        data: {
          // 需求编号创建后不可修改
          customerId: dto.customerId !== undefined ? s(dto.customerId) : undefined,
          salesManagerId,
          requirementDate:
            dto.requirementDate !== undefined ? parseDateOnly(dto.requirementDate) : undefined,
          status: dto.status !== undefined ? this.normalizeStatus(dto.status) : undefined,
          rentalType:
            dto.rentalType !== undefined ? this.normalizeRentalType(dto.rentalType) : undefined,
          leaseDuration: dto.leaseDuration !== undefined ? s(dto.leaseDuration) : undefined,
          budget: dto.budget !== undefined ? dto.budget : undefined,
          content: dto.content !== undefined ? s(dto.content) : undefined,
          remark: dto.remark !== undefined ? s(dto.remark) : undefined,
          attachment: dto.attachment !== undefined ? s(dto.attachment) : undefined,
          sizeConfigId,
          acConfigId,
          windowConfigId,
          ...(actor ? { updatedById: actor } : {}),
        },
        include: customerRequirementInclude,
      });
      return toCustomerRequirementDto(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(
          `Requirement code「${dto.requirementCode?.trim()}」already exists`,
        );
      }
      throw e;
    }
  }

  /** 软取消：状态改为「已取消」，不物理删除 */
  async remove(id: string, actor = '') {
    const existing = await this.prisma.customerRequirement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Customer requirement ${id} not found`);
    if (existing.status !== '已取消') {
      await this.prisma.customerRequirement.update({
        where: { id },
        data: {
          status: '已取消',
          ...(actor ? { updatedById: actor } : {}),
        },
      });
    }
    return { success: true };
  }

  async removeMany(ids: string[], actor = '') {
    return runBatchRemove(ids, (id) => this.remove(id, actor));
  }

  /** 批量导入：有需求编号则 upsert；按客户编号或客户名称关联；经理/配置按名称匹配 */
  async importBatch(dto: ImportCustomerRequirementsDto, actor = '') {
    const items = dto.items || [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let unlinked = 0;
    let failed = 0;
    const issues: ImportIssue[] = [];

    const codes = [
      ...new Set(items.map((it) => s(it.customerCode)).filter(Boolean)),
    ];
    const names = [
      ...new Set(items.map((it) => s(it.customerName)).filter(Boolean)),
    ];
    const reqCodes = [
      ...new Set(items.map((it) => s(it.requirementCode)).filter(Boolean)),
    ];

    const customerWhere: Prisma.CustomerWhereInput[] = [];
    if (codes.length) customerWhere.push({ customerCode: { in: codes } });
    if (names.length) {
      customerWhere.push({
        OR: names.map((name) => ({
          name: { equals: name, mode: 'insensitive' as const },
        })),
      });
      customerWhere.push({
        OR: names.map((name) => ({
          companyNameZh: { equals: name, mode: 'insensitive' as const },
        })),
      });
      customerWhere.push({
        OR: names.map((name) => ({
          companyNameEn: { equals: name, mode: 'insensitive' as const },
        })),
      });
    }

    const [customers, users, configs, existingReqs] = await Promise.all([
      customerWhere.length
        ? this.prisma.customer.findMany({
            where: { OR: customerWhere },
            select: {
              id: true,
              customerCode: true,
              name: true,
              companyNameZh: true,
              companyNameEn: true,
            },
          })
        : Promise.resolve([]),
      this.prisma.user.findMany({
        select: { id: true, account: true, displayName: true },
      }),
      this.prisma.roomConfigOption.findMany({
        select: { id: true, type: true, label: true },
      }),
      reqCodes.length
        ? this.prisma.customerRequirement.findMany({
            where: { requirementCode: { in: reqCodes } },
            select: { id: true, requirementCode: true },
          })
        : Promise.resolve([]),
    ]);

    const customerByCode = new Map(
      customers.map((c) => [c.customerCode.toLowerCase(), c.id] as const),
    );
    /** 名称 / 公司中英名不唯一时记为 null，导入时 unlinked */
    const customerByName = new Map<string, string | null>();
    for (const c of customers) {
      const keys = [c.name, c.companyNameZh, c.companyNameEn]
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
      for (const k of keys) {
        if (customerByName.has(k)) {
          customerByName.set(k, null);
        } else {
          customerByName.set(k, c.id);
        }
      }
    }
    const userByLabel = new Map<string, string>();
    for (const u of users) {
      const account = u.account.trim().toLowerCase();
      const name = u.displayName.trim().toLowerCase();
      if (account) userByLabel.set(account, u.id);
      if (name) userByLabel.set(name, u.id);
    }
    const configByTypeLabel = new Map<string, string>();
    for (const c of configs) {
      configByTypeLabel.set(`${c.type}:${c.label.trim().toLowerCase()}`, c.id);
    }
    const reqByCode = new Map(
      existingReqs.map((r) => [r.requirementCode.toLowerCase(), r.id] as const),
    );

    const actorId = actor || null;

    for (const item of items) {
      const customerCode = s(item.customerCode);
      const customerName = s(item.customerName);
      const requirementCode = s(item.requirementCode);
      const keys = {
        需求編號: requirementCode,
        客戶編號: customerCode,
        客戶名稱: customerName,
      };

      if (!customerCode && !customerName) {
        skipped += 1;
        pushImportIssue(issues, 'skipped', '缺少客戶編號或客戶名稱', keys);
        continue;
      }
      let customerId =
        (customerCode ? customerByCode.get(customerCode.toLowerCase()) : undefined) ||
        undefined;
      if (!customerId && customerName) {
        const byName = customerByName.get(customerName.toLowerCase());
        if (byName === null) {
          unlinked += 1;
          pushImportIssue(
            issues,
            'unlinked',
            `客戶名稱「${customerName}」不唯一，無法匹配`,
            keys,
          );
          continue;
        }
        customerId = byName || undefined;
      }
      if (!customerId) {
        unlinked += 1;
        pushImportIssue(
          issues,
          'unlinked',
          customerCode
            ? `客戶編號「${customerCode}」未找到`
            : `客戶名稱「${customerName}」未找到`,
          keys,
        );
        continue;
      }

      const status = this.tryNormalizeStatus(item.status);
      if (status == null) {
        skipped += 1;
        pushImportIssue(
          issues,
          'skipped',
          `狀態「${s(item.status)}」無效或缺失`,
          keys,
        );
        continue;
      }

      const rentalTypeRaw = s(item.rentalType);
      const rentalType = rentalTypeRaw
        ? this.tryNormalizeRentalType(rentalTypeRaw)
        : 'long';
      if (rentalType == null) {
        skipped += 1;
        pushImportIssue(
          issues,
          'skipped',
          `需求類型「${rentalTypeRaw}」無效`,
          keys,
        );
        continue;
      }

      const requirementDate = this.tryParseDateOnly(item.requirementDate);
      if (requirementDate === undefined) {
        skipped += 1;
        pushImportIssue(
          issues,
          'skipped',
          `需求日期「${s(item.requirementDate)}」格式無效或缺失`,
          keys,
        );
        continue;
      }

      const salesLabel = s(item.salesManager).toLowerCase();
      const salesManagerId = salesLabel ? userByLabel.get(salesLabel) ?? null : null;

      const sizeLabel = s(item.sizeConfig).toLowerCase();
      const acLabel = s(item.acConfig).toLowerCase();
      const windowLabel = s(item.windowConfig).toLowerCase();
      const sizeConfigId = sizeLabel
        ? configByTypeLabel.get(`size:${sizeLabel}`) ?? null
        : null;
      const acConfigId = acLabel ? configByTypeLabel.get(`ac:${acLabel}`) ?? null : null;
      const windowConfigId = windowLabel
        ? configByTypeLabel.get(`window:${windowLabel}`) ?? null
        : null;

      const budget =
        item.budget == null || Number.isNaN(Number(item.budget))
          ? null
          : Number(item.budget);

      // 旧系统内容里偶发字面量 "undefined"
      const content = s(item.content).replace(/^undefined/i, '').trim();

      const data = {
        customerId,
        salesManagerId,
        requirementDate,
        status,
        rentalType,
        leaseDuration: s(item.leaseDuration),
        budget,
        content,
        remark: s(item.remark),
        attachment: s(item.attachment),
        sizeConfigId,
        acConfigId,
        windowConfigId,
        updatedById: actorId,
      };

      try {
        const code = s(item.requirementCode);
        const existingId = code ? reqByCode.get(code.toLowerCase()) : undefined;
        if (existingId) {
          await this.prisma.customerRequirement.update({
            where: { id: existingId },
            data,
          });
          updated += 1;
        } else {
          const newCode = code || (await this.nextRequirementCode(reqByCode));
          const row = await this.prisma.customerRequirement.create({
            data: {
              requirementCode: newCode,
              ...data,
              createdById: actorId,
            },
            select: { id: true, requirementCode: true },
          });
          reqByCode.set(row.requirementCode.toLowerCase(), row.id);
          created += 1;
        }
      } catch (e) {
        failed += 1;
        const msg = e instanceof Error ? e.message : '建立或更新客戶需求失敗';
        pushImportIssue(issues, 'failed', msg, keys);
      }
    }

    return { created, updated, skipped, unlinked, failed, issues };
  }
}
