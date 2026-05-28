export * from './types'

// Base parse utilities — return a plain SwaggerParser (base class).
// For the full capability stack use `new SwaggerParser(spec)` or
// instantiate `Operations` directly.
export { parseSwagger, parseSwaggerFromObject } from './parser'

// Resolver — exported for consumers who want to extend or test it independently
export { Resolver } from './resolver'

// Mapper — exported for consumers who only need schema → FieldConfig conversion
export { Mapper } from './mapper'

// Operations is the top of the inheritance chain:
//   SwaggerParser → Resolver → Mapper → Operations
// It is exported as both its own name and as `SwaggerParser` so consumers
// always get the full stack when they import the default public class.
export { Operations, SwaggerParser } from './operations'

export const version = '0.1.0'
