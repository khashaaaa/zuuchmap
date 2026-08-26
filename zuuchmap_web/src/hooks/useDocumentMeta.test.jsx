import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import useDocumentMeta from './useDocumentMeta'

const content = (selector) => document.head.querySelector(selector)?.getAttribute('content')

/**
 * Every route shared the landing page's title and social card. The half of the
 * fix that runs in the browser is this hook — and the part that is easy to get
 * wrong is the cleanup: a listing's description left behind on the browse page
 * is worse than no per-route meta at all.
 */
describe('useDocumentMeta', () => {
  it('sets the title, description and social tags', () => {
    renderHook(() =>
      useDocumentMeta({
        title: 'Экскаватор түрээс',
        description: 'Komatsu PC200',
        image: 'https://example.test/a.jpg',
        url: 'https://zuuchmap.com/posts/7',
      })
    )

    expect(document.title).toBe('Экскаватор түрээс — ZuuchMap')
    expect(content('meta[name="description"]')).toBe('Komatsu PC200')
    expect(content('meta[property="og:title"]')).toBe('Экскаватор түрээс — ZuuchMap')
    expect(content('meta[property="og:image"]')).toBe('https://example.test/a.jpg')
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href'))
      .toBe('https://zuuchmap.com/posts/7')
  })

  it('restores what was there when the route unmounts', () => {
    const tag = document.createElement('meta')
    tag.setAttribute('name', 'description')
    tag.setAttribute('content', 'the site default')
    document.head.appendChild(tag)
    document.title = 'ZuuchMap'

    const { unmount } = renderHook(() => useDocumentMeta({ title: 'A listing', description: 'Something else' }))
    expect(content('meta[name="description"]')).toBe('Something else')

    unmount()
    expect(document.title).toBe('ZuuchMap')
    expect(content('meta[name="description"]')).toBe('the site default')
    tag.remove()
  })

  it('falls back to the site defaults when a route passes nothing', () => {
    renderHook(() => useDocumentMeta())
    expect(document.title).toContain('ZuuchMap')
    expect(content('meta[name="description"]')).toContain('Монголын барилгын зах зээл')
  })
})
