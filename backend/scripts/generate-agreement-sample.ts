/**
 * 生成办公室服务协议样例 Word，写入仓库 docs/templates/
 * 用法：在 backend 目录执行
 *   npx ts-node --compiler-options "{\"module\":\"CommonJS\"}" scripts/generate-agreement-sample.ts
 */
import * as path from 'path'
import { writeAgreementSampleDocxTo } from '../src/document-templates/sample-agreement-docx.util'

const out = path.resolve(
  __dirname,
  '../../docs/templates/办公室服务协议-样例模板.docx',
)
writeAgreementSampleDocxTo(out)
console.log('Wrote:', out)
