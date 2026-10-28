import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProviders } from '@/app/providers'
import { useUiStore } from '@/stores/ui-store'
import './index.css'
import App from './App'

const initialTheme = useUiStore.getState().theme
document.documentElement.dataset.theme = initialTheme
document.documentElement.classList.toggle('dark', initialTheme === 'dark')

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Không tìm thấy phần tử gốc của ứng dụng.')
}

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
)
