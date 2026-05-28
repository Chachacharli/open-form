export * from './types'

// Export the base parser utilities (parseSwagger, parseSwaggerFromObject).
// Note: the SwaggerParser class exported from parser.ts is the base class;
// consumers should use the SwaggerParser re-exported below (via mapper.ts)
// which includes resolver + mapper capabilities.
export { parseSwagger, parseSwaggerFromObject } from './parser'
export { SwaggerParser as _BaseSwaggerParser } from './parser'

// Resolver — exported for consumers who want to extend or test it independently
export { Resolver } from './resolver'

// Mapper / full SwaggerParser — this is the class all consumers should use.
// It is exported as both `Mapper` (its own name) and `SwaggerParser` (backward compat).
export { Mapper, SwaggerParser } from './mapper'

export const version = '0.1.0'
