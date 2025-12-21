/**
 * Switch Component
 * Toggle switch for boolean values
 */
import { cn } from '@/lib/utils/cn';

export interface SwitchProps {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function Switch({ id, checked, onCheckedChange, disabled = false, className }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      onClick={() => !disabled && onCheckedChange(!checked)}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
        checked ? 'bg-[#166534]' : 'bg-neutral-300',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      aria-checked={checked}
      role="switch"
    >
      <span className="sr-only">Toggle switch</span>
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  );
}
