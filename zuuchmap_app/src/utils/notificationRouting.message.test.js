import { resolveNotificationRoute } from './notificationRouting';

/**
 * Order in this table is the whole behaviour. A message push carries a postId
 * as well as a conversationId, so a rule that matches on postId first would
 * open the listing and never the thread the recipient was called to — the same
 * class of bug the review-prompt rule was written to avoid.
 */
describe('resolveNotificationRoute — messages', () => {
  it('opens the thread a message belongs to', () => {
    expect(
      resolveNotificationRoute({ type: 'message', conversationId: 'c-1', postId: 7 })
    ).toEqual({ screen: 'MessageThread', params: { id: 'c-1' } });
  });

  it('does not swallow a listing push that has no conversation', () => {
    const route = resolveNotificationRoute({ postId: 7, post_type: 'machineryrent' });
    expect(route.screen).toBe('PostDetailScreen');
  });

  // A malformed payload must fall through to the listing rather than navigating
  // to a thread that does not exist.
  it('ignores a message payload with no conversation id', () => {
    const route = resolveNotificationRoute({ type: 'message', postId: 7 });
    expect(route?.screen).not.toBe('MessageThread');
  });

  it('still puts the review prompt ahead of everything else', () => {
    const route = resolveNotificationRoute({
      type: 'review_prompt', postId: 7, bookingId: 3, providerId: 'p-1',
    });
    expect(route.screen).toBe('PostDetailScreen');
    expect(route.params.openReview).toBe(true);
  });
});
