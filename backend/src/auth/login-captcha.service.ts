import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

type CaptchaEntry = {
  answer: string;
  expiresAt: number;
};

const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const CAPTCHA_LEN = 4;
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class LoginCaptchaService {
  private readonly store = new Map<string, CaptchaEntry>();

  /** 生成一次性图形验证码（SVG data URL） */
  create(): { captchaId: string; imageDataUrl: string } {
    this.gc();
    const answer = this.randomText(CAPTCHA_LEN);
    const captchaId = randomBytes(16).toString('hex');
    this.store.set(captchaId, {
      answer: answer.toLowerCase(),
      expiresAt: Date.now() + CAPTCHA_TTL_MS,
    });
    return {
      captchaId,
      imageDataUrl: this.toSvgDataUrl(answer),
    };
  }

  /**
   * 校验并消费验证码（无论对错均删除，防重放）。
   * @returns true=通过
   */
  consume(captchaId: string | undefined, captchaCode: string | undefined): boolean {
    const id = String(captchaId || '').trim();
    const code = String(captchaCode || '').trim().toLowerCase();
    if (!id || !code) return false;
    const entry = this.store.get(id);
    this.store.delete(id);
    if (!entry) return false;
    if (entry.expiresAt < Date.now()) return false;
    return entry.answer === code;
  }

  private randomText(len: number): string {
    let out = '';
    const bytes = randomBytes(len);
    for (let i = 0; i < len; i++) {
      out += CHARSET[bytes[i]! % CHARSET.length];
    }
    return out;
  }

  private gc() {
    const now = Date.now();
    for (const [id, entry] of this.store) {
      if (entry.expiresAt < now) this.store.delete(id);
    }
  }

  private toSvgDataUrl(text: string): string {
    const w = 132;
    const h = 44;
    const chars = text.split('');
    const noise: string[] = [];
    for (let i = 0; i < 5; i++) {
      const x1 = Math.round(Math.random() * w);
      const y1 = Math.round(Math.random() * h);
      const x2 = Math.round(Math.random() * w);
      const y2 = Math.round(Math.random() * h);
      const op = (0.25 + Math.random() * 0.35).toFixed(2);
      noise.push(
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#0f4a32" stroke-opacity="${op}" stroke-width="1"/>`,
      );
    }
    const glyphs = chars
      .map((ch, i) => {
        const x = 18 + i * 28 + Math.round((Math.random() - 0.5) * 4);
        const y = 28 + Math.round((Math.random() - 0.5) * 6);
        const rot = Math.round((Math.random() - 0.5) * 28);
        const size = 20 + Math.round(Math.random() * 4);
        return `<text x="${x}" y="${y}" fill="#0f4a32" font-size="${size}" font-family="Verdana,Arial,sans-serif" font-weight="700" transform="rotate(${rot} ${x} ${y})">${ch}</text>`;
      })
      .join('');
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      `<rect width="100%" height="100%" rx="8" fill="#f3f7f4"/>` +
      noise.join('') +
      glyphs +
      `</svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
  }

  /** 供测试／调试：当前条目数 */
  size() {
    this.gc();
    return this.store.size;
  }
}

export function assertCaptchaOrThrow(
  ok: boolean,
  message = '驗證碼錯誤或已過期，請重新獲取',
): asserts ok {
  if (!ok) {
    throw new HttpException(
      {
        statusCode: 400,
        code: 'CAPTCHA_INVALID',
        message,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
