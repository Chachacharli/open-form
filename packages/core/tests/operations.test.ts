import { describe, it, expect } from 'vitest'
import { Operations } from '../src/operations'
import type { FieldConfig } from '../src/types'
import petstore3 from './fixtures/petstore3.json'
import petstore2 from './fixtures/petstore2.json'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findField(fields: FieldConfig[], key: string): FieldConfig | undefined {
  return fields.find((f) => f.key === key)
}

// ─── listOperations() — OpenAPI 3.x ─────────────────────────────────────────

describe('listOperations() — OpenAPI 3.x', () => {
  it('returns only operations that have a request body', () => {
    // createPet (POST /pets) and updatePet (PUT /pets/{id}) have requestBody.
    // listPets (GET /pets) and getPetById (GET /pets/{id}) do not.
    const ops = new Operations(petstore3).listOperations()
    expect(ops).toHaveLength(2)
  })

  it('includes the correct operationId for every returned operation', () => {
    const ops = new Operations(petstore3).listOperations()
    const ids = ops.map((op) => op.operationId)
    expect(ids).toContain('createPet')
    expect(ids).toContain('updatePet')
  })

  it('includes the correct HTTP method for each operation', () => {
    const ops = new Operations(petstore3).listOperations()
    const byId = Object.fromEntries(ops.map((op) => [op.operationId, op]))
    expect(byId['createPet']?.method).toBe('post')
    expect(byId['updatePet']?.method).toBe('put')
  })

  it('includes the correct path for each operation', () => {
    const ops = new Operations(petstore3).listOperations()
    const byId = Object.fromEntries(ops.map((op) => [op.operationId, op]))
    expect(byId['createPet']?.path).toBe('/pets')
    expect(byId['updatePet']?.path).toBe('/pets/{id}')
  })

  it('includes the summary when present', () => {
    const ops = new Operations(petstore3).listOperations()
    const create = ops.find((op) => op.operationId === 'createPet')
    expect(create?.summary).toBe('Create a pet')
  })

  it('does not include operations without a request body', () => {
    const ops = new Operations(petstore3).listOperations()
    const ids = ops.map((op) => op.operationId)
    expect(ids).not.toContain('listPets')
    expect(ids).not.toContain('getPetById')
  })
})

// ─── getOperationFields() — OpenAPI 3.x ─────────────────────────────────────

describe('getOperationFields() — OpenAPI 3.x', () => {
  it('returns a FieldConfig[] for a valid operationId', () => {
    const fields = new Operations(petstore3).getOperationFields('createPet')
    expect(fields).not.toBeNull()
    expect(Array.isArray(fields)).toBe(true)
    expect(fields!.length).toBeGreaterThan(0)
  })

  it('returns correct field keys for the createPet body schema', () => {
    const fields = new Operations(petstore3).getOperationFields('createPet')!
    expect(findField(fields, 'name')).toBeDefined()
    expect(findField(fields, 'tag')).toBeDefined()
  })

  it('propagates required from the body schema', () => {
    const fields = new Operations(petstore3).getOperationFields('createPet')!
    expect(findField(fields, 'name')?.required).toBe(true)
    expect(findField(fields, 'tag')?.required).toBe(false)
  })

  it('returns null for an unknown operationId', () => {
    expect(
      new Operations(petstore3).getOperationFields('doesNotExist'),
    ).toBeNull()
  })

  it('returns null for an operation that has no request body', () => {
    expect(
      new Operations(petstore3).getOperationFields('listPets'),
    ).toBeNull()
  })
})

// ─── getOperationByPath() — OpenAPI 3.x ─────────────────────────────────────

