/**
 * Mapper module for @open-form/core.
 *
 * Architecture: Option A — Inheritance chain (continued).
 * Mapper extends Resolver (resolver.ts) and adds schema-to-FieldConfig conversion.
 * The re-export at the bottom of this file is the authoritative SwaggerParser that
 * all consumers (and the public index.ts) should use.
 */

import { Resolver } from './resolver'
import type { FieldConfig, FieldOption, FieldType } from './types'

/** A schema-like object whose values are unknown until resolved. */
type RawSchema = Record<string, unknown>

/**
 * Converts a string value to a number when it is a finite numeric value,
 * otherwise returns `undefined`.
 */
function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && isFinite(value)) return value
  return undefined
}

/**
 * Derives the FieldType for a primitive string schema based on its `format` and
 * other constraints.
 */
function stringFieldType(schema: RawSchema): FieldType {
  const format = schema['format']
  if (format === 'email') return 'email'
  if (format === 'password') return 'password'
  if (format === 'uri') return 'url'
  if (format === 'date' || format === 'date-time') return 'date'

  if (Array.isArray(schema['enum'])) return 'select'

  const maxLength = toNumber(schema['maxLength'])
  if (maxLength !== undefined && maxLength > 200) return 'textarea'

  return 'text'
}

/**
 * Builds a human-readable label from a camelCase or snake_case key.
 * Examples: `firstName` → `First Name`, `user_id` → `User Id`
 */
function labelFromKey(key: string): string {
  // Strip dot-notation prefix (e.g. "address.city" → "city")
  const leaf = key.split('.').pop() ?? key
  return leaf
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
}

/**
 * Extends Resolver with the ability to convert a resolved OpenAPI schema into
 * an array of FieldConfig objects, recursively handling nested objects and arrays.
 */
