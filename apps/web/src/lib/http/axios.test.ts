import type { AxiosAdapter, AxiosRequestConfig, AxiosResponse } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createHttpClient } from './axios'

/**
 * Build a minimal AxiosResponse so the adapter stub can resolve like a real
 * axios call would. We don't need every field — axios only consumes status,
 * data, headers, config when running interceptors.
 */
function buildResponse<T>(
  config: AxiosRequestConfig,
  status: number,
  data: T,
): AxiosResponse<T> {
  return {
    status,
    statusText: status === 200 ? 'OK' : 'ERR',
    data,
    headers: {},
    // axios attaches the resolved config back onto the response
    config: config as AxiosResponse<T>['config'],
  }
}

/**
 * Build an axios-shaped error the way the real adapter would: an Error with
 * .response, .config, and .isAxiosError = true. The interceptor reads
 * error.response.status to decide whether to refresh.
 */
function buildError(
  config: AxiosRequestConfig,
  status: number,
  data: unknown = { message: 'ERR' },
): Error & { response: AxiosResponse; config: AxiosRequestConfig; isAxiosError: true } {
  const err = new Error(`Request failed with status code ${status}`) as Error & {
    response: AxiosResponse
    config: AxiosRequestConfig
    isAxiosError: true
  }
  err.response = {
    status,
    statusText: 'ERR',
    data,
    headers: {},
    config: config as AxiosResponse['config'],
  }
  err.config = config
  err.isAxiosError = true
  return err
}

