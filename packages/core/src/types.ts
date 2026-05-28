export type FieldType =
  | 'text'
  | 'number'
  | 'email'
  | 'password'
  | 'url'
  | 'date'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'textarea'
  | 'object'
  | 'array'

export interface FieldOption {
  label: string
  value: string | number | boolean
}

export interface FieldConfig {
  key: string
  type: FieldType
  label: string
  required: boolean
  description?: string
  placeholder?: string
  default?: unknown
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  options?: FieldOption[]
  fields?: FieldConfig[]
  itemSchema?: FieldConfig
}

export interface SwaggerOperation {
  operationId: string
  method: string
  path: string
  summary?: string
  description?: string
}