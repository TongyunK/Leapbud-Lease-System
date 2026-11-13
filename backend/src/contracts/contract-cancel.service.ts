import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingDepositMovementType,
  ContractSettlementItemType,
  ContractSettlementType,
  Prisma,
  ReceiptKind,
  ReceivableWriteoffDirection,
  RefundOrderStatus,
  RoomLeaseCapability,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerRequirementsService } from '../customer-requirements/customer-requirements.service';
import { BookingDepositService } from '../receipts/booking-deposit.service';
import { BOOKING_DEPOSIT_OFFSET_METHOD } from '../receipts/booking-deposit.constants';
import {
  incrementReceivableRefundedAmount,
  incrementRefundedForDepositApplies,
  syncReceivableReceivedAmounts,
} from '../receipts/receivable-received.sync';
import {
  OCCUPYING_CONTRACT_STATUSES,
  aggregateRoomStatus,
  buildRoomOccupancy,
} from '../common/room-lease';
import { ContractSettlementsService } from '../contract-settlements/contract-settlements.service';
import { RefundOrdersService } from '../contract-settlements/refund-orders.service';
import { ReceivableWriteoffsService } from '../contract-settlements/receivable-writeoffs.service';
import {
  contractInclude,
  toContractDto,
} from './contract.mapper';
import {
  ConductCancelContractDto,
  ConductCancelRefundDto,
  type CancelBookingDepositAction,
  type CancelPaidInvoiceAction,
} from './dto/cancel-contract.dto';

function s(v?: string | null) {
  return (v ?? '').trim();
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function parseDateOnly(v: string | null | undefined, field: string): Date {
  const raw = s(v);
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new BadRequestException(`${field} must be YYYY-MM-DD`);
  }
  return new Date(`${raw}T00:00:00.000Z`);
}

