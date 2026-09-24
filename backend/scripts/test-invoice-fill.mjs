import fs from 'fs'
import path from 'path'
import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'

const dir = path.join('uploads', 'document-templates', 'cmudkrrno0001mdtk9286lzf5')
const file = fs.readdirSync(dir).find((f) => f.endsWith('.docx'))
const full = path.join(dir, file)
const content = fs.readFileSync(full)
const zip = new PizZip(content)

const data = {
  customerName: 'Test Co',
  roomName: '05A',
  roomNo: 'R001',
  address: '1 Test Street',
  inv_date: '23/09/2026',
  inv_No: 'INV001',
  inv_subtotal: '1,000.00',
  inv_total: '1,000.00',
  inv_dueDate: '30/09/2026',
  inv_amountDue: '1,000.00',
  FPSID: '123',
  accountName: 'Leapbud',
  account: 'HSBC 001',
  post: 'Send cheque to...',
  payment_advice: 'Leapbud\nAddress line',
  clientname: 'Test Co',
  items: [
    { description: 'Monthly rent', quantity: '1', unitPrice: '800.00', amount: '800.00' },
    { description: 'Service fee', quantity: '2', unitPrice: '100.00', amount: '200.00' },
  ],
}

try {
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  })
  doc.render(data)
  const out = path.join(process.env.TEMP || '/tmp', 'invoice-fill-test.docx')
  fs.writeFileSync(out, doc.getZip().generate({ type: 'nodebuffer' }))
  console.log('OK wrote', out)

  // inspect output texts
  const outZip = new PizZip(fs.readFileSync(out))
  const xml = outZip.file('word/document.xml').asText()
  const texts = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1])
  console.log('--- texts containing rent/fee/quantity-ish ---')
  for (const t of texts) {
    if (/Monthly|Service|800|200|rent|fee|quantity|description|items|#/i.test(t) || t.includes('{')) {
      console.log(JSON.stringify(t))
    }
  }
} catch (e) {
  console.error('FAIL', e.message)
  if (e.properties) console.error(JSON.stringify(e.properties, null, 2))
}
