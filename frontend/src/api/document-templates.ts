import axios from 'axios'
import request from './request'
import { getApiBaseUrl } from '@/utils/apiConfig'
import type {
  DocumentFieldDictItem,
  DocumentTemplateRecord,
  DocumentTemplateType,
} from '@/types/document-template'

export type DocumentTemplateListQuery = {
  type?: DocumentTemplateType | string
  enabledOnly?: boolean
}

export type DocumentTemplateWriteFields = {
  name: string
  type: DocumentTemplateType
  enabled?: boolean
  remark?: string
}

function appendFields(fd: FormData, fields: Partial<DocumentTemplateWriteFields>) {
  if (fields.name !== undefined) fd.append('name', fields.name)
  if (fields.type !== undefined) fd.append('type', fields.type)
  if (fields.enabled !== undefined) {
    fd.append('enabled', String(fields.enabled))
  }
  if (fields.remark !== undefined) fd.append('remark', fields.remark)
}

function parseContentDisposition(header?: string): string | null {
  if (!header) return null
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1].trim().replace(/^"|"$/g, ''))
    } catch {
      return utf8[1].trim()
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header)
  return plain?.[1]?.trim() || null
}

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** 成功/失败时 blob 可能是 JSON，下载前校验 content-type */
async function assertDownloadableBlob(data: Blob, contentType?: string) {
  const ct = (contentType || data.type || '').toLowerCase()
  if (!ct.includes('application/json') && !ct.includes('text/plain') && !ct.includes('text/html')) {
    return
  }
  const text = await data.text()
  let message = 'Request failed'
  try {
    const json = JSON.parse(text) as { message?: string | string[] }
    const raw = json.message
    message = Array.isArray(raw) ? raw.join('; ') : raw || message
  } catch {
    if (text.trim()) message = text.trim()
  }
  throw new Error(message)
}

async function rethrowIfBlobError(error: unknown): Promise<never> {
  if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
    try {
      await assertDownloadableBlob(
        error.response.data,
        String(error.response.headers['content-type'] || ''),
      )
    } catch (parsed) {
      throw parsed
    }
  }
  throw error
}

async function downloadBlobResponse(
  response: { data: Blob; headers: Record<string, unknown> },
  fallbackName: string,
) {
  const ct = String(response.headers['content-type'] || '')
  await assertDownloadableBlob(response.data, ct)
  const fileName =
    parseContentDisposition(String(response.headers['content-disposition'] || '')) || fallbackName
  triggerBrowserDownload(response.data, fileName)
}

function writePreviewLoading(win: Window) {
  try {
    win.document.open()
    win.document.write(
      '<!doctype html><html><head><meta charset="utf-8"><title>正在生成 PDF…</title></head>' +
        '<body style="font:14px/1.5 system-ui,sans-serif;padding:24px;color:#666">' +
        '正在生成 PDF 预览，请稍候…</body></html>',
    )
    win.document.close()
  } catch {
    /* ignore */
  }
}

function openPreviewWindow(): Window {
  const win = window.open('about:blank', '_blank')
  if (!win) {
    throw new Error('浏览器拦截了弹窗，请允许本站弹出窗口后重试')
  }
  writePreviewLoading(win)
  return win
}

