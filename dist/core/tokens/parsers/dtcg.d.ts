/**
 * DTCG (Design Tokens Community Group) JSON parser.
 *
 * Reads DTCG-spec JSON (https://tr.designtokens.org/format/) and produces our
 * canonical internal TokenDocument. Designed for non-destructive round-trip:
 * a document serialized by `formatDtcg` then parsed back through this module
 * is equal to the original (modulo key ordering, which the formatter sorts
 * for stable diffs).
 *
 * Handles:
 *   - Group nesting with arbitrary depth
 *   - $value / $type / $description / $extensions on leaf tokens
 *   - Alias references: `"$value": "{path.to.token}"`
 *   - Group-level $type inheritance per the DTCG spec (tokens without their
 *     own $type inherit from their nearest ancestor group that has one)
 *   - Our $extensions["figma-console-mcp"] metadata for round-trip ID preservation
 *   - Multi-mode tokens stashed in $extensions.modes by our formatter
 */
import type { ParseInput, ParseResult } from "./index.js";
export declare function parseDtcg(input: ParseInput): ParseResult;
//# sourceMappingURL=dtcg.d.ts.map