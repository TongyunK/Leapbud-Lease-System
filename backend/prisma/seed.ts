import { PrismaClient, RoomStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const buildings = [
  {
    id: 'b1',
    name: '環薈中心',
    address: '香港九龍荔枝角永康街77號環薈中心',
    addressEn: '77 Wing Hong Street, lai Chi Kok, Kowloon, Hong Kong',
    agreementTemplate:
      '/upload/project/6690fb969f515600ad6667bd/main/file/20260610/1781072979705_環薈中心 協議書2.0 20260427.xlsx',
    apiTemplateSuffix: 'ceo06',
    workingHours: 'Mon-Fri 9am-6pm',
    invoiceTemplate:
      '/upload/project/6690fb969f515600ad6667bd/main/file/20260427/1777271389655_INVOICE_ROOM.xlsx',
    bankAccountHolder: 'Leapxen Company Limited',
    bankAccount: '012-58621488812',
    receiptTemplate:
      '/upload/project/6690fb969f515600ad6667bd/main/file/20260430/1777515570961_收据D118.xlsx',
    useWbaNumber: '85265500398',
    email: '',
    manager: '',
    managerPhone: '',
  },
  {
    id: 'b2',
    name: '紗廠工業大廈6期3樓',
    address: '九龍青山道481號香港紗廠工業大廈六期3樓',
    addressEn: '3/F., PHS 6 HK SPINNERS IND BLDG.NO. 481 CASTLE PEAK ROAD, KLN., H.K.',
    manager: '黃小姐',
    managerPhone: '84988116',
    agreementTemplate:
      '/upload/project/6690fb969f515600ad6667bd/main/file/20260320/1773990687060_紗廠6期3樓協議書1.0-20251024.xlsx',
    apiTemplateSuffix: '6sp',
    invoiceTemplate:
      '/upload/project/6690fb969f515600ad6667bd/main/file/20250509/1746754753774_複本 紗廠6期INV_2(3).xlsx',
    fpsId: '117456723',
    bankAccountHolder: 'BOC:01 SQUARE LIMITED',
    bankAccount: '012-898-2-050261-1',
    receiptTemplate:
      '/upload/project/6690fb969f515600ad6667bd/main/file/20250728/1753671263303_紗廠6期收據.xlsx',
    email: '',
    workingHours: '',
  },
  {
    id: 'b3',
    name: '時來工業大廈',
    address: '荔枝角青山道 497 號時來工業大廈 5 樓',
    addressEn: '5/F, New Timely Factory Building, 497 Castle Peak Road, Lai Chi Kok, Kowloon. H.K.',
    manager: '黃小姐',
    managerPhone: '84898116',
    agreementTemplate:
      '/upload/project/6690fb969f515600ad6667bd/main/file/20260320/1773991111083_時來工業大廈 協議書3.0 20260320.xlsx',
    apiTemplateSuffix: 'tl5',
    invoiceTemplate:
      '/upload/project/6690fb969f515600ad6667bd/main/file/20250609/1749438299917_INVOICE_ROOM.xlsx',
    fpsId: '116275025',
    bankAccountHolder: 'Leapbud Management Ltd',
    bankAccount: 'HSBC : 129-496485-001',
    chequePaymentBy:
      'The crossed cheque should make payable to " Leapbud Management Limited " and send to Rm.SP57 Flat D, 2/F., HONG KONG SPINNERS INDUSTRIAL BUILDING PHASE 5, 760-762 CHEUNG SHA WAN ROAD, LAI CHI KOK, KLN.',
    paymentAdvice:
      'Leapbud Management Limited\n5/F NEW TIMELY FACTORY BUILDING\nNO.497 CASTLE PEAK ROAD KOWLOON',
    receiptTemplate:
      '/upload/project/6690fb969f515600ad6667bd/main/file/20250401/1743475634462_1737601364667_1724004313867_1723797768710_收据D118.xlsx',
    email: '',
    workingHours: '',
  },
  {
    id: 'b4',
    name: '紗廠工業大廈3樓',
    address: '長沙灣道香港紗廠工業大廈 5 期 3 樓 C2 室',
    addressEn:
      'Flat C2 ., 3/F, Hong Kong Spinners Industrial Building Phase 5, 760-762 Cheung Sha Wan Road , Lai Chi Kok, Kowloon. H.K.',
    manager: '黃小姐',
    managerPhone: '84898116',
    agreementTemplate:
      '/upload/project/6690fb969f515600ad6667bd/main/file/20260320/1773991122049_紗廠3樓 協議書 3.0 20260320.xlsx',
    apiTemplateSuffix: 'sp03',
    invoiceTemplate:
      '/upload/project/6690fb969f515600ad6667bd/main/file/20250609/1749438313418_INVOICE_ROOM.xlsx',
    fpsId: '116831603',
    bankAccountHolder: 'Leapbud Management Ltd',
    bankAccount: 'HSBC:129-496493-001',
    chequePaymentBy:
      'The crossed cheque should make payable to " Leapbud Management Limited " and send to Rm.SP57 Flat D, 2/F., HONG KONG SPINNERS INDUSTRIAL BUILDING PHASE 5, 760-762 CHEUNG SHA WAN ROAD, LAI CHI KOK, KLN.',
    paymentAdvice:
      'Leapbud Management Limited\nUnit D 2/F Hong Kong Spinners Industrial \nBuilding Phase V\n760-762 Cheung Sha Wan Road\nKOWLOON\nHONG KONG',
    receiptTemplate:
      '/upload/project/6690fb969f515600ad6667bd/main/file/20250401/1743475663440_1737601364667_1724004313867_1723797768710_收据D118.xlsx',
    email: '',
    workingHours: '',
  },
  {
    id: 'b5',
    name: '紗廠工業大廈2樓',
    address: '長沙灣道760至762號紗廠工業大廈5期 2 樓 D 室',
    addressEn:
      'Flat D ., 2/F, Hong Kong Spinners Industrial Building Phase 5, 760-762 Cheung Sha Wan Road , Lai Chi Kok, Kowloon. H.K.',
    manager: '黃小姐',
    managerPhone: '84898116',
    agreementTemplate:
      '/upload/project/6690fb969f515600ad6667bd/main/file/20260320/1773991228829_紗廠2樓 協議書3.0 20260320.xlsx',
    apiTemplateSuffix: 'sp',
    invoiceTemplate:
      '/upload/project/6690fb969f515600ad6667bd/main/file/20250609/1749438386554_INVOICE_ROOM.xlsx',
    fpsId: '116313404',
    bankAccountHolder: 'Leapbud Management Ltd',
    bankAccount: 'HSBC : 129-496519-001',
    chequePaymentBy:
      'The crossed cheque should make payable to " Leapbud Management Limited " and send to Flat D, 2/F., HONG KONG SPINNERS INDUSTRIAL BUILDING PHASE 5, 760-762 CHEUNG SHA WAN ROAD, LAI CHI KOK, KLN.,',
    paymentAdvice:
      'Leapbud Management Limited\nUnit D, 2/F., Hong Kong Spinners Industrial \nBuilding Phase 5,\n760-762 Cheung Sha Wan Road\nLAI CHI KOK, KLN\nHONG KONG',
    receiptTemplate:
      '/upload/project/6690fb969f515600ad6667bd/main/file/20250401/1743475670050_1737601364667_1724004313867_1723797768710_收据D118.xlsx',
    email: '',
    workingHours: '',
  },
  {
    id: 'b6',
    name: '嘉圖工廠大廈',
    address: '荔枝角長裕街 2 號嘉圖工廠大廈 9 樓',
    addressEn: '9/F, Ka To Factory Building, 2 Cheung Yue Street, Lai Chi Kok, Kowloon. H.K.',
    manager: '黃小姐',
    managerPhone: '84898116',
    agreementTemplate:
      '/upload/project/6690fb969f515600ad6667bd/main/file/20260320/1773991136354_嘉圖協議書-2024版 3.0 20260320.xlsx',
    apiTemplateSuffix: 'kt9',
    invoiceTemplate:
      '/upload/project/6690fb969f515600ad6667bd/main/file/20250609/1749438400679_INVOICE_ROOM.xlsx',
    fpsId: '116394875',
    bankAccountHolder: 'Leapbud Management Ltd',
    bankAccount: 'HSBC : 129-496501-001',
    chequePaymentBy:
      'The crossed cheque should make payable to " Leapbud Management Limited " and send to Rm.SP57 Flat D, 2/F., HONG KONG SPINNERS INDUSTRIAL BUILDING PHASE 5, 760-762 CHEUNG SHA WAN ROAD, LAI CHI KOK, KLN.',
    paymentAdvice:
      'LEAPSING COMPANY LIMITED\n9/F, Ka To Factory Building,\n2 CHEUNG YUE STREET, LAI CHI KOK,\nKOWLOON.',
    receiptTemplate:
      '/upload/project/6690fb969f515600ad6667bd/main/file/20250401/1743475692421_1737601364667_1724004313867_1723797768710_收据D118.xlsx',
    email: '',
    workingHours: '',
  },
  {
    id: 'b7',
    name: '嘉圖工廠大廈_舊賬戶',
    address: '荔枝角長裕街 2 號嘉圖工廠大廈 9 樓',
    addressEn: '9/F, Ka To Factory Building, 2 Cheung Yue Street, Lai Chi Kok, Kowloon. H.K.',
    manager: '黃小姐',
    managerPhone: '84898116',
    agreementTemplate:
      '/upload/project/6690fb969f515600ad6667bd/main/file/20260320/1773991147419_嘉圖協議書-2024版 (2) - 副本.xlsx',
    apiTemplateSuffix: 'kt9',
    invoiceTemplate:
      '/upload/project/6690fb969f515600ad6667bd/main/file/20250328/1743130958303_INVOICE_ROOM.xlsx',
    fpsId: '105582373',
    bankAccountHolder: 'LEAPSING COMPANY LIMITED',
    bankAccount: 'HSBC : 521-168179-001',
    chequePaymentBy:
      'The crossed cheque should make payable to " LEAPSING COMPANY LIMITED " and send to Rm.SP57 Flat D, 2/F., HONG KONG SPINNERS INDUSTRIAL BUILDING PHASE 5, 760-762 CHEUNG SHA WAN ROAD, LAI CHI KOK, KLN.',
    paymentAdvice:
      'LEAPSING COMPANY LIMITED\n9/F, Ka To Factory Building,\n2 CHEUNG YUE STREET, LAI CHI KOK,\nKOWLOON.',
    receiptTemplate:
      '/upload/project/6690fb969f515600ad6667bd/main/file/20250401/1743475699376_1737601364667_1724004313867_1723797768710_收据D118.xlsx',
    email: '',
    workingHours: '',
    active: false,
  },
];

const rooms: Array<{
  id: string;
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
  image1?: string;
  createdBy: string;
  createdAt: Date;
}> = [
  {
    id: 'r1',
    roomCode: 'HH-0901',
    name: '環薈會議室 A',
    roomType: '會議室',
    buildingId: 'b1',
    status: RoomStatus.idle,
    serialNo: 'RM-1001',
    monthlyRent: 28000,
    dailyRent: 1800,
    hourlyRent: 280,
    sizeSqft: 420,
    image1: '/leapbud_logo.png',
    createdBy: 'admin',
    createdAt: new Date('2026-01-15T10:00:00+08:00'),
  },
  {
    id: 'r2',
    roomCode: 'HH-0908',
    name: '環薈辦公室 B',
    roomType: '辦公室',
    buildingId: 'b1',
    status: RoomStatus.leased,
    serialNo: 'RM-1002',
    monthlyRent: 18500,
    dailyRent: 900,
    hourlyRent: 150,
    sizeSqft: 180,
    image1: '/leapbud_logo.png',
    createdBy: 'admin',
    createdAt: new Date('2026-02-15T10:00:00+08:00'),
  },
  {
    id: 'r3',
    roomCode: 'SP6-0301',
    name: '紗廠6期工位區',
    roomType: '共享工位',
    buildingId: 'b2',
    status: RoomStatus.idle,
    serialNo: 'RM-2001',
    monthlyRent: 3200,
    dailyRent: 220,
    hourlyRent: 45,
    sizeSqft: 45,
    image1: '/leapbud_logo.png',
    createdBy: '黃小姐',
    createdAt: new Date('2026-03-15T10:00:00+08:00'),
  },
  {
    id: 'r4',
    roomCode: 'TL-0502',
    name: '時來工作室',
    roomType: '工作室',
    buildingId: 'b3',
    status: RoomStatus.signing,
    serialNo: 'RM-3001',
    monthlyRent: 22000,
    dailyRent: 1400,
    hourlyRent: 220,
    sizeSqft: 260,
    image1: '/leapbud_logo.png',
    createdBy: '黃小姐',
    createdAt: new Date('2026-04-15T10:00:00+08:00'),
  },
  {
    id: 'r5',
    roomCode: 'SP3-C2',
    name: '紗廠3樓辦公室',
    roomType: '辦公室',
    buildingId: 'b4',
    status: RoomStatus.terminating,
    serialNo: 'RM-4001',
    monthlyRent: 16800,
    dailyRent: 850,
    hourlyRent: 140,
    sizeSqft: 160,
    image1: '/leapbud_logo.png',
    createdBy: '黃小姐',
    createdAt: new Date('2026-05-15T10:00:00+08:00'),
  },
  {
    id: 'r6',
    roomCode: 'SP2-D01',
    name: '紗廠2樓會議室',
    roomType: '會議室',
    buildingId: 'b5',
    status: RoomStatus.idle,
    serialNo: 'RM-5001',
    monthlyRent: 35000,
    dailyRent: 2400,
    hourlyRent: 360,
    sizeSqft: 520,
    image1: '/leapbud_logo.png',
    createdBy: '黃小姐',
    createdAt: new Date('2026-06-15T10:00:00+08:00'),
  },
  {
    id: 'r7',
    roomCode: 'KT-0901',
    name: '嘉圖辦公室 A',
    roomType: '辦公室',
    buildingId: 'b6',
    status: RoomStatus.idle,
    serialNo: 'RM-6001',
    monthlyRent: 15000,
    dailyRent: 800,
    hourlyRent: 120,
    sizeSqft: 140,
    image1: '/leapbud_logo.png',
    createdBy: '黃小姐',
    createdAt: new Date('2026-07-15T10:00:00+08:00'),
  },
];

async function main() {
  for (const b of buildings) {
    await prisma.building.upsert({
      where: { id: b.id },
      create: b,
      update: b,
    });
  }

  for (const r of rooms) {
    await prisma.room.upsert({
      where: { id: r.id },
      create: r,
      update: r,
    });
  }

  const adminHash = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { account: 'admin' },
    create: {
      account: 'admin',
      passwordHash: adminHash,
      displayName: 'Demo Admin',
      role: 'admin',
      status: 'active',
      email: 'admin@leapbud.local',
    },
    update: {
      passwordHash: adminHash,
      displayName: 'Demo Admin',
      role: 'admin',
      status: 'active',
    },
  });

  const userHash = await bcrypt.hash('user123', 10);
  await prisma.user.upsert({
    where: { account: 'user' },
    create: {
      account: 'user',
      passwordHash: userHash,
      displayName: 'Demo User',
      role: 'user',
      status: 'active',
      phone: '91234567',
    },
    update: {
      passwordHash: userHash,
      displayName: 'Demo User',
      role: 'user',
      status: 'active',
    },
  });

  // 迁移旧演示账号 staff → user（若仍存在）
  await prisma.user.deleteMany({ where: { account: 'staff' } });

  const configCount = await prisma.roomConfigOption.count();
  if (configCount === 0) {
    await prisma.roomConfigOption.createMany({
      data: [
        { type: 'size', label: '300呎以上', minSqft: 300, maxSqft: null, sortOrder: 1 },
        { type: 'size', label: '250-300呎', minSqft: 250, maxSqft: 300, sortOrder: 2 },
        { type: 'size', label: '200-250呎', minSqft: 200, maxSqft: 250, sortOrder: 3 },
        { type: 'size', label: '150-200呎', minSqft: 150, maxSqft: 200, sortOrder: 4 },
        { type: 'size', label: '150呎以下', minSqft: null, maxSqft: 150, sortOrder: 5 },
        { type: 'window', label: '無窗', sortOrder: 1 },
        { type: 'window', label: '1扇窗', sortOrder: 2 },
        { type: 'window', label: '2扇窗', sortOrder: 3 },
        { type: 'window', label: '3扇窗', sortOrder: 4 },
        { type: 'window', label: '4扇窗', sortOrder: 5 },
        { type: 'ac', label: '獨立免費冷氣', sortOrder: 1 },
        { type: 'ac', label: '半中央冷氣', sortOrder: 2 },
        {
          type: 'ac',
          label: '獨立收費冷氣',
          brand: '美的',
          model: 'X1',
          sortOrder: 3,
        },
      ],
    });
  }

  const roomTypeCount = await prisma.roomTypeOption.count();
  if (roomTypeCount === 0) {
    await prisma.roomTypeOption.createMany({
      data: [
        { label: '辦公室', tone: 'office', hint: '日常辦公空間', sortOrder: 1 },
        { label: '會議室', tone: 'meeting', hint: '會議 / 洽談空間', sortOrder: 2 },
      ],
    });
  }

  const configs = await prisma.roomConfigOption.count();
  const roomTypes = await prisma.roomTypeOption.count();
  console.log(
    `Seeded ${buildings.length} buildings, ${rooms.length} rooms, 2 users, ${configs} room configs, ${roomTypes} room types`,
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
