import { CalendarDays, Check, MessageCircle, SquareArrowOutUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import type { TaskListItem, TaskStatus } from '@/types/workspace'
import { formatDueDate } from '@/lib/dates'

interface TaskRowProps {
  task: TaskListItem
  timezone: string
  depth?: number
  pending?: boolean
  dragHandle?: ReactNode
  onToggle: (task: TaskListItem) => void
  onOpenDetails?: (task: TaskListItem) => void
}

const priorityClasses: Record<number, string> = {
  1: 'border-[#c65a3b] text-[#c65a3b]',
  2: 'border-[#d3a75c] text-[#b58a3d]',
  3: 'border-[#7295a0] text-[#7295a0]',
  4: 'border-muted-foreground/50 text-transparent',
}

const statusNames: Record<TaskStatus, string> = {
  TODO: 'Chưa làm',
  IN_PROGRESS: 'Đang thực hiện',
  COMPLETED: 'Đã hoàn thành',
}

export function TaskRow({
  task,
  timezone,
  depth = 0,
  pending = false,
  dragHandle,
  onToggle,
  onOpenDetails,
}: TaskRowProps) {
  const completed = task.status === 'COMPLETED'
  const inProgress = task.status === 'IN_PROGRESS'
  const due = formatDueDate(task.dueDate, task.dueTime, timezone)
  const priorityClass = priorityClasses[task.priority] ?? priorityClasses[4]

  return (
    <article
      className={`group flex min-h-[58px] items-start gap-3 border-b border-line/80 px-2 py-3 transition duration-200 hover:bg-sidebar/55 ${
        pending ? 'scale-[0.99] opacity-40' : 'opacity-100'
      } ${completed ? 'opacity-65' : ''}`}
      style={{ paddingLeft: `${8 + Math.min(depth, 3) * 22}px` }}
    >
      {dragHandle}
      <button
        aria-label={`${completed ? 'Mở lại' : 'Hoàn thành'}: ${task.title}`}
        aria-pressed={completed}
        className="group/toggle -ml-3 -mr-3 -my-1 flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-50"
        disabled={pending}
        onClick={() => onToggle(task)}
        title={`${statusNames[task.status]} · Ưu tiên ${task.priority}`}
        type="button"
      >
        <span
          aria-hidden="true"
          className={`flex size-[19px] items-center justify-center rounded-full border-2 transition group-hover/toggle:scale-110 ${
            completed
              ? 'border-forest bg-forest text-primary-foreground'
              : inProgress
                ? 'border-accent bg-accent-soft text-accent'
                : `${priorityClass} bg-transparent group-hover/toggle:bg-accent-soft`
          }`}
        >
          {completed && <Check size={12} strokeWidth={3} />}
          {inProgress && <span className="size-1.5 rounded-full bg-current" />}
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p
            className={`min-w-0 flex-1 break-words text-[13px] leading-5 ${
              completed ? 'text-muted-foreground line-through' : 'text-ink'
            }`}
          >
            {task.title}
          </p>
          {onOpenDetails && (
            <button
              aria-label={`Chi tiết: ${task.title}`}
              className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent-soft hover:text-accent focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:size-7 md:opacity-0 md:group-hover:opacity-100"
              onClick={() => onOpenDetails(task)}
              type="button"
            >
              <SquareArrowOutUpRight aria-hidden="true" size={14} />
            </button>
          )}
        </div>
        {(due || task.labels.length > 0 || task.subTaskCount > 0 || task.commentCount > 0) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {due && (
              <span
                className={`inline-flex items-center gap-1 text-[11px] ${
                  due.overdue ? 'font-medium text-destructive' : 'text-muted-foreground'
                }`}
              >
                <CalendarDays aria-hidden="true" size={12} />
                {due.label}
              </span>
            )}
            {task.labels.map((label) => (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent"
                key={label.id}
              >
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-current"
                  style={label.color ? { color: label.color } : undefined}
                />
                {label.name}
              </span>
            ))}
            {task.subTaskCount > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {task.subTaskCount} việc con
              </span>
            )}
            {task.commentCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <MessageCircle aria-hidden="true" size={12} />
                {task.commentCount}
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
