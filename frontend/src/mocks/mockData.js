/**
 * Leapbud Lease System — 集中 mock 数据（单文件管理）
 * 路径：frontend/src/mocks/mockData.js
 *
 * 来源：
 * - 大廈：data/大廈.xlsx
 * - 房間：开发期示例数据（关联大廈 id）
 *
 * 约定：
 * - 组件可能对列表做 push/splice/替换，getter 一律返回独立副本
 * - 后续接后端 API 时，仅替换 getter 内部实现即可
 */

let _buildings = null
let _rooms = null

function cloneMockItem (item) {
  const out = { ...item }
  for (const [k, v] of Object.entries(out)) {
    if (Array.isArray(v)) out[k] = v.slice()
  }
  return out
}

function cloneMockList (list) {
  return list.map(cloneMockItem)
}

/** 登录演示用户（API 不可用时使用） */
export function createMockUser ({ account, displayName, role = 'admin' } = {}) {
  return {
    id: 'u-demo',
    account: account || 'admin',
    displayName: displayName || 'Demo Admin',
    role,
  }
}

export function createMockToken () {
  return 'mock-token'
}

function ensureBuildings () {
  if (_buildings) return _buildings
  _buildings = [
  {
    "id": "b1",
    "name": "環薈中心",
    "address": "香港九龍荔枝角永康街77號環薈中心",
    "addressEn": "77 Wing Hong Street, lai Chi Kok, Kowloon, Hong Kong",
    "manager": "",
    "managerPhone": "",
    "agreementTemplate": "",
    "agreementLogo": "",
    "apiTemplateSuffix": "ceo06",
    "logo2": "",
    "email": "",
    "workingHours": "Mon-Fri 9am-6pm",
    "invoiceTemplate": "",
    "invoiceLogo": "",
    "fpsId": "",
    "bankAccountHolder": "Leapxen Company Limited",
    "bankAccount": "012-58621488812",
    "chequePaymentBy": "",
    "paymentAdvice": "",
    "receiptTemplate": "",
    "receiptTopLogo": "",
    "receiptLeftLogo": "",
    "receiptRightLogo": "",
    "buildingConfig": "",
    "useWbaNumber": "85265500398"
  },
  {
    "id": "b2",
    "name": "紗廠工業大廈6期3樓",
    "address": "九龍青山道481號香港紗廠工業大廈六期3樓",
    "addressEn": "3/F., PHS 6 HK SPINNERS IND BLDG.NO. 481 CASTLE PEAK ROAD, KLN., H.K.",
    "manager": "黃小姐",
    "managerPhone": "84988116",
    "agreementTemplate": "",
    "agreementLogo": "",
    "apiTemplateSuffix": "6sp",
    "logo2": "",
    "email": "",
    "workingHours": "",
    "invoiceTemplate": "",
    "invoiceLogo": "",
    "fpsId": "117456723",
    "bankAccountHolder": "BOC:01 SQUARE LIMITED",
    "bankAccount": "012-898-2-050261-1",
    "chequePaymentBy": "",
    "paymentAdvice": "",
    "receiptTemplate": "",
    "receiptTopLogo": "",
    "receiptLeftLogo": "",
    "receiptRightLogo": "",
    "buildingConfig": "",
    "useWbaNumber": ""
  },
  {
    "id": "b3",
    "name": "時來工業大廈",
    "address": "荔枝角青山道 497 號時來工業大廈 5 樓",
    "addressEn": "5/F, New Timely Factory Building, 497 Castle Peak Road, Lai Chi Kok, Kowloon. H.K.",
    "manager": "黃小姐",
    "managerPhone": "84898116",
    "agreementTemplate": "",
    "agreementLogo": "",
    "apiTemplateSuffix": "tl5",
    "logo2": "",
    "email": "",
    "workingHours": "",
    "invoiceTemplate": "",
    "invoiceLogo": "",
    "fpsId": "116275025",
    "bankAccountHolder": "Leapbud Management Ltd",
    "bankAccount": "HSBC : 129-496485-001",
    "chequePaymentBy": "",
    "paymentAdvice": "",
    "receiptTemplate": "",
    "receiptTopLogo": "",
    "receiptLeftLogo": "",
    "receiptRightLogo": "",
    "buildingConfig": "",
    "useWbaNumber": ""
  },
  {
    "id": "b4",
    "name": "紗廠工業大廈3樓",
    "address": "長沙灣道香港紗廠工業大廈 5 期 3 樓 C2 室",
    "addressEn": "Flat C2 ., 3/F, Hong Kong Spinners Industrial Building Phase 5, 760-762 Cheung Sha Wan Road , Lai Chi Kok, Kowloon. H.K.",
    "manager": "黃小姐",
    "managerPhone": "84898116",
    "agreementTemplate": "",
    "agreementLogo": "",
    "apiTemplateSuffix": "sp03",
    "logo2": "",
    "email": "",
    "workingHours": "",
    "invoiceTemplate": "",
    "invoiceLogo": "",
    "fpsId": "116831603",
    "bankAccountHolder": "Leapbud Management Ltd",
    "bankAccount": "HSBC:129-496493-001",
    "chequePaymentBy": "",
    "paymentAdvice": "",
    "receiptTemplate": "",
    "receiptTopLogo": "",
    "receiptLeftLogo": "",
    "receiptRightLogo": "",
    "buildingConfig": "",
    "useWbaNumber": ""
  },
  {
    "id": "b5",
    "name": "紗廠工業大廈2樓",
    "address": "長沙灣道760至762號紗廠工業大廈5期 2 樓 D 室",
    "addressEn": "Flat D ., 2/F, Hong Kong Spinners Industrial Building Phase 5, 760-762 Cheung Sha Wan Road , Lai Chi Kok, Kowloon. H.K.",
    "manager": "黃小姐",
    "managerPhone": "84898116",
    "agreementTemplate": "",
    "agreementLogo": "",
    "apiTemplateSuffix": "sp",
    "logo2": "",
    "email": "",
    "workingHours": "",
    "invoiceTemplate": "",
    "invoiceLogo": "",
    "fpsId": "116313404",
    "bankAccountHolder": "Leapbud Management Ltd",
    "bankAccount": "HSBC : 129-496519-001",
    "chequePaymentBy": "",
    "paymentAdvice": "",
    "receiptTemplate": "",
    "receiptTopLogo": "",
    "receiptLeftLogo": "",
    "receiptRightLogo": "",
    "buildingConfig": "",
    "useWbaNumber": ""
  },
  {
    "id": "b6",
    "name": "嘉圖工廠大廈",
    "address": "荔枝角長裕街 2 號嘉圖工廠大廈 9 樓",
    "addressEn": "9/F, Ka To Factory Building, 2 Cheung Yue Street, Lai Chi Kok, Kowloon. H.K.",
    "manager": "黃小姐",
    "managerPhone": "84898116",
    "agreementTemplate": "",
    "agreementLogo": "",
    "apiTemplateSuffix": "kt9",
    "logo2": "",
    "email": "",
    "workingHours": "",
    "invoiceTemplate": "",
    "invoiceLogo": "",
    "fpsId": "116394875",
    "bankAccountHolder": "Leapbud Management Ltd",
    "bankAccount": "HSBC : 129-496501-001",
    "chequePaymentBy": "",
    "paymentAdvice": "",
    "receiptTemplate": "",
    "receiptTopLogo": "",
    "receiptLeftLogo": "",
    "receiptRightLogo": "",
    "buildingConfig": "",
    "useWbaNumber": ""
  },
  {
    "id": "b7",
    "name": "嘉圖工廠大廈_舊賬戶",
    "address": "荔枝角長裕街 2 號嘉圖工廠大廈 9 樓",
    "addressEn": "9/F, Ka To Factory Building, 2 Cheung Yue Street, Lai Chi Kok, Kowloon. H.K.",
    "manager": "黃小姐",
    "managerPhone": "84898116",
    "agreementTemplate": "",
    "agreementLogo": "",
    "apiTemplateSuffix": "kt9",
    "logo2": "",
    "email": "",
    "workingHours": "",
    "invoiceTemplate": "",
    "invoiceLogo": "",
    "fpsId": "105582373",
    "bankAccountHolder": "LEAPSING COMPANY LIMITED",
    "bankAccount": "HSBC : 521-168179-001",
    "chequePaymentBy": "",
    "paymentAdvice": "",
    "receiptTemplate": "",
    "receiptTopLogo": "",
    "receiptLeftLogo": "",
    "receiptRightLogo": "",
    "buildingConfig": "",
    "useWbaNumber": ""
  }
  ]
  for (const b of _buildings) {
    if (b.active == null) b.active = true
  }
  const legacy = _buildings.find((b) => b.id === 'b7')
  if (legacy) legacy.active = false
  return _buildings
}

