/**
 * Operations module for @open-form/core.
 *
 * Architecture: Option A — Inheritance chain (continued).
 * Operations extends Mapper (mapper.ts) and adds spec-level navigation: enumerate
 * all operations that carry a request body, and extract FieldConfig arrays from
 * individual operations or named schemas.
 *
 * The re-export at the bottom is the authoritative SwaggerParser that all
 * consumers and index.ts should use.
 */

import { Mapper } from './mapper'
import type { FieldConfig, SwaggerOperation } from './types'

/** A spec-like object whose values are unknown until inspected. */
type RawSpec = Record<string, unknown>

/** HTTP methods treated as operation identifiers inside a path item. */
const HTTP_METHODS = [
  'get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace',
] as const

type HttpMethod = (typeof HTTP_METHODS)[number]

/** Internal tuple that pairs a raw operation object with its location in the spec. */
interface OperationEntry {
  op: RawSpec
  method: HttpMethod
  path: string
}

/**
 * Derives a camelCase `operationId` from an HTTP method and path when the
 * operation omits one.
 *
 * @example
 * generateOperationId('post', '/users')       // → 'postUsers'
 * generateOperationId('put', '/users/{id}')   // → 'putUsersId'
 */
function generateOperationId(method: string, path: string): string {
  const segments = path
    .replace(/\{([^}]+)\}/g, '$1') // {id} → id
    .split('/')
    .filter(Boolean)

  const pathPart = segments
    .map((s, i) => (i === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)))
    .join('')

  const capitalized =
    pathPart.length > 0
      ? pathPart.charAt(0).toUpperCase() + pathPart.slice(1)
      : ''

  return method.toLowerCase() + capitalized
}

/**
 * Extends Mapper with spec-level navigation for listing and resolving API
 * operations into `FieldConfig` arrays.
 */
export class Operations extends Mapper {
  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Iterates all path items in the spec and yields every recognised HTTP
   * operation with its method and path.
   */
  private _allOperationEntries(): OperationEntry[] {
    const paths = this.spec['paths']
    if (!paths || typeof paths !== 'object' || Array.isArray(paths)) return []

    const entries: OperationEntry[] = []

    for (const [path, pathItem] of Object.entries(paths as RawSpec)) {
      if (
        !pathItem ||
        typeof pathItem !== 'object' ||
        Array.isArray(pathItem)
      ) {
        continue
      }

      for (const method of HTTP_METHODS) {
        const operation = (pathItem as RawSpec)[method]
        if (
          !operation ||
          typeof operation !== 'object' ||
          Array.isArray(operation)
        ) {
          continue
        }

        entries.push({ op: operation as RawSpec, method, path })
      }
    }

    return entries
  }

  /**
   * Extracts the `application/json` request body schema from an operation,
   * dispatching to the correct extractor based on spec version.
   *
   * @returns The raw schema object, or `null` if none is found.
   */
  private _extractBodySchema(operation: RawSpec): RawSpec | null {
    return this.getVersion() === '3'
      ? this._extractBodySchema3(operation)
      : this._extractBodySchema2(operation)
  }

  /**
   * Extracts the request body schema for an OpenAPI 3.x operation.
   * Looks at `requestBody.content['application/json'].schema`.
   */
  private _extractBodySchema3(operation: RawSpec): RawSpec | null {
    const requestBody = operation['requestBody']
    if (
      !requestBody ||
      typeof requestBody !== 'object' ||
      Array.isArray(requestBody)
    ) {
      return null
    }

    const content = (requestBody as RawSpec)['content']
    if (!content || typeof content !== 'object' || Array.isArray(content)) {
      return null
    }

    const jsonContent = (content as RawSpec)['application/json']
    if (
      !jsonContent ||
      typeof jsonContent !== 'object' ||
      Array.isArray(jsonContent)
    ) {
      return null
    }

    const schema = (jsonContent as RawSpec)['schema']
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
      return null
    }

