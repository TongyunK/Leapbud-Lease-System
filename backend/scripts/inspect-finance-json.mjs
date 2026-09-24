import fs from 'fs'
import path from 'path'

const finDir = path.join(
  'data',
  fs.readdirSync('data').find((n) => n.startsWith('4.')),
)

function loadJson(fileHint) {
  const name = fs.readdirSync(finDir).find((n) => n.includes(fileHint))
  if (!name) throw new Error('not found ' + fileHint)
  const full = path.join(finDir, name)
  console.log('\n===', name, (fs.statSync(full).size / 1024 / 1024).toFixed(2) + 'MB')
  const raw = fs.readFileSync(full, 'utf8')
  const data = JSON.parse(raw)
  return { name, data }
}

function summarize(label, data) {
  const topKeys = data && typeof data === 'object' ? Object.keys(data) : []
  console.log('top type', Array.isArray(data) ? 'array len=' + data.length : typeof data, 'keys', topKeys.slice(0, 20))

  let rows = data
  if (!Array.isArray(rows)) {
    // common export shapes
    for (const k of ['data', 'records', 'items', 'rows', 'list', 'entities', 'result']) {
      if (Array.isArray(data?.[k])) {
        rows = data[k]
        console.log('rows under', k, rows.length)
        break
      }
    }
  }
  if (!Array.isArray(rows)) {
    console.log('sample top', JSON.stringify(data).slice(0, 500))
    return
  }

  const first = rows[0]
  console.log('row keys', Object.keys(first || {}))
  console.log('sample0', JSON.stringify(first, null, 2).slice(0, 2500))

  // find invoice-ish fields
  const keys = Object.keys(first || {})
  const interesting = keys.filter((k) =>
    /invoice|发票|發票|id|_id|编号|編號|detail|服务|服務|amount|数量|數量|单价|單價/i.test(k),
  )
  console.log('interesting keys', interesting)

  // blank invoice code stats if field exists
  for (const k of keys) {
    if (/发票编号|發票編號|invoiceCode|invoice_no|invNo|编号/i.test(k)) {
      let blank = 0
      let filled = 0
      for (const r of rows.slice(0, 5000)) {
        const v = r[k]
        if (v == null || String(v).trim() === '') blank++
        else filled++
      }
      console.log('field', k, 'filled', filled, 'blank', blank, '(first 5000)')
    }
  }
}

const inv = loadJson('發票')
summarize('发票', inv.data)
const sd = loadJson('服務細節')
summarize('服务细节', sd.data)
