import request from './request'

export type AttachmentUploadResult = {
  storageKey: string
  fileName: string
  publicUrl: string
  kind: 'pdf' | 'image'
}

export function uploadAttachmentApi(file: File) {
  const fd = new FormData()
  fd.append('file', file)
  return request.post<AttachmentUploadResult>('/uploads/attachments', fd)
}
