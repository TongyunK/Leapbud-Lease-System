import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { toUserDto } from '../users/user.mapper';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const account = dto.account.trim();
    const user = await this.prisma.user.findUnique({ where: { account } });
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

    return {
      accessToken,
      user: toUserDto(user),
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, updatedBy: user.account },
    });

    return { success: true };
  }
}
