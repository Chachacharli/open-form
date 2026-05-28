import { describe, it, expect } from 'vitest'
import { Mapper } from '../src/mapper'
import type { FieldConfig } from '../src/types'

/** Helper: build a Mapper instance from a minimal inline spec. */
function makeMapper(
  schemas: Record<string, unknown> = {},
): Mapper {
  return new Mapper({
    openapi: '3.0.0',
    components: { schemas },
  } as Record<string, unknown>)
}

function findField(fields: FieldConfig[], key: string): FieldConfig | undefined {
  return fields.find((f) => f.key === key)
}

// ─── Flat schema ─────────────────────────────────────────────────────────────

describe('Mapper.schemaToFields — flat schema', () => {
  it('converts a schema with string, number, and boolean fields', () => {
    const m = makeMapper()
    const fields = m.schemaToFields({
      type: 'object',
      properties: {
        username: { type: 'string' },
        age: { type: 'integer' },
        active: { type: 'boolean' },
      },
    })

    const username = findField(fields, 'username')
    expect(username?.type).toBe('text')

    const age = findField(fields, 'age')
    expect(age?.type).toBe('number')

    const active = findField(fields, 'active')
    expect(active?.type).toBe('boolean')
  })

  it('sets label from property key when title is absent', () => {
    const m = makeMapper()
    const fields = m.schemaToFields({
      type: 'object',
      properties: { firstName: { type: 'string' } },
    })
    expect(fields[0]?.label).toBe('First Name')
  })

  it('uses title when present', () => {
    const m = makeMapper()
    const fields = m.schemaToFields({
      type: 'object',
      properties: {
        n: { type: 'string', title: 'Full Name' },
      },
    })
    expect(fields[0]?.label).toBe('Full Name')
  })
})

// ─── Enum / select ────────────────────────────────────────────────────────────

describe('Mapper.schemaToFields — enum → select', () => {
  it('generates a select field with correct options', () => {
    const m = makeMapper()
    const fields = m.schemaToFields({
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'inactive', 'pending'] },
      },
    })
    const status = findField(fields, 'status')
    expect(status?.type).toBe('select')
    expect(status?.options).toHaveLength(3)
    expect(status?.options?.[0]).toEqual({ label: 'active', value: 'active' })
    expect(status?.options?.[2]).toEqual({ label: 'pending', value: 'pending' })
  })
})

// ─── Format mappings ──────────────────────────────────────────────────────────

describe('Mapper.schemaToFields — format mappings', () => {
  it('maps format:email → email', () => {
    const m = makeMapper()
    const fields = m.schemaToFields({
      type: 'object',
      properties: { email: { type: 'string', format: 'email' } },
    })
    expect(findField(fields, 'email')?.type).toBe('email')
  })

  it('maps format:password → password', () => {
    const m = makeMapper()
    const fields = m.schemaToFields({
      type: 'object',
      properties: { pwd: { type: 'string', format: 'password' } },
    })
    expect(findField(fields, 'pwd')?.type).toBe('password')
  })

  it('maps format:uri → url', () => {
    const m = makeMapper()
    const fields = m.schemaToFields({
      type: 'object',
      properties: { website: { type: 'string', format: 'uri' } },
    })
    expect(findField(fields, 'website')?.type).toBe('url')
  })

  it('maps format:date → date', () => {
    const m = makeMapper()
    const fields = m.schemaToFields({
      type: 'object',
      properties: { dob: { type: 'string', format: 'date' } },
    })
    expect(findField(fields, 'dob')?.type).toBe('date')
  })

  it('maps format:date-time → date', () => {
    const m = makeMapper()
    const fields = m.schemaToFields({
      type: 'object',
      properties: { ts: { type: 'string', format: 'date-time' } },
    })
    expect(findField(fields, 'ts')?.type).toBe('date')
  })
})

// ─── maxLength > 200 → textarea ──────────────────────────────────────────────

describe('Mapper.schemaToFields — textarea', () => {
  it('maps maxLength > 200 to textarea', () => {
    const m = makeMapper()
    const fields = m.schemaToFields({
      type: 'object',
      properties: { bio: { type: 'string', maxLength: 500 } },
    })
    expect(findField(fields, 'bio')?.type).toBe('textarea')
    expect(findField(fields, 'bio')?.maxLength).toBe(500)
  })

  it('keeps text type when maxLength ≤ 200', () => {
    const m = makeMapper()
    const fields = m.schemaToFields({
      type: 'object',
      properties: { name: { type: 'string', maxLength: 100 } },
    })
    expect(findField(fields, 'name')?.type).toBe('text')
  })
})

// ─── Nested object → dot-notation keys ──────────────────────────────────────

