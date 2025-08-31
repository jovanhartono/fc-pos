import { z } from 'zod'

export const nameSchema = z
  .string({
    error: (issue) => (issue.input === undefined ? 'Name is required' : 'Name must be a string'),
  })
  .trim()
  .min(1, 'Name cannot be empty')
  .max(255, 'Name must be at most 255 characters')
  .trim()

export const descriptionSchema = z
  .string()
  .trim()
  .max(1000, 'Description must be at most 1000 characters')
  .transform((val) => (val.length === 0 ? null : val))
  .nullish()

export const isActiveSchema = z.boolean('Active status must be true or false')
