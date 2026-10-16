import { NumberingBizKey, NumberingResetCycle } from '@prisma/client';

const pad = (n: number, w: number) => String(n).padStart(w, '0');

/** 按重置周期计算当前周期键 */
export function periodKeyOf(date: Date, cycle: NumberingResetCycle): string {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1, 2);
  const d = pad(date.getDate(), 2);
  switch (cycle) {
    case NumberingResetCycle.daily:
      return `${y}${m}${d}`;
    case NumberingResetCycle.monthly:
      return `${y}${m}`;
    case NumberingResetCycle.yearly:
      return String(y);
    default:
      return '';
  }
}

/**
 * 渲染编号格式。
 * 日期：%YYYY %YY %MM %DD %HH %mm %ss；序号：%d / %04d；%% 表示字面 %。
 */
export function renderNumberingFormat(format: string, date: Date, seq: number): string {
  const y = date.getFullYear();
  const M = date.getMonth() + 1;
  const D = date.getDate();
  const H = date.getHours();
  const min = date.getMinutes();
  const s = date.getSeconds();

  let out = '';
  let i = 0;
  while (i < format.length) {
    if (format[i] === '%' && i + 1 < format.length) {
      if (format[i + 1] === '%') {
        out += '%';
        i += 2;
        continue;
      }
      const rest = format.slice(i);
      if (rest.startsWith('%YYYY')) {
        out += String(y);
        i += 5;
        continue;
      }
      if (rest.startsWith('%YY')) {
        out += String(y).slice(-2);
        i += 3;
        continue;
      }
      if (rest.startsWith('%MM')) {
        out += pad(M, 2);
        i += 3;
        continue;
      }
      if (rest.startsWith('%DD')) {
        out += pad(D, 2);
        i += 3;
        continue;
      }
      if (rest.startsWith('%HH')) {
        out += pad(H, 2);
        i += 3;
        continue;
      }
      if (rest.startsWith('%mm')) {
        out += pad(min, 2);
        i += 3;
        continue;
      }
      if (rest.startsWith('%ss')) {
        out += pad(s, 2);
        i += 3;
        continue;
      }
      const seqMatch = rest.match(/^%0(\d+)d/);
      if (seqMatch) {
        out += pad(seq, Number(seqMatch[1]));
        i += seqMatch[0].length;
        continue;
      }
      if (rest.startsWith('%d')) {
        out += String(seq);
        i += 2;
        continue;
      }
    }
    out += format[i];
    i += 1;
  }
  return out;
}

export type NumberingRuleDefaults = {
  format: string;
  startValue: number;
  resetCycle: NumberingResetCycle;
};

/** 无规则或规则停用时的回退格式（与历史硬编码一致） */
export const NUMBERING_DEFAULTS: Record<NumberingBizKey, NumberingRuleDefaults> = {
  [NumberingBizKey.customer]: {
    format: 'CSM%YY%04d',
    startValue: 1,
    resetCycle: NumberingResetCycle.yearly,
  },
  [NumberingBizKey.customerRequirement]: {
    format: 'REQ%YY%MM%DD%04d',
    startValue: 1,
    resetCycle: NumberingResetCycle.daily,
  },
  [NumberingBizKey.invoice]: {
    format: 'INV%YY%MM%DD%04d',
    startValue: 1,
    resetCycle: NumberingResetCycle.daily,
  },
  [NumberingBizKey.receipt]: {
    format: 'RCP%YY%MM%DD%04d',
    startValue: 1,
    resetCycle: NumberingResetCycle.daily,
  },
};
