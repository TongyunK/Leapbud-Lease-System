import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangeEmailDto } from './dto/change-email.dto';
import {
  ForgotPasswordResetDto,
  ForgotPasswordSendCodeDto,
} from './dto/forgot-password.dto';
import { toUserDto, userAuditInclude } from '../users/user.mapper';
import {
  forgotPasswordUiMessage,
  normalizeMailLocale,
} from '../mail/mail.i18n';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RESET_CODE_TTL_MS = 15 * 60 * 1000;
const RESET_CODE_COOLDOWN_MS = 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
  ) {}

  async login(dto: LoginDto) {
    const account = dto.account.trim();
    const user = await this.prisma.user.findUnique({
      where: { account },
      include: userAuditInclude,
    });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Invalid account or password');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid account or password');
    }

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      account: user.account,
      role: user.role,
    });

    // 仅更新最后登录时间，避免触发 @updatedAt
    const lastLoginAt = new Date();
    await this.prisma.$executeRaw`
      UPDATE "users" SET "last_login_at" = ${lastLoginAt} WHERE "id" = ${user.id}
    `;

    return {
      accessToken,
      user: toUserDto({ ...user, lastLoginAt }),
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const current = (dto.currentPassword ?? '').trim();
    const next = (dto.newPassword ?? '').trim();
    if (!current) {
      throw new BadRequestException('請輸入目前密碼');
    }
    if (!next || next.length < 6) {
      throw new BadRequestException('新密碼至少 6 位');
    }

    const ok = await bcrypt.compare(current, user.passwordHash);
    if (!ok) {
      // 使用 400，避免前端把 401 当成登录失效并强制退出
      throw new BadRequestException('目前密碼不正確');
    }
    if (current === next) {
      throw new BadRequestException('新密碼不能與目前密碼相同');
    }

    const passwordHash = await bcrypt.hash(next, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, updatedById: user.id },
    });

    return { success: true };
  }

  /** 当前登录用户资料（不含密码） */
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: userAuditInclude,
    });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException();
    }
    return toUserDto(user);
  }

  /**
   * 自行绑定／更新邮箱（用于忘记密码收信）。
   * 需验证目前密码；邮箱不可与其他启用账号重复。
   */
  async changeEmail(userId: string, dto: ChangeEmailDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException();
    }

    const current = (dto.currentPassword ?? '').trim();
    const email = (dto.email ?? '').trim();
    if (!current) {
      throw new BadRequestException('請輸入目前密碼');
    }
    if (!email) {
      throw new BadRequestException('請輸入郵箱');
    }
    if (!EMAIL_RE.test(email)) {
      throw new BadRequestException('郵箱格式不正確');
    }

    const ok = await bcrypt.compare(current, user.passwordHash);
    if (!ok) {
      throw new BadRequestException('目前密碼不正確');
    }

    if ((user.email || '').trim().toLowerCase() === email.toLowerCase()) {
      throw new BadRequestException('新郵箱與目前郵箱相同');
    }

    const taken = await this.prisma.user.findFirst({
      where: {
        id: { not: user.id },
        status: 'active',
        email: { equals: email, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (taken) {
      throw new BadRequestException('該郵箱已被其他帳號使用');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { email, updatedById: user.id },
      include: userAuditInclude,
    });

    return { success: true as const, user: toUserDto(updated) };
  }

  /** 按登录账号查找启用用户 */
  private async findActiveUserByAccount(raw: string) {
    const q = raw.trim();
    if (!q) return null;
    const user = await this.prisma.user.findUnique({ where: { account: q } });
    if (user?.status === 'active') return user;
    return null;
  }

  private maskEmail(email: string): string {
    const e = email.trim();
    const at = e.indexOf('@');
    if (at <= 0) return '***';
    const name = e.slice(0, at);
    const domain = e.slice(at + 1);
    const head = name.slice(0, Math.min(2, name.length));
    return `${head}***@${domain}`;
  }

  private generateResetCode(): string {
    return String(crypto.randomInt(100000, 1000000));
  }

  /**
   * 发送重置密码验证码到账号已绑定邮箱。
   * 仅接受登录账号；未绑定邮箱时明确提示不可用验证码重置。
   */
  async sendForgotPasswordCode(dto: ForgotPasswordSendCodeDto) {
    const locale = normalizeMailLocale(dto.locale);
    const user = await this.findActiveUserByAccount(dto.account);
    if (!user) {
      throw new BadRequestException(forgotPasswordUiMessage(locale, 'accountMissing'));
    }
    const email = (user.email || '').trim();
    if (!email || !EMAIL_RE.test(email)) {
      throw new BadRequestException(forgotPasswordUiMessage(locale, 'emailNotBound'));
    }

    const latest = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (
      latest &&
      Date.now() - latest.createdAt.getTime() < RESET_CODE_COOLDOWN_MS
    ) {
      throw new BadRequestException(forgotPasswordUiMessage(locale, 'sendTooFrequent'));
    }

    const code = this.generateResetCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MS);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          codeHash,
          expiresAt,
        },
      }),
    ]);

    await this.mail.sendPasswordResetCode(email, code, user.account, locale);

    const emailMasked = this.maskEmail(email);
    return {
      success: true as const,
      sent: true as const,
      emailMasked,
      message: forgotPasswordUiMessage(locale, 'codeSent', { emailMasked }),
    };
  }

  /** 校验邮箱验证码并重置密码 */
  async resetPasswordWithCode(dto: ForgotPasswordResetDto) {
    const locale = normalizeMailLocale(dto.locale);
    const user = await this.findActiveUserByAccount(dto.account);
    if (!user) {
      throw new BadRequestException(forgotPasswordUiMessage(locale, 'codeInvalid'));
    }
    const code = (dto.code || '').trim();
    const next = (dto.newPassword || '').trim();
    if (!code) throw new BadRequestException(forgotPasswordUiMessage(locale, 'codeInvalid'));
    if (!next || next.length < 6) {
      throw new BadRequestException(forgotPasswordUiMessage(locale, 'passwordTooShort'));
    }

    const token = await this.prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!token) {
      throw new BadRequestException(forgotPasswordUiMessage(locale, 'codeInvalid'));
    }
    const ok = await bcrypt.compare(code, token.codeHash);
    if (!ok) {
      throw new BadRequestException(forgotPasswordUiMessage(locale, 'codeWrong'));
    }

    const passwordHash = await bcrypt.hash(next, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, updatedById: user.id },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
    ]);

    return {
      success: true,
      message: forgotPasswordUiMessage(locale, 'resetSuccess'),
    };
  }
}
