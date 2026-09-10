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
    limit?: number;
    lite?: boolean;
  }) {
    const where: Prisma.OccupantWhereInput = {};
    if (params.customerId?.trim()) where.customerId = params.customerId.trim();
    const keyword = params.keyword?.trim();
    if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { customerCode: { contains: keyword, mode: 'insensitive' } },
        { relatedCustomerName: { contains: keyword, mode: 'insensitive' } },
        { mobilePhone: { contains: keyword, mode: 'insensitive' } },
        { whatsapp: { contains: keyword, mode: 'insensitive' } },
        { email: { contains: keyword, mode: 'insensitive' } },
        { idCardNo: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const take =
      typeof params.limit === 'number' && params.limit > 0
        ? Math.min(params.limit, 200)
        : undefined;

    if (params.lite) {
      const rows = await this.prisma.occupant.findMany({
        where,
        select: occupantLiteSelect,
        orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
        ...(take ? { take } : {}),
      });
      return rows.map(toOccupantLiteDto);
    }

    const rows = await this.prisma.occupant.findMany({
      where,
      include: occupantInclude,
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
      ...(take ? { take } : {}),
    });
    return rows.map(toOccupantDto);
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

  /** 批量导入：重复跳过；按客户编号关联；可为无主要使用者的客户回填 */
  async importBatch(dto: ImportOccupantsDto, actor = '') {
    const items = dto.items || [];
    let created = 0;
    let skipped = 0;
    let unlinked = 0;
    let failed = 0;

    const existing = await this.prisma.occupant.findMany({
      select: {
        id: true,
        name: true,
        customerCode: true,
        idCardNo: true,
        mobilePhone: true,
      },
    });
    const seenKeys = new Set<string>();
    for (const o of existing) {
      for (const k of occupantDupKeys(o)) seenKeys.add(k);
    }

    const codes = [
      ...new Set(items.map((it) => s(it.customerCode)).filter(Boolean)),
    ];
    const customers = codes.length
      ? await this.prisma.customer.findMany({
          where: { customerCode: { in: codes } },
          select: { id: true, customerCode: true, name: true, primaryOccupantId: true },
        })
      : [];
    const byCode = new Map(
      customers.map((c) => [c.customerCode.toLowerCase(), c]),
    );
    const primaryByCustomer = new Map(
      customers.map((c) => [c.id, c.primaryOccupantId] as const),
    );

    const actorId = actor || null;

    for (const item of items) {
      const name = s(item.name);
      if (!name) {
        skipped += 1;
        continue;
      }
      const customerCode = s(item.customerCode);
      const idCardNo = s(item.idCardNo);
      const mobilePhone = s(item.mobilePhone);
      const candidate = { name, customerCode, idCardNo, mobilePhone };
      const keys = occupantDupKeys(candidate);
      if (keys.some((k) => seenKeys.has(k))) {
        skipped += 1;
        continue;
      }

      const customer = customerCode
        ? byCode.get(customerCode.toLowerCase())
        : undefined;
      if (customerCode && !customer) unlinked += 1;

      try {
        const row = await this.prisma.occupant.create({
          data: {
            name,
            customerId: customer?.id ?? null,
            customerCode: customer?.customerCode || customerCode,
            relatedCustomerName:
              s(item.relatedCustomerName) || customer?.name || '',
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
      } catch {
        failed += 1;
      }
    }

    return { created, updated: 0, skipped, unlinked, failed };
  }
}
