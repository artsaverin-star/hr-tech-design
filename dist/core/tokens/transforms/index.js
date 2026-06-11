/**
 * Token-value transforms. Each transform is a pure function that takes a
 * TokenValue (and an options bag) and returns a transformed TokenValue.
 *
 * Transforms are composable — formatters call them in a pipeline appropriate
 * for the output format (e.g. CSS variables need px→rem and string color
 * normalization; DTCG output skips transforms entirely since it preserves the
 * source representation).
 *
 * Currently ships stubs that pass values through unchanged. The DTCG and
 * CSS variables formatters don't need transforms because they handle their
 * own value formatting inline. Transforms will be implemented when the
 * Tailwind v4 / SCSS / TS module formatters land.
 */
/**
 * Run a pipeline of transforms on a token's value(s). Iterates every mode
 * and applies each transform in order.
 */
export function runTransforms(token, transforms, opts) {
    const newValues = {};
    for (const [mode, value] of Object.entries(token.values)) {
        let result = value;
        for (const transform of transforms) {
            result = transform(result, token, opts);
        }
        newValues[mode] = result;
    }
    return { ...token, values: newValues };
}
//# sourceMappingURL=index.js.map