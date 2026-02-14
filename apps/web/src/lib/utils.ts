import { clsx, type ClassValue } from 'clsx';
export type { ClassValue };
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
