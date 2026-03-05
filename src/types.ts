// REMOVED external import: import type { Readonly } from "util/types";

/**
 * A required piece to be cut from sheet goods.
 * Represents a single part with dimensions and optional metadata.
 */
export interface Piece {
  /** Unique identifier for this piece */
  readonly id: string;
  /** Length dimension (along grain) */
  readonly length: number;
  /** Width dimension (across grain) */
  readonly width: number;
  /** Optional label for identification (e.g., "shelf", "back") */
  readonly label?: string;
  /** Grain direction preference: "longitudinal" | "cross" | "any" */
  readonly grain?: "longitudinal" | "cross" | "any";
}

/**
 * Standard sheet goods dimensions.
 * Represents raw material available for cutting.
 */
export interface Sheet {
  /** Unique identifier for this sheet type */
  readonly id: string;
  /** Standard length dimension */
  readonly length: number;
  /** Standard width dimension */
  readonly width: number;
  /** Material type (e.g., " plywood", "MDF", "lumber") */
  readonly material?: string;
}

/**
 * A piece that has been placed on a sheet with position and rotation.
 */
export interface PlacedPiece {
  /** Reference to the original piece */
  readonly piece: Piece;
  /** X coordinate of the bottom-left corner */
  readonly x: number;
  /** Y coordinate of the bottom-left corner */
  readonly y: number;
  /** Whether the piece is rotated 90 degrees */
  readonly rotated: boolean;
  /** Reference to the sheet this piece is placed on */
  readonly sheetId: string;
}

/**
 * A rectangular waste region on a sheet.
 */
export interface WasteRegion {
  /** X coordinate of the bottom-left corner */
  readonly x: number;
  /** Y coordinate of the bottom-left corner */
  readonly y: number;
  /** Width of the waste region */
  readonly width: number;
  /** Height of the waste region */
  readonly height: number;
}

/**
 * Complete layout for a single sheet including placed pieces and waste.
 */
export interface SheetLayout {
  /** Reference to the sheet used */
  readonly sheet: Sheet;
  /** All pieces placed on this sheet */
  readonly pieces: readonly PlacedPiece[];
  /** Identified waste regions */
  readonly waste: readonly WasteRegion[];
  /** Total usable area in square units */
  readonly usedArea: number;
  /** Total waste area in square units */
  readonly wasteArea: number;
}

/**
 * A single cutting instruction in the cut sequence.
 */
export interface CutStep {
  /** Step number in the sequence */
  readonly step: number;
  /** Type of cut: "vertical" or "horizontal" */
  readonly direction: "vertical" | "horizontal";
  /** X coordinate for vertical cuts, Y coordinate for horizontal */
  readonly position: number;
  /** Sheet index this cut applies to */
  readonly sheetIndex: number;
  /** Length of the cut in the perpendicular direction */
  readonly cutLength: number;
  /** Optional: piece being created by this cut */
  readonly resultingPieceId?: string;
}

/**
 * Configuration for the optimization algorithm.
 */
export interface OptimizerConfig {
  /** Blade kerf width (reduces usable material) */
  readonly kerf: number;
  /** Available sheet sizes to use */
  readonly sheets: readonly Sheet[];
  /** Whether to allow piece rotation (90 degrees) */
  readonly allowRotation: boolean;
  /** Maximum number of sheets to use (0 = unlimited) */
  readonly maxSheets?: number;
  /** Optimization algorithm: "basic" | "guillotine" */
  readonly algorithm?: "basic" | "guillotine";
}

/**
 * Complete result from the cutlist optimizer.
 */
export interface CutlistResult {
  /** Optimized layouts for each sheet used */
  readonly layouts: readonly SheetLayout[];
  /** Ordered cutting instructions for all sheets */
  readonly cutSequence: readonly CutStep[];
  /** Total waste percentage across all sheets */
  readonly wastePercentage: number;
  /** Total area of all required pieces */
  readonly totalPieceArea: number;
  /** Total area of all sheets used */
  readonly totalSheetArea: number;
  /** Number of sheets used */
  readonly sheetCount: number;
}

/**
 * Input data for the optimizer.
 */
export interface CutlistInput {
  /** Pieces to be cut */
  readonly pieces: readonly Piece[];
  /** Optimizer configuration */
  readonly config: OptimizerConfig;
}

/**
 * Result of validating a piece.
 */
export type PieceValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly error: string };

/**
 * Result of validating a sheet.
 */
export type SheetValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly error: string };

/**
 * Result of validating optimizer configuration.
 */
export type ConfigValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly error: string };