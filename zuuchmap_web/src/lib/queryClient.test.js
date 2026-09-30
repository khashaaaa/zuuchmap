import { describe, it, expect } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { findListedPost } from './queryClient'

/**
 * The detail page opens from a card, and the card's row is already in cache.
 * Finding it is what lets the page paint before its own request answers.
 */
describe('findListedPost', () => {
  const make = () => new QueryClient()

  it('finds a post on a browse page', () => {
    const qc = make()
    qc.setQueryData(['posts', { page: 1 }], { items: [{ id: 7, title: 'Экскаватор' }], total: 1 })
    expect(findListedPost(qc, '7')).toMatchObject({ title: 'Экскаватор' })
  })

  it('finds one in the similar strip and on the saved shelf', () => {
    const qc = make()
    qc.setQueryData(['posts', 'similar', 3], [{ id: 8, title: 'Кран' }])
    qc.setQueryData(['liked-posts', 1], { posts: [{ id: 9, title: 'Бульдозер' }] })
    expect(findListedPost(qc, 8)).toMatchObject({ title: 'Кран' })
    expect(findListedPost(qc, 9)).toMatchObject({ title: 'Бульдозер' })
  })

  it('returns nothing for a post no list has shown', () => {
    const qc = make()
    qc.setQueryData(['posts', {}], { items: [{ id: 1 }] })
    expect(findListedPost(qc, 2)).toBeUndefined()
  })
})
