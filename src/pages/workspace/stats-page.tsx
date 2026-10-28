import {
  Activity,
  AlertCircle,
  CheckCheck,
  ClipboardList,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useStats, useWorkspaceIdentity } from '@/hooks/use-workspace'
import { localDateInTimezone, shiftLocalDate } from '@/lib/dates'
import { friendlyApiMessage } from '@/services/api/errors'
import type { StatsGranularity, StatsOverviewInput } from '@/types/workspace'

type RangeDays = 7 | 30 | 90

function formatPeriod(period: string, granularity: StatsGranularity) {
  const [year = 0, month = 1, day = 1] = period.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day, 12))
  const formatted = new Intl.DateTimeFormat('vi-VN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date)
  return granularity === 'week' ? `Tuần ${formatted}` : formatted
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6">
      <div className="mb-5">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}

function ChartEmpty({ text }: { text: string }) {
  return (
    <div className="grid h-[270px] place-items-center rounded-xl border border-dashed border-line bg-background/60 px-5 text-center text-sm text-muted-foreground">
      {text}
    </div>
  )
}

function LoadingStats() {
  return (
    <div aria-label="Đang tải thống kê" className="mt-8 animate-pulse space-y-5" role="status">
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div aria-hidden="true" className="h-28 rounded-2xl bg-sidebar" key={index} />
        ))}
      </div>
      <div className="h-[370px] rounded-2xl bg-sidebar" />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="h-[350px] rounded-2xl bg-sidebar" />
        <div className="h-[350px] rounded-2xl bg-sidebar" />
      </div>
    </div>
  )
}

