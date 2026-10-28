import { CheckCircle2 } from 'lucide-react'

interface RoutePreviewProps {
  title: string
  description: string
}

export function RoutePreview({ title, description }: RoutePreviewProps) {
  return (
    <div className="mx-auto w-full max-w-[980px] px-5 pb-16 pt-9 sm:px-8 md:px-12 md:pt-12">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-forest">
        Không gian của bạn
      </p>
      <h1 className="font-display text-[34px] font-semibold leading-tight tracking-[-0.045em] text-ink sm:text-[40px]">
        {title}
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>

      <section
        aria-label="Trạng thái danh sách"
        className="mt-12 flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface/70 px-6 py-10 text-center"
      >
        <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <CheckCircle2 aria-hidden="true" size={23} strokeWidth={1.7} />
        </span>
        <h2 className="font-display text-xl font-medium tracking-tight text-ink">
          Một khoảng trống để bắt đầu
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </section>
    </div>
  )
}