describe('getOperationByPath() — OpenAPI 3.x', () => {
  it('returns FieldConfig[] for a valid method + path', () => {
    const fields = new Operations(petstore3).getOperationByPath('post', '/pets')
    expect(fields).not.toBeNull()
    expect(Array.isArray(fields)).toBe(true)
    expect(fields!.length).toBeGreaterThan(0)
  })

  it('is case-insensitive on the method (POST === post)', () => {
    const p = new Operations(petstore3)
    expect(p.getOperationByPath('POST', '/pets')).toEqual(
      p.getOperationByPath('post', '/pets'),
    )
  })

  it('is case-insensitive on the method (Put === put)', () => {
    const p = new Operations(petstore3)
    expect(p.getOperationByPath('Put', '/pets/{id}')).toEqual(
      p.getOperationByPath('put', '/pets/{id}'),
    )
  })

  it('returns null for an unknown path', () => {
    expect(
      new Operations(petstore3).getOperationByPath('post', '/unknown'),
    ).toBeNull()
  })

  it('returns null for a path+method without a request body', () => {
    expect(
      new Operations(petstore3).getOperationByPath('get', '/pets'),
    ).toBeNull()
  })
})

// ─── getSchemaFields() — OpenAPI 3.x ────────────────────────────────────────

describe('getSchemaFields() — OpenAPI 3.x', () => {
  it('returns FieldConfig[] for a valid schema name', () => {
    const fields = new Operations(petstore3).getSchemaFields('Pet')
    expect(fields).not.toBeNull()
    expect(Array.isArray(fields)).toBe(true)
    expect(fields!.length).toBeGreaterThan(0)
  })

  it('returns correct field keys for the Pet schema', () => {
    const fields = new Operations(petstore3).getSchemaFields('Pet')!
    const keys = fields.map((f) => f.key)
    expect(keys).toContain('id')
    expect(keys).toContain('name')
    expect(keys).toContain('tag')
  })

  it('maps required fields correctly for the Pet schema', () => {
    const fields = new Operations(petstore3).getSchemaFields('Pet')!
    expect(findField(fields, 'id')?.required).toBe(true)
    expect(findField(fields, 'name')?.required).toBe(true)
    expect(findField(fields, 'tag')?.required).toBe(false)
  })

  it('returns null for an unknown schema name', () => {
    expect(new Operations(petstore3).getSchemaFields('DoesNotExist')).toBeNull()
  })
})

// ─── Swagger 2.x support ────────────────────────────────────────────────────

describe('Swagger 2.x support', () => {
  it('listOperations() returns only body-parameter operations', () => {
    // createPet and updatePet have in:body parameters; listPets and getPetById do not
    const ops = new Operations(petstore2).listOperations()
    expect(ops).toHaveLength(2)
    const ids = ops.map((op) => op.operationId)
    expect(ids).toContain('createPet')
    expect(ids).toContain('updatePet')
  })

  it('getOperationFields() resolves a Swagger 2.x body parameter', () => {
    const fields = new Operations(petstore2).getOperationFields('createPet')
    expect(fields).not.toBeNull()
    expect(findField(fields!, 'name')).toBeDefined()
  })

  it('getOperationByPath() resolves a Swagger 2.x body parameter', () => {
    const fields = new Operations(petstore2).getOperationByPath('post', '/pets')
    expect(fields).not.toBeNull()
    expect(Array.isArray(fields)).toBe(true)
  })

  it('getSchemaFields() uses definitions for Swagger 2.x', () => {
    const fields = new Operations(petstore2).getSchemaFields('Pet')
    expect(fields).not.toBeNull()
    expect(Array.isArray(fields)).toBe(true)
    expect(fields!.length).toBeGreaterThan(0)
  })

  it('getSchemaFields() returns null for an unknown Swagger 2.x definition', () => {
    expect(new Operations(petstore2).getSchemaFields('NoSuchDef')).toBeNull()
  })
})

// ─── Generated operationId ───────────────────────────────────────────────────

describe('generated operationId', () => {
  it('generates a camelCase operationId when none is present', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1' },
      paths: {
        '/users': {
          post: {
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { name: { type: 'string' } },
                  },
                },
              },
            },
            responses: { '201': { description: 'Created' } },
          },
        },
      },
    }
    const ops = new Operations(spec).listOperations()
    expect(ops).toHaveLength(1)
    expect(ops[0]!.operationId).toBe('postUsers')
  })

  it('generates a camelCase operationId that includes path params', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1' },
      paths: {
        '/users/{id}/address': {
          put: {
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { street: { type: 'string' } },
                  },
                },
              },
            },
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    }
    const ops = new Operations(spec).listOperations()
    expect(ops[0]!.operationId).toBe('putUsersIdAddress')
  })
})
