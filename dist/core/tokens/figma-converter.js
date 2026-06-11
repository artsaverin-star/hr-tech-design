/**
 * Convert Figma's variables API response into our canonical TokenDocument.
 *
 * Input: the shape produced by `formatVariables()` in src/core/figma-api.ts
 * (an object with `collections` and `variables` arrays, matching either the
 * REST API's response or the Desktop Bridge plugin's `getLocalVariablesAsync`
 * normalized payload).
 *
 * Output: a TokenDocument with one TokenSet per collection, paths derived
 * from Figma variable names (slash-separated → path arrays), values
 * normalized to our TokenValue shape, and Figma IDs preserved in
 * $extensions["figma-console-mcp"] for round-trip non-destructiveness.
 */
/**
 * Convert a Figma variables payload to our canonical TokenDocument.
 */
export function convertFigmaVariablesToDocument(payload, opts = {}) {
    const warnings = [];
    // Build a variable index for alias resolution: variableId → variable
    const variableById = new Map();
    for (const v of payload.variables)
        variableById.set(v.id, v);
    // Filter collections per scope.
    const wantedCollections = opts.collectionIds?.length
        ? payload.collections.filter((c) => opts.collectionIds.includes(c.id))
        : payload.collections;
    const sets = wantedCollections.map((collection) => convertCollection(collection, payload.variables, variableById, opts, warnings));
    return {
        document: {
            $schema: "https://figma-console-mcp.southleft.com/schemas/dtcg-extended-v1.json",
            sets,
            meta: {
                figmaFileKey: opts.figmaFileKey,
                exportedAt: opts.exportedAt ?? new Date().toISOString(),
                mcpVersion: opts.mcpVersion,
            },
        },
        warnings,
    };
}
function convertCollection(collection, allVariables, variableById, opts, warnings) {
    // Mode filter: keep only modes the caller wants, intersected with what
    // the collection actually has.
    const wantedModes = !opts.modes || opts.modes === "all"
        ? collection.modes
        : collection.modes.filter((m) => opts.modes.includes(m.name));
    // Variables in this collection.
    const collectionVars = allVariables.filter((v) => v.variableCollectionId === collection.id);
    const tokens = collectionVars.map((variable) => convertVariable(variable, wantedModes, variableById, opts, warnings));
    return {
        name: collection.name,
        modes: wantedModes.map((m) => m.name),
        tokens,
        meta: {
            figmaCollectionId: collection.id,
        },
    };
}
function convertVariable(variable, wantedModes, variableById, opts, warnings) {
    // Derive the hierarchical path from the Figma variable name. Figma uses
    // slashes to indicate grouping: "color/brand/primary" → ["color", "brand", "primary"].
    let name = variable.name;
    if (opts.stripPrefix && name.startsWith(opts.stripPrefix)) {
        name = name.slice(opts.stripPrefix.length);
    }
    const path = name.split("/").filter(Boolean);
    // Map resolvedType to TokenType.
    const type = mapResolvedType(variable.resolvedType, variable.name, warnings);
    // Convert each (mode → value) pair to our TokenValue shape, filtered by
    // the wanted modes.
    const values = {};
    for (const mode of wantedModes) {
        const rawValue = variable.valuesByMode[mode.modeId];
        if (rawValue === undefined) {
            warnings.push(`Variable "${variable.name}" has no value for mode "${mode.name}" (${mode.modeId}); skipping that mode.`);
            continue;
        }
        values[mode.name] = convertValue(rawValue, variable.resolvedType, variableById, warnings);
    }
    return {
        path,
        type,
        description: variable.description || undefined,
        values,
        extensions: {
            "figma-console-mcp": {
                variableId: variable.id,
                collectionId: variable.variableCollectionId,
                lastSyncedAt: new Date().toISOString(),
                // We snapshot the synced value so future merge calls can detect
                // two-sided conflicts.
                lastSyncedValue: { ...values },
            },
        },
    };
}
function mapResolvedType(resolvedType, variableName, warnings) {
    switch (resolvedType) {
        case "COLOR":
            return "color";
        case "FLOAT":
            // Figma FLOAT covers both pure numbers and dimensions. We default to
            // "dimension" because the typical FLOAT variable represents spacing,
            // sizing, or radius — all dimensions. A future enhancement could
            // sniff the variable name (e.g. "opacity/*" → "number") for better
            // type fidelity.
            return inferFloatType(variableName);
        case "STRING":
            return inferStringType(variableName);
        case "BOOLEAN":
            return "boolean";
        default: {
            const _exhaustive = resolvedType;
            warnings.push(`Unknown resolvedType "${_exhaustive}" for variable "${variableName}"; treating as string.`);
            return "string";
        }
    }
}
function inferFloatType(variableName) {
    const lower = variableName.toLowerCase();
    if (lower.includes("opacity") || lower.includes("alpha"))
        return "number";
    if (lower.includes("font-weight") || lower.includes("weight"))
        return "fontWeight";
    if (lower.includes("duration") || lower.includes("delay"))
        return "duration";
    // Default: treat numeric variables as dimensions (px values).
    return "dimension";
}
function inferStringType(variableName) {
    const lower = variableName.toLowerCase();
    if (lower.includes("font-family") || lower.includes("font/family"))
        return "fontFamily";
    return "string";
}
function convertValue(rawValue, resolvedType, variableById, warnings) {
    // Alias references: convert variable ID → path-based reference for DTCG.
    if (isVariableAlias(rawValue)) {
        const target = variableById.get(rawValue.id);
        if (!target) {
            // Cross-library alias — target is in a published library this file
            // consumes, not in the local variable set. Preserve the original
            // Figma variable ID in the reference syntax so round-trip can
            // recover it AND formatters can detect this is unresolvable (vs a
            // genuine local-path alias).
            warnings.push(`Alias to unknown variable ID ${rawValue.id} (likely a cross-library reference). Original ID preserved in reference for round-trip.`);
            return { reference: `{__library:${rawValue.id}}` };
        }
        // The DTCG alias path uses dots: "color.brand.primary".
        const dotPath = target.name.replace(/\//g, ".");
        return { reference: `{${dotPath}}` };
    }
    // Literal values per type.
    if (resolvedType === "COLOR") {
        if (typeof rawValue === "object" && rawValue !== null && "r" in rawValue) {
            return { literal: rgbaToHex(rawValue) };
        }
        warnings.push(`COLOR value isn't an RGB object: ${JSON.stringify(rawValue)}`);
        return { literal: String(rawValue) };
    }
    if (resolvedType === "FLOAT") {
        return { literal: typeof rawValue === "number" ? rawValue : Number(rawValue) };
    }
    if (resolvedType === "BOOLEAN") {
        return { literal: Boolean(rawValue) };
    }
    // STRING and fallthrough.
    return { literal: typeof rawValue === "string" ? rawValue : String(rawValue) };
}
function isVariableAlias(value) {
    return (typeof value === "object" &&
        value !== null &&
        "type" in value &&
        value.type === "VARIABLE_ALIAS");
}
/**
 * Convert Figma's `{r, g, b, a}` floats (0–1 range) to a hex string. Returns
 * `#RRGGBB` when alpha is 1 (or absent), `#RRGGBBAA` when alpha < 1.
 */
function rgbaToHex(rgba) {
    const r = clampByte(rgba.r);
    const g = clampByte(rgba.g);
    const b = clampByte(rgba.b);
    const a = rgba.a ?? 1;
    const hex = `#${byteToHex(r)}${byteToHex(g)}${byteToHex(b)}`;
    if (a >= 1)
        return hex;
    return `${hex}${byteToHex(clampByte(a))}`;
}
function clampByte(f) {
    return Math.max(0, Math.min(255, Math.round(f * 255)));
}
function byteToHex(byte) {
    return byte.toString(16).padStart(2, "0").toUpperCase();
}
//# sourceMappingURL=figma-converter.js.map