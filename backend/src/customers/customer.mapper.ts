import type { Building, Customer, DocumentTemplate, Occupant } from '@prisma/client';
import { auditActorLabel, auditUserInclude, auditUserSelect, type AuditUserRef } from '../common/audit';

function iso(d: Date) {
  return d.toISOString();
}

export type PrimaryOccupantRef = Pick<
  Occupant,
  | 'id'
  | 'name'
  | 'whatsapp'
  | 'mobilePhone'
  | 'contactPhone'
  | 'email'
  | 'fax'
  | 'address'
  | 'idCardNo'
  | 'idCardImage'
  | 'addressProofCopy'
  | 'remark'
>;

export type CustomerWithRelations = Customer & {
  _count?: {
    occupants: number;
    requirements: number;
    contracts: number;
    invoices: number;
    receivables: number;
    receipts: number;
    leaseTerminations: number;
    depositRefunds: number;
  };
  building?: Pick<Building, 'id' | 'name'> | null;
  agreementTemplate?: Pick<DocumentTemplate, 'id' | 'name'> | null;
  accountManagerUser?: AuditUserRef | null;
  primaryOccupant?: Partial<PrimaryOccupantRef> & Pick<Occupant, 'id' | 'name'> | null;
  createdByUser?: AuditUserRef | null;
  updatedByUser?: AuditUserRef | null;
};

export type OccupantWithCustomer = Occupant & {
  customer?: Pick<Customer, 'id' | 'customerCode' | 'name'> | null;
  createdByUser?: AuditUserRef | null;
  updatedByUser?: AuditUserRef | null;
};

const primaryOccupantSelect = {
  id: true,
  name: true,
  whatsapp: true,
  mobilePhone: true,
  contactPhone: true,
  email: true,
  fax: true,
  address: true,
  idCardNo: true,
  idCardImage: true,
  addressProofCopy: true,
  remark: true,
} as const;

/** 列表用：主要使用者只带展示字段，减小载荷 */
const primaryOccupantListSelect = {
  id: true,
  name: true,
  whatsapp: true,
  mobilePhone: true,
  email: true,
} as const;

/** 客户关联子表计数（列表/详情共用） */
const customerCountSelect = {
  occupants: true,
  requirements: true,
  contracts: true,
  invoices: true,
  receivables: true,
  receipts: true,
  leaseTerminations: true,
  depositRefunds: true,
} as const;

const customerInclude = {
  _count: { select: customerCountSelect },
  building: { select: { id: true, name: true } },
  agreementTemplate: { select: { id: true, name: true } },
  accountManagerUser: { select: auditUserSelect },
  primaryOccupant: { select: primaryOccupantSelect },
  ...auditUserInclude,
} as const;

const customerListInclude = {
  _count: { select: customerCountSelect },
  building: { select: { id: true, name: true } },
  agreementTemplate: { select: { id: true, name: true } },
  accountManagerUser: { select: auditUserSelect },
  primaryOccupant: { select: primaryOccupantListSelect },
  ...auditUserInclude,
} as const;

const occupantInclude = {
  customer: { select: { id: true, customerCode: true, name: true } },
  ...auditUserInclude,
} as const;

/** 下拉/远程搜索用轻量字段 */
const occupantLiteSelect = {
  id: true,
  name: true,
  customerId: true,
  customerCode: true,
  relatedCustomerName: true,
  whatsapp: true,
  mobilePhone: true,
  email: true,
  customer: { select: { id: true, customerCode: true, name: true } },
} as const;

export {
  customerInclude,
  customerListInclude,
  occupantInclude,
  occupantLiteSelect,
  primaryOccupantSelect,
  primaryOccupantListSelect,
};

