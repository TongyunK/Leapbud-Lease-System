import { randomUUID } from 'crypto';

type PreviewTicket = {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  at: number;
};

const TTL_MS = 15 * 60 * 1000;
const MAX = 128;
const tickets = new Map<string, PreviewTicket>();

function prune() {
  const now = Date.now();
  for (const [id, item] of tickets) {
    if (now - item.at > TTL_MS) tickets.delete(id);
  }
  while (tickets.size > MAX) {
    const oldest = tickets.keys().next().value;
    if (oldest == null) break;
    tickets.delete(oldest);
  }
}

/** 创建短时预览票据；浏览器用 GET 打开时可带上正确文件名（Content-Disposition） */
export function createPdfPreviewTicket(params: {
  buffer: Buffer;
  fileName: string;
  contentType?: string;
}): string {
  prune();
  const id = randomUUID();
  tickets.set(id, {
    buffer: params.buffer,
    fileName: params.fileName,
    contentType: params.contentType || 'application/pdf',
    at: Date.now(),
  });
  return id;
}

export function getPdfPreviewTicket(id: string): PreviewTicket | null {
  const item = tickets.get(id);
  if (!item) return null;
  if (Date.now() - item.at > TTL_MS) {
    tickets.delete(id);
    return null;
  }
  // 续期：同一标签刷新仍可用
  item.at = Date.now();
  return item;
}
