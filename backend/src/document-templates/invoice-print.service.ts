import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { fillDocxTemplate } from './docx-fill.util';
import { convertDocxToPdf } from './pdf-convert.util';
import type { InvoicePreviewDraftDto } from './dto/document-template.dto';

function s(v?: string | null) {
  return (v ?? '').trim();
}

function decimalToFixed(
  value: Prisma.Decimal | number | string | null | undefined,
  digits = 2,
): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(digits);
}

/** 金额千分位，如 4769 → 4,769.00 */
function formatAmountWithComma(
  value: Prisma.Decimal | number | string | null | undefined,
  digits = 2,
): string {
  const fixed = decimalToFixed(value, digits);
  if (!fixed) return '';
  const [intPart, dec] = fixed.split('.');
  const withComma = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec !== undefined ? `${withComma}.${dec}` : withComma;
}

/** 数量展示：整数不带小数，否则保留两位 */
function formatQuantity(
  value: Prisma.Decimal | number | string | null | undefined,
): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '';
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return n.toFixed(2);
}

/** 发票日期：DD/MM/YYYY（港式英文发票常用） */
function formatInvoiceDate(d: Date | null | undefined): string {
  if (!d) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${day}/${m}/${y}`;
}

function parseDateOnlyLoose(v?: string | null): Date | null {
  const raw = s(v);
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return new Date(`${raw}T00:00:00.000Z`);
}

function uploadsRoot() {
  return path.join(process.cwd(), 'uploads');
}

type PrintItem = {
  description: string;
  quantity: string;
  unitPrice: string;
  unitAmount: string;
  amount: string;
  subtotal: string;
  remark: string;
};

type ComposeInput = {
  invoiceCode: string | null;
  invoiceType: string | null;
  description: string | null;
  amount: number;
  invoiceDate: Date | null;
  paymentDueDate: Date | null;
  status: string | null;
  roomNameText: string | null;
  notes: string | null;
  remark: string | null;
  whatsappNumber: string | null;
  contractCode: string | null;
  customer: {
    name: string | null;
    customerCode: string | null;
    companyNameZh: string | null;
    companyNameEn: string | null;
  };
  room: {
    roomCode: string | null;
    name: string | null;
    building: {
      name: string | null;
      address: string | null;
      addressEn: string | null;
      fpsId: string | null;
      bankAccountHolder: string | null;
      bankAccount: string | null;
      chequePaymentBy: string | null;
      paymentAdvice: string | null;
    } | null;
  };
  detailLines: Array<{
    description: string;
    quantity: number;
    unitAmount: number;
    subtotal: number;
    remark: string;
  }>;
};

export type InvoicePrintResult = {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  format: 'docx' | 'pdf';
};

@Injectable()
export class InvoicePrintService {
  constructor(private readonly prisma: PrismaService) {}

  private composePrintData(input: ComposeInput): Record<string, unknown> {
    let items: PrintItem[] = input.detailLines.map((row) => {
      const qty = formatQuantity(row.quantity);
      const unitPrice = formatAmountWithComma(row.unitAmount) || '0.00';
      const amount = formatAmountWithComma(row.subtotal) || '0.00';
      return {
        description: s(row.description),
        quantity: qty,
        unitPrice,
        unitAmount: unitPrice,
        amount,
        subtotal: amount,
        remark: s(row.remark),
      };
    });

    // 无服务细节时回退为一行，避免循环行被删空
    if (items.length === 0) {
      const unitPrice = formatAmountWithComma(input.amount) || '0.00';
      items = [
        {
          description:
            s(input.description) || s(input.invoiceType) || s(input.invoiceCode),
          quantity: '1',
          unitPrice,
          unitAmount: unitPrice,
          amount: unitPrice,
          subtotal: unitPrice,
          remark: '',
        },
      ];
    }

    const detailsSum = input.detailLines.reduce(
      (acc, row) => acc + (Number(row.subtotal) || 0),
      0,
    );
    const subtotalValue =
      input.detailLines.length > 0 ? detailsSum : Number(input.amount) || 0;
    const totalValue = Number(input.amount) || 0;
    const invSubtotal = formatAmountWithComma(subtotalValue) || '0.00';
    const invTotal = formatAmountWithComma(totalValue) || '0.00';

    const customerName = s(input.customer.name);
    const roomNameRaw = s(input.roomNameText) || s(input.room.name);
    const roomName = roomNameRaw.replace(/\s*室\s*$/u, '').trim();
    const roomNo = s(input.room.roomCode) || roomName;
    const building = input.room.building;
    const address = s(building?.addressEn) || s(building?.address);

    const invDate = formatInvoiceDate(input.invoiceDate);
    const invDueDate = formatInvoiceDate(input.paymentDueDate);
    const invNo = s(input.invoiceCode);

    const fpsId = s(building?.fpsId);
    const accountName = s(building?.bankAccountHolder);
    const account = s(building?.bankAccount);
    const post = s(building?.chequePaymentBy);
    const paymentAdvice = s(building?.paymentAdvice);

    return {
      inv_date: invDate,
      inv_No: invNo,
      customerName,
      roomName,
      roomNo,
      address,
      inv_subtotal: invSubtotal,
      inv_total: invTotal,
      inv_dueDate: invDueDate,
      FPSID: fpsId,
      accountName,
      account,
      post,
      payment_advice: paymentAdvice,
      clientname: customerName,
      inv_amountDue: invTotal,

      invoiceCode: invNo,
      invoiceDate: invDate,
      paymentDueDate: invDueDate,
      invoiceType: s(input.invoiceType),
      description: s(input.description),
      amount: invTotal,
      amountRaw: decimalToFixed(input.amount) || '0.00',
      subtotal: invSubtotal,
      status: s(input.status),
      contractCode: s(input.contractCode),
      customerCode: s(input.customer.customerCode),
      companyNameZh: s(input.customer.companyNameZh),
      companyNameEn: s(input.customer.companyNameEn),
      roomCode: s(input.room.roomCode),
      buildingName: s(building?.name),
      buildingAddress: s(building?.address),
      buildingAddressEn: s(building?.addressEn),
      fpsId,
      bankAccountHolder: accountName,
      bankAccount: account,
      chequePaymentBy: post,
      paymentAdvice,
      items,
      itemCount: items.length,
      notes: s(input.notes),
      remark: s(input.remark),
      whatsappNumber: s(input.whatsappNumber),
    };
  }

  /**
   * 聚合发票数据为模板填充对象。
   * 兼容旧系统占位符键名（如 inv_No、FPSID）；新模板也可用 camelCase 别名。
   */
  async buildInvoiceData(invoiceId: string): Promise<Record<string, unknown>> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: true,
        room: { include: { building: true } },
        contract: true,
        serviceDetails: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found`);

    return this.composePrintData({
      invoiceCode: invoice.invoiceCode,
      invoiceType: invoice.invoiceType,
      description: invoice.description,
      amount: Number(invoice.amount) || 0,
      invoiceDate: invoice.invoiceDate,
      paymentDueDate: invoice.paymentDueDate,
      status: invoice.status,
      roomNameText: invoice.roomNameText,
      notes: invoice.notes,
      remark: invoice.remark,
      whatsappNumber: invoice.whatsappNumber,
      contractCode: invoice.contract?.contractCode || '',
      customer: invoice.customer,
      room: invoice.room,
      detailLines: invoice.serviceDetails.map((row) => ({
        description: row.description,
        quantity: Number(row.quantity) || 0,
        unitAmount: Number(row.unitAmount) || 0,
        subtotal: Number(row.subtotal) || 0,
        remark: row.remark,
      })),
    });
  }

  /** 按表单草稿（可叠加已存发票）聚合打印数据 */
  async buildInvoiceDataWithDraft(
    invoiceId: string | null | undefined,
    draft: InvoicePreviewDraftDto,
  ): Promise<Record<string, unknown>> {
    const id = s(invoiceId);
    const base = id
      ? await this.prisma.invoice.findUnique({
          where: { id },
          include: {
            customer: true,
            room: { include: { building: true } },
            contract: true,
            serviceDetails: {
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
          },
        })
      : null;
    if (id && !base) throw new NotFoundException(`Invoice ${id} not found`);

    const customerId = s(draft.customerId) || base?.customerId || '';
    const roomId = s(draft.roomId) || base?.roomId || '';
    if (!customerId) throw new BadRequestException('预览须选择客户');
    if (!roomId) throw new BadRequestException('预览须选择房间');

    const [customer, room, contract] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: customerId } }),
      this.prisma.room.findUnique({
        where: { id: roomId },
        include: { building: true },
      }),
      (async () => {
        const contractId = s(draft.contractId) || base?.contractId || '';
        if (!contractId) return null;
        return this.prisma.contract.findUnique({
          where: { id: contractId },
          select: { contractCode: true, roomNameText: true },
        });
      })(),
    ]);
    if (!customer) throw new BadRequestException('客户不存在');
    if (!room) throw new BadRequestException('房间不存在');

    const useDetails = Array.isArray(draft.serviceDetails);
    const detailLines = useDetails
      ? (draft.serviceDetails || [])
          .map((row) => {
            const quantity = Number(row.quantity) || 0;
            const unitAmount = Number(row.unitAmount) || 0;
            const subtotal =
              row.subtotal != null && Number.isFinite(Number(row.subtotal))
                ? Number(row.subtotal)
                : Math.round(quantity * unitAmount * 100) / 100;
            return {
              description: s(row.description),
              quantity,
              unitAmount,
              subtotal,
              remark: s(row.remark),
            };
          })
          .filter((row) => row.description || row.subtotal > 0)
      : (base?.serviceDetails || []).map((row) => ({
          description: row.description,
          quantity: Number(row.quantity) || 0,
          unitAmount: Number(row.unitAmount) || 0,
          subtotal: Number(row.subtotal) || 0,
          remark: row.remark,
        }));

    const amount =
      draft.amount !== undefined && draft.amount !== null
        ? Number(draft.amount) || 0
        : Number(base?.amount) || 0;

    const invoiceDate =
      draft.invoiceDate !== undefined
        ? parseDateOnlyLoose(draft.invoiceDate)
        : base?.invoiceDate || null;
    const paymentDueDate =
      draft.paymentDueDate !== undefined
        ? parseDateOnlyLoose(draft.paymentDueDate)
        : base?.paymentDueDate || null;

    const roomNameText =
      draft.roomNameText !== undefined
        ? s(draft.roomNameText)
        : s(base?.roomNameText) || s(contract?.roomNameText) || s(room.name);

    return this.composePrintData({
      invoiceCode:
        draft.invoiceCode !== undefined
          ? s(draft.invoiceCode)
          : s(base?.invoiceCode),
      invoiceType:
        draft.invoiceType !== undefined
          ? s(draft.invoiceType)
          : s(base?.invoiceType),
      description:
        draft.description !== undefined
          ? s(draft.description)
          : s(base?.description),
      amount,
      invoiceDate,
      paymentDueDate,
      status: draft.status !== undefined ? s(draft.status) : s(base?.status) || '已開票',
      roomNameText,
      notes: draft.notes !== undefined ? s(draft.notes) : s(base?.notes),
      remark: draft.remark !== undefined ? s(draft.remark) : s(base?.remark),
      whatsappNumber:
        draft.whatsappNumber !== undefined
          ? s(draft.whatsappNumber)
          : s(base?.whatsappNumber),
      contractCode: s(contract?.contractCode) || '',
      customer,
      room,
      detailLines,
    });
  }

  /** 解析发票模板：房间所属大厦绑定的 invoice 模板 */
  async resolveInvoiceTemplate(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        room: {
          include: {
            building: {
              include: {
                invoiceTemplateRef: true,
              },
            },
          },
        },
      },
    });
    if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found`);
    return this.templateFromBuilding(invoice.room.building?.invoiceTemplateRef);
  }

  async resolveInvoiceTemplateByRoomId(roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        building: {
          include: {
            invoiceTemplateRef: true,
          },
        },
      },
    });
    if (!room) throw new BadRequestException('房间不存在');
    return this.templateFromBuilding(room.building?.invoiceTemplateRef);
  }

  private templateFromBuilding(
    buildingTpl:
      | {
          id: string;
          enabled: boolean;
          storageKey: string;
          updatedAt: Date;
        }
      | null
      | undefined,
  ) {
    if (buildingTpl) {
      if (!buildingTpl.enabled) {
        throw new BadRequestException('所属大厦绑定的发票模板已停用');
      }
      return buildingTpl;
    }
    throw new BadRequestException(
      '未配置发票模板：请在所属大厦中绑定启用的发票模板',
    );
  }

  async print(params: {
    invoiceId?: string;
    draft?: InvoicePreviewDraftDto;
    format?: 'docx' | 'pdf';
  }): Promise<InvoicePrintResult> {
    const invoiceId = s(params.invoiceId);
    const draft = params.draft;
    if (!invoiceId && !draft) {
      throw new BadRequestException('invoiceId 或 draft 至少提供一个');
    }

    let template: { id: string; storageKey: string; updatedAt: Date };
    let data: Record<string, unknown>;
    let cacheKeyId: string;

    if (draft) {
      const roomId =
        s(draft.roomId) ||
        (invoiceId
          ? (
              await this.prisma.invoice.findUnique({
                where: { id: invoiceId },
                select: { roomId: true },
              })
            )?.roomId || ''
          : '');
      if (!roomId) throw new BadRequestException('预览须选择房间');
      template = await this.resolveInvoiceTemplateByRoomId(roomId);
      data = await this.buildInvoiceDataWithDraft(invoiceId || null, draft);
      cacheKeyId = invoiceId || `draft:${roomId}`;
    } else {
      template = await this.resolveInvoiceTemplate(invoiceId);
      data = await this.buildInvoiceData(invoiceId);
      cacheKeyId = invoiceId;
    }

    const absPath = path.join(uploadsRoot(), template.storageKey);
    const docxBuffer = fillDocxTemplate(absPath, data, { clearItemsRowBorders: true });

    const code = s(String(data.invoiceCode ?? data.inv_No ?? '')) || 'invoice';
    const customerName = s(String(data.customerName ?? '')) || '客户';
    const safePart = (v: string) =>
      v.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
    const baseName = `${safePart(code)}-${safePart(customerName)}`;
    const wantPdf = params.format === 'pdf';

    if (wantPdf) {
      const dataHash = createHash('sha1')
        .update(JSON.stringify(data))
        .digest('hex')
        .slice(0, 16);
      const pdfBuffer = await convertDocxToPdf(
        docxBuffer,
        `print-inv:${cacheKeyId}:${template.id}:${template.updatedAt.getTime()}:${dataHash}`,
      );
      if (pdfBuffer) {
        return {
          buffer: pdfBuffer,
          fileName: `${baseName}.pdf`,
          contentType: 'application/pdf',
          format: 'pdf',
        };
      }
    }

    return {
      buffer: docxBuffer,
      fileName: `${baseName}.docx`,
      contentType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      format: 'docx',
    };
  }
}
