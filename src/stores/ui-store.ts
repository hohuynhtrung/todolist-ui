import { create } from 'zustand'

export type ThemeMode = 'light' | 'dark'

interface UiState {
  isSidebarCollapsed: boolean
  isMobileSidebarOpen: boolean
  isQuickAddOpen: boolean
  activeTaskId: string | null
  theme: ThemeMode
  toggleSidebar: () => void
  openMobileSidebar: () => void
  closeMobileSidebar: () => void
  openQuickAdd: () => void
  closeQuickAdd: () => void
  openTaskDetails: (taskId: string) => void
  closeTaskDetails: () => void
  setTheme: (theme: ThemeMode) => void
}

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'light'
  }

  return window.localStorage.getItem('nep-theme') === 'dark' ? 'dark' : 'light'
}

export const useUiStore = create<UiState>((set) => ({
  isSidebarCollapsed: false,
  isMobileSidebarOpen: false,
  isQuickAddOpen: false,
  activeTaskId: null,
  theme: getInitialTheme(),
  toggleSidebar: () =>
    set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
  openMobileSidebar: () => set({ isMobileSidebarOpen: true }),
  closeMobileSidebar: () => set({ isMobileSidebarOpen: false }),
  openQuickAdd: () => set({ isQuickAddOpen: true }),
  closeQuickAdd: () => set({ isQuickAddOpen: false }),
  openTaskDetails: (activeTaskId) => set({ activeTaskId }),
  closeTaskDetails: () => set({ activeTaskId: null }),
  setTheme: (theme) => {
    window.localStorage.setItem('nep-theme', theme)
    document.documentElement.dataset.theme = theme
    document.documentElement.classList.toggle('dark', theme === 'dark')
    set({ theme })
  },
}))
