import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { roomImagePublicUrl } from '../common/dto-mappers';

function uploadsRoot() {
  return path.join(process.cwd(), 'uploads');
}

function s(v?: string | null) {
  return (v ?? '').trim();
}

/** Fix multer UTF-8 filename (same as document-templates) */
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

function safeAttachmentFileName(original: string): string {
  const decoded = decodeMulterFilename(original);
  const base = path.basename(decoded).replace(/[^\w.\u4e00-\u9fff\-()+\s]/g, '_');
  const cleaned = base.replace(/\s+/g, ' ').trim() || 'file';
  if (cleaned.includes('..')) throw new BadRequestException('Invalid file name');
  return cleaned.slice(0, 180);
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']);
const DOC_EXTS = new Set(['.pdf']);
const ALLOWED_EXTS = new Set([...IMAGE_EXTS, ...DOC_EXTS]);
const MAX_BYTES = 20 * 1024 * 1024;

@Injectable()
export class UploadsService {
  async saveAttachment(file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Please upload a file');
    }
    if (file.buffer.length > MAX_BYTES) {
      throw new BadRequestException('File must be at most 20MB');
    }

    const fileName = safeAttachmentFileName(file.originalname);
    const ext = path.extname(fileName).toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    const okExt = ALLOWED_EXTS.has(ext);
    const okMime =
      !mime ||
      mime.startsWith('image/') ||
      mime === 'application/pdf' ||
      mime === 'application/octet-stream';
    if (!okExt || !okMime) {
      throw new BadRequestException('Only PDF or images (jpg/png/gif/webp) are allowed');
    }

    const now = new Date();
    const y = String(now.getFullYear());
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const storageKey = path.posix.join('attachments', y, m, `${randomUUID()}-${fileName}`);
    const abs = path.join(uploadsRoot(), storageKey);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, file.buffer);

    return {
      storageKey,
      fileName,
      publicUrl: roomImagePublicUrl(storageKey)!,
      kind: DOC_EXTS.has(ext) ? 'pdf' : 'image',
    };
  }
}
