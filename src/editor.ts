import type { Piece, Sheet, PlacedPiece, WasteRegion, SheetLayout, FreeRect } from './types';
import { splitFreeRects, mergeFreeRects } from './optimizer';

function rectanglesOverlap(
  x1: number, y1: number, w1: number, h1: number,
  x2: number, y2: number, w2: number, h2: number
): boolean {
  return !(x1 + w1 <= x2 || x2 + w2 <= x1 || y1 + h1 <= y2 || y2 + h2 <= y1);
}

interface InternalPlacedPiece extends PlacedPiece {
  piece: Piece;
}

/**
 * Interactive layout editor allowing manual adjustments to sheet layouts
 */
export class LayoutEditor {
  private sheet: Sheet;
  private pieces: InternalPlacedPiece[];
  private freeRects: FreeRect[];

  constructor(initialLayout: SheetLayout) {
    this.sheet = initialLayout.sheet;
    this.pieces = initialLayout.pieces.map(p => ({
      ...p,
      piece: { ...p.piece } // Deep clone piece
    }));
    
    this.freeRects = [{ x: 0, y: 0, width: this.sheet.length, height: this.sheet.width }];

    for (const piece of this.pieces) {
      const width = piece.rotated ? piece.piece.width : piece.piece.length;
      const height = piece.rotated ? piece.piece.length : piece.piece.width;
      this.freeRects = splitFreeRects(this.freeRects, piece.x, piece.y, width, height);
    }
  }

  private findPieceIndex(pieceId: string): number {
    const index = this.pieces.findIndex(p => p.piece.id === pieceId);
    if (index === -1) throw new Error(`Piece ${pieceId} not found`);
    return index;
  }

  /**
   * Move a piece to new coordinates if valid
   * @returns true if move was successful
   */
  movePiece(pieceId: string, newX: number, newY: number): boolean {
    const index = this.findPieceIndex(pieceId);
    const piece = this.pieces[index];
    const rotated = piece.rotated;
    const width = rotated ? piece.piece.width : piece.piece.length;
    const height = rotated ? piece.piece.length : piece.piece.width;

    // Boundary check
    if (newX < 0 || newY < 0 || 
        newX + width > this.sheet.length || 
        newY + height > this.sheet.width) {
      return false;
    }

    // Collision check
    for (const other of this.pieces) {
      if (other.piece.id === pieceId) continue;
      const ow = other.rotated ? other.piece.width : other.piece.length;
      const oh = other.rotated ? other.piece.length : other.piece.width;
      
      if (rectanglesOverlap(
        newX, newY, width, height,
        other.x, other.y, ow, oh
      )) return false;
    }

    // Remove piece temporaily
    const [removed] = this.pieces.splice(index, 1);
    const rWidth = removed.rotated ? removed.piece.width : removed.piece.length;
    const rHeight = removed.rotated ? removed.piece.length : removed.piece.width;

    // Restore original area
    let newFree = [...this.freeRects, { x: removed.x, y: removed.y, width: rWidth, height: rHeight }];
    this.freeRects = mergeFreeRects(newFree);

    // Check new position fits
    const fits = this.freeRects.some(rect =>
      newX >= rect.x &&
      newY >= rect.y &&
      newX + width <= rect.x + rect.width &&
      newY + height <= rect.y + rect.height
    );

    if (!fits) {
      this.pieces.splice(index, 0, removed);
      this.freeRects = splitFreeRects(this.freeRects, removed.x, removed.y, rWidth, rHeight);
      return false;
    }

    // Apply move
    this.pieces.push({ ...piece, x: newX, y: newY });
    this.freeRects = splitFreeRects(this.freeRects, newX, newY, width, height);
    return true;
  }

