import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildingContext } from './building-context';

/** 列表过滤挂载点：记录本身、房间，或经由房间/客户/合约/发票 */
export type BuildingScopeKind =
  | 'building'
  | 'room'
  | 'viaRoom'
  | 'viaContractRoom'
  | 'viaInvoiceRoom'
  | 'customer'
  | 'viaCustomer';

@Injectable()
export class BuildingAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 当前用户被分配的大厦。
   * null 表示不限制（管理员，或没有登录上下文的内部调用）。
   */
  async allowedIds(): Promise<string[] | null> {
    const store = buildingContext.getStore();
    if (!store?.actor?.sub || store.actor.role === 'admin') return null;
    if (store.allowedIds !== undefined) return store.allowedIds;
    const rows = await this.prisma.userBuilding.findMany({
      where: { userId: store.actor.sub },
      select: { buildingId: true },
    });
    store.allowedIds = rows.map((row) => row.buildingId);
    return store.allowedIds;
  }

  /**
   * 列表实际使用的大厦范围：分配范围再与顶栏所选大厦取交集。
   * null 表示不加过滤。
   */
  async viewIds(): Promise<string[] | null> {
    const allowed = await this.allowedIds();
    const selected = buildingContext.getStore()?.buildingId;
    if (!selected) return allowed;
    if (allowed == null) return [selected];
    return allowed.includes(selected) ? [selected] : [];
  }

  async constrain(
    where: { AND?: Prisma.Enumerable<unknown> },
    kind: BuildingScopeKind,
  ): Promise<void> {
    const ids = await this.viewIds();
    if (ids == null) return;
    const clause = this.clause(kind, ids);
    const prev = where.AND;
    const list = Array.isArray(prev) ? prev : prev ? [prev] : [];
    where.AND = [...list, clause];
  }

  async assertBuildingId(buildingId?: string | null): Promise<void> {
    const allowed = await this.allowedIds();
    if (allowed == null) return;
    if (!buildingId || !allowed.includes(buildingId)) {
      throw new NotFoundException();
    }
  }

  async assertRoomId(roomId?: string | null): Promise<void> {
    const allowed = await this.allowedIds();
    if (allowed == null) return;
    if (!roomId) throw new NotFoundException();
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { buildingId: true },
    });
    if (!room || !allowed.includes(room.buildingId)) throw new NotFoundException();
  }

  async assertCustomerId(customerId?: string | null): Promise<void> {
    const allowed = await this.allowedIds();
    if (allowed == null) return;
    if (!customerId) throw new NotFoundException();
    const count = await this.prisma.customer.count({
      where: { id: customerId, ...this.customerMatch(allowed) },
    });
    if (!count) throw new NotFoundException();
  }

  async assertContractId(contractId?: string | null): Promise<void> {
    const allowed = await this.allowedIds();
    if (allowed == null) return;
    if (!contractId) throw new NotFoundException();
    const count = await this.prisma.contract.count({
      where: { id: contractId, room: { buildingId: { in: allowed } } },
    });
    if (!count) throw new NotFoundException();
  }

  async assertInvoiceId(invoiceId?: string | null): Promise<void> {
    const allowed = await this.allowedIds();
    if (allowed == null) return;
    if (!invoiceId) throw new NotFoundException();
    const count = await this.prisma.invoice.count({
      where: { id: invoiceId, room: { buildingId: { in: allowed } } },
    });
    if (!count) throw new NotFoundException();
  }

  private customerMatch(ids: string[]): Prisma.CustomerWhereInput {
    return {
      OR: [
        { buildingId: { in: ids } },
        { contracts: { some: { room: { buildingId: { in: ids } } } } },
      ],
    };
  }

  private clause(kind: BuildingScopeKind, ids: string[]) {
    const room = { buildingId: { in: ids } };
    const customer = this.customerMatch(ids);
    switch (kind) {
      case 'building':
        return { id: { in: ids } };
      case 'room':
        return room;
      case 'viaRoom':
        return { room };
      case 'viaContractRoom':
        return { contract: { room } };
      case 'viaInvoiceRoom':
        return { invoice: { room } };
      case 'customer':
        return customer;
      case 'viaCustomer':
        return { customer };
    }
  }
}