function ensureRooms () {
  if (_rooms) return _rooms
  _rooms = [
  {
    "id": "r1",
    "roomCode": "HH-0901",
    "name": "環薈會議室 A",
    "roomType": "會議室",
    "buildingId": "b1",
    "buildingName": "環薈中心",
    "status": "idle",
    "serialNo": "RM-1001",
    "monthlyRent": 28000,
    "dailyRent": 1800,
    "hourlyRent": 280,
    "sizeSqft": 420,
    "image1": "/leapbud_logo.png",
    "contractRecords": [],
    "createdBy": "admin",
    "createdAt": "2026-01-15 10:00"
  },
  {
    "id": "r2",
    "roomCode": "HH-0908",
    "name": "環薈辦公室 B",
    "roomType": "辦公室",
    "buildingId": "b1",
    "buildingName": "環薈中心",
    "status": "leased",
    "serialNo": "RM-1002",
    "monthlyRent": 18500,
    "dailyRent": 900,
    "hourlyRent": 150,
    "sizeSqft": 180,
    "image1": "/leapbud_logo.png",
    "contractRecords": [],
    "createdBy": "admin",
    "createdAt": "2026-02-15 10:00"
  },
  {
    "id": "r3",
    "roomCode": "SP6-0301",
    "name": "紗廠6期工位區",
    "roomType": "共享工位",
    "buildingId": "b2",
    "buildingName": "紗廠工業大廈6期3樓",
    "status": "idle",
    "serialNo": "RM-2001",
    "monthlyRent": 3200,
    "dailyRent": 220,
    "hourlyRent": 45,
    "sizeSqft": 45,
    "image1": "/leapbud_logo.png",
    "contractRecords": [],
    "createdBy": "黃小姐",
    "createdAt": "2026-03-15 10:00"
  },
  {
    "id": "r4",
    "roomCode": "TL-0502",
    "name": "時來工作室",
    "roomType": "工作室",
    "buildingId": "b3",
    "buildingName": "時來工業大廈",
    "status": "signing",
    "serialNo": "RM-3001",
    "monthlyRent": 22000,
    "dailyRent": 1400,
    "hourlyRent": 220,
    "sizeSqft": 260,
    "image1": "/leapbud_logo.png",
    "contractRecords": [],
    "createdBy": "黃小姐",
    "createdAt": "2026-04-15 10:00"
  },
  {
    "id": "r5",
    "roomCode": "SP3-C2",
    "name": "紗廠3樓辦公室",
    "roomType": "辦公室",
    "buildingId": "b4",
    "buildingName": "紗廠工業大廈3樓",
    "status": "terminating",
    "serialNo": "RM-4001",
    "monthlyRent": 16800,
    "dailyRent": 850,
    "hourlyRent": 140,
    "sizeSqft": 160,
    "image1": "/leapbud_logo.png",
    "contractRecords": [],
    "createdBy": "黃小姐",
    "createdAt": "2026-05-15 10:00"
  },
  {
    "id": "r6",
    "roomCode": "SP2-D01",
    "name": "紗廠2樓會議室",
    "roomType": "會議室",
    "buildingId": "b5",
    "buildingName": "紗廠工業大廈2樓",
    "status": "idle",
    "serialNo": "RM-5001",
    "monthlyRent": 35000,
    "dailyRent": 2400,
    "hourlyRent": 360,
    "sizeSqft": 520,
    "image1": "/leapbud_logo.png",
    "contractRecords": [],
    "createdBy": "黃小姐",
    "createdAt": "2026-06-15 10:00"
  },
  {
    "id": "r7",
    "roomCode": "KT-0901",
    "name": "嘉圖辦公室 A",
    "roomType": "辦公室",
    "buildingId": "b6",
    "buildingName": "嘉圖工廠大廈",
    "status": "idle",
    "serialNo": "RM-6001",
    "monthlyRent": 15000,
    "dailyRent": 800,
    "hourlyRent": 120,
    "sizeSqft": 140,
    "image1": "/leapbud_logo.png",
    "contractRecords": [],
    "createdBy": "黃小姐",
    "createdAt": "2026-07-15 10:00"
  }
]
  return _rooms
}

export function getMockBuildings () {
  return cloneMockList(ensureBuildings())
}

export function getMockRooms () {
  return cloneMockList(ensureRooms())
}

export function getMockBuildingById (id) {
  const hit = ensureBuildings().find((b) => b.id === id)
  return hit ? cloneMockItem(hit) : null
}

export function getMockRoomsByBuildingId (buildingId) {
  return cloneMockList(ensureRooms().filter((r) => r.buildingId === buildingId))
}
