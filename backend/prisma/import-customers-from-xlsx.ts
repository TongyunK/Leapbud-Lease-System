/**
 * 从 data/客戶信息.xlsx + data/使用者.xlsx 导入客户与使用者
 * 用法（在 backend 目录）：
 *   npm run prisma:import-customers
 */
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type ExcelRow = Record<string, unknown>;

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function parseDate(v: unknown): Date | undefined {
  const s = str(v);
  if (!s) return undefined;
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + '+08:00');
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function dataPath(...parts: string[]) {
  return path.resolve(__dirname, '../../data', ...parts);
}

async function loadUserIdResolver() {
  const users = await prisma.user.findMany({ select: { id: true, account: true, displayName: true } });
  const byKey = new Map<string, string>();
  for (const u of users) {
    if (u.account.trim()) byKey.set(u.account.trim(), u.id);
    if (u.displayName.trim()) byKey.set(u.displayName.trim(), u.id);
  }
  return (label: string): string | null => {
    const key = label.trim();
    if (!key) return null;
    return byKey.get(key) ?? null;
  };
}

async function importCustomers() {
  const file = dataPath('客戶信息.xlsx');
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  console.log('Reading', file);

  const wb = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json<ExcelRow>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  console.log('Customer excel rows:', rows.length);

  const buildings = await prisma.building.findMany({ select: { id: true, name: true } });
  const buildingByName = new Map(buildings.map((b) => [b.name.trim(), b.id]));
  const missingBuildings = new Set<string>();
  const resolveUserId = await loadUserIdResolver();
  const unmatchedActors = new Set<string>();

  let upserted = 0;
  for (const row of rows) {
    const customerCode = str(row['客戶編號']);
    const name = str(row['客戶名稱']);
    if (!customerCode || !name) continue;

    const buildingName = str(row['所屬大廈']);
    const buildingId = buildingName ? buildingByName.get(buildingName) : undefined;
    if (buildingName && !buildingId) missingBuildings.add(buildingName);

    const actorLabel = str(row['創建人']);
    const actorId = resolveUserId(actorLabel);
    if (actorLabel && !actorId) unmatchedActors.add(actorLabel);

    const managerLabel = str(row['客戶經理']);
    const managerId = resolveUserId(managerLabel);
    if (managerLabel && !managerId) unmatchedActors.add(managerLabel);

    const createdAt = parseDate(row['創建時間'] || row['Created At']);
    const updatedAt = parseDate(row['Updated At'] || row['創建時間']);

    await prisma.customer.upsert({
      where: { customerCode },
      create: {
        customerCode,
        name,
        status: str(row['狀態']),
        accountManagerId: managerId,
        companyNameZh: str(row['公司名稱（中文）']),
        companyNameEn: str(row['公司名稱（英文）']),
        businessRegNo: str(row['商業登記號碼']),
        businessNature: str(row['業務性質']),
        businessRegCopy: str(row['商業登記副本']),
        remark: str(row['備注']),
        source: str(row['客戶來源']),
        rentedRooms: str(row['在租房間']),
        buildingId: buildingId ?? null,
        createdById: actorId,
        updatedById: actorId,
        ...(createdAt ? { createdAt } : {}),
        ...(updatedAt ? { updatedAt } : {}),
      },
      update: {
        name,
        status: str(row['狀態']),
        accountManagerId: managerId,
        companyNameZh: str(row['公司名稱（中文）']),
        companyNameEn: str(row['公司名稱（英文）']),
        businessRegNo: str(row['商業登記號碼']),
        businessNature: str(row['業務性質']),
        businessRegCopy: str(row['商業登記副本']),
        remark: str(row['備注']),
        source: str(row['客戶來源']),
        rentedRooms: str(row['在租房間']),
        buildingId: buildingId ?? null,
        ...(actorId ? { updatedById: actorId } : {}),
        ...(updatedAt ? { updatedAt } : {}),
      },
    });
    upserted += 1;
  }
  console.log('Customers upserted:', upserted);
  if (missingBuildings.size) {
    console.warn('Unmatched building names:', [...missingBuildings]);
  }
  if (unmatchedActors.size) {
    console.warn('Unmatched user labels (created_by / account_manager left null):', [
      ...unmatchedActors,
    ]);
  }
}

async function importOccupants() {
  const file = dataPath('使用者.xlsx');
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  console.log('Reading', file);

  const wb = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json<ExcelRow>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  console.log('Occupant excel rows:', rows.length);

  const customers = await prisma.customer.findMany({
    select: { id: true, customerCode: true, name: true },
  });
  const byCode = new Map(customers.map((c) => [c.customerCode, c]));
  const resolveUserId = await loadUserIdResolver();

  // 清空后全量重导（使用者表较小，避免姓名重复难匹配）
  await prisma.occupant.deleteMany();

  let created = 0;
  let unlinked = 0;
  for (const row of rows) {
    const name = str(row['姓名']);
    if (!name) continue;
    const customerCode = str(row['客戶編號']);
    const customer = customerCode ? byCode.get(customerCode) : undefined;
    if (!customer) unlinked += 1;

    const actorId = resolveUserId(str(row['創建人']));
    const createdAt = parseDate(row['創建時間']);
    await prisma.occupant.create({
      data: {
        name,
        customerId: customer?.id ?? null,
        customerCode: customer?.customerCode || customerCode,
        relatedCustomerName: str(row['關聯客戶']) || customer?.name || '',
        whatsapp: str(row['Whatsapp號碼（需加上區號）']),
        mobilePhone: str(row['手提電話']),
        contactPhone: str(row['聯絡電話']),
        email: str(row['電郵']),
        fax: str(row['傳真']),
        address: str(row['通訊地址']),
        idCardNo: str(row['身份證號碼']),
        idCardImage: str(row['身份證圖片']),
        addressProofCopy: str(row['住址証明副本']),
        remark: str(row['備注']),
        createdById: actorId,
        updatedById: actorId,
        ...(createdAt ? { createdAt } : {}),
      },
    });
    created += 1;
  }
  console.log('Occupants created:', created, '(unlinked to customer:', unlinked + ')');
}

/** 导入后：为尚无主要使用者的客户回填 primaryOccupantId */
async function backfillPrimaryOccupants() {
  const customers = await prisma.customer.findMany({
    where: { primaryOccupantId: null },
    select: { id: true },
  });
  let updated = 0;
  for (const c of customers) {
    const occ = await prisma.occupant.findFirst({
      where: { customerId: c.id },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    if (!occ) continue;
    await prisma.customer.update({
      where: { id: c.id },
      data: { primaryOccupantId: occ.id },
    });
    updated += 1;
  }
  console.log('Customers primaryOccupant backfilled:', updated);
}

async function main() {
  await importCustomers();
  await importOccupants();
  await backfillPrimaryOccupants();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
