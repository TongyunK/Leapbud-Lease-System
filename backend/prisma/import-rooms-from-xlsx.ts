/**
 * 从 data/房間信息_*.xlsx 导入房间到本地 rooms 表
 * 用法（在 backend 目录）：
 *   npx ts-node --compiler-options "{\"module\":\"CommonJS\"}" prisma/import-rooms-from-xlsx.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { PrismaClient, RoomStatus } from '@prisma/client';

const prisma = new PrismaClient();

const STATUS_MAP: Record<string, RoomStatus> = {
  閑置中: RoomStatus.idle,
  闲置中: RoomStatus.idle,
  簽約中: RoomStatus.signing,
  签约中: RoomStatus.signing,
  租賃中: RoomStatus.leased,
  租赁中: RoomStatus.leased,
  退租中: RoomStatus.terminating,
};

function findExcelFile(): string {
  const dataDir = path.resolve(__dirname, '../../data');
  const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.xlsx') && f.includes('151407'));
  if (!files.length) {
    throw new Error(`No *151407*.xlsx found in ${dataDir}`);
  }
  return path.join(dataDir, files[0]);
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function parseCreatedAt(v: unknown): Date {
  const s = str(v);
  if (!s) return new Date();
  const d = new Date(s.replace(' ', 'T') + '+08:00');
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

type ExcelRow = Record<string, unknown>;

function statusRank(status: string): number {
  // 重复编号时优先保留「租賃中」
  if (status === '租賃中') return 3;
  if (status === '簽約中') return 2;
  if (status === '退租中') return 1;
  return 0;
}

async function main() {
  const file = findExcelFile();
  console.log('Reading', file);

  const wb = XLSX.readFile(file);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<ExcelRow>(sheet, { defval: '' });
  console.log('Excel rows:', rows.length);

  const buildings = await prisma.building.findMany({ select: { id: true, name: true } });
  const buildingByName = new Map(buildings.map((b) => [b.name, b.id]));
  const users = await prisma.user.findMany({ select: { id: true, account: true, displayName: true } });
  const userByLabel = new Map<string, string>();
  for (const u of users) {
    if (u.account.trim()) userByLabel.set(u.account.trim(), u.id);
    if (u.displayName.trim()) userByLabel.set(u.displayName.trim(), u.id);
  }

  const missingBuildings = new Set<string>();
  const unknownStatus = new Set<string>();
  const unmatchedActors = new Set<string>();

  // 按房间编号去重：保留状态优先级更高的；同级保留后者
  const byCode = new Map<string, ExcelRow>();
  for (const row of rows) {
    const code = str(row['房間編號']);
    if (!code) continue;
    const prev = byCode.get(code);
    if (!prev) {
      byCode.set(code, row);
      continue;
    }
    const prevRank = statusRank(str(prev['狀態']));
    const nextRank = statusRank(str(row['狀態']));
    if (nextRank >= prevRank) byCode.set(code, row);
  }

  const payload: Array<{
    roomCode: string;
    name: string;
    roomType: string;
    buildingId: string;
    status: RoomStatus;
    serialNo: string;
    monthlyRent: number;
    dailyRent: number;
    hourlyRent: number;
    sizeSqft: number;
    images: string[];
    description: string | null;
    remark: string | null;
    windowConfig: string | null;
    acConfig: string | null;
    latestContract: string | null;
    createdById: string | null;
    updatedById: string | null;
    createdAt: Date;
    subleaseMark: string | null;
  }> = [];

  for (const row of byCode.values()) {
    const buildingName = str(row['所屬大廈']);
    const buildingId = buildingByName.get(buildingName);
    if (!buildingId) {
      missingBuildings.add(buildingName);
      continue;
    }

    const statusRaw = str(row['狀態']);
    const status = STATUS_MAP[statusRaw];
    if (!status) {
      unknownStatus.add(statusRaw);
      continue;
    }

    const roomCode = str(row['房間編號']);
    const actorLabel = str(row['創建人']);
    const actorId = actorLabel ? userByLabel.get(actorLabel) ?? null : null;
    if (actorLabel && !actorId) unmatchedActors.add(actorLabel);

    payload.push({
      roomCode,
      name: str(row['房間名稱']) || roomCode,
      roomType: str(row['房間類型']),
      buildingId,
      status,
      serialNo: roomCode,
      monthlyRent: num(row['月租']),
      dailyRent: num(row['日租']),
      hourlyRent: num(row['時租']),
      sizeSqft: num(row['房間呎寸']),
      images: [str(row['房間圖片1']), str(row['房間圖片2']), str(row['房間圖片3'])].filter(
        Boolean,
      ),
      description: str(row['房間描述']) || null,
      remark: str(row['備注']) || null,
      windowConfig: str(row['窗']) || null,
      acConfig: str(row['空調']) || null,
      latestContract: str(row['最新合約']) || null,
      createdById: actorId,
      updatedById: actorId,
      createdAt: parseCreatedAt(row['創建時間']),
      subleaseMark: str(row['分租符']) || null,
    });
  }

  if (missingBuildings.size) {
    console.warn('Skipped unknown buildings:', [...missingBuildings]);
  }
  if (unknownStatus.size) {
    console.warn('Skipped unknown status:', [...unknownStatus]);
  }
  if (unmatchedActors.size) {
    console.warn('Unmatched created_by labels (left null):', [...unmatchedActors]);
  }

  console.log('Unique rooms to import:', payload.length);

  // 全量替换本地房间数据（以 Excel 为准）
  const deleted = await prisma.room.deleteMany({});
  console.log('Cleared existing rooms:', deleted.count);

  let inserted = 0;
  for (const item of payload) {
    const { images, ...roomData } = item;
    const room = await prisma.room.create({ data: roomData });
    inserted += 1;
    if (images.length) {
      await prisma.roomImage.createMany({
        data: images.map((storageKey, sortOrder) => ({
          roomId: room.id,
          fileName: storageKey.split('/').pop() || `image${sortOrder + 1}`,
          storageKey,
          sortOrder,
          createdById: roomData.createdById,
          updatedById: roomData.updatedById,
        })),
      });
    }
  }

  const byBuilding = await prisma.room.groupBy({
    by: ['buildingId'],
    _count: { _all: true },
  });
  console.log('Imported rooms:', inserted);
  console.log(
    'By building:',
    byBuilding.map((g) => ({
      buildingId: g.buildingId,
      count: g._count._all,
    })),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
