import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, LockKeyhole } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { AuthLayout } from '@/components/auth/auth-layout'
import { FormField } from '@/components/auth/form-field'
import { Button } from '@/components/ui/button'
import { useCurrentUser } from '@/hooks/use-auth'
import { authApi } from '@/services/api/auth'
import { friendlyApiMessage } from '@/services/api/errors'
import { useMutation } from '@tanstack/react-query'

const registerSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, 'Tên cần có ít nhất 2 ký tự.')
      .max(120, 'Tên không thể dài quá 120 ký tự.'),
    email: z.string().trim().email('Hãy nhập địa chỉ email hợp lệ.'),
    password: z
      .string()
      .min(8, 'Mật khẩu cần có ít nhất 8 ký tự.')
      .max(128, 'Mật khẩu không thể dài quá 128 ký tự.'),
    confirmPassword: z.string().min(1, 'Hãy nhập lại mật khẩu.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Hai mật khẩu chưa khớp.',
    path: ['confirmPassword'],
  })

type RegisterValues = z.infer<typeof registerSchema>

export function RegisterPage() {
  const navigate = useNavigate()
  const currentUser = useCurrentUser()
  const [formError, setFormError] = useState('')
  const registerUser = useMutation({
    mutationFn: ({ email, password, displayName }: RegisterValues) =>
      authApi.register({ email, password, displayName }),
    onSuccess: (result, values) => {
      navigate(`/verify-email?email=${encodeURIComponent(values.email)}`, {
        state: { actionLink: result.actionLink },
      })
    },
    onError: (error: unknown) => setFormError(friendlyApiMessage(error)),
  })
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      displayName: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  })

  if (currentUser.data) {
    return <Navigate replace to="/app/inbox" />
  }

  return (
    <AuthLayout
      description="Tạo tài khoản miễn phí, rồi bắt đầu gom mọi việc về một nơi."
      eyebrow="Bắt đầu từ điều nhỏ nhất"
      footer={
        <>
          Đã có tài khoản?{' '}
          <Link
            className="font-semibold text-accent transition hover:underline"
            to="/login"
          >
            Đăng nhập
          </Link>
        </>
      }
      title="Tạo tài khoản"
    >
      <form
        className="space-y-4"
        noValidate
        onSubmit={handleSubmit((values) => {
          setFormError('')
          registerUser.mutate(values)
        })}
      >
        {formError && (
          <p
            className="rounded-lg border border-destructive/25 bg-destructive/5 px-3.5 py-3 text-sm leading-5 text-destructive"
            role="alert"
          >
            {formError}
          </p>
        )}
        <FormField<RegisterValues>
          autoComplete="name"
          autoFocus
          error={errors.displayName}
          label="Tên của bạn"
          name="displayName"
          placeholder="Ví dụ: Minh Anh"
          register={register}
        />
        <FormField<RegisterValues>
          autoComplete="email"
          error={errors.email}
          label="Email"
          name="email"
          placeholder="ban@vidu.com"
          register={register}
          type="email"
        />
        <FormField<RegisterValues>
          autoComplete="new-password"
          error={errors.password}
          label="Mật khẩu"
          name="password"
          placeholder="Ít nhất 8 ký tự"
          register={register}
          type="password"
        />
        <FormField<RegisterValues>
          autoComplete="new-password"
          error={errors.confirmPassword}
          label="Nhập lại mật khẩu"
          name="confirmPassword"
          placeholder="Nhập lại mật khẩu"
          register={register}
          type="password"
        />
        <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <LockKeyhole
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-forest"
            size={14}
          />
          Mật khẩu không được lưu dưới dạng văn bản thuần.
        </p>
        <Button
          className="h-11 w-full justify-center rounded-lg text-sm"
          disabled={registerUser.isPending}
          type="submit"
        >
          {registerUser.isPending ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}
          {!registerUser.isPending && <ArrowRight aria-hidden="true" size={16} />}
        </Button>
      </form>
    </AuthLayout>
  )
}
