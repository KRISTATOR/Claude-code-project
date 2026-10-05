import type * as PdfJs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';

let loader: Promise<typeof PdfJs> | null = null;

/** pdf.js, loaded on first use with its worker served by the app itself. */
export function loadPdfJs(): Promise<typeof PdfJs> {
  loader ??= (async () => {
    const pdfjs = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  })();
  return loader;
}

export interface OpenedPdf {
  pdf: PDFDocumentProxy;
  close: () => Promise<void>;
}

export async function openPdf(data: Uint8Array): Promise<OpenedPdf> {
  const pdfjs = await loadPdfJs();
  // pdf.js takes ownership of the buffer; give it a copy.
  const task = pdfjs.getDocument({ data: data.slice() });
  const pdf = await task.promise;
  return { pdf, close: () => task.destroy.call(task) };
}

/** Text of a PDF for search; scanned PDFs without a text layer give "". */
export async function pdfText(data: Uint8Array): Promise<string | null> {
  try {
    const { pdf, close } = await openPdf(data);
    const pages: string[] = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : ''))
          .join(''),
      );
    }
    await close();
    return pages.join('\n\n');
  } catch {
    return null;
  }
}
