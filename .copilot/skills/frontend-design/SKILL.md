---
name: todolist-ui
description: Design and build the user-facing React UI (Vite, Tailwind, shadcn/ui) of the Todoist-style task manager in project-ui - auth screens, app shell and sidebar, Inbox/Today/Upcoming/project views, task rows, quick add, task detail with sub-tasks/labels/comments, drag and drop, and the stats page. Use this skill whenever creating, restyling, or reviewing any page, component, theme token, or layout in this frontend, even for small tweaks like a button, an empty state, or a color change. Enforces a calm, dense, keyboard-friendly productivity look, Vietnamese end-user copy, and the data rules in doc/database.md.
---

This skill guides creation of distinctive, production-grade frontend interfaces for a task-management product, avoiding generic "AI slop" aesthetics. Implement real working code with exceptional attention to detail.

The user provides frontend requirements: a component, page, or flow to build or restyle. They may include context about the purpose, audience, or technical constraints.

## Product fit - todolist-ui

This repo is a **task-management** product (a Todoist-style clone): people open it many times a day to capture, scan, and finish tasks. **Speed, scanability, and low cognitive load come first**, and all end-user copy is **Vietnamese**.

- Treat the skill's "bold / distinctive" direction as **seasoning**: do not override established tokens, layout hierarchy, or terminology. Put distinctiveness into typography, the color palette, and a few high-value micro-interactions (especially completing a task), not into layout experiments that slow scanning.
- Reproduce the _experience_ of Todoist (sidebar + centered task list + quick add), never its logo, name, copy, or assets.
- Read `doc/database.md` before building any task, project, section, label, or stats UI. The data rules below come from it; never invent fields that are not in it.
- If tokens already exist (`src/index.css`, Tailwind config, shadcn theme), extend them instead of redefining.

## Design Thinking

Settle the direction **once for the whole app** (do not re-decide per page):

- **Purpose**: help one person plan and finish their day with minimal friction.
- **Tone**: calm, focused, utilitarian-warm. Refined minimalism with controlled whitespace and one confident accent color.
- **Constraints**: Vite + React + TypeScript (strict), Tailwind, shadcn/ui, accessibility, performance.
- **Differentiation**: the task-completion moment (satisfying check animation + undo toast). Make this the one thing people remember.

Commit to the direction and execute it with precision; intentionality matters more than intensity.

## Frontend Aesthetics Guidelines

- **Typography**: pair a characterful heading face with a highly legible UI body face. Both MUST include the Vietnamese subset: verify diacritics render correctly at every size (ă â ê ô ơ ư đ and stacked tones such as ệ, ữ, ở). Avoid generic defaults (Arial, Roboto, system fonts). Legibility beats novelty. Limit to 2 families and 4 weights, load with `display=swap`.
- **Color & Theme**: define colors as CSS variables (shadcn tokens such as `--background`, `--foreground`, `--primary`) for `:root` and `.dark`; light and dark are both first-class. One dominant accent plus neutrals. Add semantic tokens: `--priority-1..4` (P1 red, P2 orange, P3 blue, P4 neutral), due states (overdue, today, upcoming, none) and success. Never hardcode hex values in components. Keep WCAG AA contrast in both themes, and never rely on color alone: priority and overdue status also need an icon, label, or `aria-label`.
- **Motion**: purposeful and short (100-250ms): checkbox completion, row exit, dialog/drawer transitions, drag overlay. No staggered reveals on routine list navigation; reserve richer entrance animation for the first load of the app shell and auth screens. Respect `prefers-reduced-motion`. Prefer CSS transitions; use a motion library only if the project already has one.
- **Spatial Composition**: fixed collapsible sidebar (drawer below `md`) + centered content column (about 720-840px). Dense rows (about 36-48px) with a clear order: checkbox, title, metadata (due date, labels, sub-task count, comment count). Consistent spacing scale. No asymmetry, overlap, or grid-breaking in work views; auth pages may be more expressive.
- **Backgrounds & Visual Details**: flat, quiet surfaces, subtle borders, soft shadows only on floating layers (dialogs, popovers, drag overlay). A restrained touch (subtle gradient or illustration) is fine on auth screens and empty states. No heavy textures, noise, or custom cursors in work views.