export class Mapper extends Resolver {
  /**
   * Converts a resolved OpenAPI schema object into an array of {@link FieldConfig}
   * descriptors suitable for driving a dynamic form renderer.
   *
   * Mapping table:
   * - `type: string`                          → `text`
   * - `type: string` + `enum`                 → `select`
   * - `type: string` + `format: email`        → `email`
   * - `type: string` + `format: password`     → `password`
   * - `type: string` + `format: uri`          → `url`
   * - `type: string` + `format: date|date-time` → `date`
   * - `type: string` + `maxLength > 200`      → `textarea`
   * - `type: boolean`                         → `boolean`
   * - `type: integer` | `type: number`        → `number`
   * - `type: object` | has `properties`       → `object` (recursive `fields[]`)
   * - `type: array` with primitive `items`    → `array` with `itemSchema`
   * - `type: array` with object `items`       → `array` with `itemSchema.fields[]`
   *
   * @param schema - A raw OpenAPI schema object (may contain `$ref` / `allOf` etc.)
   * @param parentKey - Dot-notation prefix for nested keys (e.g. `"address"`)
   * @param parentRequired - The `required` array from the parent schema object
   */
  schemaToFields(
    schema: RawSchema,
    parentKey?: string,
    parentRequired: string[] = [],
  ): FieldConfig[] {
    // Always resolve before processing
    const resolved = this.resolveSchema(schema)
    const properties = resolved['properties']

    if (
      resolved['type'] === 'object' ||
      (properties !== undefined && properties !== null && typeof properties === 'object')
    ) {
      return this._objectToFields(resolved, parentKey, parentRequired)
    }

    // Top-level non-object schema — treat as a single field
    const key = parentKey ?? 'value'
    return [this._buildField(key, resolved, parentRequired)]
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /** Converts an object schema's `properties` into a flat FieldConfig array. */
  private _objectToFields(
    schema: RawSchema,
    parentKey: string | undefined,
    parentRequired: string[],
  ): FieldConfig[] {
    const properties = schema['properties']
    if (
      properties === undefined ||
      properties === null ||
      typeof properties !== 'object' ||
      Array.isArray(properties)
    ) {
      return []
    }

    const requiredArr: string[] = Array.isArray(schema['required'])
      ? (schema['required'] as string[])
      : []

    const fields: FieldConfig[] = []

    for (const [propKey, propSchema] of Object.entries(properties as RawSchema)) {
      const dotKey = parentKey ? `${parentKey}.${propKey}` : propKey
      const resolvedProp = this.resolveSchema(propSchema as RawSchema)
      fields.push(this._buildField(dotKey, resolvedProp, requiredArr))
    }

    return fields
  }

  /**
   * Builds a single FieldConfig for a resolved property schema.
   *
   * @param key - Full dot-notation key for this field
   * @param schema - Already-resolved schema for this property
   * @param parentRequired - The parent schema's `required` array used to set `.required`
   */
  private _buildField(
    key: string,
    schema: RawSchema,
    parentRequired: string[],
  ): FieldConfig {
    const leafKey = key.split('.').pop() ?? key
    const isRequired = parentRequired.includes(leafKey)

    const type = this._mapType(schema)
    const label =
      typeof schema['title'] === 'string' ? schema['title'] : labelFromKey(key)

    const base: FieldConfig = {
      key,
      type,
      label,
      required: isRequired,
    }

    // Optional descriptors
    if (typeof schema['description'] === 'string') {
      base.description = schema['description']
    }
    if (schema['example'] !== undefined) {
      base.placeholder = String(schema['example'])
    }
    if (schema['default'] !== undefined) {
      base.default = schema['default']
    }

    // Validation constraints
    const minLength = toNumber(schema['minLength'])
    if (minLength !== undefined) base.minLength = minLength

    const maxLength = toNumber(schema['maxLength'])
    if (maxLength !== undefined) base.maxLength = maxLength

    const minimum = toNumber(schema['minimum'])
    if (minimum !== undefined) base.min = minimum

    const maximum = toNumber(schema['maximum'])
    if (maximum !== undefined) base.max = maximum

    if (typeof schema['pattern'] === 'string') {
      base.pattern = schema['pattern']
    }

    // Enum options for select fields
    if (type === 'select' && Array.isArray(schema['enum'])) {
      base.options = (schema['enum'] as unknown[]).map(
        (v): FieldOption => ({
          label: String(v),
          value: v as string | number | boolean,
        }),
      )
    }

    // Object — recurse into properties
    if (type === 'object') {
      base.fields = this._objectToFields(schema, key, [])
    }

    // Array — build itemSchema from items
    if (type === 'array') {
      const items = schema['items']
      if (
        items !== null &&
        items !== undefined &&
        typeof items === 'object' &&
        !Array.isArray(items)
      ) {
        const resolvedItems = this.resolveSchema(items as RawSchema)
        const itemType = this._mapType(resolvedItems)

        if (itemType === 'object') {
          const itemLabel = typeof resolvedItems['title'] === 'string'
            ? resolvedItems['title']
            : labelFromKey(key)
          const itemRequired: string[] = Array.isArray(resolvedItems['required'])
            ? (resolvedItems['required'] as string[])
            : []
          base.itemSchema = {
            key: `${key}[]`,
            type: 'object',
            label: itemLabel,
            required: false,
            fields: this._objectToFields(resolvedItems, `${key}[]`, itemRequired),
          }
        } else {
          base.itemSchema = {
            key: `${key}[]`,
            type: itemType,
            label: labelFromKey(key),
            required: false,
          }
        }
      }
    }

    return base
  }

  /** Maps a resolved schema to its FieldType. */
  private _mapType(schema: RawSchema): FieldType {
    const type = schema['type']

    if (type === 'boolean') return 'boolean'
    if (type === 'integer' || type === 'number') return 'number'
    if (type === 'array') return 'array'

    if (type === 'string') return stringFieldType(schema)

    // object or schema-with-properties
    if (
      type === 'object' ||
      (schema['properties'] !== undefined &&
        schema['properties'] !== null &&
        typeof schema['properties'] === 'object')
    ) {
      return 'object'
    }

    // Fallback
    return 'text'
  }
}

/**
 * Re-export `Mapper` as `SwaggerParser` so that existing consumers that import
 * `SwaggerParser` from this package automatically receive resolver + mapper
 * capabilities without any breaking change.
 *
 * The original `SwaggerParser` class in `parser.ts` remains the base of the
 * inheritance chain and is still exported from that file for internal use.
 */
export { Mapper as SwaggerParser }
