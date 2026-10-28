import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import type {
  FieldError,
  FieldValues,
  Path,
  UseFormRegister,
} from 'react-hook-form'

interface FormFieldProps<TValues extends FieldValues> {
  label?: string
  name: Path<TValues>
  register: UseFormRegister<TValues>
  error?: FieldError
  autoComplete?: string
  placeholder?: string
  type?: 'text' | 'email' | 'password'
  autoFocus?: boolean
}

export function FormField<TValues extends FieldValues>({
  label,
  name,
  register,
  error,
  autoComplete,
  placeholder,
  type = 'text',
  autoFocus = false,
}: FormFieldProps<TValues>) {
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'
  const inputType = isPassword
    ? showPassword
      ? 'text'
      : 'password'
    : type
  const errorId = `${String(name)}-error`

  return (
    <div className="space-y-2">
      {label && (
        <label
          className="block text-[13px] font-medium text-ink"
          htmlFor={String(name)}
        >
          {label}
        </label>
      )}
      <div className="relative">
        <input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          className={`h-11 w-full rounded-lg border bg-surface px-3.5 text-sm text-ink outline-none transition placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring/40 ${
            isPassword ? 'pr-11' : ''
          } ${
            error
              ? 'border-destructive focus-visible:ring-destructive/20'
              : 'border-input hover:border-ink/25'
          }`}
          id={String(name)}
          placeholder={placeholder}
          type={inputType}
          {...register(name)}
        />
        {isPassword && (
          <button
            aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground transition hover:text-ink"
            onClick={() => setShowPassword((current) => !current)}
            type="button"
          >
            {showPassword ? (
              <EyeOff aria-hidden="true" size={17} />
            ) : (
              <Eye aria-hidden="true" size={17} />
            )}
          </button>
        )}
      </div>
      {error && (
        <p className="text-xs leading-5 text-destructive" id={errorId} role="alert">
          {error.message}
        </p>
      )}
    </div>
  )
}