## Data rules the UI must respect (from doc/database.md)

- Due date: `dueDate` (date) and `dueTime` (time, empty = all-day task), both in the user's local time. All-day tasks become overdue only the next day.
- `priority` is 1-4 (1 highest, 4 default). `status` is `TODO`, `IN_PROGRESS`, or `COMPLETED`; reopening a completed task returns it to `TODO`.
- A task may have no section (`sectionId = null`). Inbox is a special project: cannot be deleted or renamed, has no sections.
- Sub-tasks always belong to the same project as the parent, render as an indented tree, maximum 3 levels. Completing a parent completes its unfinished sub-tasks; deleting a parent deletes its sub-tasks.
- Labels are many-to-many with tasks; names are case-insensitive per user.
- `position` is an integer used for ordering; insert between neighbors by taking the midpoint, and renumber the list when there is no gap.
- Recurring tasks (`recurrenceRule`) move to the next due date when completed instead of staying completed.

## Required states and interaction

- Every page and list: loading skeleton, empty state with a clear next action, error state with a retry button.
- Optimistic updates for complete, reopen, reorder, and edit; roll back and show a toast on failure.
- Completing a task shows a toast with **Hoàn tác** (undo).
- Keyboard: `q` opens Quick Add, `Esc` closes dialogs, `Enter` submits, dnd-kit keyboard sensor enabled, visible focus ring everywhere.
- Accessibility: real buttons and checkboxes (or Radix primitives), Vietnamese `aria-label`s, `aria-live` for toasts, touch targets of at least 44px on mobile, no layout shift.
- Responsive and mobile-first. Forms use React Hook Form + Zod with inline Vietnamese error messages and a disabled/loading submit state.

## Implementation rules

- shadcn/ui first (compose, do not fork); `lucide-react` icons; `@` alias; Tailwind utilities driven by tokens; `cn()` helper.
- Data only through `src/services/api/` interfaces and TanStack Query hooks (`useTasks`, `useProjects`, ...). Components never call `fetch` or `localStorage` directly. UI-only state goes in Zustand.
- Dates with `date-fns` using the `vi` locale: "Hôm nay", "Ngày mai", weekday names. Overdue dates use the overdue token.
- Follow the `react-best-practices` and `web-design-guidelines` skills. This is a Vite SPA, so skip Next.js/server-only rules and use `React.lazy` for route splitting.
- Do not add new UI or state libraries without asking.

## Vietnamese copy

Use these terms consistently and keep the tone friendly and concise. Error messages must say what happened and what to do next.

| Concept          | Term              |
| ---------------- | ----------------- |
| Task             | công việc         |
| Project          | dự án             |
| Section          | phần              |
| Label            | nhãn              |
| Priority         | ưu tiên (P1-P4)   |
| Due date         | hạn               |
| Inbox            | Hộp thư đến       |
| Today / Upcoming | Hôm nay / Sắp tới |
| Undo             | Hoàn tác          |

## NEVER

- Generic AI aesthetics: overused font families, cliched purple-gradient-on-white schemes, cookie-cutter layouts with no character.
- Decorative effects that hurt scanability in task lists.
- Copying Todoist branding or assets.
- Hardcoded colors or Vietnamese strings scattered through components (use tokens and a shared copy location).
- Conveying status by color alone.
- Skipping loading, empty, or error states.
- Tap targets under 44px on mobile.
- Inventing data fields that are not in `doc/database.md`.

Remember: in a productivity tool the design disappears into the task. Make finishing a task feel good, and keep everything else fast and calm.
