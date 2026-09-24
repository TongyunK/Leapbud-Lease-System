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

function uploadsRoot() {
  return path.join(process.cwd(), 'uploads');
}

export type InvoicePrintResult = {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  format: 'docx' | 'pdf';
};

@Injectable()
export class InvoicePrintService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 聚合发票数据为模板填充对象。
   * 兼容旧系统占位符键名（如 inv_No、FPSID）；新模板也可用 camelCase 别名。
   * Word 模板请用 docxtemplater 语法 `{key}`（不是 `${key}`）。
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

    const customer = invoice.customer;
    const room = invoice.room;
    const building = room.building;

    let items = invoice.serviceDetails.map((row) => {
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

    // 无服务细节时，循环行会被 docxtemplater 整行删掉，表现为 description/quantity 无输出；
    // 回退为一行：描述用发票描述/类型，金额用开票金额。
    if (items.length === 0) {
      const unitPrice = formatAmountWithComma(invoice.amount) || '0.00';
      items = [
        {
          description:
            s(invoice.description) || s(invoice.invoiceType) || s(invoice.invoiceCode),
          quantity: '1',
          unitPrice,
          unitAmount: unitPrice,
          amount: unitPrice,
          subtotal: unitPrice,
          remark: '',
        },
      ];
    }

    const detailsSum = invoice.serviceDetails.reduce(
      (acc, row) => acc + (Number(row.subtotal) || 0),
      0,
    );
    // 有明细时小计取明细合计；否则回退发票金额
    const subtotalValue =
      invoice.serviceDetails.length > 0 ? detailsSum : Number(invoice.amount) || 0;
    const totalValue = Number(invoice.amount) || 0;
    const invSubtotal = formatAmountWithComma(subtotalValue) || '0.00';
    const invTotal = formatAmountWithComma(totalValue) || '0.00';

    const customerName = s(customer.name);
    const roomNameRaw = s(invoice.roomNameText) || s(room.name);
    const roomName = roomNameRaw.replace(/\s*室\s*$/u, '').trim();
    const roomNo = s(room.roomCode) || roomName;
    const address = s(building?.addressEn) || s(building?.address);

    const invDate = formatInvoiceDate(invoice.invoiceDate);
    const invDueDate = formatInvoiceDate(invoice.paymentDueDate);
    const invNo = s(invoice.invoiceCode);

    const fpsId = s(building?.fpsId);
    const accountName = s(building?.bankAccountHolder);
    const account = s(building?.bankAccount);
    const post = s(building?.chequePaymentBy);
    const paymentAdvice = s(building?.paymentAdvice);

    return {
      // —— 旧系统键名（模板迁移时把 ${x} 改成 {x} 即可）——
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

      // —— camelCase / 语义别名（字段字典推荐）——
      invoiceCode: invNo,
      invoiceDate: invDate,
      paymentDueDate: invDueDate,
      invoiceType: s(invoice.invoiceType),
      description: s(invoice.description),
      amount: invTotal,
      amountRaw: decimalToFixed(invoice.amount) || '0.00',
      subtotal: invSubtotal,
      status: s(invoice.status),
      contractCode: s(invoice.contract?.contractCode),
      customerCode: s(customer.customerCode),
      companyNameZh: s(customer.companyNameZh),
      companyNameEn: s(customer.companyNameEn),
      roomCode: s(room.roomCode),
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
      notes: s(invoice.notes),
      remark: s(invoice.remark),
      whatsappNumber: s(invoice.whatsappNumber),
    };
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

    const buildingTpl = invoice.room.building?.invoiceTemplateRef;
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
    invoiceId: string;
    format?: 'docx' | 'pdf';
  }): Promise<InvoicePrintResult> {
    const invoiceId = s(params.invoiceId);
    if (!invoiceId) throw new BadRequestException('invoiceId is required');

    const template = await this.resolveInvoiceTemplate(invoiceId);
    const absPath = path.join(uploadsRoot(), template.storageKey);
    const data = await this.buildInvoiceData(invoiceId);
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
        `print-inv:${invoiceId}:${template.id}:${template.updatedAt.getTime()}:${dataHash}`,
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
