import { getNumericValue } from '@/shared/utils'
import { z } from 'zod'

export const varcharSchema = (field: string) =>
  z
    .string({
      error: (issue) =>
        issue.input === undefined ? `${field} is required` : `${field} must be a string`,
    })
    .trim()
    .min(1, `${field} cannot be empty`)
    .max(255, `${field} must be at most 255 characters`)

export const textSchema = (field: string) =>
  z
    .string()
    .trim()
    .max(1000, `${field} must be at most 1000 characters`)
    .transform((val) => (val.length === 0 ? null : val))

export const isActiveSchema = z.boolean('Active status must be true or false')

export const currencySchema = (field: string) =>
  z
    .string(`${field} is required!`)
    .min(1, `${field} is required!`)
    .transform(getNumericValue)
    .transform(Number)
    .pipe(z.number().positive(`${field} must be positive`))
    .pipe(z.coerce.string())
