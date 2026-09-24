import * as fs from 'fs';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

const NIL_CELL_BORDERS = `<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>`;

export type FillDocxOptions = {
  /**
   * 发票明细：强制去掉 {#items} 所在行单元格的四边框，并关闭该表 insideH。
   * 避免 Word「表头下框线」被抄到循环行上框线，导致每个 item 之间都有线。
   */
  clearItemsRowBorders?: boolean;
};

/** 读取 docx 模板，用 data 填充后返回 Buffer */
export function fillDocxTemplate(
  templatePathOrBuffer: string | Buffer,
  data: Record<string, unknown>,
  options: FillDocxOptions = {},
): Buffer {
  const content =
    typeof templatePathOrBuffer === 'string'
      ? fs.readFileSync(templatePathOrBuffer)
      : templatePathOrBuffer;
  const zip = new PizZip(content);

  if (options.clearItemsRowBorders) {
    const docFile = zip.file('word/document.xml');
    if (docFile) {
      const xml = clearItemsLoopRowBorders(docFile.asText());
      zip.file('word/document.xml', xml);
    }
  }

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });
  doc.render(data);
  return doc.getZip().generate({ type: 'nodebuffer' }) as Buffer;
}

/** 去掉 {#items} 循环行上的单元格边框，并关闭所在表的内部横线 */
export function clearItemsLoopRowBorders(xml: string): string {
  let result = xml;
  const marker = '{#items}';
  let searchFrom = 0;

  while (true) {
    const idx = result.indexOf(marker, searchFrom);
    if (idx < 0) break;

    const trStart = result.lastIndexOf('<w:tr', idx);
    const trClose = result.indexOf('</w:tr>', idx);
    if (trStart < 0 || trClose < 0 || trStart > idx) {
      searchFrom = idx + marker.length;
      continue;
    }
    const trEnd = trClose + '</w:tr>'.length;
    const trXml = result.slice(trStart, trEnd);
    const patchedTr = forceNilBordersOnRowCells(trXml);
    result = result.slice(0, trStart) + patchedTr + result.slice(trEnd);
    searchFrom = trStart + patchedTr.length;

    const tblStart = result.lastIndexOf('<w:tbl', trStart);
    if (tblStart >= 0) {
      const tblPrClose = result.indexOf('</w:tblPr>', tblStart);
      if (tblPrClose > tblStart && tblPrClose < trStart + patchedTr.length + 500) {
        const tblPr = result.slice(tblStart, tblPrClose + '</w:tblPr>'.length);
        const patchedTblPr = nilTableInsideH(tblPr);
        if (patchedTblPr !== tblPr) {
          result =
            result.slice(0, tblStart) +
            patchedTblPr +
            result.slice(tblStart + tblPr.length);
          searchFrom = tblStart + patchedTblPr.length + patchedTr.length;
        }
      }
    }
  }

  return result;
}

function forceNilBordersOnRowCells(trXml: string): string {
  return trXml.replace(/<w:tc\b[\s\S]*?<\/w:tc>/g, (tc) => {
    if (/<w:tcBorders[\s>]/.test(tc)) {
      return tc.replace(/<w:tcBorders\b[\s\S]*?<\/w:tcBorders>/, NIL_CELL_BORDERS);
    }
    if (/<w:tcPr\s*\/>/.test(tc)) {
      return tc.replace(/<w:tcPr\s*\/>/, `<w:tcPr>${NIL_CELL_BORDERS}</w:tcPr>`);
    }
    if (/<w:tcPr[>\s]/.test(tc)) {
      return tc.replace(/<w:tcPr([^>]*)>/, `<w:tcPr$1>${NIL_CELL_BORDERS}`);
    }
    return tc.replace(/<w:tc([^>]*)>/, `<w:tc$1><w:tcPr>${NIL_CELL_BORDERS}</w:tcPr>`);
  });
}

function nilTableInsideH(tblPrXml: string): string {
  if (/<w:insideH\b/.test(tblPrXml)) {
    return tblPrXml.replace(/<w:insideH\b[^/]*\/>/, '<w:insideH w:val="nil"/>');
  }
  if (/<w:tblBorders\b[\s\S]*?<\/w:tblBorders>/.test(tblPrXml)) {
    return tblPrXml.replace(
      /<\/w:tblBorders>/,
      '<w:insideH w:val="nil"/></w:tblBorders>',
    );
  }
  return tblPrXml;
}