    return schema as RawSpec
  }

  /**
   * Extracts the body parameter schema for a Swagger 2.x operation.
   * Looks for a parameter with `in: 'body'` and returns its `schema`.
   */
  private _extractBodySchema2(operation: RawSpec): RawSpec | null {
    const parameters = operation['parameters']
    if (!Array.isArray(parameters)) return null

    const bodyParam = parameters.find(
      (p): p is RawSpec =>
        p !== null &&
        typeof p === 'object' &&
        !Array.isArray(p) &&
        (p as RawSpec)['in'] === 'body',
    )

    if (!bodyParam) return null

    const schema = bodyParam['schema']
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
      return null
    }

    return schema as RawSpec
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Returns all operations in the spec that carry an `application/json` request
   * body.
   *
   * Supports both OpenAPI 3.x (`requestBody`) and Swagger 2.x (`in: body`
   * parameters). When an operation has no `operationId`, one is generated from
   * the HTTP method and path (e.g. `post /users/{id}` → `postUsersId`).
   *
   * @returns An array of {@link SwaggerOperation} descriptors, one per matching
   *          operation.
   */
  listOperations(): SwaggerOperation[] {
    return this._allOperationEntries()
      .filter(({ op }) => this._extractBodySchema(op) !== null)
      .map(({ op, method, path }): SwaggerOperation => {
        const operationId =
          typeof op['operationId'] === 'string'
            ? op['operationId']
            : generateOperationId(method, path)

        const result: SwaggerOperation = { operationId, method, path }

        if (typeof op['summary'] === 'string') {
          result.summary = op['summary']
        }
        if (typeof op['description'] === 'string') {
          result.description = op['description']
        }

        return result
      })
  }

  /**
   * Returns a `FieldConfig[]` array derived from the request body schema of
   * the operation identified by `operationId`.
   *
   * @param operationId - The operation's `operationId` string.
   * @returns Resolved `FieldConfig[]`, or `null` when the operation is not
   *          found or has no `application/json` request body.
   */
  getOperationFields(operationId: string): FieldConfig[] | null {
    for (const { op, method, path } of this._allOperationEntries()) {
      const id =
        typeof op['operationId'] === 'string'
          ? op['operationId']
          : generateOperationId(method, path)

      if (id !== operationId) continue

      const bodySchema = this._extractBodySchema(op)
      if (!bodySchema) return null

      return this.schemaToFields(this.resolveSchema(bodySchema))
    }

    return null
  }

  /**
   * Returns a `FieldConfig[]` array derived from the request body schema of
   * the operation at the given HTTP method and path.
   *
   * @param method - HTTP method, case-insensitive (e.g. `'POST'` or `'post'`).
   * @param path   - Exact path string as it appears in the spec (e.g. `'/pets'`).
   * @returns Resolved `FieldConfig[]`, or `null` when the operation is not
   *          found or has no `application/json` request body.
   */
  getOperationByPath(method: string, path: string): FieldConfig[] | null {
    const normalizedMethod = method.toLowerCase()

    const paths = this.spec['paths']
    if (!paths || typeof paths !== 'object' || Array.isArray(paths)) return null

    const pathItem = (paths as RawSpec)[path]
    if (!pathItem || typeof pathItem !== 'object' || Array.isArray(pathItem)) {
      return null
    }

    const operation = (pathItem as RawSpec)[normalizedMethod]
    if (
      !operation ||
      typeof operation !== 'object' ||
      Array.isArray(operation)
    ) {
      return null
    }

    const bodySchema = this._extractBodySchema(operation as RawSpec)
    if (!bodySchema) return null

    return this.schemaToFields(this.resolveSchema(bodySchema))
  }

  /**
   * Returns a `FieldConfig[]` array for a named schema in the spec.
   *
   * - **OpenAPI 3.x**: resolves `components.schemas[schemaName]`
   * - **Swagger 2.x**: resolves `definitions[schemaName]`
   *
   * @param schemaName - The schema name as it appears in `components/schemas`
   *                     (OpenAPI 3.x) or `definitions` (Swagger 2.x).
   * @returns Resolved `FieldConfig[]`, or `null` when the schema is not found.
   */
  getSchemaFields(schemaName: string): FieldConfig[] | null {
    let schema: unknown

    if (this.getVersion() === '3') {
      const components = this.spec['components']
      if (
        !components ||
        typeof components !== 'object' ||
        Array.isArray(components)
      ) {
        return null
      }

      const schemas = (components as RawSpec)['schemas']
      if (
        !schemas ||
        typeof schemas !== 'object' ||
        Array.isArray(schemas)
      ) {
        return null
      }

      schema = (schemas as RawSpec)[schemaName]
    } else {
      const definitions = this.spec['definitions']
      if (
        !definitions ||
        typeof definitions !== 'object' ||
        Array.isArray(definitions)
      ) {
        return null
      }

      schema = (definitions as RawSpec)[schemaName]
    }

    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
      return null
    }

    return this.schemaToFields(schema as RawSpec)
  }
}

/**
 * Re-export `Operations` as `SwaggerParser` so existing consumers that import
 * `SwaggerParser` from this package automatically receive the full capability
 * stack: parser + resolver + mapper + operations.
 */
export { Operations as SwaggerParser }
