/**
 * A5 booklet imposition (docs/PLAN.md M4): pages printed two per A4 sheet
 * side, double-sided, so that folding the stack in the middle gives a
 * booklet in reading order. Page numbers are 1-based; 0 means a blank page
 * added to reach a multiple of four.
 */
export interface SheetSide {
  left: number;
  right: number;
}

export function bookletPageCount(pages: number): number {
  return Math.max(4, Math.ceil(pages / 4) * 4);
}

/** For each sheet: its front and back side, outermost sheet first. */
export function bookletSheets(pages: number): { front: SheetSide; back: SheetSide }[] {
  const total = bookletPageCount(pages);
  const real = (page: number) => (page <= pages ? page : 0);
  const sheets: { front: SheetSide; back: SheetSide }[] = [];
  for (let sheet = 0; sheet < total / 4; sheet += 1) {
    const outer = total - 2 * sheet;
    const inner = 1 + 2 * sheet;
    sheets.push({
      front: { left: real(outer), right: real(inner) },
      back: { left: real(inner + 1), right: real(outer - 1) },
    });
  }
  return sheets;
}

/** The order to print single A5 pages so each A4 side holds the right pair. */
export function bookletOrder(pages: number): number[] {
  return bookletSheets(pages).flatMap(({ front, back }) => [
    front.left,
    front.right,
    back.left,
    back.right,
  ]);
}
