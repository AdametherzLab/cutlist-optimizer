import type { CutlistResult, CutStep, SheetLayout, PlacedPiece, WasteRegion } from "./types";

/**
 * Generates an ordered cutting sequence from optimized layouts.
 * Groups cuts by direction to minimize re-setup (all rip cuts first, then crosscuts).
 * @param result - The optimized cutlist result from the optimizer
 * @returns Ordered array of cut steps for all sheets
 * @example
 * const sequence = generateCutSequence(optimizerResult);
 * // Returns: [{ step: 1, direction: "vertical", position: 24, sheetIndex: 0, cutLength: 48, resultingPieceId: "p1" }, ...]
 */
export function generateCutSequence(result: CutlistResult): readonly CutStep[] {
  const steps: CutStep[] = [];
  let stepNumber = 1;

  for (let sheetIdx = 0; sheetIdx < result.layouts.length; sheetIdx++) {
    const layout = result.layouts[sheetIdx];
    const sheetLength = layout.sheet.length;
    const sheetWidth = layout.sheet.width;

    // Collect all unique cut positions
    const verticalCuts: { position: number; cutLength: number; pieceId?: string }[] = [];
    const horizontalCuts: { position: number; cutLength: number; pieceId?: string }[] = [];

    for (const placed of layout.pieces) {
      const { x, y, piece, rotated } = placed;
      const length = rotated ? piece.width : piece.length;
      const width = rotated ? piece.length : piece.width;

      // Vertical cut at x position (rip cut along Y axis)
      if (x > 0 && x < sheetLength) {
        verticalCuts.push({
          position: x,
          cutLength: sheetWidth,
          pieceId: piece.id,
        });
      }

      // Horizontal cut at y position (crosscut along X axis)
      if (y > 0 && y < sheetWidth) {
        horizontalCuts.push({
          position: y,
          cutLength: sheetLength,
          pieceId: piece.id,
        });
      }

      // Cut at right edge of piece
      const rightEdge = x + length;
      if (rightEdge > 0 && rightEdge < sheetLength) {
        verticalCuts.push({
          position: rightEdge,
          cutLength: sheetWidth,
          pieceId: piece.id,
        });
      }

      // Cut at top edge of piece
      const topEdge = y + width;
      if (topEdge > 0 && topEdge < sheetWidth) {
        horizontalCuts.push({
          position: topEdge,
          cutLength: sheetLength,
          pieceId: piece.id,
        });
      }
    }

    // Deduplicate and sort cuts
    const uniqueVertical = deduplicateCuts(verticalCuts);
    const uniqueHorizontal = deduplicateCuts(horizontalCuts);

    // Add all vertical cuts first (rip cuts - less tool repositioning)
    for (const cut of uniqueVertical) {
      steps.push({
        step: stepNumber++,
        direction: "vertical",
        position: cut.position,
        sheetIndex: sheetIdx,
        cutLength: cut.cutLength,
        resultingPieceId: cut.pieceId,
      });
    }

    // Then all horizontal cuts (crosscuts)
    for (const cut of uniqueHorizontal) {
      steps.push({
        step: stepNumber++,
        direction: "horizontal",
        position: cut.position,
        sheetIndex: sheetIdx,
        cutLength: cut.cutLength,
        resultingPieceId: cut.pieceId,
      });
    }
  }

  return steps;
}

/**
 * Deduplicate cut positions within a small tolerance.
 */
function deduplicateCuts(
  cuts: readonly { position: number; cutLength: number; pieceId?: string }[]
): readonly { position: number; cutLength: number; pieceId?: string }[] {
  const tolerance = 0.01;
  const unique: { position: number; cutLength: number; pieceId?: string }[] = [];

  for (const cut of cuts) {
    const exists = unique.some(
      (u) => Math.abs(u.position - cut.position) < tolerance
    );
    if (!exists) {
      unique.push(cut);
    }
  }

  // Sort by position for consistent ordering
  return unique.sort((a, b) => a.position - b.position);
}

/**
 * Renders a sheet layout as an ASCII diagram.
 * @param layout - The sheet layout to render
 * @param cellSize - Size of each grid cell (default 2 characters wide)
 * @returns ASCII string representation of the layout
 * @example
 * const diagram = renderLayoutDiagram(layout);
 * console.log(diagram);
 * // ┌────────────────────────┐
 * // │ p1    │ p2    │ waste  │
 * // │       │       │        │
 * // ├───────┼───────┼────────┤
 * // │ p3    │ waste │ p4     │
 * // │       │       │        │
 * // └───────┴───────┴────────┘
 */
