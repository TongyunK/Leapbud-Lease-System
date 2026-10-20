import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NumberingBizKey, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BuildingAccessService } from '../building-access/building-access.service';
import { NumberingRulesService } from '../numbering-rules/numbering-rules.service';
import {
  CreateCustomerDto,
  ImportCustomersDto,
  NestedOccupantDto,
  UpdateCustomerDto,
} from './dto/customer.dto';
import { customerInclude, customerListInclude, toCustomerDto } from './customer.mapper';
import { userWhereActorLabels } from '../common/audit';
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

type OccupantContact = {
  name: string;
  whatsapp: string;
  mobilePhone: string;
  contactPhone: string;
  email: string;
  fax: string;
  address: string;
  idCardNo: string;
  idCardImage: string;
  addressProofCopy: string;
  remark: string;
};

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numberingRules: NumberingRulesService,
    private readonly access: BuildingAccessService,
  ) {}

  private async assertBuilding(buildingId: string | null | undefined) {
    const id = s(buildingId);
    if (!id) return null;
    const building = await this.prisma.building.findUnique({ where: { id } });
    if (!building) throw new NotFoundException(`Building ${id} not found`);
    return id;
  }

  private async assertAgreementTemplate(templateId: string | null | undefined) {
    const id = s(templateId);
    if (!id) return null;
    const tpl = await this.prisma.documentTemplate.findUnique({ where: { id } });
    if (!tpl) throw new NotFoundException(`DocumentTemplate ${id} not found`);
    if (tpl.type !== 'agreement') {
      throw new BadRequestException('agreementTemplateId 必须是协议（agreement）类型模板');
    }
    return id;
  }

  private async assertAccountManager(userId: string | null | undefined) {
    const id = s(userId);
    if (!id) return null;
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return id;
  }

  private occupantFromNested(dto?: NestedOccupantDto | null): OccupantContact | null {
    if (!dto) return null;
    const name = s(dto.name);
    if (!name) return null;
    return {
      name,
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
    };
  }

  private occupantContactFromRow(row: {
    name: string;
    whatsapp: string;
    mobilePhone: string;
    contactPhone: string;
    email: string;
    fax: string;
    address: string;
    idCardNo: string;
    idCardImage: string;
    addressProofCopy: string;
    remark: string;
  }): OccupantContact {
    return {
      name: row.name,
      whatsapp: row.whatsapp,
      mobilePhone: row.mobilePhone,
      contactPhone: row.contactPhone,
      email: row.email,
      fax: row.fax,
      address: row.address,
      idCardNo: row.idCardNo,
      idCardImage: row.idCardImage,
      addressProofCopy: row.addressProofCopy,
      remark: row.remark,
    };
  }

  async findAll(params: {
    keyword?: string;
    status?: string;
    statuses?: string[];
    accountManagers?: string[];
    buildingNames?: string[];
    names?: string[];
    primaryContacts?: string[];
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    createdAtFrom?: string;
    createdAtTo?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = parsePage(params.page);
    const pageSize = parsePageSize(params.pageSize);
    const where = this.buildListWhere(params);
    await this.access.constrain(where, 'customer');

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        include: customerListInclude,
        orderBy: this.buildListOrderBy(params.sortBy, params.sortDir),
        ...paginateArgs(page, pageSize),
      }),
    ]);

    return {
      items: rows.map(toCustomerDto),
      total,
      page,
      pageSize: pageSize ?? total,
    };
  }

  private buildListWhere(params: {
    keyword?: string;
    status?: string;
    statuses?: string[];
    accountManagers?: string[];
    buildingNames?: string[];
    names?: string[];
    primaryContacts?: string[];
    createdAtFrom?: string;
    createdAtTo?: string;
  }): Prisma.CustomerWhereInput {
    const where: Prisma.CustomerWhereInput = {};
    const and: Prisma.CustomerWhereInput[] = [];

    const statuses = [
      ...new Set(
        [...(params.statuses || []), params.status?.trim() || '']
          .map((v) => s(v))
          .filter(Boolean),
      ),
    ];
    if (statuses.length === 1) where.status = statuses[0];
    else if (statuses.length > 1) where.status = { in: statuses };

    const managers = (params.accountManagers || []).map((v) => s(v)).filter(Boolean);
    if (managers.length) {
      and.push({ accountManagerUser: userWhereActorLabels(managers) });
    }

    const buildingNames = (params.buildingNames || []).map((v) => s(v)).filter(Boolean);
    if (buildingNames.length) {
      and.push({ building: { name: { in: buildingNames } } });
    }

    const names = (params.names || []).map((v) => s(v)).filter(Boolean);
    if (names.length === 1) {
      and.push({ name: names[0] });
    } else if (names.length > 1) {
      and.push({ name: { in: names } });
    }

    const primaryContacts = (params.primaryContacts || []).map((v) => s(v)).filter(Boolean);
    if (primaryContacts.length) {
      and.push({ primaryOccupant: { name: { in: primaryContacts } } });
    }

    const keyword = params.keyword?.trim();
    if (keyword) {
      and.push({
        OR: [
          { customerCode: { contains: keyword, mode: 'insensitive' } },
          { name: { contains: keyword, mode: 'insensitive' } },
          { companyNameZh: { contains: keyword, mode: 'insensitive' } },
          { companyNameEn: { contains: keyword, mode: 'insensitive' } },
          { rentedRooms: { contains: keyword, mode: 'insensitive' } },
          { status: { contains: keyword, mode: 'insensitive' } },
          { building: { name: { contains: keyword, mode: 'insensitive' } } },
          { accountManagerUser: { account: { contains: keyword, mode: 'insensitive' } } },
          { accountManagerUser: { displayName: { contains: keyword, mode: 'insensitive' } } },
          { primaryOccupant: { name: { contains: keyword, mode: 'insensitive' } } },
          { primaryOccupant: { mobilePhone: { contains: keyword, mode: 'insensitive' } } },
          { primaryOccupant: { whatsapp: { contains: keyword, mode: 'insensitive' } } },
          { primaryOccupant: { email: { contains: keyword, mode: 'insensitive' } } },
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
  ): Prisma.CustomerOrderByWithRelationInput[] {
    const dir = parseSortDir(sortDir) ?? 'asc';
    const key = s(sortBy);
    if (key === 'customerCode') return [{ customerCode: dir }];
    if (key === 'name') return [{ name: dir }];
    if (key === 'status') return [{ status: dir }, { customerCode: 'asc' }];
    if (key === 'accountManager') {
      return [
        { accountManagerUser: { displayName: dir } },
        { accountManagerUser: { account: dir } },
        { customerCode: 'asc' },
      ];
    }
    if (key === 'buildingName') {
      return [{ building: { name: dir } }, { customerCode: 'asc' }];
    }
    if (key === 'primaryContact') {
      return [{ primaryOccupant: { name: dir } }, { customerCode: 'asc' }];
    }
    if (key === 'occupantCount') return [{ occupants: { _count: dir } }, { customerCode: 'asc' }];
    if (key === 'requirementCount') {
      return [{ requirements: { _count: dir } }, { customerCode: 'asc' }];
    }
    if (key === 'contractCount') return [{ contracts: { _count: dir } }, { customerCode: 'asc' }];
    if (key === 'invoiceCount') return [{ invoices: { _count: dir } }, { customerCode: 'asc' }];
    if (key === 'receivableCount') {
      return [{ receivables: { _count: dir } }, { customerCode: 'asc' }];
    }
    if (key === 'receiptCount') return [{ receipts: { _count: dir } }, { customerCode: 'asc' }];
    if (key === 'terminationCount') {
      return [{ leaseTerminations: { _count: dir } }, { customerCode: 'asc' }];
    }
    if (key === 'depositRefundCount') {
      return [{ depositRefunds: { _count: dir } }, { customerCode: 'asc' }];
    }
    if (key === 'createdAt') return [{ createdAt: dir }];
    if (key === 'updatedAt') return [{ updatedAt: dir }];
    return [{ updatedAt: 'desc' }, { customerCode: 'asc' }];
  }

  async findOne(id: string) {
    const row = await this.prisma.customer.findUnique({
      where: { id },
      include: customerInclude,
    });
    if (!row) throw new NotFoundException(`Customer ${id} not found`);
    await this.access.assertCustomerId(row.id);
    return toCustomerDto(row);
  }

  /** 生成下一个客户编号：CSM + YY + 4 位序号 */
  private async nextCustomerCode(reserved?: { has(key: string): boolean }) {
    return this.numberingRules.nextCode(NumberingBizKey.customer, {
      reserved,
      isTaken: async (code) =>
        !!(await this.prisma.customer.findFirst({
          where: { customerCode: code },
          select: { id: true },
        })),
    });
  }

  async create(dto: CreateCustomerDto, actor = '') {
    const name = s(dto.name);
    if (!name) throw new BadRequestException('name is required');
    const customerCode = s(dto.customerCode) || (await this.nextCustomerCode());

    const linkOccupantId = s(dto.linkOccupantId);
    let nestedOcc = this.occupantFromNested(dto.occupant);
    const buildingId = await this.assertBuilding(dto.buildingId);
    const agreementTemplateId = await this.assertAgreementTemplate(dto.agreementTemplateId);
    const accountManagerId = await this.assertAccountManager(dto.accountManagerId);
    const actorId = actor || null;

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        if (linkOccupantId) {
          const existing = await tx.occupant.findUnique({ where: { id: linkOccupantId } });
          if (!existing) throw new NotFoundException(`Occupant ${linkOccupantId} not found`);
          if (!nestedOcc) nestedOcc = this.occupantContactFromRow(existing);
          else nestedOcc = { ...this.occupantContactFromRow(existing), ...nestedOcc, name: nestedOcc.name };
        }

        const created = await tx.customer.create({
          data: {
            customerCode,
            name,
            status: s(dto.status),
            accountManagerId,
            companyNameZh: s(dto.companyNameZh),
            companyNameEn: s(dto.companyNameEn),
            businessRegNo: s(dto.businessRegNo),
            businessNature: s(dto.businessNature),
            businessRegCopy: s(dto.businessRegCopy),
            remark: s(dto.remark),
            source: s(dto.source),
            rentedRooms: s(dto.rentedRooms),
            buildingId,
            agreementTemplateId,
            createdById: actorId,
            updatedById: actorId,
          },
        });

        let primaryId: string | null = null;

        if (linkOccupantId && nestedOcc) {
          await tx.occupant.update({
            where: { id: linkOccupantId },
            data: {
              customerId: created.id,
              customerCode: created.customerCode,
              relatedCustomerName: created.name,
              name: nestedOcc.name,
              whatsapp: nestedOcc.whatsapp,
              mobilePhone: nestedOcc.mobilePhone,
              contactPhone: nestedOcc.contactPhone,
              email: nestedOcc.email,
              fax: nestedOcc.fax,
              address: nestedOcc.address,
              idCardNo: nestedOcc.idCardNo,
              idCardImage: nestedOcc.idCardImage,
              addressProofCopy: nestedOcc.addressProofCopy,
              remark: nestedOcc.remark,
              updatedById: actorId,
            },
          });
          primaryId = linkOccupantId;
        } else if (nestedOcc) {
          const occ = await tx.occupant.create({
            data: {
              name: nestedOcc.name,
              customerId: created.id,
              customerCode: created.customerCode,
              relatedCustomerName: created.name,
              whatsapp: nestedOcc.whatsapp,
              mobilePhone: nestedOcc.mobilePhone,
              contactPhone: nestedOcc.contactPhone,
              email: nestedOcc.email,
              fax: nestedOcc.fax,
              address: nestedOcc.address,
              idCardNo: nestedOcc.idCardNo,
              idCardImage: nestedOcc.idCardImage,
              addressProofCopy: nestedOcc.addressProofCopy,
              remark: nestedOcc.remark,
              createdById: actorId,
              updatedById: actorId,
            },
          });
          primaryId = occ.id;
        }

        if (primaryId) {
          await tx.customer.update({
            where: { id: created.id },
            data: { primaryOccupantId: primaryId },
          });
        }

        return tx.customer.findUniqueOrThrow({
          where: { id: created.id },
          include: customerInclude,
        });
      });
      return toCustomerDto(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Customer code「${customerCode}」already exists`);
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateCustomerDto, actor = '') {
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Customer ${id} not found`);

    let buildingId: string | null | undefined = undefined;
    if (dto.buildingId !== undefined) {
      buildingId = (await this.assertBuilding(dto.buildingId)) ?? null;
    }

    let agreementTemplateId: string | null | undefined = undefined;
    if (dto.agreementTemplateId !== undefined) {
      agreementTemplateId = (await this.assertAgreementTemplate(dto.agreementTemplateId)) ?? null;
    }

    let accountManagerId: string | null | undefined = undefined;
    if (dto.accountManagerId !== undefined) {
      accountManagerId = (await this.assertAccountManager(dto.accountManagerId)) ?? null;
    }

    const actorId = actor || null;
    const nestedOcc = this.occupantFromNested(dto.occupant);
    const linkOccupantId = s(dto.linkOccupantId);
    const explicitPrimaryId =
      dto.primaryOccupantId === null ? null : s(dto.primaryOccupantId) || undefined;

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        let nextPrimaryId = existing.primaryOccupantId;

        if (linkOccupantId) {
          const linkRow = await tx.occupant.findUnique({ where: { id: linkOccupantId } });
          if (!linkRow) throw new NotFoundException(`Occupant ${linkOccupantId} not found`);
          await tx.occupant.update({
            where: { id: linkOccupantId },
            data: {
              customerId: id,
              customerCode: s(dto.customerCode) || existing.customerCode,
              relatedCustomerName: s(dto.name) || existing.name,
              ...(actorId ? { updatedById: actorId } : {}),
            },
          });
          if (!nextPrimaryId) nextPrimaryId = linkOccupantId;
        }

        if (explicitPrimaryId !== undefined) {
          if (explicitPrimaryId === null) {
            nextPrimaryId = null;
          } else {
            const target = await tx.occupant.findUnique({ where: { id: explicitPrimaryId } });
            if (!target || target.customerId !== id) {
              throw new BadRequestException('primaryOccupantId 不属于当前客户');
            }
            nextPrimaryId = explicitPrimaryId;
          }
        }

        if (nestedOcc) {
          let targetId = nextPrimaryId || '';
          if (targetId) {
            const target = await tx.occupant.findUnique({ where: { id: targetId } });
            if (!target || target.customerId !== id) {
              targetId = '';
            }
          }
          if (!targetId) {
            const linked = await tx.occupant.findFirst({
              where: { customerId: id },
              orderBy: [{ updatedAt: 'desc' }],
            });
            targetId = linked?.id || '';
          }

          if (targetId) {
            await tx.occupant.update({
              where: { id: targetId },
              data: {
                name: nestedOcc.name,
                whatsapp: nestedOcc.whatsapp,
                mobilePhone: nestedOcc.mobilePhone,
                contactPhone: nestedOcc.contactPhone,
                email: nestedOcc.email,
                fax: nestedOcc.fax,
                address: nestedOcc.address,
                idCardNo: nestedOcc.idCardNo,
                idCardImage: nestedOcc.idCardImage,
                addressProofCopy: nestedOcc.addressProofCopy,
                remark: nestedOcc.remark,
                customerCode: s(dto.customerCode) || existing.customerCode,
                relatedCustomerName: s(dto.name) || existing.name,
                ...(actorId ? { updatedById: actorId } : {}),
              },
            });
            nextPrimaryId = targetId;
          } else {
            const occ = await tx.occupant.create({
              data: {
                name: nestedOcc.name,
                customerId: id,
                customerCode: s(dto.customerCode) || existing.customerCode,
                relatedCustomerName: s(dto.name) || existing.name,
                whatsapp: nestedOcc.whatsapp,
                mobilePhone: nestedOcc.mobilePhone,
                contactPhone: nestedOcc.contactPhone,
                email: nestedOcc.email,
                fax: nestedOcc.fax,
                address: nestedOcc.address,
                idCardNo: nestedOcc.idCardNo,
                idCardImage: nestedOcc.idCardImage,
                addressProofCopy: nestedOcc.addressProofCopy,
                remark: nestedOcc.remark,
                createdById: actorId,
                updatedById: actorId,
              },
            });
            nextPrimaryId = occ.id;
          }
        }

        return tx.customer.update({
          where: { id },
          data: {
            customerCode: dto.customerCode !== undefined ? s(dto.customerCode) : undefined,
            name: dto.name !== undefined ? s(dto.name) : undefined,
            status: dto.status !== undefined ? s(dto.status) : undefined,
            accountManagerId,
            companyNameZh: dto.companyNameZh !== undefined ? s(dto.companyNameZh) : undefined,
            companyNameEn: dto.companyNameEn !== undefined ? s(dto.companyNameEn) : undefined,
            businessRegNo: dto.businessRegNo !== undefined ? s(dto.businessRegNo) : undefined,
            businessNature: dto.businessNature !== undefined ? s(dto.businessNature) : undefined,
            businessRegCopy: dto.businessRegCopy !== undefined ? s(dto.businessRegCopy) : undefined,
            remark: dto.remark !== undefined ? s(dto.remark) : undefined,
            source: dto.source !== undefined ? s(dto.source) : undefined,
            rentedRooms: dto.rentedRooms !== undefined ? s(dto.rentedRooms) : undefined,
            buildingId,
            agreementTemplateId,
            primaryOccupantId: nextPrimaryId,
            ...(actorId ? { updatedById: actorId } : {}),
          },
          include: customerInclude,
        });
      });
      return toCustomerDto(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(
          `Customer code「${dto.customerCode?.trim()}」already exists`,
        );
      }
      throw e;
    }
  }

  async remove(id: string) {
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Customer ${id} not found`);
    // 先清空主要使用者，避免删客户时自引用阻碍
    await this.prisma.customer.update({
      where: { id },
      data: { primaryOccupantId: null },
    });
    await this.prisma.customer.delete({ where: { id } });
    return { success: true };
  }

  async removeMany(ids: string[]) {
    return runBatchRemove(ids, (id) => this.remove(id));
  }

  /** 批量导入：有编号则按编号 upsert；无编号则自动生成后新建 */
  async importBatch(dto: ImportCustomersDto, actor = '') {
    const items = dto.items || [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const issues: ImportIssue[] = [];

    const codes = [
      ...new Set(items.map((it) => s(it.customerCode)).filter(Boolean)),
    ];
    const existingRows = codes.length
      ? await this.prisma.customer.findMany({
          where: { customerCode: { in: codes } },
          select: { id: true, customerCode: true },
        })
      : [];
    const byCode = new Map(existingRows.map((c) => [c.customerCode, c]));
    const reserved = new Set(
      [...byCode.keys()].map((c) => c.toLowerCase()),
    );

    for (const item of items) {
      const name = s(item.name);
      let code = s(item.customerCode);
      const keys = { 客戶編號: code, 客戶名稱: name };

      if (!name) {
        skipped += 1;
        pushImportIssue(issues, 'skipped', '缺少客戶名稱', keys);
        continue;
      }
      try {
        if (code) {
          const hit = byCode.get(code);
          if (hit) {
            await this.update(hit.id, item as UpdateCustomerDto, actor);
            updated += 1;
          } else {
            const row = await this.create({ ...item, customerCode: code, name }, actor);
            byCode.set(code, { id: row.id, customerCode: code });
            reserved.add(code.toLowerCase());
            created += 1;
          }
        } else {
          code = await this.nextCustomerCode(reserved);
          const row = await this.create({ ...item, customerCode: code, name }, actor);
          byCode.set(code, { id: row.id, customerCode: code });
          reserved.add(code.toLowerCase());
          created += 1;
        }
      } catch (e) {
        failed += 1;
        const msg = e instanceof Error ? e.message : '建立或更新客戶失敗';
        pushImportIssue(issues, 'failed', msg, { ...keys, 客戶編號: code });
      }
    }

    return { created, updated, skipped, failed, issues };
  }
}