export function StatsPage() {
  const identity = useWorkspaceIdentity()
  const [rangeDays, setRangeDays] = useState<RangeDays>(30)
  const [granularity, setGranularity] = useState<StatsGranularity>('day')
  const today = localDateInTimezone(identity?.timezone ?? 'UTC')
  const input = useMemo<StatsOverviewInput>(
    () => ({
      fromDate: shiftLocalDate(today, -(rangeDays - 1)),
      toDate: today,
      granularity,
    }),
    [granularity, rangeDays, today],
  )
  const statsQuery = useStats(input)
  const stats = statsQuery.data
  const completedTotal =
    stats?.completedByPeriod.reduce(
      (total, bucket) => total + bucket.completedCount,
      0,
    ) ?? 0
  const overdueTotal =
    stats?.overdueByProject.reduce(
      (total, project) => total + project.count,
      0,
    ) ?? 0
  const hasCompletedByProject = Boolean(
    stats?.completedByProject.some((project) => project.count > 0),
  )
  const hasOverdueByProject = Boolean(
    stats?.overdueByProject.some((project) => project.count > 0),
  )

  return (
    <div className="mx-auto w-full max-w-[1120px] px-5 pb-24 pt-9 sm:px-8 md:px-12 md:pt-12">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-forest">
        Không gian của bạn
      </p>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-[34px] font-semibold leading-tight tracking-[-0.045em] text-ink sm:text-[40px]">
            Thống kê
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Theo dõi nhịp độ hoàn thành và những việc cần được quan tâm.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="stats-range">
            Khoảng thời gian
          </label>
          <select
            className="h-10 rounded-lg border border-input bg-surface px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            id="stats-range"
            onChange={(event) =>
              setRangeDays(Number(event.target.value) as RangeDays)
            }
            value={rangeDays}
          >
            <option value={7}>7 ngày</option>
            <option value={30}>30 ngày</option>
            <option value={90}>90 ngày</option>
          </select>
          <div
            aria-label="Cách nhóm thời gian"
            className="inline-flex h-10 rounded-lg border border-line bg-surface p-1"
            role="group"
          >
            {([
              ['day', 'Theo ngày'],
              ['week', 'Theo tuần'],
            ] as const).map(([value, label]) => (
              <button
                aria-pressed={granularity === value}
                className={`rounded-md px-3 text-xs font-medium transition ${
                  granularity === value
                    ? 'bg-accent-soft text-accent'
                    : 'text-muted-foreground hover:text-ink'
                }`}
                key={value}
                onClick={() => setGranularity(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {statsQuery.isPending ? (
        <LoadingStats />
      ) : statsQuery.isError ? (
        <section
          className="mt-8 rounded-2xl border border-destructive/20 bg-destructive/5 px-6 py-10 text-center"
          role="alert"
        >
          <AlertCircle
            aria-hidden="true"
            className="mx-auto text-destructive"
            size={24}
          />
          <h2 className="mt-3 font-display text-lg font-semibold text-ink">
            Chưa thể tải thống kê
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {friendlyApiMessage(statsQuery.error)}
          </p>
          <button
            className="mt-5 inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink transition hover:bg-sidebar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => void statsQuery.refetch()}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={14} />
            Thử tải lại
          </button>
        </section>
      ) : stats ? (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <SummaryCard
              label={`Task hoàn thành · ${rangeDays} ngày`}
              value={completedTotal}
              Icon={CheckCheck}
              tone="forest"
            />
            <SummaryCard
              label="Task quá hạn"
              value={overdueTotal}
              Icon={Activity}
              tone="terracotta"
            />
            <SummaryCard
              label="Project đang theo dõi"
              value={stats.completedByProject.length}
              Icon={ClipboardList}
              tone="blue"
            />
          </div>

          <div className="mt-5">
            <ChartCard
              description={`Số lần hoàn thành từ ${input.fromDate} đến ${input.toDate}.`}
              title={
                granularity === 'day'
                  ? 'Task hoàn thành theo ngày'
                  : 'Task hoàn thành theo tuần'
              }
            >
              {completedTotal === 0 ? (
                <ChartEmpty text="Chưa có task hoàn thành trong khoảng thời gian này." />
              ) : (
                <div
                  aria-label="Biểu đồ task hoàn thành theo thời gian"
                  className="h-[300px] w-full"
                  role="img"
                >
                  <ResponsiveContainer height="100%" width="100%">
                    <LineChart
                      data={stats.completedByPeriod.map((bucket) => ({
                        ...bucket,
                        label: formatPeriod(bucket.period, granularity),
                      }))}
                      margin={{ top: 8, right: 12, left: -18, bottom: 4 }}
                    >
                      <CartesianGrid
                        stroke="var(--color-line)"
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis
                        axisLine={false}
                        dataKey="label"
                        minTickGap={18}
                        tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        axisLine={false}
                        tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-line)',
                          borderRadius: 12,
                          color: 'var(--color-ink)',
                        }}
                        formatter={(value) => [value, 'Đã hoàn thành']}
                      />
                      <Line
                        activeDot={{ r: 5 }}
                        dataKey="completedCount"
                        dot={{ fill: 'var(--color-forest)', r: 3 }}
                        name="Đã hoàn thành"
                        stroke="var(--color-forest)"
                        strokeWidth={2.5}
                        type="monotone"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <ChartCard
              description="Completion events trong khoảng thời gian đã chọn."
              title="Hoàn thành theo project"
            >
              {hasCompletedByProject ? (
                <div
                  aria-label="Biểu đồ task hoàn thành theo project"
                  className="h-[300px] w-full"
                  role="img"
                >
                  <ResponsiveContainer height="100%" width="100%">
                    <BarChart
                      data={stats.completedByProject.filter(
                        (project) => project.count > 0,
                      )}
                      layout="vertical"
                      margin={{ top: 0, right: 12, left: 8, bottom: 0 }}
                    >
                      <CartesianGrid
                        stroke="var(--color-line)"
                        strokeDasharray="3 3"
                        horizontal={false}
                      />
                      <XAxis
                        allowDecimals={false}
                        axisLine={false}
                        tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                        tickLine={false}
                        type="number"
                      />
                      <YAxis
                        axisLine={false}
                        dataKey="projectName"
                        tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                        tickLine={false}
                        type="category"
                        width={100}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-line)',
                          borderRadius: 12,
                          color: 'var(--color-ink)',
                        }}
                        formatter={(value) => [value, 'Đã hoàn thành']}
                      />
                      <Bar
                        dataKey="count"
                        fill="var(--color-forest)"
                        name="Đã hoàn thành"
                        radius={[0, 6, 6, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <ChartEmpty text="Chưa có project nào có task hoàn thành trong khoảng này." />
              )}
            </ChartCard>

            <ChartCard
              description="Task chưa hoàn thành đã quá hạn theo múi giờ tài khoản."
              title="Task quá hạn theo project"
            >
              {hasOverdueByProject ? (
                <div
                  aria-label="Biểu đồ task quá hạn theo project"
                  className="h-[300px] w-full"
                  role="img"
                >
                  <ResponsiveContainer height="100%" width="100%">
                    <BarChart
                      data={stats.overdueByProject.filter(
                        (project) => project.count > 0,
                      )}
                      layout="vertical"
                      margin={{ top: 0, right: 12, left: 8, bottom: 0 }}
                    >
                      <CartesianGrid
                        stroke="var(--color-line)"
                        strokeDasharray="3 3"
                        horizontal={false}
                      />
                      <XAxis
                        allowDecimals={false}
                        axisLine={false}
                        tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                        tickLine={false}
                        type="number"
                      />
                      <YAxis
                        axisLine={false}
                        dataKey="projectName"
                        tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                        tickLine={false}
                        type="category"
                        width={100}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-line)',
                          borderRadius: 12,
                          color: 'var(--color-ink)',
                        }}
                        formatter={(value) => [value, 'Task quá hạn']}
                      />
                      <Bar
                        dataKey="count"
                        fill="#c8795d"
                        name="Task quá hạn"
                        radius={[0, 6, 6, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <ChartEmpty text="Không có task nào quá hạn. Bạn đang theo kịp kế hoạch." />
              )}
            </ChartCard>
          </div>
          <p className="mt-5 text-right text-[11px] text-muted-foreground">
            Múi giờ thống kê: {identity?.timezone ?? 'UTC'}
          </p>
        </>
      ) : null}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  Icon,
  tone,
}: {
  label: string
  value: number
  Icon: LucideIcon
  tone: 'forest' | 'terracotta' | 'blue'
}) {
  const toneStyles = {
    forest: 'bg-forest/10 text-forest',
    terracotta: 'bg-[#c8795d]/10 text-[#b46249]',
    blue: 'bg-[#7295a0]/10 text-[#557d89]',
  }
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink">
            {value}
          </p>
        </div>
        <span className={`flex size-10 items-center justify-center rounded-xl ${toneStyles[tone]}`}>
          <Icon aria-hidden="true" size={19} />
        </span>
      </div>
    </section>
  )
}