function showPdfInWindow(win: Window, pdfBlob: Blob, autoPrint: boolean) {
  const url = URL.createObjectURL(pdfBlob)
  try {
    win.location.href = url
  } catch {
    win.close()
    URL.revokeObjectURL(url)
    throw new Error('无法在预览窗口中打开 PDF，请重试')
  }
  if (autoPrint) {
    window.setTimeout(() => {
      try {
        win.focus()
        win.print()
      } catch {
        /* 用户可在预览页手动 Ctrl+P */
      }
    }, 800)
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
}

/** 协议 PDF 预览票据缓存：打开真实 URL 才能让「另存为」带上正确文件名 */
type AgreementPreviewTicket = { ticket: string; fileName: string; at: number }
const agreementTicketCache = new Map<string, AgreementPreviewTicket>()
const AGREEMENT_TICKET_TTL_MS = 10 * 60 * 1000
const agreementTicketInflight = new Map<string, Promise<AgreementPreviewTicket>>()

function getCachedAgreementTicket(contractId: string): AgreementPreviewTicket | null {
  const hit = agreementTicketCache.get(contractId)
  if (!hit) return null
  if (Date.now() - hit.at > AGREEMENT_TICKET_TTL_MS) {
    agreementTicketCache.delete(contractId)
    return null
  }
  return hit
}

function setCachedAgreementTicket(contractId: string, ticket: AgreementPreviewTicket) {
  agreementTicketCache.set(contractId, ticket)
  while (agreementTicketCache.size > 32) {
    const oldest = agreementTicketCache.keys().next().value
    if (oldest == null) break
    agreementTicketCache.delete(oldest)
  }
}

async function fetchAgreementPreviewTicket(
  contractId: string,
  opts?: { silentError?: boolean },
): Promise<AgreementPreviewTicket> {
  const cached = getCachedAgreementTicket(contractId)
  if (cached) return cached

  const inflight = agreementTicketInflight.get(contractId)
  if (inflight) return inflight

  const task = (async () => {
    const res = await request.post<{ ticket: string; fileName: string }>(
      '/document-templates/prints/agreement/preview-ticket',
      { contractId, format: 'pdf' },
      { silentError: opts?.silentError },
    )
    const ticket = String(res.data?.ticket || '')
    const fileName = String(res.data?.fileName || 'agreement.pdf')
    if (!ticket) throw new Error('未能创建 PDF 预览')
    const entry = { ticket, fileName, at: Date.now() }
    setCachedAgreementTicket(contractId, entry)
    return entry
  })()

  agreementTicketInflight.set(contractId, task)
  try {
    return await task
  } finally {
    agreementTicketInflight.delete(contractId)
  }
}

function agreementPreviewUrl(ticket: string, fileName: string) {
  const safeName = encodeURIComponent(fileName || 'agreement.pdf')
  return `${getApiBaseUrl()}/document-templates/prints/agreement/view/${encodeURIComponent(ticket)}/${safeName}`
}

export function fetchDocumentTemplates(params?: DocumentTemplateListQuery) {
  const query: Record<string, string> = {}
  if (params?.type) query.type = params.type
  if (params?.enabledOnly !== undefined) query.enabledOnly = String(params.enabledOnly)
  return request.get<DocumentTemplateRecord[]>('/document-templates', {
    params: Object.keys(query).length ? query : undefined,
  })
}

export function fetchDocumentFieldDictionary(type: DocumentTemplateType | string) {
  return request.get<DocumentFieldDictItem[]>('/document-templates/field-dictionary', {
    params: { type },
  })
}

export function createDocumentTemplateApi(fields: DocumentTemplateWriteFields, file: File) {
  const fd = new FormData()
  appendFields(fd, fields)
  fd.append('file', file)
  return request.post<DocumentTemplateRecord>('/document-templates', fd)
}

export function updateDocumentTemplateApi(
  id: string,
  fields: Partial<DocumentTemplateWriteFields>,
  file?: File | null,
) {
  const fd = new FormData()
  appendFields(fd, fields)
  if (file) fd.append('file', file)
  return request.patch<DocumentTemplateRecord>(`/document-templates/${id}`, fd)
}

export function deleteDocumentTemplateApi(id: string) {
  return request.delete(`/document-templates/${id}`)
}

export function batchDeleteDocumentTemplatesApi(ids: string[]) {
  return request.post<{
    deleted: number
    failures: Array<{ id: string; message: string }>
  }>('/document-templates/batch-delete', { ids })
}

export async function downloadDocumentTemplateApi(id: string, fallbackName = 'template.docx') {
  try {
    const res = await request.get<Blob>(`/document-templates/${id}/download`, {
      responseType: 'blob',
    })
    await downloadBlobResponse(res, fallbackName)
  } catch (error) {
    await rethrowIfBlobError(error)
  }
}

/** 新标签预览模板（docx → PDF，最终版式） */
export async function previewDocumentTemplateApi(id: string) {
  const win = openPreviewWindow()
  try {
    const res = await request.get<Blob>(`/document-templates/${id}/preview`, {
      responseType: 'blob',
      silentError: true,
    })
    const ct = String(res.headers['content-type'] || res.data.type || '').toLowerCase()
    await assertDownloadableBlob(res.data, ct)
    const head = new Uint8Array(await res.data.slice(0, 5).arrayBuffer())
    const isPdf =
      ct.includes('pdf') ||
      (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46)
    if (isPdf) {
      const pdfBlob =
        res.data.type === 'application/pdf'
          ? res.data
          : new Blob([res.data], { type: 'application/pdf' })
      showPdfInWindow(win, pdfBlob, false)
      return
    }
    const name =
      parseContentDisposition(String(res.headers['content-disposition'] || '')) || 'template.docx'
    triggerBrowserDownload(res.data, name)
    try {
      win.close()
    } catch {
      /* ignore */
    }
    throw new Error('该文件无法生成 PDF 预览，已改为下载')
  } catch (error) {
    try {
      if (!win.closed) win.close()
    } catch {
      /* ignore */
    }
    await rethrowIfBlobError(error)
  }
}

export async function printAgreementApi(
  contractId: string,
  format: 'docx' | 'pdf' = 'pdf',
  opts?: { silentError?: boolean },
) {
  try {
    const res = await request.post<Blob>(
      '/document-templates/prints/agreement',
      { contractId, format },
      { responseType: 'blob', silentError: opts?.silentError },
    )
    const ext = format === 'pdf' ? 'pdf' : 'docx'
    await downloadBlobResponse(res, `agreement.${ext}`)
  } catch (error) {
    await rethrowIfBlobError(error)
  }
}

/** 悬停预热：提前生成预览票据，点击时可直接打开最终 PDF */
export function prefetchAgreementPdfApi(contractId: string) {
  if (
    !contractId ||
    getCachedAgreementTicket(contractId) ||
    agreementTicketInflight.has(contractId)
  ) {
    return
  }
  void fetchAgreementPreviewTicket(contractId, { silentError: true }).catch(() => undefined)
}

/**
 * 在浏览器新标签页预览协议最终 PDF。
 * 走短时预览 URL（带 Content-Disposition），「另存为」才会是「合约编号-客户名称.pdf」。
 * 必须在用户点击的同步阶段先打开窗口，否则 await 之后会被浏览器拦截弹窗。
 */
export async function previewAgreementPdfApi(
  contractId: string,
  opts?: { silentError?: boolean; autoPrint?: boolean },
) {
  const autoPrint = opts?.autoPrint === true
  const win = openPreviewWindow()

  try {
    const { ticket, fileName } = await fetchAgreementPreviewTicket(contractId, {
      silentError: opts?.silentError,
    })
    const url = agreementPreviewUrl(ticket, fileName)
    try {
      win.location.href = url
    } catch {
      win.close()
      throw new Error('无法在预览窗口中打开 PDF，请重试')
    }
    if (autoPrint) {
      window.setTimeout(() => {
        try {
          win.focus()
          win.print()
        } catch {
          /* 用户可在预览页手动 Ctrl+P */
        }
      }, 800)
    }
  } catch (error) {
    try {
      if (!win.closed) win.close()
    } catch {
      /* ignore */
    }
    throw error
  }
}

/** 下载协议样例 docx（含占位符） */
export async function downloadAgreementSampleApi() {
  try {
    const res = await request.get<Blob>('/document-templates/samples/agreement', {
      responseType: 'blob',
    })
    await downloadBlobResponse(res, 'agreement-sample.docx')
  } catch (error) {
    await rethrowIfBlobError(error)
  }
}

/** 下载发票样例 docx（旧系统键名占位符） */
export async function downloadInvoiceSampleApi() {
  try {
    const res = await request.get<Blob>('/document-templates/samples/invoice', {
      responseType: 'blob',
    })
    await downloadBlobResponse(res, 'invoice-sample.docx')
  } catch (error) {
    await rethrowIfBlobError(error)
  }
}

/** 发票 PDF 预览票据缓存 */
type InvoicePreviewTicket = { ticket: string; fileName: string; at: number }
const invoiceTicketCache = new Map<string, InvoicePreviewTicket>()
const INVOICE_TICKET_TTL_MS = 10 * 60 * 1000
const invoiceTicketInflight = new Map<string, Promise<InvoicePreviewTicket>>()

function getCachedInvoiceTicket(invoiceId: string): InvoicePreviewTicket | null {
  const hit = invoiceTicketCache.get(invoiceId)
  if (!hit) return null
  if (Date.now() - hit.at > INVOICE_TICKET_TTL_MS) {
    invoiceTicketCache.delete(invoiceId)
    return null
  }
  return hit
}

function setCachedInvoiceTicket(invoiceId: string, ticket: InvoicePreviewTicket) {
  invoiceTicketCache.set(invoiceId, ticket)
  while (invoiceTicketCache.size > 32) {
    const oldest = invoiceTicketCache.keys().next().value
    if (oldest == null) break
    invoiceTicketCache.delete(oldest)
  }
}

async function fetchInvoicePreviewTicket(
  invoiceId: string,
  opts?: { silentError?: boolean },
): Promise<InvoicePreviewTicket> {
  const cached = getCachedInvoiceTicket(invoiceId)
  if (cached) return cached

  const inflight = invoiceTicketInflight.get(invoiceId)
  if (inflight) return inflight

  const task = (async () => {
    const res = await request.post<{ ticket: string; fileName: string }>(
      '/document-templates/prints/invoice/preview-ticket',
      { invoiceId, format: 'pdf' },
      { silentError: opts?.silentError },
    )
    const ticket = String(res.data?.ticket || '')
    const fileName = String(res.data?.fileName || 'invoice.pdf')
    if (!ticket) throw new Error('未能创建 PDF 预览')
    const entry = { ticket, fileName, at: Date.now() }
    setCachedInvoiceTicket(invoiceId, entry)
    return entry
  })()

  invoiceTicketInflight.set(invoiceId, task)
  try {
    return await task
  } finally {
    invoiceTicketInflight.delete(invoiceId)
  }
}

function invoicePreviewUrl(ticket: string, fileName: string) {
  const safeName = encodeURIComponent(fileName || 'invoice.pdf')
  return `${getApiBaseUrl()}/document-templates/prints/invoice/view/${encodeURIComponent(ticket)}/${safeName}`
}

export async function printInvoiceApi(
  invoiceId: string,
  format: 'docx' | 'pdf' = 'pdf',
  opts?: { silentError?: boolean },
) {
  try {
    const res = await request.post<Blob>(
      '/document-templates/prints/invoice',
      { invoiceId, format },
      { responseType: 'blob', silentError: opts?.silentError },
    )
    const ext = format === 'pdf' ? 'pdf' : 'docx'
    await downloadBlobResponse(res, `invoice.${ext}`)
  } catch (error) {
    await rethrowIfBlobError(error)
  }
}

/** 悬停预热：提前生成发票预览票据 */
export function prefetchInvoicePdfApi(invoiceId: string) {
  if (
    !invoiceId ||
    getCachedInvoiceTicket(invoiceId) ||
    invoiceTicketInflight.has(invoiceId)
  ) {
    return
  }
  void fetchInvoicePreviewTicket(invoiceId, { silentError: true }).catch(() => undefined)
}

/**
 * 在浏览器新标签页预览发票最终 PDF。
 * 走短时预览 URL，「另存为」为「发票编号-客户名称.pdf」。
 */
export async function previewInvoicePdfApi(
  invoiceId: string,
  opts?: { silentError?: boolean; autoPrint?: boolean },
) {
  const autoPrint = opts?.autoPrint === true
  const win = openPreviewWindow()

  try {
    const { ticket, fileName } = await fetchInvoicePreviewTicket(invoiceId, {
      silentError: opts?.silentError,
    })
    const url = invoicePreviewUrl(ticket, fileName)
    try {
      win.location.href = url
    } catch {
      win.close()
      throw new Error('无法在预览窗口中打开 PDF，请重试')
    }
    if (autoPrint) {
      window.setTimeout(() => {
        try {
          win.focus()
          win.print()
        } catch {
          /* 用户可在预览页手动 Ctrl+P */
        }
      }, 800)
    }
  } catch (error) {
    try {
      if (!win.closed) win.close()
    } catch {
      /* ignore */
    }
    throw error
  }
}
