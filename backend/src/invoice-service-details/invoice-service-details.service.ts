import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BuildingAccessService } from '../building-access/building-access.service';
import {
  CreateInvoiceServiceDetailDto,
  ImportInvoiceServiceDetailsDto,
  UpdateInvoiceServiceDetailDto,
} from './dto/invoice-service-detail.dto';
import {
  invoiceServiceDetailInclude,
  toInvoiceServiceDetailListDto,
} from './invoice-service-detail.mapper';
import {
  dateRangeFilter,
  paginateArgs,
  parsePage,
  parsePageSize,
  parseSortDir,
  type PaginatedResult,
} from '../common/pagination';
import { runBatchRemove } from '../common/batch-delete';
import { pushImportIssue, type ImportIssue } from '../common/import-result';
import { actorLabelsOrEmpty } from '../common/audit';
import { numberFieldInOrEmpty, stringFieldInOrEmpty } from '../common/column-filter';

function s(v?: string | null) {
  return (v ?? '').trim();
}

function decimalField(v: number, field: string): Prisma.Decimal {
  const n = Number(v);
  if (Number.isNaN(n)) throw new BadRequestException(`${field} must be a number`);
  return new Prisma.Decimal(n);
}

function feeSubtotal(
  quantity: Prisma.Decimal,
  unitAmount: Prisma.Decimal,
  subtotal?: number | null,
): Prisma.Decimal {
  if (subtotal != null && !Number.isNaN(Number(subtotal))) {
    return decimalField(subtotal, 'subtotal');
  }
  return new Prisma.Decimal(Number(quantity.toString()) * Number(unitAmount.toString()));
}

function numOrZero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

