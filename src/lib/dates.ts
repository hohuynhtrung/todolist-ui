export function localDateInTimezone(timezone: string, date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function shiftLocalDate(date: string, offset: number): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + offset))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}

export function parseNaturalDate(
  value: string,
  timezone: string,
  now = new Date(),
): string | null {
  const normalized = value.trim().toLocaleLowerCase('vi-VN')
  if (!normalized) return null
  const today = localDateInTimezone(timezone, now)
  if (['today', 'hôm nay', 'hn'].includes(normalized)) return today
  if (['tomorrow', 'tmr', 'ngày mai', 'mai'].includes(normalized)) {
    return shiftLocalDate(today, 1)
  }
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized)
  if (isoMatch) {
    const [, year, month, day] = isoMatch
    const candidate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
    if (
      candidate.getUTCFullYear() === Number(year) &&
      candidate.getUTCMonth() + 1 === Number(month) &&
      candidate.getUTCDate() === Number(day)
    ) {
      return normalized
    }
    return null
  }

  const weekdays: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    'chủ nhật': 0,
    'thứ 2': 1,
    'thứ hai': 1,
    'thứ 3': 2,
    'thứ ba': 2,
    'thứ 4': 3,
    'thứ tư': 3,
    'thứ 5': 4,
    'thứ năm': 4,
    'thứ 6': 5,
    'thứ sáu': 5,
    'thứ 7': 6,
    'thứ bảy': 6,
  }
  const nextMatch = /^(?:next\s+)?(.+)$/.exec(normalized)
  const weekday = nextMatch ? weekdays[nextMatch[1] ?? ''] : undefined
  if (weekday === undefined) return null
  const [year = 0, month = 1, day = 1] = today.split('-').map(Number)
  const currentWeekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  let offset = (weekday - currentWeekday + 7) % 7
  if (normalized.startsWith('next ') || offset === 0) {
    offset = offset === 0 ? 7 : offset
    if (normalized.startsWith('next ') && offset === 0) offset = 7
  }
  return shiftLocalDate(today, offset)
}

export function isTaskOverdue(
  dueDate: string | null,
  dueTime: string | null,
  timezone: string,
  now = new Date(),
): boolean {
  if (!dueDate) return false
  const today = localDateInTimezone(timezone, now)
  if (dueDate < today) return true
  if (dueDate > today || !dueTime) return false
  const localTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now)
  return localTime >= dueTime.slice(0, 5)
}

export function formatDueDate(
  dueDate: string | null,
  dueTime: string | null,
  timezone: string,
  now = new Date(),
): { label: string; overdue: boolean; today: boolean; tomorrow: boolean } | null {
  if (!dueDate) return null
  const today = localDateInTimezone(timezone, now)
  const tomorrow = shiftLocalDate(today, 1)
  const overdue = isTaskOverdue(dueDate, dueTime, timezone, now)
  let dateLabel: string
  if (dueDate === today) {
    dateLabel = 'Hôm nay'
  } else if (dueDate === tomorrow) {
    dateLabel = 'Ngày mai'
  } else {
    const [year = 0, month = 1, day = 1] = dueDate.split('-').map(Number)
    dateLabel = new Intl.DateTimeFormat('vi-VN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day, 12)))
  }
  return {
    label: dueTime ? `${dateLabel}, ${dueTime.slice(0, 5)}` : dateLabel,
    overdue,
    today: dueDate === today,
    tomorrow: dueDate === tomorrow,
  }
}
