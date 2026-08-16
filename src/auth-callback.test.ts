import { describe, expect, it } from 'vitest'
import { readAuthCallback } from './auth-callback'

describe('auth callback routing', () => {
  it('recognizes an implicit invite callback as password setup', () => {
    expect(readAuthCallback({ hash: '#access_token=token&type=invite', search: '' })).toEqual({ kind: 'password_setup', type: 'invite' })
  })

  it('surfaces callback errors instead of falling through to a blank app', () => {
    expect(readAuthCallback({ hash: '#error=access_denied&error_description=Email+link+is+invalid+or+has+expired', search: '' })).toEqual({ kind: 'error', message: 'Email link is invalid or has expired' })
  })

  it('leaves ordinary navigation in the normal auth flow', () => {
    expect(readAuthCallback({ hash: '', search: '?view=board' })).toEqual({ kind: 'none' })
  })
})
