import { describe, it, expect } from 'vitest'
import { parseSwaggerFromObject, SwaggerParser } from '../src/parser'
import petstore3 from './fixtures/petstore3.json'
import petstore2 from './fixtures/petstore2.json'

describe('parseSwaggerFromObject', () => {
  it('returns a SwaggerParser instance for a valid OpenAPI 3.x spec', () => {
    const parser = parseSwaggerFromObject(petstore3)
    expect(parser).toBeInstanceOf(SwaggerParser)
  })

  it('returns a SwaggerParser instance for a valid Swagger 2.x spec', () => {
    const parser = parseSwaggerFromObject(petstore2)
    expect(parser).toBeInstanceOf(SwaggerParser)
  })

  it('throws with [open-form] prefix when passed an empty object', () => {
    expect(() => parseSwaggerFromObject({})).toThrow('[open-form]')
  })

  it('throws with [open-form] prefix when passed an object with no version field', () => {
    expect(() => parseSwaggerFromObject({ title: 'No version', paths: {} })).toThrow('[open-form]')
  })

  it('throws with a descriptive message mentioning the missing fields', () => {
    expect(() => parseSwaggerFromObject({})).toThrowError(
      /Invalid spec.*"openapi".*"swagger"/,
    )
  })
})

describe('SwaggerParser.getVersion', () => {
  it('returns "3" for an OpenAPI 3.x spec', () => {
    const parser = parseSwaggerFromObject(petstore3)
    expect(parser.getVersion()).toBe('3')
  })

  it('returns "2" for a Swagger 2.x spec', () => {
    const parser = parseSwaggerFromObject(petstore2)
    expect(parser.getVersion()).toBe('2')
  })

  it('returns "3" when openapi field is present alongside unrelated fields', () => {
    const parser = parseSwaggerFromObject({ openapi: '3.1.0', info: { title: 'T', version: '1' }, paths: {} })
    expect(parser.getVersion()).toBe('3')
  })
})
