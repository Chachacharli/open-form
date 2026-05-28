# @open-form/core — Roadmap

> TS-native OpenAPI parser. Zero dependencies. Zero framework assumptions.
> Input: `swagger.json` → Output: `FieldConfig[]`

---

## Principios del proyecto

- **Sin framework** — cero imports de Vue, React, Angular o cualquier UI lib
- **Sin DOM** — corre en Node, navegador, edge workers, donde sea
- **Contrato claro** — `FieldConfig[]` es el único output que los adapters necesitan
- **Testeado desde el día uno** — cada módulo tiene sus propios tests con fixtures reales
- **Tree-shakeable** — cada función es importable de forma independiente

---

## Estructura del monorepo

```
open-form/
├── packages/
│   └── core/               ← este proyecto
│       ├── src/
│       │   ├── types.ts
│       │   ├── parser.ts
│       │   ├── resolver.ts
│       │   ├── mapper.ts
│       │   ├── operations.ts
│       │   └── index.ts
│       ├── tests/
│       │   └── fixtures/   ← swagger.json de ejemplo
│       ├── package.json
│       └── tsconfig.json
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

---

## Phase 0 — Setup del monorepo

**Objetivo:** tener la base lista para trabajar antes de escribir una línea de lógica.

### Tareas

- [ ] Inicializar repo con `pnpm init`
- [ ] Configurar `pnpm-workspace.yaml`
- [ ] Instalar y configurar **Turborepo**
- [ ] Crear `packages/core` con su propio `package.json`
- [ ] Configurar **TypeScript** (`strict: true`, `moduleResolution: bundler`)
- [ ] Configurar **Vitest** como test runner
- [ ] Configurar **tsup** para build y bundling
- [ ] Añadir `exports` en `package.json` para subpath exports
- [ ] Setup de linting con **ESLint + typescript-eslint**
- [ ] CI básico con GitHub Actions (lint + test en cada PR)

### Entregable

Repo público en GitHub con estructura lista, README inicial y primer commit limpio.

---

## Phase 1 — Types & Contracts

**Objetivo:** definir el contrato central del proyecto. Todo lo demás depende de esto.

### Tipos a definir

```ts
// El tipo de campo que se renderizará
type FieldType =
  | 'text' | 'number' | 'email' | 'password' | 'url'
  | 'date' | 'boolean' | 'select' | 'multiselect'
  | 'textarea' | 'object' | 'array'

// Una opción de un select/multiselect
interface FieldOption {
  label: string
  value: string | number | boolean
}

// El contrato central — lo que consume cualquier adapter
interface FieldConfig {
  key: string             // "address.street" para campos anidados
  type: FieldType
  label: string
  required: boolean
  description?: string
  placeholder?: string
  default?: unknown

  // Validación como descriptores (no como lógica ejecutable)
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  pattern?: string

  // Para select / multiselect
  options?: FieldOption[]

  // Para type: 'object' (campos anidados)
  fields?: FieldConfig[]

  // Para type: 'array'
  itemSchema?: FieldConfig
}

// Metadata de una operación del spec
interface SwaggerOperation {
  operationId: string
  method: string
  path: string
  summary?: string
  description?: string
}
```

### Tareas

- [ ] Escribir `types.ts` con todos los tipos exportados
- [ ] Documentar cada campo con JSDoc
- [ ] Tests de tipos con `expect-type` o `tsd`

### Entregable

`types.ts` exportado desde `index.ts`. Es lo primero que cualquier adapter va a importar.

---

## Phase 2 — Parser del spec

**Objetivo:** cargar el spec de OpenAPI desde cualquier fuente.

### API pública

```ts
// Desde URL (fetch interno)
parseSwagger(url: string): Promise<SwaggerParser>