@Injectable()
export class InvoiceServiceDetailsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BuildingAccessService,
  ) {}

  async findAll(params: {
    keyword?: string;
    invoiceId?: string;
    invoiceCodes?: string[];
    quantities?: string[];
    unitAmounts?: string[];
    subtotals?: string[];
    createdBys?: string[];
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    createdAtFrom?: string;
    createdAtTo?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<ReturnType<typeof toInvoiceServiceDetailListDto>>> {
    const page = parsePage(params.page);
    const pageSize = parsePageSize(params.pageSize);
    const where = this.buildListWhere(params);
    await this.access.constrain(where, 'viaInvoiceRoom');
    const { skip, take } = paginateArgs(page, pageSize);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.invoiceServiceDetail.count({ where }),
      this.prisma.invoiceServiceDetail.findMany({
        where,
        include: invoiceServiceDetailInclude,
        orderBy: this.buildListOrderBy(params.sortBy, params.sortDir),
        ...(skip != null ? { skip, take } : {}),
      }),
    ]);

    return {
      items: rows.map(toInvoiceServiceDetailListDto),
      total,
      page: pageSize == null ? 1 : page,
      pageSize: pageSize == null ? total : pageSize,
    };
  }

  private buildListWhere(params: {
    keyword?: string;
    invoiceId?: string;
    invoiceCodes?: string[];
    quantities?: string[];
    unitAmounts?: string[];
    subtotals?: string[];
    createdBys?: string[];
    createdAtFrom?: string;
    createdAtTo?: string;
  }): Prisma.InvoiceServiceDetailWhereInput {
    const where: Prisma.InvoiceServiceDetailWhereInput = {};
    if (params.invoiceId?.trim()) where.invoiceId = params.invoiceId.trim();

    const and: Prisma.InvoiceServiceDetailWhereInput[] = [];

    const invoiceCodeClause = stringFieldInOrEmpty('invoiceCode', params.invoiceCodes);
    if (invoiceCodeClause) {
      and.push({ invoice: invoiceCodeClause } as Prisma.InvoiceServiceDetailWhereInput);
    }

    const quantityClause = numberFieldInOrEmpty('quantity', params.quantities);
    if (quantityClause) and.push(quantityClause as Prisma.InvoiceServiceDetailWhereInput);

    const unitAmountClause = numberFieldInOrEmpty('unitAmount', params.unitAmounts);
    if (unitAmountClause) and.push(unitAmountClause as Prisma.InvoiceServiceDetailWhereInput);

    const subtotalClause = numberFieldInOrEmpty('subtotal', params.subtotals);
    if (subtotalClause) and.push(subtotalClause as Prisma.InvoiceServiceDetailWhereInput);

    const createdByClause = actorLabelsOrEmpty('createdBy', params.createdBys);
    if (createdByClause) and.push(createdByClause as Prisma.InvoiceServiceDetailWhereInput);

    if (and.length) where.AND = and;

    const keyword = params.keyword?.trim();
    if (keyword) {
      where.OR = [
        { description: { contains: keyword, mode: 'insensitive' } },
        { remark: { contains: keyword, mode: 'insensitive' } },
        { invoice: { invoiceCode: { contains: keyword, mode: 'insensitive' } } },
        { invoice: { contract: { contractCode: { contains: keyword, mode: 'insensitive' } } } },
        { invoice: { customer: { name: { contains: keyword, mode: 'insensitive' } } } },
        { invoice: { room: { roomCode: { contains: keyword, mode: 'insensitive' } } } },
        { createdByUser: { account: { contains: keyword, mode: 'insensitive' } } },
        { createdByUser: { displayName: { contains: keyword, mode: 'insensitive' } } },
      ];
    }

    const createdAt = dateRangeFilter(params.createdAtFrom, params.createdAtTo, true);
    if (createdAt) where.createdAt = createdAt;

    return where;
  }

  private buildListOrderBy(
    sortBy?: string,
    sortDir?: 'asc' | 'desc',
  ): Prisma.InvoiceServiceDetailOrderByWithRelationInput[] {
    const dir = parseSortDir(sortDir) ?? 'asc';
    const key = s(sortBy);
    if (!key) return [{ createdAt: 'desc' }, { invoice: { invoiceCode: 'asc' } }, { sortOrder: 'asc' }];
    if (key === 'invoiceCode') {
      return [{ invoice: { invoiceCode: dir } }, { sortOrder: 'asc' }, { createdAt: 'asc' }];
    }
    if (key === 'contractCode') {
      return [{ invoice: { contract: { contractCode: dir } } }, { sortOrder: 'asc' }];
    }
    if (key === 'customerName') {
      return [{ invoice: { customer: { name: dir } } }, { sortOrder: 'asc' }];
    }
    if (key === 'roomCode') {
      return [{ invoice: { room: { roomCode: dir } } }, { sortOrder: 'asc' }];
    }
    if (key === 'description') return [{ description: dir }];
    if (key === 'quantity') return [{ quantity: dir }];
    if (key === 'unitAmount') return [{ unitAmount: dir }];
    if (key === 'subtotal') return [{ subtotal: dir }];
    if (key === 'remark') return [{ remark: dir }];
    if (key === 'createdBy') {
      return [{ createdByUser: { displayName: dir } }, { createdByUser: { account: dir } }];
    }
    if (key === 'createdAt') return [{ createdAt: dir }];
    if (key === 'sortOrder') return [{ sortOrder: dir }, { createdAt: 'asc' }];
    return [
      { invoice: { invoiceCode: 'asc' } },
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
    ];
  }

  async findOne(id: string) {
    const row = await this.prisma.invoiceServiceDetail.findUnique({
      where: { id },
      include: invoiceServiceDetailInclude,
    });
    if (!row) throw new NotFoundException(`Invoice service detail ${id} not found`);
    await this.access.assertInvoiceId(row.invoiceId);
    return toInvoiceServiceDetailListDto(row);
  }

  async create(dto: CreateInvoiceServiceDetailDto, actor = '') {
    const invoice = await this.resolveInvoice(dto.invoiceId, dto.invoiceCode);
    const quantity = decimalField(dto.quantity ?? 0, 'quantity');
    const unitAmount = decimalField(dto.unitAmount ?? 0, 'unitAmount');
    const subtotal = feeSubtotal(quantity, unitAmount, dto.subtotal);
    const actorId = actor || null;

    const row = await this.prisma.invoiceServiceDetail.create({
      data: {
        invoiceId: invoice.id,
        description: s(dto.description),
        quantity,
        unitAmount,
        subtotal,
        remark: s(dto.remark),
        sortOrder: dto.sortOrder != null ? Math.floor(Number(dto.sortOrder)) : 0,
        createdById: actorId,
        updatedById: actorId,
      },
      include: invoiceServiceDetailInclude,
    });
    return toInvoiceServiceDetailListDto(row);
  }

  async importBatch(dto: ImportInvoiceServiceDetailsDto, actor = '') {
    const items = dto.items || [];
    let created = 0;
    let skipped = 0;
    let failed = 0;
    let unlinked = 0;
    const issues: ImportIssue[] = [];
    const actorId = actor || null;

    const invoiceCodes = [
      ...new Set(items.map((it) => s(it.invoiceCode)).filter(Boolean)),
    ];
    const invoiceIdHints = [
      ...new Set(items.map((it) => s(it.invoiceId)).filter(Boolean)),
    ];

    const invoices =
      invoiceCodes.length || invoiceIdHints.length
        ? await this.prisma.invoice.findMany({
            where: {
              OR: [
                ...(invoiceCodes.length ? [{ invoiceCode: { in: invoiceCodes } }] : []),
                ...(invoiceIdHints.length ? [{ id: { in: invoiceIdHints } }] : []),
              ],
            },
            select: { id: true, invoiceCode: true },
          })
        : [];
    const invoiceByCode = new Map(
      invoices
        .filter((inv): inv is { id: string; invoiceCode: string } => Boolean(inv.invoiceCode))
        .map((inv) => [inv.invoiceCode.toLowerCase(), inv]),
    );
    const invoiceById = new Map(invoices.map((inv) => [inv.id, inv]));

    const seedInvoiceIds = invoices.map((inv) => inv.id);
    const existing = seedInvoiceIds.length
      ? await this.prisma.invoiceServiceDetail.findMany({
          where: { invoiceId: { in: seedInvoiceIds } },
          select: {
            invoiceId: true,
            description: true,
            quantity: true,
            unitAmount: true,
            invoice: { select: { invoiceCode: true } },
          },
        })
      : [];
    const seen = new Set(
      existing.map(
        (r) =>
          `${(r.invoice?.invoiceCode || r.invoiceId).toLowerCase()}|${(r.description || '').toLowerCase()}|${r.quantity.toString()}|${r.unitAmount.toString()}`,
      ),
    );

    for (const item of items) {
      const invoiceIdHint = s(item.invoiceId);
      const invoiceCode = s(item.invoiceCode);
      const description = s(item.description);
      const keys = {
        發票編號: invoiceCode,
        服務描述: description,
      };

      if (!invoiceCode && !invoiceIdHint) {
        skipped += 1;
        pushImportIssue(issues, 'skipped', '缺少發票編號', keys);
        continue;
      }

      let invoice: { id: string; invoiceCode: string | null } | null = null;
      if (invoiceIdHint) {
        invoice =
          invoiceById.get(invoiceIdHint) ||
          (await this.prisma.invoice.findUnique({
            where: { id: invoiceIdHint },
            select: { id: true, invoiceCode: true },
          }));
      } else if (invoiceCode) {
        invoice = invoiceByCode.get(invoiceCode.toLowerCase()) || null;
      }

      if (!invoice) {
        unlinked += 1;
        pushImportIssue(
          issues,
          'unlinked',
          invoiceCode
            ? `發票編號「${invoiceCode}」未找到`
            : `發票 ID「${invoiceIdHint}」未找到`,
          keys,
        );
        continue;
      }

      const quantity = decimalField(numOrZero(item.quantity), 'quantity');
      const unitAmount = decimalField(numOrZero(item.unitAmount), 'unitAmount');
      const subtotal = feeSubtotal(quantity, unitAmount, item.subtotal);

      const invoiceLabel = invoice.invoiceCode || invoice.id;
      const dupKey = `${invoiceLabel.toLowerCase()}|${description.toLowerCase()}|${quantity.toString()}|${unitAmount.toString()}`;
      if (seen.has(dupKey)) {
        skipped += 1;
        pushImportIssue(
          issues,
          'skipped',
          `發票「${invoiceLabel}」已存在相同服務細節記錄`,
          { ...keys, 發票編號: invoiceLabel },
        );
        continue;
      }

      try {
        await this.prisma.invoiceServiceDetail.create({
          data: {
            invoiceId: invoice.id,
            description,
            quantity,
            unitAmount,
            subtotal,
            remark: s(item.remark),
            sortOrder: item.sortOrder != null ? Math.floor(Number(item.sortOrder)) : 0,
            createdById: actorId,
            updatedById: actorId,
          },
        });
        seen.add(dupKey);
        created += 1;
      } catch (e) {
        failed += 1;
        const msg = e instanceof Error ? e.message : '建立服務細節失敗';
        pushImportIssue(issues, 'failed', msg, { ...keys, 發票編號: invoice.invoiceCode || invoice.id });
      }
    }

    return { created, updated: 0, skipped, failed, unlinked, issues };
  }

  async update(id: string, dto: UpdateInvoiceServiceDetailDto, actor = '') {
    const existing = await this.prisma.invoiceServiceDetail.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Invoice service detail ${id} not found`);

    const invoiceId =
      dto.invoiceId !== undefined ? s(dto.invoiceId) : existing.invoiceId;
    if (!invoiceId) throw new BadRequestException('invoiceId is required');
    await this.assertInvoice(invoiceId);

    const quantity =
      dto.quantity !== undefined
        ? decimalField(dto.quantity, 'quantity')
        : existing.quantity;
    const unitAmount =
      dto.unitAmount !== undefined
        ? decimalField(dto.unitAmount, 'unitAmount')
        : existing.unitAmount;
    const subtotal =
      dto.subtotal !== undefined || dto.quantity !== undefined || dto.unitAmount !== undefined
        ? feeSubtotal(
            quantity,
            unitAmount,
            dto.subtotal !== undefined ? dto.subtotal : undefined,
          )
        : existing.subtotal;

    const row = await this.prisma.invoiceServiceDetail.update({
      where: { id },
      data: {
        invoiceId,
        description: dto.description !== undefined ? s(dto.description) : undefined,
        quantity,
        unitAmount,
        subtotal,
        remark: dto.remark !== undefined ? s(dto.remark) : undefined,
        sortOrder: dto.sortOrder !== undefined ? Math.floor(Number(dto.sortOrder)) : undefined,
        ...(actor ? { updatedById: actor } : {}),
      },
      include: invoiceServiceDetailInclude,
    });
    return toInvoiceServiceDetailListDto(row);
  }

  async remove(id: string) {
    const existing = await this.prisma.invoiceServiceDetail.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Invoice service detail ${id} not found`);
    await this.prisma.invoiceServiceDetail.delete({ where: { id } });
    return { success: true };
  }

  async removeMany(ids: string[]) {
    return runBatchRemove(ids, (id) => this.remove(id));
  }

  private async resolveInvoice(invoiceId?: string | null, invoiceCode?: string | null) {
    const id = s(invoiceId);
    const code = s(invoiceCode);
    if (id) {
      const row = await this.prisma.invoice.findUnique({
        where: { id },
        select: { id: true, invoiceCode: true },
      });
      if (!row) throw new BadRequestException('Invalid invoiceId');
      return row;
    }
    if (code) {
      const row = await this.prisma.invoice.findUnique({
        where: { invoiceCode: code },
        select: { id: true, invoiceCode: true },
      });
      if (!row) throw new BadRequestException('Invalid invoiceCode');
      return row;
    }
    throw new BadRequestException('invoiceId or invoiceCode is required');
  }

  private async assertInvoice(invoiceId: string) {
    const row = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true },
    });
    if (!row) throw new BadRequestException('Invalid invoiceId');
    return row;
  }
}
