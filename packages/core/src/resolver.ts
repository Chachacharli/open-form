/**
 * Resolver module for @open-form/core.
 *
 * Architecture: Option A — Inheritance chain.
 * Resolver extends SwaggerParser (parser.ts) and adds $ref / allOf / oneOf / anyOf
 * resolution. The Mapper (mapper.ts) will extend Resolver, and the final exported
 * SwaggerParser is that Mapper class, keeping the public API surface unchanged.
 */

import { SwaggerParser } from './parser'

/** A schema-like object whose values are unknown until resolved. */
type RawSchema = Record<string, unknown>

/**
 * Traverses a dot-separated path (e.g. `components/schemas/User`) over the spec
 * object and returns the value at that path, or `undefined` if any segment is missing.
 */
function getByPath(obj: RawSchema, segments: string[]): unknown {
  let current: unknown = obj
  for (const segment of segments) {
    if (
      current === null ||
      typeof current !== 'object' ||
      Array.isArray(current)
    ) {
      return undefined
    }
    current = (current as RawSchema)[segment]
  }
  return current
}

/**
 * Deep merges two plain objects.  Arrays are concatenated; primitive values from
 * `b` overwrite those of `a`; nested objects are merged recursively.
 */
function deepMerge(a: RawSchema, b: RawSchema): RawSchema {
  const result: RawSchema = { ...a }
  for (const key of Object.keys(b)) {
    const av = a[key]
    const bv = b[key]
    if (
      av !== null &&
      bv !== null &&
      typeof av === 'object' &&
      typeof bv === 'object' &&
      !Array.isArray(av) &&
      !Array.isArray(bv)
    ) {
      result[key] = deepMerge(av as RawSchema, bv as RawSchema)
    } else if (Array.isArray(av) && Array.isArray(bv)) {
      result[key] = [...av, ...bv]
    } else {
      result[key] = bv
    }
  }
  return result
}

/**
 * Extends SwaggerParser with $ref / composition keyword resolution.
 */
export class Resolver extends SwaggerParser {
  /**
   * Resolves a JSON Reference string (e.g. `#/components/schemas/User`) by
   * traversing the spec object and returning the referenced schema.
   *
   * @param ref - A `$ref` value such as `#/components/schemas/User`
   * @param visited - Internal set used to detect circular references
   * @throws `[open-form] Unknown $ref: <ref>` when the path cannot be resolved
   * @throws `[open-form] Circular reference detected at: <path>` on cycles
   */
  resolveRef(ref: string, visited: Set<string> = new Set()): RawSchema {
    if (visited.has(ref)) {
      throw new Error(`[open-form] Circular reference detected at: ${ref}`)
    }
    visited.add(ref)

    // Only local JSON Pointer refs are supported in v1
    if (!ref.startsWith('#/')) {
      throw new Error(
        `[open-form] Unsupported $ref format "${ref}". Only local JSON Pointer refs (#/…) are supported.`,
      )
    }

    const path = ref.slice(2).split('/')
    const resolved = getByPath(this.spec, path)

    if (
      resolved === undefined ||
      resolved === null ||
      typeof resolved !== 'object' ||
      Array.isArray(resolved)
    ) {
      throw new Error(`[open-form] Unknown $ref: ${ref}`)
    }

    const schema = resolved as RawSchema

    // If the resolved schema itself contains a $ref, follow it recursively
    if (typeof schema['$ref'] === 'string') {
      return this.resolveRef(schema['$ref'], visited)
    }

    return schema
  }

  /**
   * Inspects a schema for `$ref`, `allOf`, `oneOf`, or `anyOf` keywords and
   * dispatches to the appropriate resolver.  Returns the schema unchanged when
   * none of these keywords are present.
   *
   * @param schema - The raw schema object to resolve
   * @param visited - Internal set used to detect circular references
   */
  resolveSchema(schema: RawSchema, visited: Set<string> = new Set()): RawSchema {
    if (typeof schema['$ref'] === 'string') {
      const resolved = this.resolveRef(schema['$ref'], visited)
      // Recursively resolve the target in case it has its own keywords
      return this.resolveSchema(resolved, visited)
    }

    if (Array.isArray(schema['allOf'])) {
      return this.resolveAllOf(
        schema['allOf'] as RawSchema[],
        visited,
      )
    }

    if (Array.isArray(schema['oneOf'])) {
      return this.resolveOneOf(
        schema['oneOf'] as RawSchema[],
        visited,
      )
    }

    if (Array.isArray(schema['anyOf'])) {
      return this.resolveAnyOf(
        schema['anyOf'] as RawSchema[],
        visited,
      )
    }

    return schema
  }

  /**
   * Merges an array of schemas as if they were combined via `allOf`.
   *
   * - `properties` objects are deep-merged, with later schemas winning on
   *   individual property conflicts.
   * - `required` arrays are concatenated and de-duplicated.
   * - All other keys from later schemas overwrite earlier ones.
   *
   * @param schemas - The array of sub-schemas from an `allOf` keyword
   * @param visited - Internal set used to detect circular references
   */
  resolveAllOf(schemas: RawSchema[], visited: Set<string> = new Set()): RawSchema {
    const resolved = schemas.map((s) => this.resolveSchema(s, visited))
    let merged: RawSchema = {}

    for (const schema of resolved) {
      merged = deepMerge(merged, schema)
    }

    // De-duplicate required array if present
    if (Array.isArray(merged['required'])) {
      merged['required'] = [...new Set(merged['required'] as string[])]
    }

    return merged
  }

  /**
   * Handles `oneOf` keywords.
   *
   * **v1 behaviour:** Returns the first schema in the array after resolving it.
   * Future versions may expose a discriminator-aware selection strategy.
   *
   * @param schemas - The array of sub-schemas from a `oneOf` keyword
   * @param visited - Internal set used to detect circular references
   */
  resolveOneOf(schemas: RawSchema[], visited: Set<string> = new Set()): RawSchema {
    if (schemas.length === 0) {
      throw new Error('[open-form] resolveOneOf received an empty array')
    }
    return this.resolveSchema(schemas[0] as RawSchema, visited)
  }

  /**
   * Handles `anyOf` keywords.
   *
   * **v1 behaviour:** Returns the first schema in the array after resolving it.
   * Future versions may expose union-aware merging.
   *
   * @param schemas - The array of sub-schemas from an `anyOf` keyword
   * @param visited - Internal set used to detect circular references
   */
  resolveAnyOf(schemas: RawSchema[], visited: Set<string> = new Set()): RawSchema {
    if (schemas.length === 0) {
      throw new Error('[open-form] resolveAnyOf received an empty array')
    }
    return this.resolveSchema(schemas[0] as RawSchema, visited)
  }
}
