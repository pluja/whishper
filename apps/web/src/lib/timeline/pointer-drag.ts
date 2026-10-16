export type PointerCapture = { pointerId: number; owner: HTMLElement };

export function capturePointer(event: PointerEvent): PointerCapture {
  const owner = event.currentTarget as HTMLElement;
  owner.setPointerCapture(event.pointerId);
  return { pointerId: event.pointerId, owner };
}

export function releasePointer(capture: PointerCapture): void {
  if (capture.owner.hasPointerCapture(capture.pointerId)) {
    capture.owner.releasePointerCapture(capture.pointerId);
  }
}

export function isCapturedPointer<Drag extends PointerCapture>(
  drag: Drag | null,
  event: PointerEvent,
): drag is Drag {
  return drag !== null && drag.pointerId === event.pointerId;
}
