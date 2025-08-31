import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getNumericValue = (formattedValue: string): string => {
  return formattedValue.replaceAll(/[^\d]/g, '')
}

export const formatIDRCurrency = (value: string): string => {
  // Remove all non-digit characters
  const numericValue = value.replaceAll(/[^\d]/g, '')

  if (!numericValue) return ''

  // Parse into integer (whole Rupiah)
  const number = Number.parseInt(numericValue, 10)

  // Format with Indonesian locale (thousands separator, no decimals)
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(number)
}
