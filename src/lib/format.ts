import { format } from 'date-fns';

export const formatDate = (value?: string) => {
  if (!value) return '—';
  try {
    return format(new Date(value), 'PPp');
  } catch {
    return value;
  }
};

export const formatMoney = (amount?: number, currency = 'EUR') => {
  if (amount === undefined || Number.isNaN(amount)) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
};
