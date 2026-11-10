type VerticalSpan = Pick<DOMRect, "top" | "bottom">;

// The scroll that brings a row fully into view, like scrollIntoView with
// block "nearest", except that it moves only the list and never the page.
export function revealOffset(list: VerticalSpan, row: VerticalSpan): number {
  if (row.top < list.top) return row.top - list.top;
  if (row.bottom > list.bottom) return row.bottom - list.bottom;
  return 0;
}
