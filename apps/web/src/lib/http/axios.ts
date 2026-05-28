import axios, {
  type AxiosAdapter,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios'

/**
 * Configuration for the shared axios HTTP client.
 *
 * Callbacks are injected so the client stays decoupled from the Redux store —
 * tests can drive every boundary deterministically, and the production wiring
 * happens once at app boot via {@link configureHttpClient}.
 */
export interface HttpClientOptions {
  /** Base URL prefixed to every request. Defaults to `VITE_API_URL` or localhost. */
  baseURL?: string
  /**
   * Optional axios adapter override. Tests use this to short-circuit the
   * real network layer; production should leave this undefined so axios
   * picks its default adapter.
   */
  adapter?: AxiosAdapter
  /** Reads the current access token (e.g. from Redux). Returns null when unauthenticated. */
  getAccessToken: () => string | null
  /** Called after a successful refresh with the freshly issued access token. */
  onTokenRefreshed: (token: string) => void
  /** Called when refresh itself fails (e.g. expired refresh cookie) — typically dispatches logout. */
  onUnauthorized: () => void
}

/**
 * Internal flag we attach to the request config so we never retry the same
 * request twice on 401. Using a symbol-prefixed key keeps the surface invisible
 * to consumers and avoids colliding with axios internals.
 */
type RetryableConfig = InternalAxiosRequestConfig & { _authRetry?: boolean }

const REFRESH_PATH = '/auth/refresh'

/**
 * Build a fully-configured axios instance with:
 * - Request interceptor that injects `Authorization: Bearer <token>`
 *   from {@link HttpClientOptions.getAccessToken} unless the caller already
 *   set the header explicitly (login → /auth/me composition needs this).
 * - Response interceptor that on 401 fires a single in-flight refresh,
 *   updates the store via `onTokenRefreshed`, and retries the original
 *   request with the new bearer. Concurrent 401s coalesce onto the same
 *   refresh promise. If refresh itself returns 401 (or any error), the
 *   original error is rejected and `onUnauthorized` fires.
 *
 * Each instance owns its own `refreshPromise`, so tests are isolated.
 */
export function createHttpClient(opts: HttpClientOptions): AxiosInstance {
  const client = axios.create({
    baseURL: opts.baseURL,
    withCredentials: true, // refresh cookie travels on every request
    adapter: opts.adapter,
  })

  // Single-flight guard — multiple simultaneous 401s share one refresh.
  let refreshPromise: Promise<string> | null = null

  function refreshAccessToken(): Promise<string> {
    if (refreshPromise) return refreshPromise
    refreshPromise = client
      .post<{ accessToken: string }>(REFRESH_PATH, undefined)
      .then((response) => {
        const newToken = response.data.accessToken
        // Fire onTokenRefreshed once per actual refresh, not once per retried request.
        opts.onTokenRefreshed(newToken)
        return newToken
      })
      .finally(() => {
        refreshPromise = null
      })
    return refreshPromise
  }

  client.interceptors.request.use((config) => {
    // Respect an explicit Authorization header (e.g. login composing /auth/me
    // with the freshly issued token before the store has caught up).
    const existing = config.headers?.Authorization ?? config.headers?.get?.('Authorization')
    if (existing) return config

    const token = opts.getAccessToken()
    if (token) {
      config.headers = config.headers ?? ({} as InternalAxiosRequestConfig['headers'])
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })

  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config as RetryableConfig | undefined
      const status = error.response?.status

      // Only 401s are interesting for refresh; everything else propagates.
      if (status !== 401 || !originalRequest) return Promise.reject(error)

      // Loop guard: if /auth/refresh itself failed, don't try to refresh again.
      const url = originalRequest.url ?? ''
      if (url.includes(REFRESH_PATH)) return Promise.reject(error)

      // Idempotency guard: a request that already retried once should not loop.
      if (originalRequest._authRetry) return Promise.reject(error)
      originalRequest._authRetry = true

      try {
        const newToken = await refreshAccessToken()
        // Replace the bearer on the retried request — bypasses the request
        // interceptor's "respect existing Authorization" rule because the new
        // token IS the authoritative one for the retry.
        originalRequest.headers = originalRequest.headers ?? ({} as InternalAxiosRequestConfig['headers'])
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return await client.request(originalRequest)
      } catch {
        opts.onUnauthorized()
        return Promise.reject(error)
      }
    },
  )

  return client
}

/**
 * Resolved base URL for the production singleton. Vite injects `VITE_API_URL`
 * at build time; the localhost fallback keeps `pnpm dev` working without
 * extra setup.
 */
const DEFAULT_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

/**
 * Mutable callback slots for the production singleton. They start as no-ops
 * so authApi can issue public requests (signup, login, verify-email) before
 * the Redux store exists. The boot sequence in `store.ts` (task 4.15) calls
 * {@link configureHttpClient} once with real wiring.
 */
let _getAccessToken: () => string | null = () => null
let _onTokenRefreshed: (token: string) => void = () => {}
let _onUnauthorized: () => void = () => {}

/**
 * Wire the production singleton to the Redux store. Call this exactly once
 * at app boot, after the store is created.
 */
export function configureHttpClient(opts: {
  getAccessToken: () => string | null
  onTokenRefreshed: (token: string) => void
  onUnauthorized: () => void
}): void {
  _getAccessToken = opts.getAccessToken
  _onTokenRefreshed = opts.onTokenRefreshed
  _onUnauthorized = opts.onUnauthorized
}

/**
 * Production HTTP client used by feature APIs. The interceptors read through
 * the closure-bound slots so {@link configureHttpClient} can wire/rewire the
 * Redux callbacks without re-creating the axios instance.
 */
export const httpClient: AxiosInstance = createHttpClient({
  baseURL: DEFAULT_BASE_URL,
  getAccessToken: () => _getAccessToken(),
  onTokenRefreshed: (token) => _onTokenRefreshed(token),
  onUnauthorized: () => _onUnauthorized(),
})

export type { AxiosInstance } from 'axios'
