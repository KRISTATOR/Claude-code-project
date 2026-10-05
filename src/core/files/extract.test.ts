import ExcelJS from 'exceljs';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { decodeXml, extractText, slideXmlText, wordXmlText } from './extract';

describe('wordXmlText', () => {
  it('joins runs within a paragraph and splits paragraphs', () => {
    const xml =
      '<w:body><w:p><w:r><w:t>Neherní materiál</w:t></w:r><w:r><w:t xml:space="preserve"> – nesdílet</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Jméno:</w:t></w:r><w:r><w:tab/><w:t>Hraběnka z Lipnova</w:t></w:r></w:p></w:body>';
    expect(wordXmlText(xml).trim()).toBe('Neherní materiál – nesdílet\nJméno:\tHraběnka z Lipnova');
  });
});

describe('slideXmlText', () => {
  it('reads PowerPoint paragraphs', () => {
    const xml =
      '<p:sp><a:p><a:r><a:t>Proslov I.</a:t></a:r></a:p><a:p><a:r><a:t>Občané &amp; vojáci!</a:t></a:r></a:p></p:sp>';
    expect(slideXmlText(xml)).toBe('Proslov I.\nObčané & vojáci!');
  });
});

describe('decodeXml', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeXml('&lt;a&gt; &amp; &#269;&#x161;')).toBe('<a> & čš');
  });
});

describe('extractText', () => {
  it('reads a .docx archive', () => {
    const docx = zipSync({
      'word/document.xml': strToU8(
        '<w:document><w:body><w:p><w:r><w:t>Dopis č. 12</w:t></w:r></w:p></w:body></w:document>',
      ),
      'word/header1.xml': strToU8('<w:hdr><w:p><w:r><w:t>Hlavička</w:t></w:r></w:p></w:hdr>'),
    });
    expect(extractText('dopis.docx', docx)).toBe('Dopis č. 12\nHlavička');
  });

  it('reads a .pptx archive slide by slide', () => {
    const pptx = zipSync({
      'ppt/slides/slide10.xml': strToU8('<a:p><a:r><a:t>Desátý</a:t></a:r></a:p>'),
      'ppt/slides/slide2.xml': strToU8('<a:p><a:r><a:t>Druhý</a:t></a:r></a:p>'),
    });
    expect(extractText('proslov.pptx', pptx)).toBe('Druhý\n\nDesátý');
  });

  it('reads an .xlsx written by Excel-compatible software', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Nákup');
    sheet.addRow(['Surovina', 'Množství', 'Cena']);
    sheet.addRow(['Mouka hladká', 12, 15.5]);
    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
    expect(extractText('nakup.xlsx', bytes)).toBe(
      'Surovina\tMnožství\tCena\nMouka hladká\t12\t15.5',
    );
  });

  it('reads plain text and returns null for unknown or broken files', () => {
    expect(extractText('poznamky.md', strToU8('# Lipnov\nNic.'))).toBe('# Lipnov\nNic.');
    expect(extractText('mapa.png', new Uint8Array([1, 2, 3]))).toBeNull();
    expect(extractText('rozbity.docx', new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