function toPrimaryOccupantDto(
  row:
    | PrimaryOccupantRef
    | {
        id: string
        name: string
        whatsapp?: string
        mobilePhone?: string
        contactPhone?: string
        email?: string
        fax?: string
        address?: string
        idCardNo?: string
        idCardImage?: string
        addressProofCopy?: string
        remark?: string
      }
    | null
    | undefined,
) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    whatsapp: row.whatsapp ?? '',
    mobilePhone: row.mobilePhone ?? '',
    contactPhone: row.contactPhone ?? '',
    email: row.email ?? '',
    fax: row.fax ?? '',
    address: row.address ?? '',
    idCardNo: row.idCardNo ?? '',
    idCardImage: row.idCardImage ?? '',
    addressProofCopy: row.addressProofCopy ?? '',
    remark: row.remark ?? '',
  };
}

export function toCustomerDto(row: CustomerWithRelations) {
  const primaryOccupant = toPrimaryOccupantDto(row.primaryOccupant);
  return {
    id: row.id,
    customerCode: row.customerCode,
    name: row.name,
    status: row.status,
    accountManagerId: row.accountManagerId,
    accountManager: auditActorLabel(row.accountManagerUser),
    companyNameZh: row.companyNameZh,
    companyNameEn: row.companyNameEn,
    businessRegNo: row.businessRegNo,
    businessNature: row.businessNature,
    businessRegCopy: row.businessRegCopy,
    remark: row.remark,
    source: row.source,
    rentedRooms: row.rentedRooms,
    buildingId: row.buildingId,
    buildingName: row.building?.name ?? '',
    agreementTemplateId: row.agreementTemplateId,
    agreementTemplateName: row.agreementTemplate?.name ?? '',
    primaryOccupantId: row.primaryOccupantId,
    primaryOccupant,
    /** 列表展示：主要联络人姓名（来自主要使用者） */
    primaryContact: primaryOccupant?.name ?? '',
    mobilePhone: primaryOccupant?.mobilePhone ?? '',
    occupantCount: row._count?.occupants ?? 0,
    requirementCount: row._count?.requirements ?? 0,
    contractCount: row._count?.contracts ?? 0,
    invoiceCount: row._count?.invoices ?? 0,
    receivableCount: row._count?.receivables ?? 0,
    receiptCount: row._count?.receipts ?? 0,
    terminationCount: row._count?.leaseTerminations ?? 0,
    depositRefundCount: row._count?.depositRefunds ?? 0,
    createdBy: auditActorLabel(row.createdByUser),
    updatedBy: auditActorLabel(row.updatedByUser),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toOccupantDto(row: OccupantWithCustomer) {
  return {
    id: row.id,
    name: row.name,
    customerId: row.customerId,
    customerCode: row.customerCode || row.customer?.customerCode || '',
    customerName: row.customer?.name || row.relatedCustomerName || '',
    relatedCustomerName: row.relatedCustomerName,
    whatsapp: row.whatsapp,
    mobilePhone: row.mobilePhone,
    contactPhone: row.contactPhone,
    email: row.email,
    fax: row.fax,
    address: row.address,
    idCardNo: row.idCardNo,
    idCardImage: row.idCardImage,
    addressProofCopy: row.addressProofCopy,
    remark: row.remark,
    createdBy: auditActorLabel(row.createdByUser),
    updatedBy: auditActorLabel(row.updatedByUser),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

/** 下拉选项轻量 DTO */
export function toOccupantLiteDto(row: {
  id: string;
  name: string;
  customerId: string | null;
  customerCode: string;
  relatedCustomerName: string;
  whatsapp: string;
  mobilePhone: string;
  email: string;
  customer?: Pick<Customer, 'id' | 'customerCode' | 'name'> | null;
}) {
  return {
    id: row.id,
    name: row.name,
    customerId: row.customerId,
    customerCode: row.customerCode || row.customer?.customerCode || '',
    customerName: row.customer?.name || row.relatedCustomerName || '',
    relatedCustomerName: row.relatedCustomerName,
    whatsapp: row.whatsapp,
    mobilePhone: row.mobilePhone,
    contactPhone: '',
    email: row.email,
    fax: '',
    address: '',
    idCardNo: '',
    idCardImage: '',
    addressProofCopy: '',
    remark: '',
    createdBy: '',
    updatedBy: '',
    createdAt: '',
    updatedAt: '',
  };
}
