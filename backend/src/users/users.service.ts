import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { toUserDto, userAuditInclude } from './user.mapper';
import { runBatchRemove } from '../common/batch-delete';

const ADMIN_ROLE_CODE = 'admin';
const DEFAULT_ROLE_CODE = 'user';

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
            { assignedRole: { name: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {};

    const rows = await this.prisma.user.findMany({
      where,
      include: userAuditInclude,
      orderBy: [{ role: 'asc' }, { account: 'asc' }],
    });
    return rows.map(toUserDto);
  }

  async findOne(id: string) {
    const row = await this.prisma.user.findUnique({
      where: { id },
      include: userAuditInclude,
    });
    if (!row) throw new NotFoundException(`User ${id} not found`);
    return toUserDto(row);
  }

  async create(dto: CreateUserDto, actor = '') {
    const account = dto.account.trim();
    const exists = await this.prisma.user.findUnique({ where: { account } });
    if (exists) throw new ConflictException('Account already exists');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const actorId = actor || null;
    const role = await this.resolveRoleCode(dto.role);
    const row = await this.prisma.user.create({
      data: {
        account,
        passwordHash,
        displayName: dto.displayName?.trim() || account,
        role,
        status: dto.status ?? UserStatus.active,
        phone: dto.phone?.trim() || '',
        email: dto.email?.trim() || '',
        createdById: actorId,
        updatedById: actorId,
      },
      include: userAuditInclude,
    });
    if (role !== ADMIN_ROLE_CODE) {
      await this.replaceBuildings(row.id, dto.buildingIds);
    }
    return this.findOne(row.id);
  }

  async update(id: string, dto: UpdateUserDto, actor = '') {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`User ${id} not found`);

    const data: Prisma.UserUncheckedUpdateInput = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName.trim();
    if (dto.role !== undefined) data.role = await this.resolveRoleCode(dto.role);
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.phone !== undefined) data.phone = dto.phone.trim();
    if (dto.email !== undefined) data.email = dto.email.trim();
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10);
    if (actor) data.updatedById = actor;

    await this.prisma.user.update({
      where: { id },
      data,
      include: userAuditInclude,
    });
    const nextRole = (data.role as string | undefined) ?? existing.role;
    if (nextRole === ADMIN_ROLE_CODE) {
      await this.replaceBuildings(id, []);
    } else if (dto.buildingIds !== undefined || dto.role !== undefined) {
      await this.replaceBuildings(id, dto.buildingIds ?? undefined);
    }
    return this.findOne(id);
  }

  private async resolveRoleCode(code?: string): Promise<string> {
    const resolved = (code ?? DEFAULT_ROLE_CODE).trim();
    if (!resolved) throw new BadRequestException('請選擇角色');
    const role = await this.prisma.role.findUnique({ where: { code: resolved } });
    if (!role) throw new BadRequestException(`角色「${resolved}」不存在`);
    if (!role.active) throw new BadRequestException(`角色「${role.name}」已停用`);
    return role.code;
  }

  private async replaceBuildings(userId: string, buildingIds?: string[]) {
    const ids = [...new Set((buildingIds ?? []).map((id) => id.trim()).filter(Boolean))];
    if (ids.length) {
      const found = await this.prisma.building.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      if (found.length !== ids.length) {
        throw new BadRequestException('存在无效的大厦');
      }
    }
    await this.prisma.userBuilding.deleteMany({ where: { userId } });
    if (ids.length) {
      await this.prisma.userBuilding.createMany({
        data: ids.map((buildingId) => ({ userId, buildingId })),
      });
    }
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

  async removeMany(ids: string[]) {
    return runBatchRemove(ids, (id) => this.remove(id));
  }
}
