import { describe, it, expect, beforeEach } from 'bun:test';
import { LayoutEditor } from '../src/editor';
import type { Piece, Sheet, SheetLayout, PlacedPiece } from '../src/types';

describe('LayoutEditor', () => {
  let sheet: Sheet;
  let piece1: Piece;
  let piece2: Piece;
  let initialLayout: SheetLayout;

  beforeEach(() => {
    sheet = { id: 's1', length: 96, width: 48 };
    piece1 = { id: 'p1', length: 48, width: 24 };
    piece2 = { id: 'p2', length: 24, width: 24 };

    const placed1: PlacedPiece = {
      piece: piece1,
      x: 0,
      y: 0,
      rotated: false,
      sheetId: 's1'
    };

    const placed2: PlacedPiece = {
      piece: piece2,
      x: 48,
      y: 0,
      rotated: false,
      sheetId: 's1'
    };

    initialLayout = {
      sheet,
      pieces: [placed1, placed2],
      waste: [],
      usedArea: 48*24 + 24*24,
      wasteArea: 96*48 - (48*24 + 24*24)
    };
  });

  it('should move piece within free space', () => {
    const editor = new LayoutEditor(initialLayout);
    expect(editor.movePiece('p2', 0, 24)).toBeTrue();
    
    const layout = editor.getLayout();
    const moved = layout.pieces.find(p => p.piece.id === 'p2');
    expect(moved?.x).toBe(0);
    expect(moved?.y).toBe(24);
  });

  it('should prevent overlapping moves', () => {
    const editor = new LayoutEditor(initialLayout);
    expect(editor.movePiece('p2', 24, 0)).toBeFalse();
  });

  it('should rotate piece when space allows', () => {
    const editor = new LayoutEditor(initialLayout);
    expect(editor.rotatePiece('p1')).toBeTrue();
    
    const rotated = editor.getLayout().pieces.find(p => p.piece.id === 'p1');
    expect(rotated?.rotated).toBeTrue();
    expect(rotated?.x).toBe(0);
    expect(rotated?.y).toBe(0);
  });

  it('should prevent invalid rotations', () => {
    // Create overlapping scenario
    initialLayout.pieces[1].x = 24;
    const editor = new LayoutEditor(initialLayout);
    expect(editor.rotatePiece('p1')).toBeFalse();
  });

  it('should add new piece to empty space', () => {
    const editor = new LayoutEditor(initialLayout);
    const newPiece: Piece = { id: 'p3', length: 24, width: 24 };
    expect(editor.addPiece(newPiece, 72, 0, false)).toBeTrue();
    expect(editor.getLayout().pieces).toHaveLength(3);
  });

  it('should remove piece and update waste', () => {
    const editor = new LayoutEditor(initialLayout);
    editor.removePiece('p2');
    const layout = editor.getLayout();
    expect(layout.pieces).toHaveLength(1);
    expect(layout.waste.some(w => w.x === 48 && w.width === 24)).toBeTrue();
  });
});
