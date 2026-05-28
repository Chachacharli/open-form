/**
 * Core OpenAPI/Swagger parser for @open-form/core.
 * Handles both OpenAPI 3.x and Swagger 2.x specifications.
 */

type SpecVersion = '2' | '3'

/** Raw spec object with unknown property values — used internally before validation. */
type RawSpec = Record<string, unknown>

function assertValidSpec(spec: RawSpec): void {
  const hasOpenApi =
    'openapi' in spec && typeof spec['openapi'] === 'string'
  const hasSwagger =
    'swagger' in spec && typeof spec['swagger'] === 'string'

  if (!hasOpenApi && !hasSwagger) {
    throw new Error(
      '[open-form] Invalid spec: object must contain an "openapi" field (OpenAPI 3.x) or a "swagger" field (Swagger 2.x)',
    )
  }
}

/**
 * Base parser class for OpenAPI/Swagger specifications.
 * Detects spec version and provides a foundation for resolver and mapper modules.
 */
export class SwaggerParser {
  /** The raw, validated spec object. */
  protected readonly spec: RawSpec

  constructor(spec: RawSpec) {
    assertValidSpec(spec)
    this.spec = spec
  }

  /**
   * Returns the major version of the parsed specification.
   * @returns `'3'` for OpenAPI 3.x, `'2'` for Swagger 2.x
   */
  getVersion(): SpecVersion {
    return 'openapi' in this.spec ? '3' : '2'
  }
}

/**
 * Parses an OpenAPI/Swagger spec from a URL.
 * Uses the native `fetch` API — no external dependencies.
 *
 * @param url - The URL of the JSON spec to fetch
 * @throws `[open-form]` prefixed error on network failure, non-OK response, or invalid JSON
 */
export async function parseSwagger(url: string): Promise<SwaggerParser> {
  let response: Response

  try {
    response = await fetch(url)
  } catch (err) {
    throw new Error(
      `[open-form] Failed to fetch spec from "${url}": ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!response.ok) {
    throw new Error(
      `[open-form] Failed to fetch spec from "${url}": HTTP ${response.status} ${response.statusText}`,
    )
  }

  let raw: unknown

  try {
    raw = await response.json()
  } catch (err) {
    throw new Error(
      `[open-form] Failed to parse JSON response from "${url}": ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(
      `[open-form] Spec at "${url}" must be a JSON object, got ${raw === null ? 'null' : typeof raw}`,
    )
  }

  return new SwaggerParser(raw as RawSpec)
}

/**
 * Parses an OpenAPI/Swagger spec from an in-memory object.
 *
 * @param spec - A plain object representing an OpenAPI 3.x or Swagger 2.x specification
 * @throws `[open-form]` prefixed error if the object is not a valid spec
 */
export function parseSwaggerFromObject(spec: object): SwaggerParser {
  return new SwaggerParser(spec as RawSpec)
}
