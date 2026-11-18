/** 在纯文本中把已知业务编号切成可点击片段 */

export type TextLinkTarget = {
  kind: 'invoice' | 'contract' | 'receivable'
  id: string
}

export type TextLinkPart = {
  text: string
  link?: TextLinkTarget
}

/**
 * 按已知编号（长的优先）切分文本；同一编号多次出现都会切出。
 */
export function splitTextByLinkCodes(
  text: string,
  links: Map<string, TextLinkTarget>,
): TextLinkPart[] {
  const raw = text ?? ''
  if (!raw) return []
  if (!links.size) return [{ text: raw }]

  const codes = [...links.keys()]
    .map((c) => c.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
  if (!codes.length) return [{ text: raw }]

  const parts: TextLinkPart[] = []
  let rest = raw
  while (rest.length) {
    let bestIdx = -1
    let bestCode = ''
    for (const code of codes) {
      const i = rest.indexOf(code)
      if (i >= 0 && (bestIdx < 0 || i < bestIdx)) {
        bestIdx = i
        bestCode = code
      }
    }
    if (bestIdx < 0 || !bestCode) {
      parts.push({ text: rest })
      break
    }
    if (bestIdx > 0) parts.push({ text: rest.slice(0, bestIdx) })
    const link = links.get(bestCode)
    parts.push(link ? { text: bestCode, link } : { text: bestCode })
    rest = rest.slice(bestIdx + bestCode.length)
  }
  return parts
}