export function renderLayoutDiagram(layout: SheetLayout, cellSize: number = 4): string {
  const sheet = layout.sheet;
  const cellWidth = cellSize;
  const cellHeight = 2; // Characters tall per cell

  // Calculate grid dimensions
  const gridCols = Math.ceil(sheet.length / cellWidth);
  const gridRows = Math.ceil(sheet.width / cellHeight);

  // Initialize grid with empty cells
  const grid: string[][] = [];
  for (let y = 0; y < gridRows; y++) {
    grid[y] = [];
    for (let x = 0; x < gridCols; x++) {
      grid[y][x] = " ";
    }
  }

  // Place pieces on grid
  for (const placed of layout.pieces) {
    const { x, y, piece, rotated } = placed;
    const length = rotated ? piece.width : piece.length;
    const width = rotated ? piece.length : piece.width;

    const startCol = Math.floor(x / cellWidth);
    const startRow = Math.floor(y / cellHeight);
    const endCol = Math.ceil((x + length) / cellWidth);
    const endRow = Math.ceil((y + width) / cellHeight);

    const label = piece.label || piece.id;
    const displayLabel = label.substring(0, cellWidth - 1);

    for (let row = startRow; row < endRow && row < gridRows; row++) {
      for (let col = startCol; col < endCol && col < gridCols; col++) {
        if (row === startRow && col === startCol) {
          grid[row][col] = displayLabel;
        } else if (row === startRow) {
          grid[row][col] = displayLabel;
        } else if (col === startCol) {
          grid[row][col] = displayLabel;
        }
      }
    }
  }

  // Mark waste regions
  for (const waste of layout.waste) {
    const startCol = Math.floor(waste.x / cellWidth);
    const startRow = Math.floor(waste.y / cellHeight);
    const endCol = Math.ceil((waste.x + waste.width) / cellWidth);
    const endRow = Math.ceil((waste.y + waste.height) / cellHeight);

    for (let row = startRow; row < endRow && row < gridRows; row++) {
      for (let col = startCol; col < endCol && col < gridCols; col++) {
        if (grid[row][col] === " ") {
          grid[row][col] = "·";
        }
      }
    }
  }

  // Build ASCII diagram with borders
  const lines: string[] = [];

  // Top border
  lines.push("┌" + "─".repeat(gridCols * (cellWidth + 1) - 1) + "┐");

  for (let row = 0; row < gridRows; row++) {
    let line = "│";
    for (let col = 0; col < gridCols; col++) {
      const cell = grid[row][col] || " ";
      line += cell.padEnd(cellWidth) + "│";
    }
    lines.push(line);

    if (row < gridRows - 1) {
      let divider = "├";
      for (let col = 0; col < gridCols; col++) {
        divider += "─".repeat(cellWidth) + (col < gridCols - 1 ? "┼" : "┤");
      }
      lines.push(divider);
    }
  }

  // Bottom border
  lines.push("└" + "─".repeat(gridCols * (cellWidth + 1) - 1) + "┘");

  // Add legend
  lines.push("");
  lines.push(`Sheet: ${sheet.id} (${sheet.length}x${sheet.width})`);
  lines.push(`Pieces: ${layout.pieces.length}, Waste: ${layout.wasteArea.toFixed(1)} (${((layout.wasteArea / (sheet.length * sheet.width)) * 100).toFixed(1)}%)`);

  return lines.join("\n");
}

/**
 * Computes detailed waste map coordinates for a sheet layout.
 * @param layout - The sheet layout to analyze
 * @returns Array of waste regions with coordinates and dimensions
 * @example
 * const wasteMap = computeWasteMap(layout);
 * // Returns: [{ x: 48, y: 0, width: 48, height: 96 }, ...]
 */
export function computeWasteMap(layout: SheetLayout): readonly WasteRegion[] {
  return layout.waste;
}

/**
 * Generates a summary report for a cutlist result.
 * @param result - The optimized cutlist result
 * @returns Formatted text report
 * @example
 * const report = generateReport(result);
 * console.log(report);
 */
export function generateReport(result: CutlistResult): string {
  const lines: string[] = [];

  lines.push("═══════════════════════════════════════════════════════");
  lines.push("              CUTLIST OPTIMIZATION REPORT              ");
  lines.push("═══════════════════════════════════════════════════════");
  lines.push("");

  lines.push(`Total Sheets Used: ${result.sheetCount}`);
  lines.push(`Total Piece Area: ${result.totalPieceArea.toFixed(1)} sq units`);
  lines.push(`Total Sheet Area: ${result.totalSheetArea.toFixed(1)} sq units`);
  lines.push(`Waste Percentage: ${result.wastePercentage.toFixed(1)}%`);
  lines.push("");

  lines.push("───────────────────────────────────────────────────────");
  lines.push("                    SHEET LAYOUTS                      ");
  lines.push("───────────────────────────────────────────────────────");

  for (let i = 0; i < result.layouts.length; i++) {
    const layout = result.layouts[i];
    lines.push("");
    lines.push(`Sheet ${i + 1}: ${layout.sheet.id} (${layout.sheet.length}x${layout.sheet.width})`);
    lines.push(`  Pieces: ${layout.pieces.length}`);
    lines.push(`  Used Area: ${layout.usedArea.toFixed(1)}`);
    lines.push(`  Waste Area: ${layout.wasteArea.toFixed(1)} (${((layout.wasteArea / (layout.sheet.length * layout.sheet.width)) * 100).toFixed(1)}%)`);
    lines.push("");

    // Show piece list
    lines.push("  Pieces on this sheet:");
    for (const placed of layout.pieces) {
      const dims = placed.rotated
        ? `${placed.piece.width}x${placed.piece.length}`
        : `${placed.piece.length}x${placed.piece.width}`;
      const label = placed.piece.label ? ` (${placed.piece.label})` : "";
      lines.push(`    - ${placed.piece.id}${label}: ${dims} @ (${placed.x}, ${placed.y})`);
    }
  }

  lines.push("");
  lines.push("───────────────────────────────────────────────────────");
  lines.push("                    CUT SEQUENCE                       ");
  lines.push("───────────────────────────────────────────────────────");

  const sheetGroups = new Map<number, CutStep[]>();
  for (const step of result.cutSequence) {
    const existing = sheetGroups.get(step.sheetIndex) || [];
    existing.push(step);
    sheetGroups.set(step.sheetIndex, existing);
  }

  for (const [sheetIdx, steps] of sheetGroups) {
    lines.push("");
    lines.push(`Sheet ${sheetIdx + 1}:`);
    for (const step of steps) {
      const dir = step.direction === "vertical" ? "RIP" : "CROSS";
      const piece = step.resultingPieceId ? ` [${step.resultingPieceId}]` : "";
      lines.push(`  ${step.step}. ${dir} cut at ${step.position}"${piece}`);
    }
  }

  lines.push("");
  lines.push("═══════════════════════════════════════════════════════");

  return lines.join("\n");
}