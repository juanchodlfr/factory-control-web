export type AuthCallbackState =
  | { kind: 'none' }
  | { kind: 'password_setup'; type: 'invite' | 'recovery' }
  | { kind: 'error'; message: string }

const authErrorKeys = ['error_description', 'error', 'error_code'] as const

function paramsFrom(value: string, prefix: string) {
  return new URLSearchParams(value.startsWith(prefix) ? value.slice(prefix.length) : value)
}

export function readAuthCallback(input: Pick<Location, 'hash' | 'search'>): AuthCallbackState {
  const hash = paramsFrom(input.hash, '#')
  const search = paramsFrom(input.search, '?')
  const get = (key: string) => hash.get(key) ?? search.get(key)

  for (const key of authErrorKeys) {
    const value = get(key)
    if (value) return { kind: 'error', message: value }
  }

  const type = get('type')
  if (type === 'invite' || type === 'recovery') return { kind: 'password_setup', type }
  return { kind: 'none' }
}

export function clearAuthCallbackUrl() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  for (const key of ['error', 'error_code', 'error_description', 'code', 'type']) url.searchParams.delete(key)
  url.hash = ''
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`)
}