function dateOnlyStr(d: Date | null | undefined): string {
  if (!d) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function hkStamp(d = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')}`;
}

const SIGNING_CANONICAL = new Set(['簽約中', '已簽約', '草稿', '交吉中']);

@Injectable()
export class ContractCancelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingDeposit: BookingDepositService,
    private readonly customerRequirements: CustomerRequirementsService,
    private readonly settlements: ContractSettlementsService,
    private readonly refundOrders: RefundOrdersService,
    private readonly writeoffs: ReceivableWriteoffsService,
  ) {}

  private isSigningStatus(status: string) {
    return SIGNING_CANONICAL.has(s(status)) || s(status) === '簽約中';
  }

  async previewCancel(contractId: string) {
    const id = s(contractId);
    if (!id) throw new BadRequestException('contractId is required');

    const contract = await this.prisma.contract.findUnique({
      where: { id },
      select: {
        id: true,
        contractCode: true,
        status: true,
        customerId: true,
        roomId: true,
        startDate: true,
        endDate: true,
        bookingDeposit: true,
        customer: { select: { id: true, customerCode: true, name: true } },
        room: { select: { id: true, roomCode: true, name: true } },
      },
    });
    if (!contract) throw new NotFoundException(`Contract ${id} not found`);

    const invoices = await this.prisma.invoice.findMany({
      where: { contractId: id, status: { not: '已取消' } },
      select: {
        id: true,
        invoiceCode: true,
        status: true,
        invoiceType: true,
        amount: true,
        receivables: {
          select: {
            id: true,
            receivableCode: true,
            invoiceAmount: true,
            receivedAmount: true,
            receivableAmount: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const receivableIds = invoices.flatMap((i) => i.receivables.map((r) => r.id));
    const applyByReceivableId = new Map<string, number>();
    if (receivableIds.length) {
      const applies = await this.prisma.bookingDepositMovement.findMany({
        where: {
          contractId: id,
          type: BookingDepositMovementType.apply,
          receivableId: { in: receivableIds },
        },
        select: { receivableId: true, amount: true },
      });
      for (const m of applies) {
        const rid = s(m.receivableId);
        if (!rid) continue;
        applyByReceivableId.set(
          rid,
          round2((applyByReceivableId.get(rid) ?? 0) + Number(m.amount.toString())),
        );
      }
    }

    const invoiceRows = invoices.map((inv) => {
      const received = round2(
        inv.receivables.reduce(
          (sum, r) => sum + Number(r.receivedAmount?.toString() ?? 0),
          0,
        ),
      );
      const open = round2(
        inv.receivables.reduce(
          (sum, r) => sum + Number(r.receivableAmount?.toString() ?? 0),
          0,
        ),
      );
      const depositApplied = round2(
        inv.receivables.reduce(
          (sum, r) => sum + (applyByReceivableId.get(r.id) ?? 0),
          0,
        ),
      );
      const cashReceived = round2(Math.max(0, received - depositApplied));
      const total = round2(Number(inv.amount?.toString() ?? 0));
      return {
        id: inv.id,
        invoiceCode: inv.invoiceCode || '',
        status: inv.status,
        invoiceType: inv.invoiceType || '',
        totalAmount: total,
        receivedAmount: received,
        depositAppliedAmount: depositApplied,
        cashReceivedAmount: cashReceived,
        openAmount: open,
        paid: received > 0.009,
      };
    });

    const unpaidInvoices = invoiceRows.filter((r) => !r.paid);
    const paidInvoices = invoiceRows.filter((r) => r.paid);
    const paidTotal = round2(paidInvoices.reduce((sum, r) => sum + r.receivedAmount, 0));
    const depositAppliedTotal = round2(
      invoiceRows.reduce((sum, r) => sum + r.depositAppliedAmount, 0),
    );
    const cashReceivedTotal = round2(
      invoiceRows.reduce((sum, r) => sum + r.cashReceivedAmount, 0),
    );

    const booking = await this.bookingDeposit.getAccountByContractId(id);

    return {
      contract: {
        id: contract.id,
        contractCode: contract.contractCode,
        status: contract.status,
        customerId: contract.customerId,
        customerCode: contract.customer?.customerCode ?? '',
        customerName: contract.customer?.name ?? '',
        roomId: contract.roomId,
        roomCode: contract.room?.roomCode ?? '',
        roomName: contract.room?.name ?? '',
        startDate: dateOnlyStr(contract.startDate),
        endDate: dateOnlyStr(contract.endDate),
        cancellable: this.isSigningStatus(contract.status),
      },
      unpaidInvoices,
      paidInvoices,
      paidInvoiceReceivedTotal: paidTotal,
      /** 发票侧：已用定金抵扣合计（抵扣流水保留；退款记在发票侧，不并入定金余额） */
      depositAppliedTotal,
      /** 发票侧：已收现金合计 */
      cashReceivedTotal,
      bookingDeposit: {
        receiptId: booking.receiptId,
        receiptCode: booking.receiptCode,
        principal: booking.principal,
        applied: booking.applied,
        refunded: booking.refunded,
        forfeited: booking.forfeited ?? 0,
        /** 定金侧：当前可用余额（不含已抵扣到发票的金额） */
        balance: booking.balance,
      },
      suggestedCancelDate: dateOnlyStr(new Date()),
    };
  }

  async conductCancel(contractId: string, dto: ConductCancelContractDto, actor = '') {
    const id = s(contractId);
    if (!id) throw new BadRequestException('contractId is required');
    const cancelDate = parseDateOnly(dto.cancelDate, 'cancelDate');
    const cancelDateStr = dateOnlyStr(cancelDate);
    // 立刻退／冲销办理日：可与取消日分开；缺省跟取消日
    const refundDate = dto.refundDate?.trim()
      ? parseDateOnly(dto.refundDate, 'refundDate')
      : cancelDate;
    const refundDateStr = dateOnlyStr(refundDate);
    const actorId = actor || null;
    const remark = s(dto.remark);

    const preview = await this.previewCancel(id);
    if (!preview.contract.cancellable) {
      throw new BadRequestException(
        `当前合约状态「${preview.contract.status}」不可取消（仅簽約中）`,
      );
    }

    /** 定金侧只结算「当前可用余额」，不含已抵扣到发票的金额 */
    const depositBalance = round2(preview.bookingDeposit.balance);
    const paidById = new Map(
      [...preview.unpaidInvoices, ...preview.paidInvoices].map((r) => [r.id, r]),
    );

    /**
     * 发票结算计划。
     * 需退基数=另收+定金抵扣；扣除可扣已收合计（先另收后定金抵扣）；余额先冲另收再记定金抵扣。
     */
    type InvPlan = {
      invoiceId: string
      cash: number
      dep: number
      refund: number
      deduct: number
      /** 另收暂缓 */
      defer: number
      cashForfeit: number
      depForfeit: number
      cashRefund: number
      depRefund: number
      depDefer: number
      settleNow: boolean
    };
    const invPlans = new Map<string, InvPlan>();
    const hasInvoiceSettlements = Array.isArray(dto.invoiceSettlements);

    const buildInvPlan = (
      invoiceId: string,
      cash: number,
      dep: number,
      refundIn: number,
      deductIn: number,
      code: string,
    ): InvPlan => {
      const dueMax = round2(cash + dep);
      const refund = round2(Math.max(0, refundIn));
      const deduct = round2(Math.max(0, deductIn));
      if (deduct > dueMax + 0.009) {
        throw new BadRequestException(
          `发票 ${code || invoiceId} 扣除不可超过已收 ${dueMax.toFixed(2)}`,
        );
      }
      if (refund + deduct > dueMax + 0.009) {
        throw new BadRequestException(
          `发票 ${code || invoiceId} 需退+扣除不可超过已收 ${dueMax.toFixed(2)}`,
        );
      }
      // 扣除：先扣另收，再扣定金抵扣
      const cashForfeit = round2(Math.min(deduct, cash));
      const depForfeit = round2(Math.max(0, deduct - cashForfeit));
      const cashLeft = round2(Math.max(0, cash - cashForfeit));
      const depLeft = round2(Math.max(0, dep - depForfeit));
      // 退款：先退另收余额，再记退定金抵扣余额
      const cashRefund = round2(Math.min(refund, cashLeft));
      const depRefund = round2(Math.min(Math.max(0, refund - cashRefund), depLeft));
      const cashDefer = round2(Math.max(0, cashLeft - cashRefund));
      const depDefer = round2(Math.max(0, depLeft - depRefund));
      return {
        invoiceId,
        cash,
        dep,
        refund,
        deduct,
        defer: cashDefer,
        cashForfeit,
        depForfeit,
        cashRefund,
        depRefund,
        depDefer,
        // 仅「立刻退另收」才冲销收据；扣除留在原收据（钱未退回，勿改历史收款面额）
        settleNow: cashRefund > 0.009,
      };
    };

    if (hasInvoiceSettlements) {
      const seen = new Set<string>();
      for (const line of dto.invoiceSettlements || []) {
        const invoiceId = s(line.invoiceId);
        if (!invoiceId || seen.has(invoiceId)) {
          throw new BadRequestException('invoiceSettlements 含无效或重复发票');
        }
        seen.add(invoiceId);
        const snap = paidById.get(invoiceId);
        if (!snap) {
          throw new BadRequestException(`发票不存在或不属于本合约：${invoiceId}`);
        }
        const cash = round2(snap.cashReceivedAmount ?? 0);
        const dep = round2(snap.depositAppliedAmount ?? 0);
        invPlans.set(
          invoiceId,
          buildInvPlan(
            invoiceId,
            cash,
            dep,
            Number(line.refundAmount ?? 0),
            Number(line.deductAmount ?? 0),
            snap.invoiceCode || '',
          ),
        );
      }
      for (const snap of preview.paidInvoices) {
        if (invPlans.has(snap.id)) continue;
        const cash = round2(snap.cashReceivedAmount ?? 0);
        const dep = round2(snap.depositAppliedAmount ?? 0);
        if (cash + dep > 0.009) {
          throw new BadRequestException(
            `已收发票 ${snap.invoiceCode || snap.id} 缺少结算明细`,
          );
        }
        invPlans.set(snap.id, buildInvPlan(snap.id, 0, 0, 0, 0, snap.invoiceCode || ''));
      }
    } else {
      const paidAction = (s(dto.paidInvoiceAction) || 'refund_now') as CancelPaidInvoiceAction;
      if (paidAction !== 'refund_now' && paidAction !== 'defer') {
        throw new BadRequestException('paidInvoiceAction 无效');
      }
      for (const snap of [...preview.unpaidInvoices, ...preview.paidInvoices]) {
        const cash = round2(snap.cashReceivedAmount ?? 0);
        const dep = round2(snap.depositAppliedAmount ?? 0);
        if (paidAction === 'refund_now') {
          invPlans.set(
            snap.id,
            buildInvPlan(snap.id, cash, dep, round2(cash + dep), 0, snap.invoiceCode || ''),
          );
        } else {
          invPlans.set(snap.id, buildInvPlan(snap.id, cash, dep, 0, 0, snap.invoiceCode || ''));
        }
      }
    }

    /** 定金：金额优先；否则兼容旧 action */
    let bookingRefundPlan = 0;
    let bookingForfeitPlan = 0;
    let bookingDeferPlan = 0;
    let bdAction: CancelBookingDepositAction = 'defer';
    const hasBdAmounts =
      dto.bookingDepositRefundAmount != null ||
      (dto.bookingDepositForfeitAmount != null &&
        (hasInvoiceSettlements || dto.bookingDepositAction == null));

    if (hasBdAmounts || hasInvoiceSettlements) {
      bookingRefundPlan = round2(Math.max(0, Number(dto.bookingDepositRefundAmount ?? 0)));
      bookingForfeitPlan = round2(Math.max(0, Number(dto.bookingDepositForfeitAmount ?? 0)));
      if (bookingRefundPlan + bookingForfeitPlan > depositBalance + 0.009) {
        throw new BadRequestException(
          `定金需退+扣除不可超过可用余额（${depositBalance.toFixed(2)}）`,
        );
      }
      const allocated = round2(bookingRefundPlan + bookingForfeitPlan);
      bookingDeferPlan = round2(Math.max(0, depositBalance - allocated));
      // 两维：扣除多少 × 余额是否立刻退（可扣除后暂缓余额）
      if (allocated <= 0.009) {
        bdAction = 'defer';
        bookingDeferPlan = depositBalance;
        bookingRefundPlan = 0;
        bookingForfeitPlan = 0;
      } else if (bookingForfeitPlan > 0.009) {
        bdAction = 'partial';
      } else if (bookingDeferPlan > 0.009) {
        bdAction = 'partial';
      } else {
        bdAction = 'refund_all';
      }
    } else {
      bdAction = (s(dto.bookingDepositAction) || 'refund_all') as CancelBookingDepositAction;
      if (bdAction !== 'refund_all' && bdAction !== 'partial' && bdAction !== 'defer') {
        throw new BadRequestException('bookingDepositAction 无效');
      }
      const forfeitAmt =
        bdAction === 'partial'
          ? round2(Math.max(0, Number(dto.bookingDepositForfeitAmount ?? 0)))
          : 0;
      if (bdAction === 'partial' && forfeitAmt > depositBalance + 0.009) {
        throw new BadRequestException(
          `扣留金额不可超过定金可用余额（${depositBalance.toFixed(2)}）`,
        );
      }
      if (bdAction === 'defer') {
        bookingDeferPlan = depositBalance;
      } else if (bdAction === 'refund_all') {
        bookingRefundPlan = depositBalance;
      } else {
        bookingForfeitPlan = forfeitAmt;
        bookingRefundPlan = round2(Math.max(0, depositBalance - forfeitAmt));
      }
    }

    const paidAction: CancelPaidInvoiceAction = [...invPlans.values()].some(
      (p) => p.settleNow && p.cash > 0.009,
    )
      ? 'refund_now'
      : 'defer';

    const stamp = hkStamp();

    const result = await this.prisma.$transaction(async (tx) => {
      // 定金抵扣动账保留（审计）；取消时不删除、不冲回定金余额
      const applies = await tx.bookingDepositMovement.findMany({
        where: { contractId: id, type: BookingDepositMovementType.apply },
        select: { receivableId: true, amount: true },
      });
      const depositAppliedKept = round2(
        applies.reduce((sum, a) => sum + Number(a.amount.toString()), 0),
      );

      const invoices = await tx.invoice.findMany({
        where: { contractId: id, status: { not: '已取消' } },
        select: {
          id: true,
          invoiceCode: true,
          changeLog: true,
          receivables: { select: { id: true, receivedAmount: true } },
        },
      });

      let cashRefunded = 0;
      let cashDeferred = 0;
      let cashForfeited = 0;
      let invoiceDepositRefundNoted = 0;
      let invoiceDepositForfeited = 0;
      let invoiceDepositDeferred = 0;

      // 立刻退的另收才冲销收据；扣除不冲销（钱未退回，保留原收据面额供打印）
      const settleRecvIds: string[] = [];
      let voided = 0;
      for (const inv of invoices) {
        const plan = invPlans.get(inv.id);
        if (!plan?.settleNow) continue;
        const recvIds = inv.receivables.map((r) => r.id);
        settleRecvIds.push(...recvIds);
        const cashTaken = round2(plan.cashRefund);
        // 有暂缓或另有扣除时，只冲销「立刻退」额度，其余分摊留在原收据
        const limit =
          plan.defer > 0.009 || plan.cashForfeit > 0.009 ? cashTaken : undefined;
        voided = round2(
          voided + (await this.reverseInvoiceCash(tx, recvIds, undefined, limit)),
        );
      }
      const uniqueSettleRecv = [...new Set(settleRecvIds)];
      cashRefunded = round2(
        [...invPlans.values()].reduce((sum, p) => sum + p.cashRefund, 0),
      );
      cashForfeited = round2(
        [...invPlans.values()].reduce((sum, p) => sum + p.cashForfeit, 0),
      );
      invoiceDepositRefundNoted = round2(
        [...invPlans.values()].reduce((sum, p) => sum + p.depRefund, 0),
      );
      invoiceDepositForfeited = round2(
        [...invPlans.values()].reduce((sum, p) => sum + p.depForfeit, 0),
      );
      if (Math.abs(voided - cashRefunded) > 0.05) {
        // 冲销合计与计划略有差异时，仍以计划需退为准
      }

      // 定金抵扣：记退 + 没收都累加已退，清掉应退容量
      for (const inv of invoices) {
        const plan = invPlans.get(inv.id);
        if (!plan) continue;
        const depSettle = round2(plan.depRefund + plan.depForfeit);
        if (depSettle <= 0.009) continue;
        const recvIds = inv.receivables.map((r) => r.id);
        await incrementRefundedForDepositApplies(tx, recvIds, depSettle);
      }
      if (uniqueSettleRecv.length) {
        await syncReceivableReceivedAmounts(tx, uniqueSettleRecv);
      }

      cashDeferred = round2(
        [...invPlans.values()].reduce((sum, p) => sum + p.defer, 0),
      );
      invoiceDepositDeferred = round2(
        [...invPlans.values()].reduce((sum, p) => sum + p.depDefer, 0),
      );

      let cancelledInvoiceCount = 0;
      for (const inv of invoices) {
        const plan = invPlans.get(inv.id) || {
          invoiceId: inv.id,
          cash: 0,
          dep: 0,
          refund: 0,
          deduct: 0,
          defer: 0,
          cashForfeit: 0,
          depForfeit: 0,
          cashRefund: 0,
          depRefund: 0,
          depDefer: 0,
          settleNow: true,
        };
        const logLines: string[] = [
          `#inv|contract_cancel|void|${stamp}|${inv.invoiceCode || ''}`,
        ];
        if (plan.cashRefund > 0.009) {
          logLines.push(
            `#inv|contract_cancel|cash_refund|${stamp}|${plan.cashRefund.toFixed(2)}|${inv.invoiceCode || ''}`,
          );
        }
        if (plan.cashForfeit > 0.009) {
          logLines.push(
            `#inv|contract_cancel|cash_forfeit|${stamp}|${plan.cashForfeit.toFixed(2)}|${inv.invoiceCode || ''}`,
          );
        }
        if (plan.defer > 0.009) {
          logLines.push(
            `#inv|contract_cancel|cash_defer|${stamp}|${plan.defer.toFixed(2)}|${inv.invoiceCode || ''}`,
          );
        }
        if (plan.depRefund > 0.009) {
          logLines.push(
            `#inv|contract_cancel|deposit_offset_refund|${stamp}|${plan.depRefund.toFixed(2)}|${inv.invoiceCode || ''}`,
          );
        }
        if (plan.depForfeit > 0.009) {
          logLines.push(
            `#inv|contract_cancel|deposit_offset_forfeit|${stamp}|${plan.depForfeit.toFixed(2)}|${inv.invoiceCode || ''}`,
          );
        }
        if (plan.depDefer > 0.009) {
          logLines.push(
            `#inv|contract_cancel|deposit_offset_defer|${stamp}|${plan.depDefer.toFixed(2)}|${inv.invoiceCode || ''}`,
          );
        }
        const prev = (inv.changeLog || '').trim();
        const nextLog = [...logLines, ...(prev ? [prev] : [])].join('\n');
        const recvIds = inv.receivables.map((r) => r.id);
        await tx.invoice.update({
          where: { id: inv.id },
          data: {
            status: '已取消',
            changeLog: nextLog,
            updatedById: actorId,
          },
        });
        if (recvIds.length) {
          await syncReceivableReceivedAmounts(tx, recvIds);
          await tx.receivable.updateMany({
            where: { id: { in: recvIds } },
            data: { updatedById: actorId },
          });
        }
        cancelledInvoiceCount += 1;
      }

      const existing = await tx.contract.findUniqueOrThrow({
        where: { id },
        select: { remark: true, roomId: true, requirementId: true },
      });
      const mergedRemark = remark
        ? [s(existing.remark), `【取消 ${cancelDateStr}】${remark}`].filter(Boolean).join('\n')
        : undefined;
      const after = await tx.contract.update({
        where: { id },
        data: {
          status: '已取消',
          ...(mergedRemark != null ? { remark: mergedRemark } : {}),
          updatedById: actorId,
        },
        select: {
          id: true,
          roomId: true,
          requirementId: true,
        },
      });

      await this.customerRequirements.recomputeStatusFromContracts(
        after.requirementId,
        actorId,
        tx,
      );
      await this.syncRoomAfterCancel(tx, after.roomId, actorId);

      return {
        cancelledInvoiceCount,
        cashRefunded,
        cashDeferred,
        cashForfeited,
        depositAppliedKept,
        invoiceDepositRefundNoted,
        invoiceDepositForfeited,
        invoiceDepositDeferred,
      };
    });

    // 定金侧：只结算可用余额（与发票抵扣无关）
    let bookingRefunded = 0;
    let bookingForfeited = 0;
    let bookingDeferred = 0;
    const accountAfter = await this.bookingDeposit.getAccountByContractId(id);
    const bal = round2(accountAfter.balance);
    const settleTarget = round2(Math.min(bal, depositBalance));

    const forfeit = round2(Math.min(bookingForfeitPlan, settleTarget));
    const refund = round2(
      Math.min(bookingRefundPlan, Math.max(0, settleTarget - forfeit)),
    );
    bookingDeferred = round2(
      Math.max(0, settleTarget - forfeit - refund),
    );

    if (forfeit > 0.009) {
      await this.bookingDeposit.forfeit(
        {
          contractId: id,
          amount: forfeit,
          forfeitDate: refundDateStr,
          remark: '取消合约扣留定金余额',
        },
        actorId,
      );
      bookingForfeited = forfeit;
    }
    if (refund > 0.009) {
      await this.bookingDeposit.refund(
        {
          contractId: id,
          amount: refund,
          refundDate: refundDateStr,
          remark: '取消合约退还定金余额',
        },
        actorId,
      );
      bookingRefunded = refund;
    }

    const invoiceOrder = [
      ...preview.paidInvoices.map((x) => x.id),
      ...preview.unpaidInvoices.map((x) => x.id),
    ];
    const invoiceRefundLines = [...invPlans.values()]
      .map((p) => {
        const snap = paidById.get(p.invoiceId);
        return {
          invoiceId: p.invoiceId,
          invoiceCode: (snap?.invoiceCode || '').trim(),
          invoiceType: (snap?.invoiceType || '').trim(),
          cashRefund: p.cashRefund,
          depRefund: p.depRefund,
          cashDefer: p.defer,
          depDefer: p.depDefer,
          cashForfeit: p.cashForfeit,
          depForfeit: p.depForfeit,
        };
      })
      .sort((a, b) => {
        const ia = invoiceOrder.indexOf(a.invoiceId);
        const ib = invoiceOrder.indexOf(b.invoiceId);
        return (ia < 0 ? 9999 : ia) - (ib < 0 ? 9999 : ib);
      });

    const settlementMeta = await this.writeCancelSettlement({
      contractId: id,
      customerId: preview.contract.customerId,
      roomId: preview.contract.roomId,
      cancelDate,
      refundDate,
      actorId,
      remark,
      paidAction,
      bdAction,
      unpaidAndPaidInvoices: [...preview.unpaidInvoices, ...preview.paidInvoices],
      invoiceRefundLines,
      cashRefunded: result.cashRefunded,
      cashDeferred: result.cashDeferred,
      cashForfeited: result.cashForfeited,
      invoiceDepositDeferred: result.invoiceDepositDeferred,
      invoiceDepositRefundNoted: result.invoiceDepositRefundNoted,
      invoiceDepositForfeited: result.invoiceDepositForfeited,
      bookingRefunded,
      bookingForfeited,
      bookingDeferred,
      bookingReceiptCode: (preview.bookingDeposit.receiptCode || '').trim(),
    });

    const row = await this.prisma.contract.findUniqueOrThrow({
      where: { id },
      include: contractInclude,
    });

    return {
      contract: toContractDto(row),
      cancelledInvoiceCount: result.cancelledInvoiceCount,
      depositAppliedKept: result.depositAppliedKept,
      invoiceDepositRefundNoted: result.invoiceDepositRefundNoted,
      invoiceDepositForfeited: result.invoiceDepositForfeited,
      invoiceDepositDeferred: result.invoiceDepositDeferred,
      cashRefunded: result.cashRefunded,
      cashDeferred: result.cashDeferred,
      cashForfeited: result.cashForfeited,
      bookingDepositRefunded: bookingRefunded,
      bookingDepositForfeited: bookingForfeited,
      bookingDepositDeferred: bookingDeferred,
      paidInvoiceAction: paidAction,
      bookingDepositAction: bdAction,
      settlementId: settlementMeta.settlementId,
      settlementCode: settlementMeta.settlementCode,
      refundOrderId: settlementMeta.refundOrderId,
      refundOrderCode: settlementMeta.refundOrderCode,
    };
  }

  /**
   * 已取消合约：暂不退后续办理预览。
   * - 另收：所属已取消发票下仍有效的发票收据金额
   * - 定金：当前可用余额
   */
  async previewCancelRefund(contractId: string) {
    const id = s(contractId);
    if (!id) throw new BadRequestException('contractId is required');

    const contract = await this.prisma.contract.findUnique({
      where: { id },
      select: {
        id: true,
        contractCode: true,
        status: true,
        customerId: true,
        roomId: true,
        customer: { select: { id: true, customerCode: true, name: true } },
        room: { select: { id: true, roomCode: true, name: true } },
      },
    });
    if (!contract) throw new NotFoundException(`Contract ${id} not found`);

    const cancelled = s(contract.status) === '已取消';
    const pendingCash = await this.collectDeferredInvoiceCash(id);
    const booking = await this.bookingDeposit.getAccountByContractId(id);
    const depositBalance = round2(booking.balance);
    const hasCash = pendingCash.total > 0.009;
    const hasDepositOffsetNote = pendingCash.depositOffsetPending > 0.009;
    const hasDeposit = depositBalance > 0.009;

    return {
      contract: {
        id: contract.id,
        contractCode: contract.contractCode,
        status: contract.status,
        customerId: contract.customerId,
        customerCode: contract.customer?.customerCode ?? '',
        customerName: contract.customer?.name ?? '',
        roomId: contract.roomId,
        roomCode: contract.room?.roomCode ?? '',
        roomName: contract.room?.name ?? '',
        cancelled,
      },
      cash: {
        amount: pendingCash.total,
        depositOffsetNoted: pendingCash.depositOffsetPending,
        receipts: pendingCash.receipts,
        invoices: pendingCash.invoices,
      },
      bookingDeposit: {
        receiptId: booking.receiptId,
        receiptCode: booking.receiptCode,
        principal: booking.principal,
        applied: booking.applied,
        refunded: booking.refunded,
        forfeited: booking.forfeited ?? 0,
        balance: depositBalance,
      },
      hasPending: cancelled && (hasCash || hasDepositOffsetNote || hasDeposit),
      suggestedRefundDate: dateOnlyStr(new Date()),
    };
  }

  /**
   * 已取消合约：办理暂不退的退款（冲销另收 ± 退还定金余额）。
   */
  async conductCancelRefund(
    contractId: string,
    dto: ConductCancelRefundDto,
    actor = '',
  ) {
    const id = s(contractId);
    if (!id) throw new BadRequestException('contractId is required');
    const refundDate = parseDateOnly(dto.refundDate, 'refundDate');
    const refundDateStr = dateOnlyStr(refundDate);
    const stamp = hkStamp();
    const actorId = s(actor) || null;
    const remark = s(dto.remark);
    const paymentMethod = s(dto.paymentMethod);

    const contract = await this.prisma.contract.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        contractCode: true,
        customerId: true,
        roomId: true,
      },
    });
    if (!contract) throw new NotFoundException(`Contract ${id} not found`);
    if (s(contract.status) !== '已取消') {
      throw new BadRequestException('仅「已取消」合约可办理取消后的暂留退款');
    }

    const pending = await this.collectDeferredInvoiceCash(id);
    const booking = await this.bookingDeposit.getAccountByContractId(id);
    const depositBalance = round2(booking.balance);

    const wantCash =
      dto.refundCash === undefined
        ? pending.total > 0.009 || pending.depositOffsetPending > 0.009
        : Boolean(dto.refundCash);
    const wantDeposit =
      dto.refundBookingDeposit === undefined
        ? depositBalance > 0.009
        : Boolean(dto.refundBookingDeposit);

    if (!wantCash && !wantDeposit) {
      throw new BadRequestException('请至少选择冲销另收或退还定金');
    }
    if (
      wantCash &&
      pending.total <= 0.009 &&
      pending.depositOffsetPending <= 0.009
    ) {
      throw new BadRequestException('没有可冲销的暂留另收／待记退定金抵扣');
    }
    if (wantDeposit && depositBalance <= 0.009) {
      throw new BadRequestException('没有可退还的定金余额');
    }

    let cashRefunded = 0;
    let depositOffsetNoted = 0;
    if (wantCash) {
      const latestSettlementId = (
        await this.settlements.findLatestByContractAndType(
          id,
          ContractSettlementType.CANCEL,
        )
      )?.id;
      const result = await this.prisma.$transaction(async (tx) => {
        let voided = 0;
        if (pending.receivableIds.length && pending.total > 0.009) {
          voided = await this.reverseInvoiceCash(
            tx,
            pending.receivableIds,
            `#rcp|cancel_refund|void|${stamp}`,
          );
          await syncReceivableReceivedAmounts(tx, pending.receivableIds);

          // 冲销另收后应收重新露出未收：补写核销留痕（取消时若已全额已收则不会写）
          const openRows = await tx.receivable.findMany({
            where: {
              id: { in: pending.receivableIds },
              invoice: { status: '已取消' },
            },
            select: { id: true, receivableAmount: true },
          });
          for (const r of openRows) {
            const open = round2(Number(r.receivableAmount?.toString() ?? 0));
            if (open <= 0.009) continue;
            await this.writeoffs.create(
              {
                receivableId: r.id,
                amount: open,
                direction: ReceivableWriteoffDirection.reduce,
                reasonType: 'void_cancel',
                writeoffDate: refundDate,
                settlementId: latestSettlementId || null,
                remark: '取消后冲销发票另收',
                actorId,
              },
              tx,
            );
          }
        }

        let offsetNoted = 0;
        for (const inv of pending.invoices) {
          const row = await tx.invoice.findUnique({
            where: { id: inv.id },
            select: { changeLog: true, invoiceCode: true },
          });
          if (!row) continue;
          const prev = (row.changeLog || '').trim();
          const lines: string[] = [];
          if (inv.cashAmount > 0.009) {
            lines.push(
              `#inv|cancel_refund|cash|${stamp}|${inv.cashAmount.toFixed(2)}|${row.invoiceCode || ''}`,
            );
          }
          if (inv.depositOffsetPending > 0.009) {
            lines.push(
              `#inv|cancel_refund|deposit_offset|${stamp}|${inv.depositOffsetPending.toFixed(2)}|${row.invoiceCode || ''}`,
            );
            offsetNoted = round2(offsetNoted + inv.depositOffsetPending);
          }
          if (!lines.length) continue;
          if (remark) lines.push(`#inv|cancel_refund|remark|${stamp}|${remark}`);
          await tx.invoice.update({
            where: { id: inv.id },
            data: {
              changeLog: [...lines, ...(prev ? [prev] : [])].join('\n'),
              ...(actorId ? { updatedById: actorId } : {}),
            },
          });
        }
        if (offsetNoted > 0.009 && pending.receivableIds.length) {
          await incrementRefundedForDepositApplies(tx, pending.receivableIds);
          await syncReceivableReceivedAmounts(tx, pending.receivableIds);
        }
        return { voided, offsetNoted };
      });
      cashRefunded = result.voided;
      depositOffsetNoted = result.offsetNoted;
    }

    let bookingDepositRefunded = 0;
    if (wantDeposit) {
      await this.bookingDeposit.refund(
        {
          contractId: id,
          amount: depositBalance,
          refundDate: refundDateStr,
          remark: remark || '取消合约后办理定金退还',
        },
        actorId,
      );
      bookingDepositRefunded = depositBalance;
    }

    const latestSettlement = await this.settlements.findLatestByContractAndType(
      id,
      ContractSettlementType.CANCEL,
    );
    let settlementId = latestSettlement?.id ?? null;
    let settlementCode = latestSettlement?.settlementCode ?? '';
    let refundOrderId: string | null = null;
    let refundOrderCode = '';

    const refundItems: Array<{
      itemType: string
      description?: string
      amount: number
      receivableId?: string | null
      receiptId?: string | null
    }> = [];
    if (wantCash && cashRefunded > 0.009) {
      refundItems.push({
        itemType: 'invoice_cash',
        description: '取消后冲销发票另收',
        amount: cashRefunded,
      });
    }
    if (wantDeposit && bookingDepositRefunded > 0.009) {
      refundItems.push({
        itemType: 'booking_deposit',
        description: '取消后定金退还',
        amount: bookingDepositRefunded,
      });
    }
    const refundAmt = round2(
      refundItems.reduce((sum, r) => sum + r.amount, 0),
    );
    if (refundAmt > 0.009 && settlementId) {
      const openOrders = await this.prisma.refundOrder.findMany({
        where: {
          settlementId,
          status: {
            notIn: [RefundOrderStatus.paid, RefundOrderStatus.cancelled],
          },
        },
        select: { id: true, amount: true, refundCode: true },
        orderBy: { createdAt: 'asc' },
      });
      let paidTotal = 0;
      if (openOrders.length) {
        for (const o of openOrders) {
          await this.refundOrders.disburse(o.id, {
            refundDate,
            paymentMethod: paymentMethod || undefined,
            handlerId: actorId,
            actorId,
          });
          paidTotal = round2(paidTotal + Number(o.amount.toString()));
          refundOrderId = o.id;
          refundOrderCode = o.refundCode;
        }
      } else {
        const order = await this.refundOrders.create({
          contractId: id,
          customerId: contract.customerId,
          roomId: contract.roomId,
          settlementId,
          amount: refundAmt,
          initialPaidAmount: refundAmt,
          refundDate,
          paymentMethod: paymentMethod || undefined,
          handlerId: actorId,
          remark: remark || '取消合约后办理暂留退款',
          items: refundItems,
          actorId,
        });
        refundOrderId = order.id;
        refundOrderCode = order.refundCode;
        paidTotal = refundAmt;
      }
      await this.settlements.refreshAfterRefund(settlementId, paidTotal, actorId);
      const refreshed = await this.prisma.contractSettlement.findUnique({
        where: { id: settlementId },
        select: { settlementCode: true },
      });
      settlementCode = refreshed?.settlementCode || settlementCode;
    }

    const row = await this.prisma.contract.findUniqueOrThrow({
      where: { id },
      include: contractInclude,
    });

    return {
      contract: toContractDto(row),
      cashRefunded,
      depositOffsetNoted,
      bookingDepositRefunded,
      refundDate: refundDateStr,
      settlementId,
      settlementCode,
      refundOrderId,
      refundOrderCode,
    };
  }

  /**
   * 汇总已取消合约下「稍后需退」的另收／定金抵扣。
   * 以发票 changeLog 为准（收据不可变，不能再靠作废收据判断待退）。
   */
  private async collectDeferredInvoiceCash(contractId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { contractId, status: '已取消' },
      select: {
        id: true,
        invoiceCode: true,
        changeLog: true,
        receivables: { select: { id: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const receivableIds = [
      ...new Set(invoices.flatMap((inv) => inv.receivables.map((r) => r.id))),
    ];
    if (!receivableIds.length) {
      return {
        total: 0,
        depositOffsetPending: 0,
        receivableIds: [] as string[],
        receipts: [] as Array<{
          id: string;
          receiptCode: string;
          amount: number;
          paymentDate: string;
          paymentMethod: string;
        }>,
        invoices: [] as Array<{
          id: string;
          invoiceCode: string;
          cashAmount: number;
          depositOffsetPending: number;
        }>,
      };
    }

    // 关联原收据仅供预览展示（面额不变）
    const allocs = await this.prisma.receiptAllocation.findMany({
      where: {
        receivableId: { in: receivableIds },
        receipt: {
          kind: ReceiptKind.invoice,
          NOT: { paymentMethod: BOOKING_DEPOSIT_OFFSET_METHOD },
        },
      },
      select: {
        amount: true,
        receipt: {
          select: {
            id: true,
            receiptCode: true,
            paymentDate: true,
            paymentMethod: true,
          },
        },
      },
    });
    const receiptMap = new Map<
      string,
      {
        id: string;
        receiptCode: string;
        amount: number;
        paymentDate: string;
        paymentMethod: string;
      }
    >();
    for (const a of allocs) {
      const r = a.receipt;
      if (!r) continue;
      const amt = round2(Number(a.amount.toString()));
      const prev = receiptMap.get(r.id);
      receiptMap.set(r.id, {
        id: r.id,
        receiptCode: r.receiptCode || '',
        amount: round2((prev?.amount ?? 0) + amt),
        paymentDate: dateOnlyStr(r.paymentDate),
        paymentMethod: r.paymentMethod || '',
      });
    }

    const invoiceRows = invoices.map((inv) => {
      const log = inv.changeLog || '';
      const deferred = this.sumInvoiceLogAmounts(log, 'cash_defer');
      // #inv|cancel_refund|cash|stamp|amount|code
      let refundedLater = 0;
      for (const raw of log.split('\n')) {
        const line = raw.trim();
        if (!line.includes('|cancel_refund|cash|')) continue;
        const parts = line.split('|');
        const amt = Number(parts[4] ?? NaN);
        if (Number.isFinite(amt) && amt > 0) refundedLater = round2(refundedLater + amt);
      }
      const cashAmount = round2(Math.max(0, deferred - refundedLater));
      const depDeferred = this.sumInvoiceLogAmounts(log, 'deposit_offset_defer');
      let depRefunded = this.sumInvoiceLogAmounts(log, 'deposit_offset_refund');
      for (const raw of log.split('\n')) {
        const line = raw.trim();
        if (!line.includes('|cancel_refund|deposit_offset|')) continue;
        const parts = line.split('|');
        const amt = Number(parts[4] ?? NaN);
        if (Number.isFinite(amt) && amt > 0) depRefunded = round2(depRefunded + amt);
      }
      const depositOffsetPending = round2(Math.max(0, depDeferred - depRefunded));
      return {
        id: inv.id,
        invoiceCode: inv.invoiceCode || '',
        cashAmount,
        depositOffsetPending,
      };
    });

    const total = round2(invoiceRows.reduce((sum, r) => sum + r.cashAmount, 0));
    const depositOffsetPending = round2(
      invoiceRows.reduce((sum, r) => sum + r.depositOffsetPending, 0),
    );

    return {
      total,
      depositOffsetPending,
      receivableIds,
      receipts: [...receiptMap.values()].sort((a, b) =>
        a.receiptCode.localeCompare(b.receiptCode),
      ),
      invoices: invoiceRows.filter(
        (r) => r.cashAmount > 0.009 || r.depositOffsetPending > 0.009,
      ),
    };
  }

  /**
   * 记退发票现金收款（不改原收据）。
   * 收据金额／分摊一律不可变；只按分摊 FIFO 把额度累加到应收「已退」。
   * @param amountLimit 若传入，则最多记退该金额（立刻退部分）；缺省为全部另收。
   */
  private async reverseInvoiceCash(
    tx: Prisma.TransactionClient,
    receivableIds: string[],
    _voidLogLine?: string,
    amountLimit?: number,
  ): Promise<number> {
    const ids = [...new Set(receivableIds.map((x) => s(x)).filter(Boolean))];
    if (!ids.length) return 0;

    const refundedByReceivable = new Map<string, number>();
    let budget =
      amountLimit == null || !Number.isFinite(amountLimit)
        ? Number.POSITIVE_INFINITY
        : Math.max(0, round2(amountLimit));

    const addRefunded = (receivableId: string, amt: number) => {
      const rid = s(receivableId);
      const n = Number.isFinite(amt) ? amt : 0;
      if (!rid || n <= 0.009) return;
      refundedByReceivable.set(
        rid,
        round2((refundedByReceivable.get(rid) ?? 0) + n),
      );
    };

    const takeBudget = (want: number) => {
      const w = Number.isFinite(want) ? want : 0;
      if (w <= 0.009 || budget <= 0.009) return 0;
      const take = round2(Math.min(w, budget));
      budget = round2(Math.max(0, budget - take));
      return take;
    };

    // 只读分摊归因，绝不 update/delete 收据
    const allocs = await tx.receiptAllocation.findMany({
      where: {
        receivableId: { in: ids },
        receipt: {
          kind: ReceiptKind.invoice,
          NOT: { paymentMethod: BOOKING_DEPOSIT_OFFSET_METHOD },
        },
      },
      select: { receivableId: true, amount: true },
      orderBy: { id: 'asc' },
    });

    let notedAlloc = 0;
    for (const a of allocs) {
      if (budget <= 0.009) break;
      const amt = Number(a.amount.toString());
      const take = takeBudget(Number.isFinite(amt) ? amt : 0);
      if (take <= 0.009) continue;
      notedAlloc = round2(notedAlloc + take);
      addRefunded(a.receivableId, take);
    }

    const legacy = await tx.receipt.findMany({
      where: {
        receivableId: { in: ids },
        kind: ReceiptKind.invoice,
        allocations: { none: {} },
        NOT: { paymentMethod: BOOKING_DEPOSIT_OFFSET_METHOD },
      },
      select: { amount: true, receivableId: true },
      orderBy: { id: 'asc' },
    });
    let notedLegacy = 0;
    for (const r of legacy) {
      if (budget <= 0.009) break;
      const amt = Number(r.amount.toString());
      const take = takeBudget(Number.isFinite(amt) ? amt : 0);
      if (take <= 0.009) continue;
      notedLegacy = round2(notedLegacy + take);
      if (r.receivableId) addRefunded(r.receivableId, take);
    }

    for (const [recvId, amt] of refundedByReceivable) {
      await incrementReceivableRefundedAmount(tx, recvId, amt);
    }

    return round2(notedAlloc + notedLegacy);
  }

  /** 从发票 changeLog 汇总某类金额行（`#inv|...|marker|stamp|amount|...`） */
  private sumInvoiceLogAmounts(changeLog: string, marker: string): number {
    const needle = `|${marker}|`;
    let sum = 0;
    for (const raw of (changeLog || '').split('\n')) {
      const line = raw.trim();
      if (!line.includes(needle)) continue;
      const parts = line.split('|');
      // #inv | scope | marker | stamp | amount | code?
      const amt = Number(parts[4] ?? NaN);
      if (Number.isFinite(amt) && amt > 0) sum = round2(sum + amt);
    }
    return sum;
  }

  private invoiceNeedRefundDesc(invoiceCode: string, invoiceType: string) {
    return [invoiceCode.trim(), invoiceType.trim(), '需退']
      .filter(Boolean)
      .join(' ');
  }

  private async writeCancelSettlement(params: {
    contractId: string
    customerId: string
    roomId: string
    cancelDate: Date
    /** 即时退款／冲销办理日；缺省跟 cancelDate */
    refundDate?: Date
    actorId: string | null
    remark: string
    paidAction: CancelPaidInvoiceAction
    bdAction: CancelBookingDepositAction
    unpaidAndPaidInvoices: Array<{
      id: string
      invoiceCode: string
      openAmount: number
      cashReceivedAmount: number
      depositAppliedAmount: number
      receivables?: Array<{ id: string }>
    }>
    /** 各发票退／扣／暂缓拆分（退款单明细按发票合并另收+定金抵扣） */
    invoiceRefundLines: Array<{
      invoiceId: string
      invoiceCode: string
      invoiceType: string
      cashRefund: number
      depRefund: number
      cashDefer: number
      depDefer: number
      cashForfeit: number
      depForfeit: number
    }>
    cashRefunded: number
    cashDeferred: number
    cashForfeited: number
    invoiceDepositDeferred: number
    invoiceDepositRefundNoted: number
    invoiceDepositForfeited: number
    bookingRefunded: number
    bookingForfeited: number
    bookingDeferred: number
    bookingReceiptCode?: string
  }) {
    const refundDate = params.refundDate ?? params.cancelDate
    const bookingNeedRefundDesc = [params.bookingReceiptCode?.trim(), '需退']
      .filter(Boolean)
      .join(' ')
    const invoices = await this.prisma.invoice.findMany({
      where: { contractId: params.contractId, status: '已取消' },
      select: {
        id: true,
        invoiceCode: true,
        receivables: { select: { id: true, receivableAmount: true } },
      },
    });

    const items: Array<{
      itemType: ContractSettlementItemType
      description?: string
      amount: number
      receivableId?: string | null
      invoiceId?: string | null
      writeWriteoff?: boolean
      writeoffReasonType?: string
      remark?: string
    }> = [];

    for (const inv of invoices) {
      for (const r of inv.receivables) {
        const open = round2(Number(r.receivableAmount?.toString() ?? 0));
        items.push({
          itemType: ContractSettlementItemType.VOID_RECEIVABLE,
          description: `取消合约作废应收 ${inv.invoiceCode || ''}`.trim(),
          amount: open,
          receivableId: r.id,
          invoiceId: inv.id,
          writeWriteoff: open > 0.009,
          writeoffReasonType: 'void_cancel',
        });
      }
    }

    if (params.bookingForfeited > 0.009) {
      items.push({
        itemType: ContractSettlementItemType.PENALTY_DEDUCTION,
        description: '取消合约扣留定金余额',
        amount: params.bookingForfeited,
        remark: 'booking_deposit_forfeit',
      });
    }
    if (params.cashForfeited > 0.009) {
      items.push({
        itemType: ContractSettlementItemType.PENALTY_DEDUCTION,
        description: '取消合约扣留发票另收',
        amount: params.cashForfeited,
        remark: 'invoice_cash_forfeit',
      });
    }
    if (params.invoiceDepositForfeited > 0.009) {
      items.push({
        itemType: ContractSettlementItemType.PENALTY_DEDUCTION,
        description: '取消合约扣留发票定金抵扣',
        amount: params.invoiceDepositForfeited,
        remark: 'invoice_deposit_offset_forfeit',
      });
    }

    const refundAlloc = round2(
      params.bookingRefunded +
        params.bookingDeferred +
        params.cashRefunded +
        params.cashDeferred +
        params.invoiceDepositRefundNoted +
        params.invoiceDepositDeferred,
    );
    if (refundAlloc > 0.009) {
      items.push({
        itemType: ContractSettlementItemType.REFUND_ALLOCATION,
        description: '取消合约应退／待退额度（定金余额＋发票另收等）',
        amount: refundAlloc,
      });
    }

    const receivableIdByInvoice = new Map<string, string>()
    for (const inv of invoices) {
      const rid = inv.receivables[0]?.id
      if (rid) receivableIdByInvoice.set(inv.id, rid)
    }

    const immediateItems: Array<{
      itemType: string
      description?: string
      amount: number
      receivableId?: string | null
    }> = [];
    for (const line of params.invoiceRefundLines) {
      const amt = round2(line.cashRefund + line.depRefund);
      if (amt <= 0.009) continue;
      immediateItems.push({
        itemType: 'invoice_cash',
        description: this.invoiceNeedRefundDesc(line.invoiceCode, line.invoiceType),
        amount: amt,
        receivableId: receivableIdByInvoice.get(line.invoiceId) || null,
      });
    }
    if (params.bookingRefunded > 0.009) {
      immediateItems.push({
        itemType: 'booking_deposit',
        description: bookingNeedRefundDesc || '需退',
        amount: params.bookingRefunded,
      });
    }
    const immediateAmount = round2(
      immediateItems.reduce((sum, x) => sum + x.amount, 0),
    );

    const pendingItems: Array<{
      itemType: string
      description?: string
      amount: number
      receivableId?: string | null
    }> = [];
    for (const line of params.invoiceRefundLines) {
      const amt = round2(line.cashDefer + line.depDefer);
      if (amt <= 0.009) continue;
      pendingItems.push({
        itemType: 'invoice_cash',
        description: this.invoiceNeedRefundDesc(line.invoiceCode, line.invoiceType),
        amount: amt,
        receivableId: receivableIdByInvoice.get(line.invoiceId) || null,
      });
    }
    if (params.bookingDeferred > 0.009) {
      pendingItems.push({
        itemType: 'booking_deposit',
        description: bookingNeedRefundDesc || '需退',
        amount: params.bookingDeferred,
      });
    }
    const pendingAmount = round2(
      pendingItems.reduce((sum, x) => sum + x.amount, 0),
    );

    return this.settlements.create({
      type: ContractSettlementType.CANCEL,
      contractId: params.contractId,
      customerId: params.customerId,
      roomId: params.roomId,
      settlementDate: params.cancelDate,
      remark: params.remark,
      items,
      actorId: params.actorId,
      immediateRefund:
        immediateAmount > 0.009
          ? {
              amount: immediateAmount,
              refundDate,
              remark: '取消合约即时退款／冲销',
              items: immediateItems,
            }
          : null,
      pendingRefund:
        pendingAmount > 0.009
          ? {
              amount: pendingAmount,
              remark: '取消合约稍后需退',
              items: pendingItems,
            }
          : null,
      changeLogSummary: `取消合约结算：定金动作=${params.bdAction}，另收动作=${params.paidAction}`,
    });
  }

  private async syncRoomAfterCancel(
    tx: Prisma.TransactionClient,
    roomId: string,
    actorId: string | null,
  ) {
    const room = await tx.room.findUnique({
      where: { id: roomId },
      select: { leaseCapability: true, splitLabels: true },
    });
    const occupying = await tx.contract.findMany({
      where: { roomId, status: { in: [...OCCUPYING_CONTRACT_STATUSES] } },
      select: {
        contractCode: true,
        status: true,
        occupancyMode: true,
        partLabel: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
    const occupancy = buildRoomOccupancy(
      {
        leaseCapability: room?.leaseCapability || RoomLeaseCapability.flexible,
        splitLabels: room?.splitLabels || [],
      },
      occupying.map((c) => ({
        id: c.contractCode,
        contractCode: c.contractCode,
        status: c.status,
        occupancyMode: c.occupancyMode,
        partLabel: c.partLabel,
      })),
    );
    let latest = '';
    if (occupancy.wholeOccupied) {
      latest = occupancy.wholeContractCode || occupying[0]?.contractCode || '';
    } else if (occupancy.slots.some((x) => x.occupied)) {
      latest = occupancy.slots
        .filter((x) => x.occupied)
        .map((x) => `${x.label}:${x.contractCode || ''}`)
        .join(' / ');
    } else if (occupying[0]) {
      latest = occupying[0].contractCode;
    }
    await tx.room.update({
      where: { id: roomId },
      data: {
        latestContract: latest || null,
        status: aggregateRoomStatus(occupying),
        ...(actorId ? { updatedById: actorId } : {}),
      },
    });
  }
}
