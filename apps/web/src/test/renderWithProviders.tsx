import type { RenderResult } from '@testing-library/react'
import { render } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { configureStore } from '@reduxjs/toolkit'
import authReducer, { type AuthState } from '../features/auth/slices/authSlice'
import { theme } from '../lib/theme'

interface RenderOptions {
  preloadedState?: { auth?: Partial<AuthState> }
  initialEntries?: string[]
}

export function renderWithProviders(
  ui: React.ReactElement,
  { preloadedState = {}, initialEntries = ['/'] }: RenderOptions = {},
): RenderResult & { store: ReturnType<typeof configureStore> } {
  const authInitial: AuthState = {
    user: null,
    accessToken: null,
    status: 'idle',
    error: null,
    ...preloadedState.auth,
  }

  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: authInitial },
  })

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
      </ThemeProvider>
    </Provider>
  )

  const result = render(ui, { wrapper: Wrapper })
  return { ...result, store }
}
