import { describe, it, expect } from 'vitest'
import { Resolver } from '../src/resolver'
import petstore3 from './fixtures/petstore3.json'

/** Helper: build a minimal Resolver backed by a given spec object. */
function makeResolver(spec: object): Resolver {
  return new Resolver(spec as Record<string, unknown>)
}

// ─── resolveRef ──────────────────────────────────────────────────────────────

describe('Resolver.resolveRef', () => {
  it('resolves a valid $ref in an OpenAPI 3.x spec', () => {
    const r = makeResolver(petstore3)
    const schema = r.resolveRef('#/components/schemas/Pet')
    expect(schema).toMatchObject({
      type: 'object',
      required: ['id', 'name'],
    })
    expect(schema['properties']).toBeDefined()
  })

  it('throws [open-form] on an unknown $ref', () => {
    const r = makeResolver(petstore3)
    expect(() => r.resolveRef('#/components/schemas/DoesNotExist')).toThrow(
      /\[open-form\] Unknown \$ref/,
    )
  })

  it('throws [open-form] on an unsupported (non-local) $ref', () => {
    const r = makeResolver(petstore3)
    expect(() => r.resolveRef('https://example.com/schema.json')).toThrow(
      /\[open-form\] Unsupported \$ref format/,
    )
  })

  it('resolves a $ref that points to another $ref (chained)', () => {
    const spec = {
      openapi: '3.0.0',
      components: {
        schemas: {
          Alias: { $ref: '#/components/schemas/Real' },
          Real: { type: 'string' },
        },
      },
    }
    const r = makeResolver(spec)
    const schema = r.resolveRef('#/components/schemas/Alias')
    expect(schema).toEqual({ type: 'string' })
  })
})

// ─── resolveSchema ────────────────────────────────────────────────────────────

describe('Resolver.resolveSchema', () => {
  it('resolves a schema that is a $ref', () => {
    const r = makeResolver(petstore3)
    const schema = r.resolveSchema({ $ref: '#/components/schemas/NewPet' })
    expect(schema).toMatchObject({ type: 'object' })
    expect((schema['properties'] as Record<string, unknown>)['name']).toBeDefined()
  })

  it('returns the schema unchanged when it has no special keywords', () => {
    const r = makeResolver(petstore3)
    const plain = { type: 'string', format: 'email' }
    expect(r.resolveSchema(plain)).toEqual(plain)
  })

  it('resolves a schema with allOf and returns merged properties', () => {
    const spec = {
      openapi: '3.0.0',
      components: { schemas: {} },
    }
    const r = makeResolver(spec)
    const merged = r.resolveSchema({
      allOf: [
        { type: 'object', properties: { name: { type: 'string' } } },
        { type: 'object', properties: { age: { type: 'integer' } } },
      ],
    })
    const props = merged['properties'] as Record<string, unknown>
    expect(props['name']).toBeDefined()
    expect(props['age']).toBeDefined()
  })
})

// ─── resolveAllOf ─────────────────────────────────────────────────────────────

describe('Resolver.resolveAllOf', () => {
  it('merges properties from multiple schemas', () => {
    const r = makeResolver({ openapi: '3.0.0' })
    const result = r.resolveAllOf([
      { type: 'object', properties: { a: { type: 'string' } } },
      { type: 'object', properties: { b: { type: 'number' } } },
      { type: 'object', properties: { c: { type: 'boolean' } } },
    ])
    const props = result['properties'] as Record<string, unknown>
    expect(props['a']).toBeDefined()
    expect(props['b']).toBeDefined()
    expect(props['c']).toBeDefined()
  })

  it('concatenates and de-duplicates required arrays', () => {
    const r = makeResolver({ openapi: '3.0.0' })
    const result = r.resolveAllOf([
      { required: ['name', 'email'] },
      { required: ['email', 'age'] },
    ])
    const required = result['required'] as string[]
    expect(required).toContain('name')
    expect(required).toContain('email')
    expect(required).toContain('age')
    // de-duplicated
    expect(required.filter((v) => v === 'email').length).toBe(1)
  })

  it('later schema properties win on a key conflict', () => {
    const r = makeResolver({ openapi: '3.0.0' })
    const result = r.resolveAllOf([
      { type: 'string', description: 'first' },
      { type: 'string', description: 'second' },
    ])
    expect(result['description']).toBe('second')
  })
})

// ─── circular reference detection ────────────────────────────────────────────

describe('Resolver circular reference detection', () => {
  it('throws [open-form] Circular reference detected when a $ref resolves to itself', () => {
    const spec = {
      openapi: '3.0.0',
      components: {
        schemas: {
          Loop: { $ref: '#/components/schemas/Loop' },
        },
      },
    }
    const r = makeResolver(spec)
    expect(() => r.resolveRef('#/components/schemas/Loop')).toThrow(
      /\[open-form\] Circular reference detected at:/,
    )
  })

  it('throws [open-form] Circular reference detected for indirect cycles', () => {
    const spec = {
      openapi: '3.0.0',
      components: {
        schemas: {
          A: { $ref: '#/components/schemas/B' },
          B: { $ref: '#/components/schemas/A' },
        },
      },
    }
    const r = makeResolver(spec)
    expect(() => r.resolveRef('#/components/schemas/A')).toThrow(
      /\[open-form\] Circular reference detected at:/,
    )
  })
})
