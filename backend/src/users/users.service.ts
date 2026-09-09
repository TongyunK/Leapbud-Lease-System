import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { toUserDto } from './user.mapper';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(keyword?: string) {
    const q = keyword?.trim();
    const where: Prisma.UserWhereInput = q
      ? {
          OR: [
            { account: { contains: q, mode: 'insensitive' } },
            { displayName: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {};

    const rows = await this.prisma.user.findMany({
      where,
      orderBy: [{ role: 'asc' }, { account: 'asc' }],
    });
    return rows.map(toUserDto);
  }

  async findOne(id: string) {
    const row = await this.prisma.user.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`User ${id} not found`);
    return toUserDto(row);
  }

  async create(dto: CreateUserDto) {
    const account = dto.account.trim();
    const exists = await this.prisma.user.findUnique({ where: { account } });
    if (exists) throw new ConflictException('Account already exists');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const row = await this.prisma.user.create({
      data: {
        account,
        passwordHash,
        displayName: dto.displayName?.trim() || account,
        role: dto.role ?? UserRole.user,
        status: dto.status ?? UserStatus.active,
        phone: dto.phone?.trim() || '',
        email: dto.email?.trim() || '',
      },
    });
    return toUserDto(row);
  }

  async update(id: string, dto: UpdateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`User ${id} not found`);

    const data: Prisma.UserUpdateInput = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName.trim();
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.phone !== undefined) data.phone = dto.phone.trim();
    if (dto.email !== undefined) data.email = dto.email.trim();
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10);

    const row = await this.prisma.user.update({ where: { id }, data });
    return toUserDto(row);
  }

  async remove(id: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`User ${id} not found`);
    if (existing.account === 'admin') {
      throw new BadRequestException('Cannot delete the default admin account');
    }
    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }
}
