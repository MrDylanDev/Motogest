import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { store } from './store'
import { theme } from './lib/theme'
import { configureHttpClient } from './lib/http/axios'
import { logout, tokenRefreshed } from './features/auth/slices/authSlice'
import App from './App'
import './index.css'

configureHttpClient({
  getAccessToken: () => store.getState().auth.accessToken,
  onTokenRefreshed: (token) => {
    store.dispatch(tokenRefreshed(token))
  },
  onUnauthorized: () => {
    store.dispatch(logout())
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ThemeProvider>
    </Provider>
  </StrictMode>,
)
