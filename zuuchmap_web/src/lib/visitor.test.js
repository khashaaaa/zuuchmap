import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The visitor id is what lets an anonymous view be counted once instead of not
 * at all. Both properties matter: it has to survive a reload, and it has to
 * keep working when storage does not.
 */
describe('getVisitorId', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  it('is stable across calls within a session', async () => {
    const { getVisitorId } = await import('./visitor')
    expect(getVisitorId()).toBe(getVisitorId())
  })

  it('survives a reload by persisting to localStorage', async () => {
    const { getVisitorId } = await import('./visitor')
    const first = getVisitorId()

    // A fresh module instance is what a page load looks like.
    vi.resetModules()
    const { getVisitorId: again } = await import('./visitor')
    expect(again()).toBe(first)
  })

  // Private mode throws on write. Falling over here would take the whole API
  // client with it, since the id is set on every request.
  it('still returns an id when localStorage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const { getVisitorId } = await import('./visitor')
    const id = getVisitorId()
    expect(id).toBeTruthy()
    expect(getVisitorId()).toBe(id)
  })

  it('produces an id long enough for the server to accept', async () => {
    const { getVisitorId } = await import('./visitor')
    // The server ignores anything under 8 characters and falls back to IP.
    expect(getVisitorId().length).toBeGreaterThanOrEqual(8)
  })
})