// Desde objeto ya en memoria (útil para tests y SSR)
parseSwaggerFromObject(spec: object): SwaggerParser
```

### Tareas

- [ ] Implementar `parseSwagger(url)` con fetch nativo
- [ ] Implementar `parseSwaggerFromObject(spec)`
- [ ] Detección de versión: **OpenAPI 3.x** vs **Swagger 2.x**
- [ ] Validación básica: lanzar error descriptivo si el objeto no es un spec válido
- [ ] Manejo de errores de red (timeout, 404, CORS)
- [ ] Tests con fixtures: un spec 3.x y un spec 2.x reales

### Notas

- OpenAPI 3.x es prioridad. Swagger 2.x es nice-to-have para v1.
- No se añade ninguna dependencia externa para el parsing — JSON nativo es suficiente.

### Entregable

`parser.ts` con las dos funciones públicas y su suite de tests.

---

## Phase 3 — Resolver de referencias

**Objetivo:** resolver `$ref`, `allOf`, `oneOf` y `anyOf` de forma recursiva y sin loops infinitos.

### API interna (usada por el mapper)

```ts
class SwaggerParser {
  resolveRef(ref: string): object
  resolveSchema(schema: object): object
  resolveAllOf(schemas: object[]): object
  resolveOneOf(schemas: object[]): object   // toma el primero por defecto
  resolveAnyOf(schemas: object[]): object   // toma el primero por defecto
}
```

### Tareas

- [ ] Implementar `resolveRef` con path traversal (`#/components/schemas/User`)
- [ ] Implementar `resolveSchema` que detecta y despacha al resolver correcto
- [ ] Implementar `resolveAllOf` con merge profundo de `properties` y `required`
- [ ] Implementar `resolveOneOf` / `resolveAnyOf` (primer schema como fallback v1)
- [ ] Protección contra referencias circulares (visited set)
- [ ] Tests con specs que usen `$ref` encadenados, `allOf` con herencia múltiple

### Notas

- `oneOf` / `anyOf` son complejos semánticamente. Para v1, tomar el primer schema es suficiente. En v2 se puede generar un `select` que cambie el subformulario.

### Entregable

`resolver.ts` integrado en `SwaggerParser`, con tests de casos límite.

---

## Phase 4 — Mapper: Schema → FieldConfig

**Objetivo:** convertir cualquier schema de OpenAPI en un array de `FieldConfig`.

### API pública

```ts
class SwaggerParser {
  schemaToFields(schema: object, parentKey?: string): FieldConfig[]
}
```

### Tabla de conversión

| OpenAPI schema | `FieldType` resultante |
|---|---|
| `type: string` | `text` |
| `type: string` + `enum` | `select` |
| `type: string` + `format: email` | `email` |
| `type: string` + `format: password` | `password` |
| `type: string` + `format: uri` | `url` |
| `type: string` + `format: date` o `date-time` | `date` |
| `type: string` + `maxLength > 200` | `textarea` |
| `type: boolean` | `boolean` |
| `type: integer` o `number` | `number` |
| `type: object` o `properties` | `object` + recursión |
| `type: array` + `items` (primitivo) | `array` con `itemSchema` simple |
| `type: array` + `items` (objeto) | `array` con `itemSchema` anidado |

### Tareas

- [ ] Implementar `propToField` para tipos primitivos
- [ ] Implementar conversión de `enum` a `options[]`
- [ ] Implementar recursión para `type: object` (genera `fields[]`)
- [ ] Implementar manejo de `type: array` con items simples y complejos
- [ ] Generar `key` con dot-notation para campos anidados (`address.city`)
- [ ] Mapear `required[]` del schema padre a cada `FieldConfig.required`
- [ ] Mapear `title`, `description`, `example`, `default` cuando existen
- [ ] Tests con schemas: plano, anidado, con arrays, con enums, con referencias

### Entregable

`mapper.ts` integrado en `SwaggerParser`, cobertura de todos los tipos de la tabla.

---

## Phase 5 — Navegación de operaciones

**Objetivo:** exponer una API para listar y acceder a los endpoints del spec.

### API pública

```ts
class SwaggerParser {
  // Lista todos los endpoints que tienen requestBody
  listOperations(): SwaggerOperation[]

  // Por operationId (el más común)
  getOperationFields(operationId: string): FieldConfig[] | null

  // Por método + path (alternativa)
  getOperationByPath(method: string, path: string): FieldConfig[] | null

  // Acceso directo a un schema por nombre
  getSchemaFields(schemaName: string): FieldConfig[] | null
}
```

### Tareas

- [ ] Implementar `listOperations` iterando `spec.paths`
- [ ] Implementar `getOperationFields` buscando por `operationId`
- [ ] Implementar `getOperationByPath` con normalización de método a lowercase
- [ ] Implementar `getSchemaFields` para acceso directo a `components/schemas`
- [ ] Manejo de operaciones sin `requestBody` (GET, DELETE) — retornar `null` o `[]`
- [ ] Tests con specs multi-endpoint reales

