import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentTemplateType, Prisma } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { runBatchRemove } from '../common/batch-delete';
import {
  documentTemplateInclude,
  toDocumentTemplateDto,
} from './document-template.mapper';
import {
  CreateDocumentTemplateDto,
  UpdateDocumentTemplateDto,
} from './dto/document-template.dto';
import { convertDocxToPdf, invalidatePdfCache, warmUpLibreOffice } from './pdf-convert.util';

function s(v?: string | null) {
  return (v ?? '').trim();
}

function uploadsRoot() {
  return path.join(process.cwd(), 'uploads');
}

/**
 * multer/busboy 常把 UTF-8 文件名按 latin1 解码，导致「合约模板」变成「åçº¦…」。
 * 若原文无中文、转回 UTF-8 后有中文，则采用修复结果。
 */
function decodeMulterFilename(name: string): string {
  const raw = s(name);
  if (!raw) return raw;
  try {
    const decoded = Buffer.from(raw, 'latin1').toString('utf8');
    if (decoded.includes('\uFFFD')) return raw;
    const rawHasCjk = /[\u4e00-\u9fff]/.test(raw);
    const decodedHasCjk = /[\u4e00-\u9fff]/.test(decoded);
    if (!rawHasCjk && decodedHasCjk) return decoded;
    return raw;
  } catch {
    return raw;
  }
}

/** 磁盘路径：uploads/document-templates/{templateId}/{fileName}，允许不同模板同名文件 */
function storageKeyForTemplate(templateId: string, fileName: string) {
  const id = s(templateId);
  const base = path.basename(s(fileName));
  if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
    throw new BadRequestException('非法模板 ID');
  }
  if (!base || base.includes('..') || base.includes('/') || base.includes('\\')) {
    throw new BadRequestException('非法文件名');
  }
  return `document-templates/${id}/${base}`;
}

function assertDocxFile(file?: Express.Multer.File | null) {
  if (!file?.buffer?.length) {
    throw new BadRequestException('请上传 .docx 模板文件');
  }
  const original = decodeMulterFilename(file.originalname) || 'template.docx';
  const ext = path.extname(original).toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  const okExt = ext === '.docx';
  const okMime =
    !mime ||
    mime.includes('officedocument.wordprocessingml') ||
    mime === 'application/octet-stream' ||
    mime === 'application/zip';
  if (!okExt || !okMime) {
    throw new BadRequestException('仅支持 .docx 文件');
  }
  const fileName = path.basename(original);
  if (!fileName || fileName.includes('..')) {
    throw new BadRequestException('非法文件名');
  }
  return { fileName, buffer: file.buffer };
}

@Injectable()
export class DocumentTemplatesService {
  constructor(private readonly prisma: PrismaService) {
    warmUpLibreOffice();
  }

  private absPath(storageKey: string) {
    return path.join(uploadsRoot(), storageKey);
  }