describe('createHttpClient', () => {
  let adapter: ReturnType<typeof vi.fn>
  let getAccessToken: ReturnType<typeof vi.fn>
  let onTokenRefreshed: ReturnType<typeof vi.fn>
  let onUnauthorized: ReturnType<typeof vi.fn>

  beforeEach(() => {
    adapter = vi.fn()
    getAccessToken = vi.fn(() => 'access-token-1')
    onTokenRefreshed = vi.fn()
    onUnauthorized = vi.fn()
  })

  function makeClient() {
    return createHttpClient({
      baseURL: 'http://api.test',
      adapter: adapter as unknown as AxiosAdapter,
      getAccessToken: getAccessToken as () => string | null,
      onTokenRefreshed: onTokenRefreshed as (token: string) => void,
      onUnauthorized: onUnauthorized as () => void,
    })
  }

  describe('request interceptor', () => {
    it('injects Authorization: Bearer header from getAccessToken on every request', async () => {
      adapter.mockImplementationOnce((config: AxiosRequestConfig) =>
        Promise.resolve(buildResponse(config, 200, { ok: true })),
      )

      const client = makeClient()
      await client.get('/auth/me')

      expect(adapter).toHaveBeenCalledTimes(1)
      const sentConfig = adapter.mock.calls[0]?.[0] as AxiosRequestConfig
      expect(sentConfig.headers?.Authorization).toBe('Bearer access-token-1')
    })

    it('omits Authorization header when getAccessToken returns null (e.g. pre-login)', async () => {
      getAccessToken.mockReturnValue(null)
      adapter.mockImplementationOnce((config: AxiosRequestConfig) =>
        Promise.resolve(buildResponse(config, 200, { ok: true })),
      )

      const client = makeClient()
      await client.post('/auth/login', { email: 'a@b.test', password: 'x' })

      const sentConfig = adapter.mock.calls[0]?.[0] as AxiosRequestConfig
      expect(sentConfig.headers?.Authorization).toBeUndefined()
    })

    it('respects an explicit Authorization header set by the caller (e.g. login composing /auth/me with a freshly issued token)', async () => {
      // The store hasn't been updated yet, but the caller already has the token
      // in scope and passes it explicitly. The interceptor must NOT overwrite.
      getAccessToken.mockReturnValue('stale-token-from-store')
      adapter.mockImplementationOnce((config: AxiosRequestConfig) =>
        Promise.resolve(buildResponse(config, 200, { id: 'user-1' })),
      )

      const client = makeClient()
      await client.get('/auth/me', {
        headers: { Authorization: 'Bearer fresh-token-from-login' },
      })

      const sentConfig = adapter.mock.calls[0]?.[0] as AxiosRequestConfig
      expect(sentConfig.headers?.Authorization).toBe('Bearer fresh-token-from-login')
    })
  })

  describe('response interceptor — happy path', () => {
    it('returns successful 2xx responses untouched', async () => {
      adapter.mockImplementationOnce((config: AxiosRequestConfig) =>
        Promise.resolve(buildResponse(config, 200, { id: 'user-1' })),
      )

      const client = makeClient()
      const res = await client.get('/auth/me')

      expect(res.status).toBe(200)
      expect(res.data).toEqual({ id: 'user-1' })
      // No refresh attempted on success
      expect(adapter).toHaveBeenCalledTimes(1)
    })

    it('propagates non-401 errors without attempting refresh', async () => {
      adapter.mockImplementationOnce((config: AxiosRequestConfig) =>
        Promise.reject(buildError(config, 500, { message: 'INTERNAL' })),
      )

      const client = makeClient()

      await expect(client.get('/auth/me')).rejects.toMatchObject({
        response: { status: 500 },
      })
      expect(adapter).toHaveBeenCalledTimes(1)
      expect(onTokenRefreshed).not.toHaveBeenCalled()
      expect(onUnauthorized).not.toHaveBeenCalled()
    })
  })

  describe('response interceptor — 401 refresh + retry', () => {
    it('on 401, POSTs /auth/refresh, updates token via onTokenRefreshed, and retries the original request with the new bearer', async () => {
      // 1st call: GET /auth/me -> 401
      // 2nd call: POST /auth/refresh -> 200 { accessToken: 'access-token-2' }
      // 3rd call: GET /auth/me retried -> 200 { id: 'user-1' }
      adapter
        .mockImplementationOnce((config: AxiosRequestConfig) =>
          Promise.reject(buildError(config, 401, { message: 'TOKEN_EXPIRED' })),
        )
        .mockImplementationOnce((config: AxiosRequestConfig) =>
          Promise.resolve(buildResponse(config, 200, { accessToken: 'access-token-2' })),
        )
        .mockImplementationOnce((config: AxiosRequestConfig) =>
          Promise.resolve(buildResponse(config, 200, { id: 'user-1' })),
        )

      const client = makeClient()
      const res = await client.get('/auth/me')

      expect(res.data).toEqual({ id: 'user-1' })
      expect(adapter).toHaveBeenCalledTimes(3)

      // Refresh hit /auth/refresh as POST
      const refreshCall = adapter.mock.calls[1]?.[0] as AxiosRequestConfig
      expect(refreshCall.method?.toLowerCase()).toBe('post')
      expect(refreshCall.url).toContain('/auth/refresh')

      // Token rotation observed
      expect(onTokenRefreshed).toHaveBeenCalledTimes(1)
      expect(onTokenRefreshed).toHaveBeenCalledWith('access-token-2')

      // Retried request carries the NEW bearer, not the stale one
      const retryCall = adapter.mock.calls[2]?.[0] as AxiosRequestConfig
      expect(retryCall.headers?.Authorization).toBe('Bearer access-token-2')

      // Refresh succeeded → onUnauthorized must NOT fire
      expect(onUnauthorized).not.toHaveBeenCalled()
    })

    it('when /auth/refresh itself returns 401, calls onUnauthorized and rejects the original error without retrying again', async () => {
      adapter
        .mockImplementationOnce((config: AxiosRequestConfig) =>
          Promise.reject(buildError(config, 401, { message: 'TOKEN_EXPIRED' })),
        )
        .mockImplementationOnce((config: AxiosRequestConfig) =>
          Promise.reject(buildError(config, 401, { message: 'MissingRefreshToken' })),
        )

      const client = makeClient()

      await expect(client.get('/auth/me')).rejects.toBeDefined()

      // Exactly 2 calls: original 401 + refresh 401. NO third call (no infinite loop).
      expect(adapter).toHaveBeenCalledTimes(2)
      expect(onUnauthorized).toHaveBeenCalledTimes(1)
      expect(onTokenRefreshed).not.toHaveBeenCalled()
    })

    it('does NOT attempt to refresh when the failing request IS /auth/refresh itself (loop guard)', async () => {
      adapter.mockImplementationOnce((config: AxiosRequestConfig) =>
        Promise.reject(buildError(config, 401, { message: 'MissingRefreshToken' })),
      )

      const client = makeClient()

      await expect(client.post('/auth/refresh')).rejects.toMatchObject({
        response: { status: 401 },
      })

      // Only the single failed call — no recursive refresh attempt
      expect(adapter).toHaveBeenCalledTimes(1)
      expect(onTokenRefreshed).not.toHaveBeenCalled()
    })
  })

  describe('response interceptor — single-flight refresh', () => {
    it('coalesces concurrent 401s into a single /auth/refresh call', async () => {
      // Two parallel requests both get 401. Only ONE refresh should fire,
      // and both originals should retry with the same new token.
      let refreshResolve: ((value: AxiosResponse) => void) | undefined
      const refreshPending = new Promise<AxiosResponse>((resolve) => {
        refreshResolve = resolve
      })

      adapter.mockImplementation((config: AxiosRequestConfig) => {
        // First two calls are the original GETs (both 401)
        const callIndex = adapter.mock.calls.length - 1
        if (callIndex === 0 || callIndex === 1) {
          return Promise.reject(buildError(config, 401, { message: 'TOKEN_EXPIRED' }))
        }
        // 3rd call MUST be /auth/refresh — held until we resolve it
        if (config.url?.includes('/auth/refresh')) {
          return refreshPending.then((res) => ({
            ...res,
            config: config as AxiosResponse['config'],
          }))
        }
        // 4th and 5th calls are the retries — succeed
        return Promise.resolve(buildResponse(config, 200, { retried: true }))
      })

      const client = makeClient()
      const a = client.get('/resource/a')
      const b = client.get('/resource/b')

      // Let the original 401s settle and the single refresh start
      await new Promise((r) => setTimeout(r, 0))

      // Resolve the in-flight refresh
      refreshResolve?.(
        buildResponse({} as AxiosRequestConfig, 200, { accessToken: 'access-token-2' }),
      )

      const [resA, resB] = await Promise.all([a, b])

      expect(resA.data).toEqual({ retried: true })
      expect(resB.data).toEqual({ retried: true })

      // Count refresh calls — must be exactly 1
      const refreshCalls = adapter.mock.calls.filter(
        (call) => (call[0] as AxiosRequestConfig).url?.includes('/auth/refresh'),
      )
      expect(refreshCalls).toHaveLength(1)

      // Token-refreshed callback fires once with the shared new token
      expect(onTokenRefreshed).toHaveBeenCalledTimes(1)
      expect(onTokenRefreshed).toHaveBeenCalledWith('access-token-2')
    })
  })
})
