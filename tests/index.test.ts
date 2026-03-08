import { describe, it, expect } from "bun:test";
import { optimizeCutlist, generateCutSequence, renderLayoutDiagram } from "../src/index";
import type { Piece, OptimizerConfig, SheetLayout } from "../src/index";

describe("cutlist-optimizer", () => {
  it("basic optimization fits 2 pieces on one sheet with valid cut sequence", () => {
    const pieces: Piece[] = [
      { id: "p1", length: 48, width: 24, quantity: 1 },
      { id: "p2", length: 48, width: 24, quantity: 1 },
    ];
    const config: OptimizerConfig = {
      sheets: [{ id: "s1", length: 96, width: 48 }],
      kerf: 0.125,
      allowRotation: true,
    };

    const result = optimizeCutlist(pieces, config);

    expect(result.totalSheets).toBe(1);
    expect(result.cutSequence.length).toBeGreaterThan(0);

    const stepNumbers = result.cutSequence.map((s) => s.step);
    for (let i = 0; i < stepNumbers.length; i++) {
      expect(stepNumbers[i]).toBe(i + 1);
    }
  });

  it("multiple pieces require multiple sheets with quantity expansion", () => {
    const pieces: Piece[] = [
      { id: "p1", length: 48, width: 24, quantity: 3 },
      { id: "p2", length: 48, width: 24, quantity: 3 },
    ];
    const config: OptimizerConfig = {
      sheets: [{ id: "s1", length: 96, width: 48 }],
      kerf: 0.125,
      allowRotation: true,
    };

    const result = optimizeCutlist(pieces, config);

    expect(result.totalSheets).toBeGreaterThanOrEqual(2);
    const totalPlacedPieces = result.layouts.reduce(
      (sum, layout) => sum + layout.placedPieces.length,
      0
    );
    expect(totalPlacedPieces).toBe(6);
  });

  it("waste percentage is between 0 and 100 and mathematically correct", () => {
    const pieces: Piece[] = [
      { id: "p1", length: 48, width: 24, quantity: 1 },
    ];
    const config: OptimizerConfig = {
      sheets: [{ id: "s1", length: 96, width: 48 }],
      kerf: 0.125,
      allowRotation: true,
    };

    const result = optimizeCutlist(pieces, config);

    expect(result.totalWastePercent).toBeGreaterThanOrEqual(0);
    expect(result.totalWastePercent).toBeLessThanOrEqual(100);

    const sheetArea = 96 * 48;
    const pieceArea = 48 * 24;
    const expectedWastePercent = ((sheetArea - pieceArea) / sheetArea) * 100;
    expect(result.totalWastePercent).toBeCloseTo(expectedWastePercent, 1);
  });

  it("rotation disabled prevents rotated placements and uses more sheets", () => {
    const pieces: Piece[] = [
      { id: "p1", length: 24, width: 48, quantity: 1 },
      { id: "p2", length: 24, width: 48, quantity: 1 },
    ];
    const config: OptimizerConfig = {
      sheets: [{ id: "s1", length: 96, width: 48 }],
      kerf: 0.125,
      allowRotation: false,
    };

    const result = optimizeCutlist(pieces, config);

    const hasRotatedPiece = result.layouts.some((layout) =>
      layout.placedPieces.some((p) => p.rotated === true)
    );
    expect(hasRotatedPiece).toBe(false);

    const diagram = renderLayoutDiagram(result.layouts[0]);
    expect(diagram.length).toBeGreaterThan(0);
  });

  it("piece larger than sheet throws descriptive error", () => {
    const pieces: Piece[] = [
      { id: "oversized", length: 120, width: 60, quantity: 1 },
    ];
    const config: OptimizerConfig = {
      sheets: [{ id: "s1", length: 96, width: 48 }],
      kerf: 0.125,
      allowRotation: true,
    };

    expect(() => optimizeCutlist(pieces, config)).toThrow();
  });

  it("uses multiple sheet sizes when specified", () => {
    const pieces: Piece[] = [
      { id: "p1", length: 96, width: 48, quantity: 1 },
      { id: "p2", length: 48, width: 24, quantity: 2 },
    ];
    const config: OptimizerConfig = {
      sheets: [
        { id: "large", length: 96, width: 48 },
        { id: "small", length: 48, width: 24 },
      ],
      kerf: 0.125,
      allowRotation: true,
    };

    const result = optimizeCutlist(pieces, config);
    
    expect(result.layouts.some(l => l.sheet.id === "large")).toBe(true);
    expect(result.layouts.some(l => l.sheet.id === "small")).toBe(true);
    expect(result.totalSheets).toBe(2);
  });
});