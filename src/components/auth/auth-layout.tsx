import { Check, Leaf, Moon, MoveUpRight, Sun } from 'lucide-react'
import type { PropsWithChildren, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useUiStore } from '@/stores/ui-store'

interface AuthLayoutProps extends PropsWithChildren {
  eyebrow: string
  title: string
  description: string
  footer?: ReactNode
}

export function AuthLayout({
  eyebrow,
  title,
  description,
  footer,
  children,
}: AuthLayoutProps) {
  const theme = useUiStore((state) => state.theme)
  const setTheme = useUiStore((state) => state.setTheme)

  return (
    <main className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,1.05fr)_minmax(440px,0.95fr)]">
      <aside className="relative hidden min-h-screen flex-col overflow-hidden bg-[#34483a] px-12 py-10 text-white lg:flex xl:px-20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-36 top-[18%] size-[540px] rounded-full border border-white/10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 top-[26%] size-[390px] rounded-full border border-white/10"
        />
        <Link
          aria-label="Nếp — trang đăng nhập"
          className="relative flex w-fit items-center gap-2.5 rounded-md"
          to="/login"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-white/15">
            <Check aria-hidden="true" size={20} strokeWidth={2.8} />
          </span>
          <span className="font-display text-[23px] font-semibold tracking-[-0.04em]">
            Nếp
          </span>
        </Link>

        <div className="relative my-auto max-w-[540px] pb-10 xl:pb-20">
          <span className="mb-7 inline-flex size-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
            <Leaf aria-hidden="true" size={22} strokeWidth={1.7} />
          </span>
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">
            Một nhịp làm việc nhẹ nhàng hơn
          </p>
          <h2 className="max-w-[500px] font-display text-[42px] font-medium leading-[1.13] tracking-[-0.045em] xl:text-[52px]">
            Việc rõ ràng.
            <br />
            Tâm trí thảnh thơi.
          </h2>
          <p className="mt-6 max-w-[410px] text-[15px] leading-7 text-white/75">
            Tập hợp những điều cần làm, dành sự tập trung cho điều quan trọng
            nhất hôm nay.
          </p>
          <div className="mt-12 flex items-center gap-3 border-t border-white/15 pt-5 text-sm text-white/70">
            <span className="flex size-8 items-center justify-center rounded-full bg-white/10">
              <Check aria-hidden="true" size={15} />
            </span>
            <span>Mỗi ngày một bước nhỏ cũng là tiến về phía trước.</span>
          </div>
        </div>

        <p className="relative text-xs text-white/50">
          Không gian riêng để bạn sắp xếp theo cách của mình.
        </p>
      </aside>

      <section className="flex min-h-screen flex-col px-5 py-7 sm:px-8 lg:px-12 xl:px-20">
        <header className="flex items-center justify-between lg:justify-end lg:gap-3">
          <Link
            aria-label="Nếp — trang đăng nhập"
            className="flex items-center gap-2 rounded-md lg:hidden"
            to="/login"
          >
            <span className="flex size-8 items-center justify-center rounded-[10px] bg-primary text-primary-foreground">
              <Check aria-hidden="true" size={18} strokeWidth={2.8} />
            </span>
            <span className="font-display text-xl font-semibold tracking-[-0.04em] text-ink">
              Nếp
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <button
              aria-label={theme === 'light' ? 'Bật giao diện tối' : 'Bật giao diện sáng'}
              aria-pressed={theme === 'dark'}
              className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-sidebar hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:size-9"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              type="button"
            >
              {theme === 'light' ? (
                <Moon aria-hidden="true" size={17} />
              ) : (
                <Sun aria-hidden="true" size={17} />
              )}
            </button>
            <Link
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition hover:text-ink md:min-h-9"
              to="/login"
            >
              Trợ giúp
              <MoveUpRight aria-hidden="true" size={13} />
            </Link>
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-[400px]">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-forest">
              {eyebrow}
            </p>
            <h1 className="font-display text-[34px] font-semibold leading-tight tracking-[-0.045em] text-ink sm:text-[38px]">
              {title}
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {description}
            </p>
            <div className="mt-8">{children}</div>
            {footer && (
              <div className="mt-7 border-t border-line pt-5 text-center text-sm text-muted-foreground">
                {footer}
              </div>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-4 text-[11px] text-muted-foreground">
          <span>© {new Date().getFullYear()} Nếp</span>
          <span className="text-right">Dành một chút không gian cho mình.</span>
        </footer>
      </section>
    </main>
  )
}