  private async writeTemplateFile(id: string, fileName: string, buffer: Buffer) {
    const storageKey = storageKeyForTemplate(id, fileName);
    const abs = this.absPath(storageKey);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buffer);
    invalidatePdfCache(`tpl:${id}:`);
    return storageKey;
  }

  private async removeStoredFile(storageKey: string, exceptId?: string) {
    if (!storageKey) return;
    const stillUsed = await this.prisma.documentTemplate.count({
      where: {
        storageKey,
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
    });
    if (stillUsed > 0) return;
    const abs = this.absPath(storageKey);
    await fs.rm(abs, { force: true }).catch(() => undefined);
    const dir = path.dirname(abs);
    if (path.basename(path.dirname(dir)) === 'document-templates') {
      await fs.rmdir(dir).catch(() => undefined);
    }
    if (exceptId) invalidatePdfCache(`tpl:${exceptId}:`);
  }

  async findAll(params: { type?: string; enabledOnly?: boolean }) {
    const where: Prisma.DocumentTemplateWhereInput = {};
    const type = s(params.type);
    if (type) {
      if (!Object.values(DocumentTemplateType).includes(type as DocumentTemplateType)) {
        throw new BadRequestException(`Invalid type: ${type}`);
      }
      where.type = type as DocumentTemplateType;
    }
    if (params.enabledOnly) where.enabled = true;

    const rows = await this.prisma.documentTemplate.findMany({
      where,
      include: documentTemplateInclude,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toDocumentTemplateDto);
  }

  async findOne(id: string) {
    const row = await this.prisma.documentTemplate.findUnique({
      where: { id },
      include: documentTemplateInclude,
    });
    if (!row) throw new NotFoundException(`DocumentTemplate ${id} not found`);
    return toDocumentTemplateDto(row);
  }

  async getFile(id: string) {
    const row = await this.prisma.documentTemplate.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`DocumentTemplate ${id} not found`);
    const abs = this.absPath(row.storageKey);
    try {
      const buffer = await fs.readFile(abs);
      return { buffer, fileName: row.fileName, storageKey: row.storageKey };
    } catch {
      throw new NotFoundException('模板文件不存在或已被删除');
    }
  }

  /** 浏览器预览：docx 优先转 PDF；转失败则回退原文件下载 */
  async previewFile(id: string) {
    const file = await this.getFile(id);
    const lower = file.fileName.toLowerCase();
    if (lower.endsWith('.docx')) {
      let cacheKey = `tpl:${id}`;
      try {
        const st = await fs.stat(this.absPath(file.storageKey));
        cacheKey = `tpl:${id}:${st.mtimeMs}:${st.size}`;
      } catch {
        /* ignore */
      }
      const pdf = await convertDocxToPdf(file.buffer, cacheKey);
      if (pdf) {
        const base = file.fileName.replace(/\.docx$/i, '') || 'template';
        return {
          buffer: pdf,
          fileName: `${base}.pdf`,
          contentType: 'application/pdf',
        };
      }
    }
    return {
      buffer: file.buffer,
      fileName: file.fileName,
      contentType: lower.endsWith('.docx')
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/octet-stream',
    };
  }

  async create(dto: CreateDocumentTemplateDto, file: Express.Multer.File, actor = '') {
    const name = s(dto.name);
    if (!name) throw new BadRequestException('name is required');
    if (!dto.type) throw new BadRequestException('type is required');

    const { fileName, buffer } = assertDocxFile(file);
    const enabled = dto.enabled !== false;
    const actorId = actor || null;

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.documentTemplate.create({
        data: {
          name,
          type: dto.type,
          fileName,
          storageKey: '',
          enabled,
          remark: s(dto.remark),
          createdById: actorId,
          updatedById: actorId,
        },
      });

      const storageKey = await this.writeTemplateFile(created.id, fileName, buffer);

      return tx.documentTemplate.update({
        where: { id: created.id },
        data: { storageKey },
        include: documentTemplateInclude,
      });
    });

    return toDocumentTemplateDto(row);
  }

  async update(
    id: string,
    dto: UpdateDocumentTemplateDto,
    file: Express.Multer.File | undefined,
    actor = '',
  ) {
    const existing = await this.prisma.documentTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`DocumentTemplate ${id} not found`);

    const actorId = actor || null;
    let newFile: { fileName: string; buffer: Buffer } | null = null;
    if (file) {
      newFile = assertDocxFile(file);
    }

    const oldStorageKey = existing.storageKey;

    const row = await this.prisma.$transaction(async (tx) => {
      let storageKey = existing.storageKey;
      let fileName = existing.fileName;

      if (newFile) {
        storageKey = await this.writeTemplateFile(id, newFile.fileName, newFile.buffer);
        fileName = newFile.fileName;
      }

      return tx.documentTemplate.update({
        where: { id },
        data: {
          name: dto.name !== undefined ? s(dto.name) : undefined,
          type: dto.type,
          fileName,
          storageKey,
          enabled: dto.enabled,
          remark: dto.remark !== undefined ? s(dto.remark) : undefined,
          ...(actorId ? { updatedById: actorId } : {}),
        },
        include: documentTemplateInclude,
      });
    });

    if (newFile && oldStorageKey && oldStorageKey !== row.storageKey) {
      await this.removeStoredFile(oldStorageKey, id);
    }

    return toDocumentTemplateDto(row);
  }

  async remove(id: string) {
    const existing = await this.prisma.documentTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`DocumentTemplate ${id} not found`);

    const customerRef = await this.prisma.customer.count({
      where: { agreementTemplateId: id },
    });
    if (customerRef > 0) {
      throw new BadRequestException(
        `无法删除：仍有 ${customerRef} 个客户引用该协议模板`,
      );
    }

    const buildingRef = await this.prisma.building.count({
      where: {
        OR: [
          { agreementTemplateId: id },
          { invoiceTemplateId: id },
          { receiptTemplateId: id },
        ],
      },
    });
    if (buildingRef > 0) {
      throw new BadRequestException(
        `无法删除：仍有 ${buildingRef} 个大厦绑定该模板，请先在大厦中改选其他模板`,
      );
    }

    await this.prisma.documentTemplate.delete({ where: { id } });
    await this.removeStoredFile(existing.storageKey);
    invalidatePdfCache(`tpl:${id}:`);
    return { ok: true };
  }

  async removeMany(ids: string[]) {
    return runBatchRemove(ids, (id) => this.remove(id));
  }
}