describe('Mapper.schemaToFields — nested object', () => {
  it('generates fields with dot-notation keys for nested objects', () => {
    const m = makeMapper()
    const fields = m.schemaToFields({
      type: 'object',
      properties: {
        address: {
          type: 'object',
          properties: {
            city: { type: 'string' },
            zip: { type: 'string' },
          },
        },
      },
    })

    const addressField = findField(fields, 'address')
    expect(addressField?.type).toBe('object')
    expect(addressField?.fields).toBeDefined()

    const cityField = addressField?.fields?.find((f) => f.key === 'address.city')
    expect(cityField).toBeDefined()
    expect(cityField?.type).toBe('text')

    const zipField = addressField?.fields?.find((f) => f.key === 'address.zip')
    expect(zipField).toBeDefined()
  })
})

// ─── Array of primitives ─────────────────────────────────────────────────────

describe('Mapper.schemaToFields — array of primitives', () => {
  it('generates an array field with a primitive itemSchema', () => {
    const m = makeMapper()
    const fields = m.schemaToFields({
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string' } },
      },
    })

    const tagsField = findField(fields, 'tags')
    expect(tagsField?.type).toBe('array')
    expect(tagsField?.itemSchema).toBeDefined()
    expect(tagsField?.itemSchema?.type).toBe('text')
    expect(tagsField?.itemSchema?.key).toBe('tags[]')
  })
})

// ─── Array of objects ────────────────────────────────────────────────────────

describe('Mapper.schemaToFields — array of objects', () => {
  it('generates an array field with itemSchema.fields[] for object items', () => {
    const m = makeMapper()
    const fields = m.schemaToFields({
      type: 'object',
      properties: {
        contacts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              phone: { type: 'string' },
            },
          },
        },
      },
    })

    const contactsField = findField(fields, 'contacts')
    expect(contactsField?.type).toBe('array')
    expect(contactsField?.itemSchema?.type).toBe('object')
    expect(contactsField?.itemSchema?.fields).toBeDefined()

    const nameInItem = contactsField?.itemSchema?.fields?.find(
      (f) => f.key === 'contacts[].name',
    )
    expect(nameInItem).toBeDefined()
    expect(nameInItem?.type).toBe('text')
  })
})

// ─── required propagation ────────────────────────────────────────────────────

describe('Mapper.schemaToFields — required propagation', () => {
  it('sets required:true for fields listed in the parent required array', () => {
    const m = makeMapper()
    const fields = m.schemaToFields({
      type: 'object',
      required: ['email', 'username'],
      properties: {
        username: { type: 'string' },
        email: { type: 'string', format: 'email' },
        bio: { type: 'string' },
      },
    })

    expect(findField(fields, 'username')?.required).toBe(true)
    expect(findField(fields, 'email')?.required).toBe(true)
    expect(findField(fields, 'bio')?.required).toBe(false)
  })
})

// ─── $ref resolution through mapper ─────────────────────────────────────────

describe('Mapper.schemaToFields — $ref resolution', () => {
  it('resolves a $ref before mapping fields', () => {
    const m = new Mapper({
      openapi: '3.0.0',
      components: {
        schemas: {
          User: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'integer' },
              name: { type: 'string' },
            },
          },
        },
      },
    } as Record<string, unknown>)

    const fields = m.schemaToFields({ $ref: '#/components/schemas/User' })
    const idField = findField(fields, 'id')
    expect(idField?.type).toBe('number')
    expect(idField?.required).toBe(true)
  })
})

// ─── Validation descriptors ──────────────────────────────────────────────────

describe('Mapper.schemaToFields — validation descriptors', () => {
  it('maps minLength, maxLength, minimum, maximum, pattern', () => {
    const m = makeMapper()
    const fields = m.schemaToFields({
      type: 'object',
      properties: {
        score: { type: 'number', minimum: 0, maximum: 100 },
        code: { type: 'string', minLength: 3, maxLength: 10, pattern: '^[A-Z]+$' },
      },
    })

    const score = findField(fields, 'score')
    expect(score?.min).toBe(0)
    expect(score?.max).toBe(100)

    const code = findField(fields, 'code')
    expect(code?.minLength).toBe(3)
    expect(code?.maxLength).toBe(10)
    expect(code?.pattern).toBe('^[A-Z]+$')
  })

  it('maps example to placeholder', () => {
    const m = makeMapper()
    const fields = m.schemaToFields({
      type: 'object',
      properties: {
        city: { type: 'string', example: 'New York' },
      },
    })
    expect(findField(fields, 'city')?.placeholder).toBe('New York')
  })

  it('maps default value', () => {
    const m = makeMapper()
    const fields = m.schemaToFields({
      type: 'object',
      properties: {
        active: { type: 'boolean', default: true },
      },
    })
    expect(findField(fields, 'active')?.default).toBe(true)
  })
})
