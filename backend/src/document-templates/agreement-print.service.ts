import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContractConfigType, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import * as path from 'path';
import { KEY_DEPOSIT_CODES } from '../contract-configs/contract-config.mapper';
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

/** 单价展示：整数不带小数（100），否则保留两位（100.50） */
function formatUnitPrice(
  value: Prisma.Decimal | number | string | null | undefined,
): string {
  if (value === null || value === undefined || value === '') return '0';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return formatAmountWithComma(n, 2);
}

const PAYMENT_CYCLE_MONTHS: Record<string, number> = {
  月繳: 1,
  季繳: 3,
  半年繳: 6,
  年繳: 12,
  '1年半': 18,
  '2年': 24,
};

function paymentCycleMonths(cycle: string): number | '' {
  const months = PAYMENT_CYCLE_MONTHS[s(cycle)];
  return months ?? '';
}

/** 缴费周期 →「每N個月付一次款」 */
function paymentCycleToPayPhrase(cycle: string): string {
  const c = s(cycle);
  const months = PAYMENT_CYCLE_MONTHS[c];
  if (months) return `每${months}個月付一次款`;
  return c ? `按${c}付一次款` : '';
}

/** 格式化为 YYYY年M月D日（按 UTC 日期分量，与 Date 列一致） */
function formatZhDate(d: Date | null | undefined): string {
  if (!d) return '';
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${y}年${m}月${day}日`;
}

const CN_DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
const CN_UNITS = ['', '拾', '佰', '仟'];
const CN_SECTIONS = ['', '万', '亿'];

function sectionToChinese(n: number): string {
  if (n === 0) return '';
  let str = '';
  let unitPos = 0;
  let zero = true;
  while (n > 0) {
    const digit = n % 10;
    if (digit === 0) {
      if (!zero) {
        zero = true;
        str = CN_DIGITS[0] + str;
      }
    } else {
      zero = false;
      str = CN_DIGITS[digit] + CN_UNITS[unitPos] + str;
    }
    unitPos += 1;
    n = Math.floor(n / 10);
  }
  return str;
}

/** 金额中文大写（元/角/分） */
export function amountToChinese(value: Prisma.Decimal | number | string | null | undefined): string {
  const fixed = decimalToFixed(value, 2);
  if (!fixed) return '';
  const num = Number(fixed);
  if (!Number.isFinite(num)) return '';
  if (num === 0) return '零元整';

  const negative = num < 0;
  let yuan = Math.floor(Math.abs(num));
  const cents = Math.round((Math.abs(num) - yuan) * 100);
  const jiao = Math.floor(cents / 10);
  const fen = cents % 10;

  let result = '';
  let sectionIndex = 0;
  let needZero = false;
  while (yuan > 0) {
    const section = yuan % 10000;
    if (section === 0) {
      needZero = result.length > 0;
    } else {
      let part = sectionToChinese(section) + CN_SECTIONS[sectionIndex];
      if (needZero) part = CN_DIGITS[0] + part;
      result = part + result;
      needZero = false;
    }
    yuan = Math.floor(yuan / 10000);
    sectionIndex += 1;
  }

  result = (result || CN_DIGITS[0]) + '元';
  if (jiao === 0 && fen === 0) {
    result += '整';
  } else {
    if (jiao > 0) result += CN_DIGITS[jiao] + '角';
    else if (fen > 0) result += CN_DIGITS[0];
    if (fen > 0) result += CN_DIGITS[fen] + '分';
  }
  return negative ? `负${result}` : result;
}

function uploadsRoot() {
  return path.join(process.cwd(), 'uploads');
}

export type AgreementPrintResult = {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  format: 'docx' | 'pdf';
};

@Injectable()
export class AgreementPrintService {
  constructor(private readonly prisma: PrismaService) {}

  /** 聚合合约数据为模板填充对象 */
  async buildAgreementData(contractId: string): Promise<Record<string, unknown>> {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        customer: { include: { primaryOccupant: true } },
        room: { include: { building: true } },
        periods: { orderBy: [{ sortOrder: 'asc' }, { startDate: 'asc' }] },
      },
    });
    if (!contract) throw new NotFoundException(`Contract ${contractId} not found`);

    const keyPriceRows = await this.prisma.contractConfigOption.findMany({
      where: {
        type: ContractConfigType.keyDeposit,
        code: { in: [KEY_DEPOSIT_CODES.door, KEY_DEPOSIT_CODES.mailbox] },
      },
    });
    const doorKeyUnitPrice = formatUnitPrice(
      keyPriceRows.find((r) => r.code === KEY_DEPOSIT_CODES.door)?.unitPrice,
    );
    const mailboxKeyUnitPrice = formatUnitPrice(
      keyPriceRows.find((r) => r.code === KEY_DEPOSIT_CODES.mailbox)?.unitPrice,
    );

    const customer = contract.customer;
    const occupant = customer.primaryOccupant;
    const room = contract.room;
    const building = room.building;

    const periods = contract.periods.map((p) => {
      const start = formatZhDate(p.startDate);
      const end = formatZhDate(p.endDate);
      const unit = s(p.dateUnit) || '月';
      const dateType = s(p.dateType) || '合約期';
      // 例：2027年9月23日 至 2028年9月22日 為 12 個月使用期
      const range = start && end ? `${start} 至 ${end}` : start || end || '';
      const unitPhrase = unit === '月' ? '個月' : unit;
      const duration =
        p.dateValue > 0 ? `為 ${p.dateValue} ${unitPhrase}${dateType}` : dateType;
      const text = [range, duration].filter(Boolean).join(' ');
      return {
        label: dateType,
        text,
        startDate: start,
        endDate: end,
        dateType,
        dateValue: p.dateValue,
        dateUnit: unit,
      };
    });

    const periodsSummary = periods
      .map((p) => `${p.label}：${p.text}`)
      .join('；');
    // 单元格内多行：用 \n 拼接（配合 linebreaks），避免循环内软换行导致末尾多空行
    const periodsLines = periods.map((p) => p.text).join('\n');

    const monthlyRentAmount = formatAmountWithComma(contract.monthlyRent);
    const paymentMonths = paymentCycleMonths(contract.paymentCycle ?? '');
    const paymentCyclePayText = paymentCycleToPayPhrase(contract.paymentCycle ?? '');
    // 兼容旧模板整句；新模板请只用数字字段自行排版
    const monthlyRentLine = [
      monthlyRentAmount ? `合約期內每月費用 HKD$ ${monthlyRentAmount}` : '合約期內每月費用',
      paymentCyclePayText ? `(${paymentCyclePayText})` : '',
    ]
      .filter(Boolean)
      .join('');

    return {
      contractCode: contract.contractCode,
      startDate: formatZhDate(contract.startDate),
      endDate: formatZhDate(contract.endDate),
      monthlyRent: decimalToFixed(contract.monthlyRent),
      monthlyRentAmount,
      monthlyRentText: amountToChinese(contract.monthlyRent),
      monthlyRentLine,
      // 仅单价，便于模板自由组合：---NIL--- 跟前約 (以每度電 {electricity} 計)
      electricityRate: decimalToFixed(contract.electricityRate, 2) || '0.00',
      electricity: `$${formatAmountWithComma(contract.electricityRate ?? 0, 2) || '0.00'}`,
      roomDeposit: decimalToFixed(contract.roomDeposit),
      roomDepositAmount: formatAmountWithComma(contract.roomDeposit) || '0.00',
      bookingDeposit: decimalToFixed(contract.bookingDeposit),
      miscDeposit: decimalToFixed(contract.miscDeposit),
      miscDepositAmount: formatAmountWithComma(contract.miscDeposit) || '0.00',
      // 服務保證金 = 房間按金 + 雜項按金；图2格式：$ 9,538.00 + $ 2,000.00
      serviceDepositAmount: formatAmountWithComma(
        (Number(contract.roomDeposit ?? 0) || 0) + (Number(contract.miscDeposit ?? 0) || 0),
      ),
      serviceDepositLine: `$ ${formatAmountWithComma(contract.roomDeposit) || '0.00'} + $ ${formatAmountWithComma(contract.miscDeposit) || '0.00'}`,
      doorKeyQty: contract.doorKeyQty,
      doorKeyUnitPrice,
      doorKeyDeposit: decimalToFixed(contract.doorKeyDeposit),
      mailboxKeyQty: contract.mailboxKeyQty,
      mailboxKeyUnitPrice,
      mailboxKeyDeposit: decimalToFixed(contract.mailboxKeyDeposit),
      remark: contract.remark ?? '',
      leaseType: contract.leaseType ?? '',
      paymentCycle: contract.paymentCycle ?? '',
      paymentCycleMonths: paymentMonths,
      paymentCyclePayText,
      customerCode: customer.customerCode,
      customerName: customer.name,
      companyNameZh: customer.companyNameZh ?? '',
      companyNameEn: customer.companyNameEn ?? '',
      businessRegNo: customer.businessRegNo ?? '',
      businessNature: customer.businessNature ?? '',
      occupantName: occupant?.name ?? '',
      occupantMobile: occupant?.mobilePhone ?? '',
      occupantPhone: occupant?.contactPhone ?? '',
      occupantEmail: occupant?.email ?? '',
      occupantFax: occupant?.fax ?? '',
      occupantAddress: occupant?.address ?? '',
      occupantIdCardNo: occupant?.idCardNo ?? '',
      roomCode: room.roomCode,
      // 模板写「{roomName} 室」；名称若已带「室」则去掉，只传如 05A
      roomName: (s(contract.roomNameText) || room.name).replace(/\s*室\s*$/u, '').trim(),
      buildingName: building?.name ?? '',
      buildingAddress: building?.address ?? '',
      buildingAddressEn: building?.addressEn ?? '',
      periods,
      periodCount: periods.length,
      periodsSummary,
      periodsLines,
    };
  }

  /** 解析协议模板：客户覆盖 → 大厦绑定 → 否则 400 */
  async resolveAgreementTemplate(contractId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        customer: {
          include: {
            agreementTemplate: true,
          },
        },
        room: {
          include: {
            building: {
              include: {
                agreementTemplateRef: true,
              },
            },
          },
        },
      },
    });
    if (!contract) throw new NotFoundException(`Contract ${contractId} not found`);

    const override = contract.customer.agreementTemplate;
    if (override) {
      if (!override.enabled) {
        throw new BadRequestException('客户指定的协议模板已停用');
      }
      return override;
    }

    const buildingTpl = contract.room.building?.agreementTemplateRef;
    if (buildingTpl) {
      if (!buildingTpl.enabled) {
        throw new BadRequestException('所属大厦绑定的协议模板已停用');
      }
      return buildingTpl;
    }

    throw new BadRequestException(
      '未配置协议模板：请为客户指定模板，或在所属大厦中绑定启用的协议模板',
    );
  }

  async print(params: {
    contractId: string;
    format?: 'docx' | 'pdf';
  }): Promise<AgreementPrintResult> {
    const contractId = s(params.contractId);
    if (!contractId) throw new BadRequestException('contractId is required');

    const template = await this.resolveAgreementTemplate(contractId);
    const absPath = path.join(uploadsRoot(), template.storageKey);
    const data = await this.buildAgreementData(contractId);
    const docxBuffer = fillDocxTemplate(absPath, data);

    const code = s(String(data.contractCode ?? '')) || 'agreement';
    const customerName = s(String(data.customerName ?? '')) || '客户';
    const safePart = (v: string) =>
      v.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
    const baseName = `${safePart(code)}-${safePart(customerName)}`;
    const wantPdf = params.format === 'pdf';

    if (wantPdf) {
      // 稳定缓存键：合约数据 + 模板未变时直接复用 PDF
      const dataHash = createHash('sha1')
        .update(JSON.stringify(data))
        .digest('hex')
        .slice(0, 16);
      const pdfBuffer = await convertDocxToPdf(
        docxBuffer,
        `print:${contractId}:${template.id}:${template.updatedAt.getTime()}:${dataHash}`,
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