  /**
   * Rotate piece 90 degrees if possible
   * @returns true if rotation was successful
   */
  rotatePiece(pieceId: string): boolean {
    const index = this.findPieceIndex(pieceId);
    const piece = this.pieces[index];
    const newRotated = !piece.rotated;
    const newWidth = newRotated ? piece.piece.width : piece.piece.length;
    const newHeight = newRotated ? piece.piece.length : piece.piece.width;

    // Boundary check
    if (piece.x + newWidth > this.sheet.length ||
        piece.y + newHeight > this.sheet.width) {
      return false;
    }

    // Rotation collision check
    for (const other of this.pieces) {
      if (other.piece.id === pieceId) continue;
      const ow = other.rotated ? other.piece.width : other.piece.length;
      const oh = other.rotated ? other.piece.length : other.piece.width;
      
      if (rectanglesOverlap(
        piece.x, piece.y, newWidth, newHeight,
        other.x, other.y, ow, oh
      )) return false;
    }

    // Remove and re-add with new dimensions
    const [removed] = this.pieces.splice(index, 1);
    const rWidth = removed.rotated ? removed.piece.width : removed.piece.length;
    const rHeight = removed.rotated ? removed.piece.length : removed.piece.width;

    let newFree = [...this.freeRects, { x: removed.x, y: removed.y, width: rWidth, height: rHeight }];
    newFree = mergeFreeRects(newFree);

    // Check fit with new rotation
    const fits = newFree.some(rect =>
      removed.x >= rect.x &&
      removed.y >= rect.y &&
      removed.x + newWidth <= rect.x + rect.width &&
      removed.y + newHeight <= rect.y + rect.height
    );

    if (!fits) {
      this.pieces.splice(index, 0, removed);
      this.freeRects = splitFreeRects(newFree, removed.x, removed.y, rWidth, rHeight);
      return false;
    }

    this.pieces.push({ ...removed, rotated: newRotated });
    this.freeRects = splitFreeRects(newFree, removed.x, removed.y, newWidth, newHeight);
    return true;
  }

  /**
   * Add new piece to layout if space permits
   * @returns true if placement succeeded
   */
  addPiece(piece: Piece, x: number, y: number, rotated: boolean): boolean {
    const width = rotated ? piece.width : piece.length;
    const height = rotated ? piece.length : piece.width;

    // Boundary check
    if (x < 0 || y < 0 || 
        x + width > this.sheet.length || 
        y + height > this.sheet.width) {
      return false;
    }

    // Collision check
    for (const existing of this.pieces) {
      const ew = existing.rotated ? existing.piece.width : existing.piece.length;
      const eh = existing.rotated ? existing.piece.length : existing.piece.width;
      
      if (rectanglesOverlap(
        x, y, width, height,
        existing.x, existing.y, ew, eh
      )) return false;
    }

    // Free space check
    if (!this.freeRects.some(rect => 
      x >= rect.x &&
      y >= rect.y &&
      x + width <= rect.x + rect.width &&
      y + height <= rect.y + rect.height
    )) return false;

    this.pieces.push({
      piece: { ...piece },
      x,
      y,
      rotated,
      sheetId: this.sheet.id
    });

    this.freeRects = splitFreeRects(this.freeRects, x, y, width, height);
    return true;
  }

  /**
   * Remove piece from layout
   */
  removePiece(pieceId: string): void {
    const index = this.findPieceIndex(pieceId);
    const [removed] = this.pieces.splice(index, 1);
    const width = removed.rotated ? removed.piece.width : removed.piece.length;
    const height = removed.rotated ? removed.piece.length : removed.piece.width;

    this.freeRects = mergeFreeRects([
      ...this.freeRects,
      { x: removed.x, y: removed.y, width, height }
    ]);
  }

  /**
   * Get current layout state
   */
  getLayout(): SheetLayout {
    const usedArea = this.pieces.reduce((sum, p) => 
      sum + (p.piece.length * p.piece.width), 0);
    
    return {
      sheet: this.sheet,
      pieces: [...this.pieces],
      waste: this.freeRects.map(r => ({
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height
      })),
      usedArea,
      wasteArea: (this.sheet.length * this.sheet.width) - usedArea
    };
  }
}