### Entregable

`operations.ts` integrado en `SwaggerParser` con los 4 métodos públicos.

---

## Phase 6 — Validación como descriptores

**Objetivo:** extraer reglas de validación del schema y exponerlas en `FieldConfig` sin ejecutarlas.

### Qué se mapea

| OpenAPI | `FieldConfig` |
|---|---|
| `required: ['email']` | `required: true` en el field |
| `minLength` | `minLength` |
| `maxLength` | `maxLength` |
| `minimum` | `min` |
| `maximum` | `max` |
| `pattern` | `pattern` |
| `format: email` | infiere `type: 'email'` (ya cubierto en Phase 4) |

### Tareas

- [ ] Asegurar que todos los descriptores anteriores se mapean en `propToField`
- [ ] Documentar claramente que el core **no valida** — solo describe
- [ ] Añadir utilidad opcional `fieldConfigToZodSchema(fields)` — exportable por separado

### Notas

La generación de schema Zod es conveniente pero opcional. Un adapter puede hacer su propia validación. Se exporta como utilidad separada para no forzar la dependencia de Zod en quien no la necesita.

### Entregable

Descriptores correctamente mapeados. Utilidad Zod como export opcional en `utils/zod.ts`.

---

## Phase 7 — Testing & fixtures

**Objetivo:** tener una suite de tests robusta antes de publicar.

### Fixtures necesarios

- `petstore.json` — el spec oficial de ejemplo de OpenAPI (simple, bien conocido)
- `complex.json` — spec con `$ref`, `allOf`, arrays de objetos, enums anidados
- `swagger2.json` — spec en formato Swagger 2.x para verificar compatibilidad

### Cobertura mínima para v1

- [ ] Todos los tipos de `FieldType` generados correctamente
- [ ] `$ref` resuelto en 1, 2 y 3 niveles de profundidad
- [ ] `allOf` con merge de dos schemas
- [ ] Array de objetos genera `itemSchema` con `fields[]`
- [ ] `required` se propaga correctamente
- [ ] `getOperationFields` devuelve `null` para operación inexistente
- [ ] Referencias circulares no producen stack overflow

### Entregable

Suite de tests con Vitest. `pnpm test` en verde antes de publicar.

---

## Phase 8 — Publicación v0.1.0

**Objetivo:** primer release público en npm bajo `@open-form/core`.

### Tareas

- [ ] Revisar `exports` en `package.json` (ESM + CJS + types)
- [ ] Generar tipos con `tsup` (`dts: true`)
- [ ] Escribir **README.md** completo con:
  - Instalación
  - Quick start con ejemplo real
  - Tabla de tipos soportados
  - API reference de los métodos públicos
  - Roadmap de adapters
- [ ] Añadir `LICENSE` (MIT)
- [ ] Añadir `CHANGELOG.md`
- [ ] Configurar **semantic-release** o release manual con tag `v0.1.0`
- [ ] `npm publish --access public`

### Entregable

`@open-form/core@0.1.0` disponible en npm. Repo público en GitHub bajo `open-form`.

---

## Después del core — adapters (fuera de scope v1)

Una vez publicado el core, el camino natural es:

| Paquete | Qué añade |
|---|---|
| `@open-form/vue` | Composable `useSwaggerForm` + componente `<open-formForm>` |
| `@open-form/react` | Hook `useSwaggerForm` + componente `<open-formForm>` |
| `@open-form/zod` | Genera `ZodSchema` desde `FieldConfig[]` |
| `@open-form/shadcn-vue` | Renderer con shadcn-vue pre-integrado |
| `@open-form/shadcn-react` | Renderer con shadcn/ui pre-integrado |

Cada uno de estos depende de `@open-form/core` y solo añade lo específico de su entorno.

---

## Resumen de fases

| Phase | Nombre | Prioridad |
|---|---|---|
| 0 | Setup del monorepo | Bloqueante |
| 1 | Types & Contracts | Bloqueante |
| 2 | Parser del spec | Alta |
| 3 | Resolver de referencias | Alta |
| 4 | Mapper Schema → FieldConfig | Alta |
| 5 | Navegación de operaciones | Alta |
| 6 | Validación como descriptores | Media |
| 7 | Testing & fixtures | Alta |
| 8 | Publicación v0.1.0 | — |

---

*Licencia: MIT — github.com/tu-usuario/open-form*