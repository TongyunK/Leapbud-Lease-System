import * as fs from 'fs';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

/** 读取 docx 模板，用 data 填充后返回 Buffer */
export function fillDocxTemplate(
  templatePathOrBuffer: string | Buffer,
  data: Record<string, unknown>,
): Buffer {
  const content =
    typeof templatePathOrBuffer === 'string'
      ? fs.readFileSync(templatePathOrBuffer)
      : templatePathOrBuffer;
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });
  doc.render(data);
  return doc.getZip().generate({ type: 'nodebuffer' }) as Buffer;
}
