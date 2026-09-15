import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateOccupantDto,
  ImportOccupantsDto,
  UpdateOccupantDto,
} from './dto/occupant.dto';
import {
  occupantInclude,
  occupantLiteSelect,
  toOccupantDto,
  toOccupantLiteDto,
} from '../customers/customer.mapper';
import {
  dateRangeFilter,
  paginateArgs,
  parsePage,
  parsePageSize,
  parseSortDir,
} from '../common/pagination';
import { runBatchRemove } from '../common/batch-delete';
import { pushImportIssue, type ImportIssue } from '../common/import-result';

function s(v?: string | null) {
  return (v ?? '').trim();
}

function occupantDupKeys(o: {
  name: string;
  customerCode?: string | null;
  idCardNo?: string | null;
  mobilePhone?: string | null;
}): string[] {
  const keys: string[] = [];
  const id = s(o.idCardNo).toLowerCase();
  if (id) keys.push(`id:${id}`);
  const code = s(o.customerCode).toLowerCase();
  const name = s(o.name).toLowerCase();
  if (code && name) keys.push(`cn:${code}|${name}`);
  const mobile = s(o.mobilePhone).replace(/[\s\-()]/g, '').toLowerCase();
  if (!code && name && mobile) keys.push(`nm:${name}|${mobile}`);
  return keys;
}

