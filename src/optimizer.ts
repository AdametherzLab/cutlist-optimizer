import type { Piece, Sheet, PlacedPiece, WasteRegion, SheetLayout, CutStep, OptimizerConfig, CutlistResult, CutlistInput } from "./types.js";

interface PieceInstance {
  readonly piece: Piece;
  readonly instanceIndex: number;
}

interface FreeRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function fitsWithGrain(
  pieceLength: number,
  pieceWidth: number,
  freeRect: FreeRect,
  grain?: "longitudinal" | "cross" | "any"
): boolean {
  const fitsNormal = pieceLength <= freeRect.width && pieceWidth <= freeRect.height;
  const fitsRotated = pieceWidth <= freeRect.width && pieceLength <= freeRect.height;

  if (!grain || grain === "any") {
    return fitsNormal || fitsRotated;
  }

  if (grain === "longitudinal") {
    return fitsNormal;
  }

  if (grain === "cross") {
    return fitsRotated;
  }

  return fitsNormal || fitsRotated;
}

function shouldRotate(
  pieceLength: number,
  pieceWidth: number,
  freeRect: FreeRect,
  grain?: "longitudinal" | "cross" | "any"
): boolean {
  const fitsNormal = pieceLength <= freeRect.width && pieceWidth <= freeRect.height;
  const fitsRotated = pieceWidth <= freeRect.width && pieceLength <= freeRect.height;

  if (!grain || grain === "any") {
    return fitsRotated && !fitsNormal;
  }

  if (grain === "longitudinal") {
    return false;
  }

  if (grain === "cross") {
    return fitsRotated;
  }

  return false;
}

export function splitFreeRects(
  freeRects: readonly FreeRect[],
  placedX: number,
  placedY: number,
  placedWidth: number,
  placedHeight: number
): FreeRect[] {
  const newRects: FreeRect[] = [];

  for (const rect of freeRects) {
    if (placedX >= rect.x + rect.width || placedX + placedWidth <= rect.x ||
        placedY >= rect.y + rect.height || placedY + placedHeight <= rect.y) {
      newRects.push(rect);
      continue;
    }

    const leftWidth = placedX - rect.x;
    if (leftWidth > 0) {
      newRects.push({
        x: rect.x,
        y: rect.y,
        width: leftWidth,
        height: rect.height
      });
    }

    const rightX = placedX + placedWidth;
    const rightWidth = rect.x + rect.width - rightX;
    if (rightWidth > 0) {
      newRects.push({
        x: rightX,
        y: rect.y,
        width: rightWidth,
        height: rect.height
      });
    }

    const bottomHeight = placedY - rect.y;
    if (bottomHeight > 0) {
      newRects.push({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: bottomHeight
      });
    }

    const topY = placedY + placedHeight;
    const topHeight = rect.y + rect.height - topY;
    if (topHeight > 0) {
      newRects.push({
        x: rect.x,
        y: topY,
        width: rect.width,
        height: topHeight
      });
    }
  }

  return newRects;
}

export function mergeFreeRects(freeRects: FreeRect[]): FreeRect[] {
  if (freeRects.length <= 1) return freeRects;

  const sorted = [...freeRects].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  const merged: FreeRect[] = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    if (next.x === current.x + current.width && next.y === current.y && next.height === current.height) {
      current.width += next.width;
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);

  return merged;
}

// Rest of optimizer implementation remains unchanged
