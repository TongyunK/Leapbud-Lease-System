import fs from 'fs'
import path from 'path'
import PizZip from 'pizzip'

const dir = path.join('uploads', 'document-templates', 'cmudkrrno0001mdtk9286lzf5')
const file = fs.readdirSync(dir).find((f) => f.endsWith('.docx'))
const full = path.join(dir, file)
const zip = new PizZip(fs.readFileSync(full))
let xml = zip.file('word/document.xml').asText()

// 当前被误改成: }( + roomNo + }  → 补回 { ，并在结尾加 )
// 目标连续文本: {customerName}({roomNo})
xml = xml.replace(
  /(<w:t[^>]*>)\}\(<\/w:t>/,
  '$1}({</w:t>',
)

// 若已是 }({roomNo} 结尾仍是单独 }，改成 )}
// 找到 customerName 后第一个独立的 </w:t> 中仅为 } 且前面是 roomNo 的 run
xml = xml.replace(
  /(<w:t[^>]*>roomNo<\/w:t><\/w:r><w:proofErr w:type="spellEnd"\/><w:r[^>]*><w:rPr>[\s\S]*?<\/w:rPr><w:t>)\}(<\/w:t>)/,
  '$1)}$2',
)

// 若没有 proofErr 的简化结构
if (!xml.includes('({roomNo})') && !xml.includes('roomNo}</w:t>') === false) {
  // noop guard
}

zip.file('word/document.xml', xml)
fs.writeFileSync(full, zip.generate({ type: 'nodebuffer' }))

const texts = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1])
const joined = texts.join('')
const i = joined.indexOf('customerName')
console.log('joined around header:', joined.slice(Math.max(0, i - 2), i + 40))
console.log('has ({roomNo}):', joined.includes('({roomNo})'))