@Injectable()
export class OccupantsService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveCustomer(params: {
    customerId?: string | null;
    customerCode?: string;
  }) {
    const customerId = s(params.customerId || undefined);
    const customerCode = s(params.customerCode);
    if (customerId) {
      const c = await this.prisma.customer.findUnique({ where: { id: customerId } });
      if (!c) throw new NotFoundException(`Customer ${customerId} not found`);
      return c;
    }
    if (customerCode) {
      return this.prisma.customer.findUnique({ where: { customerCode } });
    }
    return null;
  }

  async findAll(params: {
    keyword?: string;
    customerId?: string;
    customerNames?: string[];
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    createdAtFrom?: string;
    createdAtTo?: string;
    page?: number;
    pageSize?: number;
    /** @deprecated 兼容旧调用；等同 pageSize */
    limit?: number;
    lite?: boolean;
  }) {
    const page = parsePage(params.page);
    const pageSize =
      params.pageSize !== undefined && params.pageSize !== null
        ? parsePageSize(params.pageSize)
        : params.limit != null && params.limit > 0
          ? Math.min(500, Math.max(1, Math.floor(params.limit)))
          : parsePageSize(undefined);
    const where = this.buildListWhere(params);

    if (params.lite) {
      const [total, rows] = await this.prisma.$transaction([
        this.prisma.occupant.count({ where }),
        this.prisma.occupant.findMany({
          where,
          select: occupantLiteSelect,
          orderBy: this.buildListOrderBy(params.sortBy, params.sortDir),
          ...paginateArgs(page, pageSize),
        }),
      ]);
      return {
        items: rows.map(toOccupantLiteDto),
        total,
        page,
        pageSize: pageSize ?? total,
      };
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.occupant.count({ where }),
      this.prisma.occupant.findMany({
        where,
        include: occupantInclude,
        orderBy: this.buildListOrderBy(params.sortBy, params.sortDir),
        ...paginateArgs(page, pageSize),
      }),
    ]);

    return {
      items: rows.map(toOccupantDto),
      total,
      page,
      pageSize: pageSize ?? total,
    };
  }

  private buildListWhere(params: {
    keyword?: string;
    customerId?: string;
    customerNames?: string[];
    createdAtFrom?: string;
    createdAtTo?: string;
  }): Prisma.OccupantWhereInput {
    const where: Prisma.OccupantWhereInput = {};
    const and: Prisma.OccupantWhereInput[] = [];

    if (params.customerId?.trim()) where.customerId = params.customerId.trim();

    const customerNames = (params.customerNames || []).map((v) => s(v)).filter(Boolean);
    if (customerNames.length) {
      and.push({
        OR: [
          { customer: { name: { in: customerNames } } },
          {
            AND: [{ customerId: null }, { relatedCustomerName: { in: customerNames } }],
          },
        ],
      });
    }

    const keyword = params.keyword?.trim();
    if (keyword) {
      and.push({
        OR: [
          { name: { contains: keyword, mode: 'insensitive' } },
          { customerCode: { contains: keyword, mode: 'insensitive' } },
          { relatedCustomerName: { contains: keyword, mode: 'insensitive' } },
          { mobilePhone: { contains: keyword, mode: 'insensitive' } },
          { whatsapp: { contains: keyword, mode: 'insensitive' } },
          { contactPhone: { contains: keyword, mode: 'insensitive' } },
          { email: { contains: keyword, mode: 'insensitive' } },
          { idCardNo: { contains: keyword, mode: 'insensitive' } },
          { customer: { name: { contains: keyword, mode: 'insensitive' } } },
          { customer: { customerCode: { contains: keyword, mode: 'insensitive' } } },
        ],
      });
    }

    const createdAt = dateRangeFilter(params.createdAtFrom, params.createdAtTo, true);
    if (createdAt) where.createdAt = createdAt;

    if (and.length) where.AND = and;
    return where;
  }

  private buildListOrderBy(
    sortBy?: string,
    sortDir?: 'asc' | 'desc',
  ): Prisma.OccupantOrderByWithRelationInput[] {
    const dir = parseSortDir(sortDir) ?? 'asc';
    const key = s(sortBy);
    if (key === 'name') return [{ name: dir }];
    if (key === 'customerName') {
      return [
        { customer: { name: dir } },
        { relatedCustomerName: dir },
        { name: 'asc' },
      ];
    }
    if (key === 'customerCode') return [{ customerCode: dir }, { name: 'asc' }];
    if (key === 'mobilePhone') return [{ mobilePhone: dir }, { name: 'asc' }];
    if (key === 'whatsapp') return [{ whatsapp: dir }, { name: 'asc' }];
    if (key === 'email') return [{ email: dir }, { name: 'asc' }];
    if (key === 'createdAt') return [{ createdAt: dir }];
    if (key === 'updatedAt') return [{ updatedAt: dir }];
    return [{ updatedAt: 'desc' }, { name: 'asc' }];
  }

  async findOne(id: string) {
    const row = await this.prisma.occupant.findUnique({
      where: { id },
      include: occupantInclude,
    });
    if (!row) throw new NotFoundException(`Occupant ${id} not found`);
    return toOccupantDto(row);
  }

  async create(dto: CreateOccupantDto, actor = '') {
    const name = s(dto.name);
    if (!name) throw new BadRequestException('name is required');

    const customer = await this.resolveCustomer({
      customerId: dto.customerId,
      customerCode: dto.customerCode,
    });
    const actorId = actor || null;

    const row = await this.prisma.occupant.create({
      data: {
        name,
        customerId: customer?.id ?? null,
        customerCode: customer?.customerCode || s(dto.customerCode),
        relatedCustomerName: s(dto.relatedCustomerName) || customer?.name || '',
        whatsapp: s(dto.whatsapp),
        mobilePhone: s(dto.mobilePhone),
        contactPhone: s(dto.contactPhone),
        email: s(dto.email),
        fax: s(dto.fax),
        address: s(dto.address),
        idCardNo: s(dto.idCardNo),
        idCardImage: s(dto.idCardImage),
        addressProofCopy: s(dto.addressProofCopy),
        remark: s(dto.remark),
        createdById: actorId,
        updatedById: actorId,
      },
      include: occupantInclude,
    });
    return toOccupantDto(row);
  }

  async update(id: string, dto: UpdateOccupantDto, actor = '') {
    const existing = await this.prisma.occupant.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Occupant ${id} not found`);

    let customerId = existing.customerId;
    let customerCode = existing.customerCode;
    let relatedCustomerName = existing.relatedCustomerName;

    if (dto.customerId !== undefined || dto.customerCode !== undefined) {
      if (dto.customerId === null) {
        customerId = null;
        if (dto.customerCode !== undefined) customerCode = s(dto.customerCode);
      } else {
        const customer = await this.resolveCustomer({
          customerId: dto.customerId,
          customerCode: dto.customerCode,
        });
        customerId = customer?.id ?? null;
        customerCode = customer?.customerCode || s(dto.customerCode) || customerCode;
        if (customer && !s(dto.relatedCustomerName)) {
          relatedCustomerName = customer.name;
        }
      }
    }

    if (dto.relatedCustomerName !== undefined) {
      relatedCustomerName = s(dto.relatedCustomerName);
    }

    const row = await this.prisma.occupant.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? s(dto.name) : undefined,
        customerId,
        customerCode:
          dto.customerCode !== undefined ? s(dto.customerCode) || customerCode : customerCode,
        relatedCustomerName,
        whatsapp: dto.whatsapp !== undefined ? s(dto.whatsapp) : undefined,
        mobilePhone: dto.mobilePhone !== undefined ? s(dto.mobilePhone) : undefined,
        contactPhone: dto.contactPhone !== undefined ? s(dto.contactPhone) : undefined,
        email: dto.email !== undefined ? s(dto.email) : undefined,
        fax: dto.fax !== undefined ? s(dto.fax) : undefined,
        address: dto.address !== undefined ? s(dto.address) : undefined,
        idCardNo: dto.idCardNo !== undefined ? s(dto.idCardNo) : undefined,
        idCardImage: dto.idCardImage !== undefined ? s(dto.idCardImage) : undefined,
        addressProofCopy:
          dto.addressProofCopy !== undefined ? s(dto.addressProofCopy) : undefined,
        remark: dto.remark !== undefined ? s(dto.remark) : undefined,
        ...(actor ? { updatedById: actor } : {}),
      },
      include: occupantInclude,
    });
    return toOccupantDto(row);
  }

  async remove(id: string) {
    const existing = await this.prisma.occupant.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Occupant ${id} not found`);
    await this.prisma.occupant.delete({ where: { id } });
    return { success: true };
  }

  async removeMany(ids: string[]) {
    return runBatchRemove(ids, (id) => this.remove(id));
  }

  /** 批量导入：重复跳过；按客户编号优先，否则按关联客户名称（唯一）关联 */
  async importBatch(dto: ImportOccupantsDto, actor = '') {
    const items = dto.items || [];
    let created = 0;
    let skipped = 0;
    let unlinked = 0;
    let failed = 0;
    const issues: ImportIssue[] = [];

    const idCards = [
      ...new Set(items.map((it) => s(it.idCardNo).toLowerCase()).filter(Boolean)),
    ];
    const batchCodes = [
      ...new Set(items.map((it) => s(it.customerCode).toLowerCase()).filter(Boolean)),
    ];
    const batchNames = [
      ...new Set(items.map((it) => s(it.name).toLowerCase()).filter(Boolean)),
    ];
    const batchMobiles = [
      ...new Set(
        items
          .map((it) => s(it.mobilePhone).replace(/[\s\-()]/g, '').toLowerCase())
          .filter(Boolean),
      ),
    ];

    const dedupOr: Prisma.OccupantWhereInput[] = [];
    if (idCards.length) {
      dedupOr.push({
        OR: idCards.map((id) => ({
          idCardNo: { equals: id, mode: 'insensitive' as const },
        })),
      });
    }
    if (batchCodes.length && batchNames.length) {
      dedupOr.push({
        AND: [
          {
            OR: batchCodes.map((c) => ({
              customerCode: { equals: c, mode: 'insensitive' as const },
            })),
          },
          {
            OR: batchNames.map((n) => ({
              name: { equals: n, mode: 'insensitive' as const },
            })),
          },
        ],
      });
    }
    if (batchNames.length && batchMobiles.length) {
      dedupOr.push({
        AND: [
          {
            OR: batchNames.map((n) => ({
              name: { equals: n, mode: 'insensitive' as const },
            })),
          },
          {
            OR: batchMobiles.map((m) => ({
              mobilePhone: { contains: m, mode: 'insensitive' as const },
            })),
          },
        ],
      });
    }

    const existing = dedupOr.length
      ? await this.prisma.occupant.findMany({
          where: { OR: dedupOr },
          select: {
            id: true,
            name: true,
            customerCode: true,
            idCardNo: true,
            mobilePhone: true,
          },
        })
      : [];
    const seenKeys = new Set<string>();
    for (const o of existing) {
      for (const k of occupantDupKeys(o)) seenKeys.add(k);
    }

    const codes = [
      ...new Set(items.map((it) => s(it.customerCode)).filter(Boolean)),
    ];
    const customerNames = [
      ...new Set(
        items
          .filter((it) => !s(it.customerCode) && s(it.relatedCustomerName))
          .map((it) => s(it.relatedCustomerName)),
      ),
    ];
    const [customersByCode, customersByName] = await Promise.all([
      codes.length
        ? this.prisma.customer.findMany({
            where: { customerCode: { in: codes } },
            select: { id: true, customerCode: true, name: true, primaryOccupantId: true },
          })
        : Promise.resolve([]),
      customerNames.length
        ? this.prisma.customer.findMany({
            where: {
              OR: customerNames.map((name) => ({
                name: { equals: name, mode: 'insensitive' as const },
              })),
            },
            select: { id: true, customerCode: true, name: true, primaryOccupantId: true },
          })
        : Promise.resolve([]),
    ]);
    const byCode = new Map(
      customersByCode.map((c) => [c.customerCode.toLowerCase(), c]),
    );
    /** 名称不唯一时记为 null，导入时记 unlinked */
    const customerByName = new Map<
      string,
      { id: string; customerCode: string; name: string; primaryOccupantId: string | null } | null
    >();
    for (const c of customersByName) {
      const key = c.name.trim().toLowerCase();
      if (!key) continue;
      if (customerByName.has(key)) {
        customerByName.set(key, null);
      } else {
        customerByName.set(key, c);
      }
    }
    const primaryByCustomer = new Map<string, string | null>();
    for (const c of customersByCode) {
      primaryByCustomer.set(c.id, c.primaryOccupantId);
    }
    for (const c of customersByName) {
      if (!primaryByCustomer.has(c.id)) {
        primaryByCustomer.set(c.id, c.primaryOccupantId);
      }
    }

    const actorId = actor || null;

    for (const item of items) {
      const name = s(item.name);
      const customerCode = s(item.customerCode);
      const relatedCustomerName = s(item.relatedCustomerName);
      const idCardNo = s(item.idCardNo);
      const mobilePhone = s(item.mobilePhone);
      const issueKeys = {
        姓名: name,
        客戶編號: customerCode,
        關聯客戶: relatedCustomerName,
        身份證號: idCardNo,
        手提電話: mobilePhone,
      };

      if (!name) {
        skipped += 1;
        pushImportIssue(issues, 'skipped', '缺少使用者姓名', issueKeys);
        continue;
      }
      const candidate = { name, customerCode, idCardNo, mobilePhone };
      const keys = occupantDupKeys(candidate);
      if (keys.some((k) => seenKeys.has(k))) {
        skipped += 1;
        pushImportIssue(issues, 'skipped', '已存在相同身分證、客戶編號+姓名或姓名+手機的紀錄', issueKeys);
        continue;
      }

      let customer =
        (customerCode ? byCode.get(customerCode.toLowerCase()) : undefined) ||
        undefined;
      if (customerCode && !customer) {
        unlinked += 1;
        pushImportIssue(
          issues,
          'unlinked',
          `客戶編號「${customerCode}」未找到`,
          issueKeys,
        );
      } else if (!customer && relatedCustomerName) {
        const byName = customerByName.get(relatedCustomerName.toLowerCase());
        if (byName === null) {
          unlinked += 1;
          pushImportIssue(
            issues,
            'unlinked',
            `關聯客戶「${relatedCustomerName}」不唯一，無法匹配`,
            issueKeys,
          );
        } else if (byName === undefined) {
          unlinked += 1;
          pushImportIssue(
            issues,
            'unlinked',
            `關聯客戶「${relatedCustomerName}」未找到`,
            issueKeys,
          );
        } else {
          customer = byName;
        }
      }

      try {
        const row = await this.prisma.occupant.create({
          data: {
            name,
            customerId: customer?.id ?? null,
            customerCode: customer?.customerCode || customerCode,
            relatedCustomerName: relatedCustomerName || customer?.name || '',
            whatsapp: s(item.whatsapp),
            mobilePhone,
            contactPhone: s(item.contactPhone),
            email: s(item.email),
            fax: s(item.fax),
            address: s(item.address),
            idCardNo,
            idCardImage: s(item.idCardImage),
            addressProofCopy: s(item.addressProofCopy),
            remark: s(item.remark),
            createdById: actorId,
            updatedById: actorId,
          },
          select: { id: true, customerId: true },
        });
        for (const k of keys) seenKeys.add(k);
        // 无强键时也登记姓名，避免批内完全空联络重复
        if (!keys.length) seenKeys.add(`n:${name.toLowerCase()}`);
        created += 1;

        if (row.customerId && !primaryByCustomer.get(row.customerId)) {
          await this.prisma.customer.update({
            where: { id: row.customerId },
            data: { primaryOccupantId: row.id },
          });
          primaryByCustomer.set(row.customerId, row.id);
        }
      } catch (e) {
        failed += 1;
        const msg = e instanceof Error ? e.message : '建立使用者失敗';
        pushImportIssue(issues, 'failed', msg, issueKeys);
      }
    }

    return { created, updated: 0, skipped, unlinked, failed, issues };
  }
}
