import { z } from 'zod'
import parsePhoneNumberFromString, { isValidPhoneNumber } from 'libphonenumber-js'
import { currencySchema, textSchema, isActiveSchema, varcharSchema } from '@/shared/zod'

export const POSTUserSchema = z
  .object({
    username: z.string('Minimum 5 characters').trim().min(5, 'Minimum 5 characters'),
    name: z.string('Name is required').trim().min(1, 'Name is required'),
    password: z.string('Minimum 8 characters').trim().min(8, 'Minimum 8 characters'),
    confirm_password: z.string('Minimum 8 characters').trim().min(8, 'Minimum 8 characters'),
    role: z.literal(['admin', 'cashier', 'worker'], 'Role is required'),
    is_active: isActiveSchema,
  })
  .refine((data) => data.password === data.confirm_password, {
    error: 'Password does not match',
    path: ['confirm_password'],
    when: (payload) =>
      POSTUserSchema.pick({ password: true, confirm_password: true }).safeParse(payload.value)
        .success,
  })

export const PUTUserSchema = POSTUserSchema.omit({
  password: true,
  confirm_password: true,
})

export const POSTStoreSchema = z.object({
  code: z.string().trim().min(3, 'Minimum 3 characters').max(3),
  name: z.string().trim().min(1, 'Store name is required'),
  phone_number: z
    .string()
    .trim()
    .min(1, 'Phone number is required!')
    .refine(isValidPhoneNumber, { error: 'Invalid phone number' })
    .pipe(z.transform((value) => parsePhoneNumberFromString(value)?.number ?? value)),
  address: z.string().trim().min(1, 'Address is required!'),
  latitude: z.preprocess(
    (val) => (val === '' ? undefined : Number(val)),
    z
      .number('Latitude is required!')
      .min(-90, 'Invalid latitude')
      .max(90, 'Invalid latitude')
      .transform(String),
  ),
  longitude: z.preprocess(
    (val) => (val === '' ? undefined : Number(val)),
    z
      .number('Longitude is required!')
      .min(-180, 'Invalid longitude')
      .max(180, 'Invalid longitude')
      .transform(String),
  ),
  is_active: isActiveSchema,
})

export const POSTCategorySchema = z.object({
  name: varcharSchema('name'),
  description: textSchema('Description').nullish(),
  is_active: isActiveSchema,
})

export const POSTServiceSchema = z.object({
  category_id: z
    .int({
      error: (issue) =>
        issue.input === undefined ? 'Category is required' : 'Category must be a number',
    })
    .positive('Category must be a valid category ID'),

  code: z
    .string({
      error: (issue) => (issue.input === undefined ? 'Code is required' : 'Code must be a string'),
    })
    .min(1, 'Code is required')
    .max(4, 'Code must be at most 4 characters')
    .regex(/^[A-Z0-9]+$/, 'Code must contain only uppercase letters and numbers'),

  cogs: currencySchema('COGS'),
  price: currencySchema('Price'),

  name: varcharSchema('Name'),
  description: textSchema('Description').nullish(),
  is_active: isActiveSchema,
})

export const POSTProductSchema = z.object({
  name: varcharSchema('Name'),
  description: textSchema('Description').nullish(),
  is_active: isActiveSchema,
  sku: z
    .string({
      error: (issue) => (issue.input === undefined ? 'SKU is required' : 'SKU must be a string'),
    })
    .min(1, 'SKU is required')
    .regex(/^[A-Z0-9]+$/, 'SKU must contain only uppercase letters and numbers'),
  uom: varcharSchema('UOM'),
  stock: z.int('Stock is required'),

  category_id: z
    .int({
      error: (issue) =>
        issue.input === undefined ? 'Category is required' : 'Category must be a number',
    })
    .positive('Category must be a valid category ID'),

  cogs: currencySchema('COGS'),
  price: currencySchema('Price'),
})
