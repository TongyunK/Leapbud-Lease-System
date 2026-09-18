/**
 * 生成办公室服务协议样例 Word → docs/templates/
 * 用法（在 backend 目录）：node scripts/generate-agreement-sample.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { buildAgreementSampleDocx } = require('../dist/document-templates/sample-agreement-docx.util.js')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const out = path.resolve(__dirname, '../../docs/templates/办公室服务协议-样例模板.docx')

// 若尚未 build，退回用 ts-node 同目录的动态编译不可用时：直接用 pizzip 内联生成
let buf
try {
  buf = buildAgreementSampleDocx()
} catch {
  // dist 不存在则用 ts 源码路径不可直接 require；改为内联调用 transpile
  console.error('请先 npm run build，或使用系统管理页「下载协议样例」按钮。')
  process.exit(1)
}

fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, buf)
console.log('Wrote:', out)
