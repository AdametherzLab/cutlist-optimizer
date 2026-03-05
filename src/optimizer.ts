import type { Piece, Sheet, PlacedPiece, WasteRegion, SheetLayout, CutStep, OptimizerConfig, CutlistResult, CutlistInput } from "./types.js";

/**
 * Represents a piece instance with its index for tracking
 */
interface PieceInstance {
  readonly piece: Piece;
  readonly instanceIndex: number;
}

/**
 * Free rectangle for guillotine cutting algorithm
 */
interface FreeRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Check if a piece fits in a free rectangle considering grain constraints
 */
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

/**
 * Determine if piece should be rotated based on grain and fit
 */
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

/**
 * Split free rectangles after placing a piece (guillotine cut)
 */
function splitFreeRects(
  freeRects: FreeRect[],
  placedX: number,
  placedY: number,
  placedWidth: number,
  placedHeight: number
): FreeRect[] {
  const newRects: FreeRect[] = [];

  for (const rect of freeRects) {
    // Skip if this rect was used for placement
    if (placedX >= rect.x + rect.width || placedX + placedWidth <= rect.x ||
        placedY >= rect.y + rect.height || placedY + placedHeight <= rect.y) {
      newRects.push(rect);
      continue;
    }

    // Left remainder
    const leftWidth = placedX - rect.x;
    if (leftWidth > 0) {
      newRects.push({
        x: rect.x,
        y: rect.y,
        width: leftWidth,
        height: rect.height
      });
    }

    // Right remainder
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

    // Bottom remainder
    const bottomHeight = placedY - rect.y;
    if (bottomHeight > 0) {
      newRects.push({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: bottomHeight
      });
    }

    // Top remainder
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

/**
 * Find best free rectangle for placement
 */
function findBestFreeRect(
  pieceLength: number,
  pieceWidth: number,
  freeRects: FreeRect[],
  allowRotation: boolean,
  grain?: "longitudinal" | "cross" | "any"
): { rect: FreeRect | null; rotated: boolean } {
  let bestRect: FreeRect | null = null;
  let bestArea = Infinity;
  let rotated = false;

  for (const rect of freeRects) {
    // Try normal orientation
    if (pieceLength <= rect.width && pieceWidth <= rect.height) {
      const area = rect.width * rect.height;
      if (area < bestArea) {
        bestArea = area;
        bestRect = rect;
        rotated = false;
      }
    }

    // Try rotated orientation if allowed
    if (allowRotation && pieceWidth <= rect.width && pieceLength <= rect.height) {
      const area = rect.width * rect.height;
      if (area < bestArea) {
        bestArea = area;
        bestRect = rect;
        rotated = true;
      }
    }
  }

  return { rect: bestRect, rotated };
}

/**
 * Merge adjacent free rectangles to reduce fragmentation
 */
function mergeFreeRects(freeRects: FreeRect[]): FreeRect[] {
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

/**
 * Calculate waste regions from remaining free rectangles
 */
function calculateWasteRegions(freeRects: FreeRect[], sheetLength: number, sheetWidth: number): WasteRegion[] {
  const merged = mergeFreeRects(freeRects);
  return merged.map(rect => ({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  }));
}

/**
 * Optimize cutlist using First-Fit Decreasing with guillotine cutting
 * @param input - Cutlist input with pieces and configuration
 * @returns Optimized cutlist result with layouts and cut sequence
 * @throws {Error} If no pieces provided or no sheets available
 */
export function optimizeCutlist(input: CutlistInput): CutlistResult {
  const { pieces, config } = input;
  const { sheets, allowRotation, kerf = 0 } = config;

  if (!pieces || pieces.length === 0) {
    throw new Error("No pieces provided to optimize");
  }

  if (!sheets || sheets.length === 0) {
    throw new Error("No sheets available for optimization");
  }

  // Expand pieces by quantity into individual instances
  const pieceInstances: PieceInstance[] = [];
  for (const piece of pieces) {
    const quantity = (piece as { quantity?: number }).quantity ?? 1;
    for (let i = 0; i < quantity; i++) {
      pieceInstances.push({ piece, instanceIndex: i });
    }
  }

  // Sort by area descending (First-Fit Decreasing)
  pieceInstances.sort((a, b) => {
    const areaA = a.piece.length * a.piece.width;
    const areaB = b.piece.length * b.piece.width;
    if (areaB !== areaA) return areaB - areaA;
    // Tie-breaker: prefer longer pieces
    return b.piece.length - a.piece.length;
  });

  // Track sheets and their free space
  interface SheetState {
    sheet: Sheet;
    freeRects: FreeRect[];
    placedPieces: PlacedPiece[];
  }

  const sheetStates: SheetState[] = [];

  // Place each piece
  for (const instance of pieceInstances) {
    const { piece } = instance;
    const pieceLength = piece.length + kerf;
    const pieceWidth = piece.width + kerf;

    let placed = false;

    // Try to fit on existing sheets
    for (const sheetState of sheetStates) {
      const result = findBestFreeRect(
        pieceLength,
        pieceWidth,
        sheetState.freeRects,
        allowRotation,
        piece.grain
      );

      if (result.rect) {
        const rotated = shouldRotate(pieceLength, pieceWidth, result.rect, piece.grain);
        const actualLength = rotated ? pieceWidth : pieceLength;
        const actualWidth = rotated ? pieceLength : pieceWidth;

        const placedPiece: PlacedPiece = {
          piece,
          x: result.rect.x,
          y: result.rect.y,
          rotated,
          sheetId: sheetState.sheet.id
        };

        sheetState.placedPieces.push(placedPiece);
        sheetState.freeRects = splitFreeRects(
          sheetState.freeRects,
          result.rect.x,
          result.rect.y,
          actualLength,
          actualWidth
        );
        placed = true;
        break;
      }
    }

    // If not placed, try to open a new sheet
    if (!placed) {
      // Find best fitting sheet
      let bestSheet: Sheet | null = null;
      let bestFit = Infinity;

      for (const sheet of sheets) {
        const sheetArea = sheet.length * sheet.width;
        const pieceArea = pieceLength * pieceWidth;
        if (sheetArea >= pieceArea && sheetArea < bestFit) {
          bestFit = sheetArea;
          bestSheet = sheet;
        }
      }

      if (!bestSheet) {
        // Use first sheet as fallback
        bestSheet = sheets[0];
      }

      const initialFreeRect: FreeRect = {
        x: 0,
        y: 0,
        width: bestSheet.length,
        height: bestSheet.width
      };

      const result = findBestFreeRect(
        pieceLength,
        pieceWidth,
        [initialFreeRect],
        allowRotation,
        piece.grain
      );

      if (result.rect) {
        const rotated = shouldRotate(pieceLength, pieceWidth, result.rect, piece.grain);
        const actualLength = rotated ? pieceWidth : pieceLength;
        const actualWidth = rotated ? pieceLength : pieceWidth;

        const placedPiece: PlacedPiece = {
          piece,
          x: result.rect.x,
          y: result.rect.y,
          rotated,
          sheetId: bestSheet.id
        };

        const newFreeRects = splitFreeRects(
          [initialFreeRect],
          result.rect.x,
          result.rect.y,
          actualLength,
          actualWidth
        );

        sheetStates.push({
          sheet: bestSheet,
          freeRects: newFreeRects,
          placedPieces: [placedPiece]
        });
      }
    }
  }

  // Build sheet layouts
  const layouts: SheetLayout[] = [];
  let totalPieceArea = 0;
  let totalSheetArea = 0;

  for (const state of sheetStates) {
    const sheetArea = state.sheet.length * state.sheet.width;
    const usedArea = state.placedPieces.reduce((sum, p) => {
      return sum + (p.piece.length + kerf) * (p.piece.width + kerf);
    }, 0);
    const wasteArea = sheetArea - usedArea;

    totalPieceArea += usedArea;
    totalSheetArea += sheetArea;

    const waste = calculateWasteRegions(state.freeRects, state.sheet.length, state.sheet.width);

    layouts.push({
      sheet: state.sheet,
      pieces: state.placedPieces,
      waste,
      usedArea,
      wasteArea
    });
  }

  // Generate cut sequence (simplified guillotine cuts)
  const cutSequence: CutStep[] = [];
  let step = 1;

  for (let sheetIdx = 0; sheetIdx < layouts.length; sheetIdx++) {
    const layout = layouts[sheetIdx];
    const sortedPieces = [...layout.pieces].sort((a, b) => {
      if (Math.abs(a.y - b.y) > 1) return a.y - b.y;
      return a.x - b.x;
    });

    for (const placed of sortedPieces) {
      // Horizontal cuts at piece boundaries
      if (placed.y > 0) {
        cutSequence.push({
          step: step++,
          direction: "horizontal",
          position: placed.y,
          sheetIndex: sheetIdx,
          cutLength: placed.rotated ? placed.piece.width : placed.piece.length,
          resultingPieceId: placed.piece.id
        });
      }

      // Vertical cuts at piece boundaries
      if (placed.x > 0) {
        cutSequence.push({
          step: step++,
          direction: "vertical",
          position: placed.x,
          sheetIndex: sheetIdx,
          cutLength: placed.rotated ? placed.piece.length : placed.piece.width,
          resultingPieceId: placed.piece.id
        });
      }
    }
  }

  const wastePercentage = totalSheetArea > 0
    ? ((totalSheetArea - totalPieceArea) / totalSheetArea) * 100
    : 0;

  return {
    layouts,
    cutSequence,
    wastePercentage,
    totalPieceArea,
    totalSheetArea,
    sheetCount: layouts.length
  };
}