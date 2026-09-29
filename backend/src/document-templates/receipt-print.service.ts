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

/** 金额千分位，如 8850.6 → 8,850.60 */
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

const EN_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** 旧系统收据日期：25 September 2026 */
function formatReceiptDateLong(d: Date | null | undefined): string {
  if (!d) return '';
  const y = d.getUTCFullYear();
  const m = EN_MONTHS[d.getUTCMonth()] ?? '';
  const day = d.getUTCDate();
  return `${day} ${m} ${y}`;
}

/** DD/MM/YYYY */
function formatDateDmy(d: Date | null | undefined): string {
  if (!d) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${day}/${m}/${y}`;
}

function uploadsRoot() {
  return path.join(process.cwd(), 'uploads');
}

export type ReceiptPrintResult = {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  format: 'docx' | 'pdf';
};

@Injectable()
export class ReceiptPrintService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 聚合收据数据为模板填充对象。
   * 兼容旧系统键名：date / payer / amount / paymentNumber。
   * Word 模板请用 `{key}`（不是 `${key}`）。印章/Logo 请直接放进 Word 模板（静态图）。
   */
  async buildReceiptData(receiptId: string): Promise<Record<string, unknown>> {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id: receiptId },
      include: {
        customer: true,
        contract: { include: { room: { include: { building: true } } } },
        invoice: { include: { room: { include: { building: true } } } },
        receivable: true,
      },
    });
    if (!receipt) throw new NotFoundException(`Receipt ${receiptId} not found`);

    const customer = receipt.customer;
    const building =
      receipt.invoice?.room?.building ?? receipt.contract?.room?.building ?? null;
    const room = receipt.invoice?.room ?? receipt.contract?.room ?? null;

    const payer = s(customer.name);
    const amountFmt = formatAmountWithComma(receipt.amount) || '0.00';
    const dateLong = formatReceiptDateLong(receipt.paymentDate);
    const dateDmy = formatDateDmy(receipt.paymentDate);

    const invoiceCode = s(receipt.invoice?.invoiceCode);
    const receiptCode = s(receipt.receiptCode);
    // 旧模板「In payment of」样例为 #发票编号
    const paymentNumber = invoiceCode
      ? `#${invoiceCode.replace(/^#/, '')}`
      : receiptCode
        ? `#${receiptCode.replace(/^#/, '')}`
        : '';

    const paymentMethod = s(receipt.paymentMethod);
    // 旧模板「Cash / By Cheque」行：支票时可填方式，否则留空手写
    const cashCheque =
      /支票|cheque/i.test(paymentMethod) || /現金|cash/i.test(paymentMethod)
        ? paymentMethod
        : '';

    return {
      // —— 旧系统键名 ——
      date: dateLong,
      payer,
      amount: amountFmt,
      paymentNumber,
      // 旧 Excel 的 ${dp1|img_*} 为图片位；docx 请用模板内静态图，此处不输出二进制

      // —— camelCase / 语义别名 ——
      receiptCode,
      paymentDate: dateDmy,
      paymentDateLong: dateLong,
      customerName: payer,
      customerCode: s(customer.customerCode),
      companyNameZh: s(customer.companyNameZh),
      companyNameEn: s(customer.companyNameEn),
      amountRaw: decimalToFixed(receipt.amount) || '0.00',
      paymentMethod,
      cashCheque,
      remark: s(receipt.remark),
      invoiceCode,
      contractCode: s(receipt.contract?.contractCode),
      receivableCode: s(receipt.receivable?.receivableCode),
      roomCode: s(room?.roomCode),
      roomName: s(room?.name)
        .replace(/\s*室\s*$/u, '')
        .trim(),
      buildingName: s(building?.name),
      buildingAddress: s(building?.address),
      buildingAddressEn: s(building?.addressEn),
    };
  }

  /** 解析收据模板：优先发票房间所属大厦，其次合约房间，再次应收关联的发票/合约 */
  async resolveReceiptTemplate(receiptId: string) {
    const roomBuildingTpl = {
      include: {
        room: {
          include: {
            building: {
              include: { receiptTemplateRef: true },
            },
          },
        },
      },
    };
    const receipt = await this.prisma.receipt.findUnique({
      where: { id: receiptId },
      include: {
        invoice: roomBuildingTpl,
        contract: roomBuildingTpl,
        receivable: {
          include: {
            invoice: roomBuildingTpl,
            contract: roomBuildingTpl,
          },
        },
      },
    });
    if (!receipt) throw new NotFoundException(`Receipt ${receiptId} not found`);

    const buildingTpl =
      receipt.invoice?.room?.building?.receiptTemplateRef ??
      receipt.contract?.room?.building?.receiptTemplateRef ??
      receipt.receivable?.invoice?.room?.building?.receiptTemplateRef ??
      receipt.receivable?.contract?.room?.building?.receiptTemplateRef ??
      null;

    if (buildingTpl) {
      if (!buildingTpl.enabled) {
        throw new BadRequestException('所属大厦绑定的收据模板已停用');
      }
      return buildingTpl;
    }

    throw new BadRequestException(
      '未配置收据模板：请在所属大厦中绑定启用的收据模板（收据需关联发票或合约以定位大厦）',
    );
  }

  async print(params: {
    receiptId: string;
    format?: 'docx' | 'pdf';
  }): Promise<ReceiptPrintResult> {
    const receiptId = s(params.receiptId);
    if (!receiptId) throw new BadRequestException('receiptId is required');

    const template = await this.resolveReceiptTemplate(receiptId);
    const absPath = path.join(uploadsRoot(), template.storageKey);
    const data = await this.buildReceiptData(receiptId);
    const docxBuffer = fillDocxTemplate(absPath, data);

    const code = s(String(data.receiptCode ?? '')) || 'receipt';
    const customerName = s(String(data.customerName ?? data.payer ?? '')) || '客户';
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
        `print-rcp:${receiptId}:${template.id}:${template.updatedAt.getTime()}:${dataHash}`,
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
