import { ForbiddenException } from '@nestjs/common';
import { MessagingService } from './messaging.service';

/**
 * A thread is the only place two strangers exchange anything on the platform,
 * so the questions worth pinning down are: who may read it, does the recipient
 * find out, and does the unread badge tell the truth.
 */
describe('MessagingService', () => {
  const conversation = {
    id: 'conv-1',
    post: { id: 7, title: 'Экскаватор' },
    customer: { id: 'cust-1', given_name: 'Бат' },
    provider: { id: 'prov-1', given_name: 'Дорж' },
    customer_unread: 0,
    provider_unread: 2,
    last_message_at: null,
    last_message_preview: null,
    date_created: new Date(),
  };

  const makeService = (
    overrides: { conversation?: any; conversations?: any[] } = {},
  ) => {
    const conv =
      overrides.conversation === undefined
        ? conversation
        : overrides.conversation;
    const conversations: any = {
      findOne: jest.fn(async () => conv),
      find: jest.fn(async () => overrides.conversations ?? [conversation]),
      save: jest.fn(async (row: any) => ({ ...row, id: 'conv-new' })),
      create: jest.fn((row: any) => row),
    };
    const messages: any = { find: jest.fn(async () => []) };
    const posts: any = {
      findOne: jest.fn(async () => ({
        id: 7,
        approval_status: 'APPROVED',
        user: { id: 'prov-1' },
      })),
    };
    const users: any = {
      findOne: jest.fn(async (o: any) => ({ id: o.where.id })),
    };
    const events: any = { emitMessage: jest.fn() };
    const notifications: any = { notifyUsers: jest.fn(async () => undefined) };
    const dataSource: any = {
      transaction: jest.fn(async (cb: any) =>
        cb({
          findOne: jest.fn(async () => ({ id: 'cust-1' })),
          create: jest.fn((_: any, row: any) => ({
            ...row,
            id: 'msg-1',
            date_created: new Date(),
          })),
          save: jest.fn(async (row: any) => row),
          update: jest.fn(async () => ({ affected: 1 })),
          createQueryBuilder: jest.fn(() => {
            const qb: any = {
              update: () => qb,
              set: () => qb,
              where: () => qb,
              andWhere: () => qb,
              execute: async () => ({ affected: 1 }),
            };
            return qb;
          }),
        }),
      ),
    };
    const svc = new MessagingService(
      conversations,
      messages,
      posts,
      users,
      events,
      notifications,
      dataSource,
    );
    return { svc, conversations, events, notifications, posts };
  };

  it('refuses a caller who is in neither seat', async () => {
    const { svc } = makeService();
    await expect(svc.detail('conv-1', 'stranger')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lets both participants read the thread', async () => {
    const { svc } = makeService();
    await expect(svc.detail('conv-1', 'cust-1')).resolves.toMatchObject({
      role: 'CUSTOMER',
    });
    await expect(svc.detail('conv-1', 'prov-1')).resolves.toMatchObject({
      role: 'PROVIDER',
    });
  });

  // The badge is read from the caller's own side; showing the other party's
  // count would leave a provider staring at an unread marker they cannot clear.
  it('reports each side its own unread count', async () => {
    const { svc } = makeService();
    await expect(svc.unreadCount('prov-1')).resolves.toEqual({ unread: 2 });
    await expect(svc.unreadCount('cust-1')).resolves.toEqual({ unread: 0 });
  });

  it('tells the recipient — never the sender — that a message arrived', async () => {
    const { svc, events, notifications } = makeService();

    await svc.send('cust-1', 'conv-1', '  Сайн байна уу  ');

    expect(events.emitMessage).toHaveBeenCalledWith(
      'prov-1',
      expect.objectContaining({
        conversationId: 'conv-1',
        senderId: 'cust-1',
      }),
    );
    expect(notifications.notifyUsers).toHaveBeenCalledWith(
      ['prov-1'],
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ type: 'message' }),
    );
  });

  it('trims the body before it is stored or previewed', async () => {
    const { svc } = makeService();
    const result = await svc.send('cust-1', 'conv-1', '  Сайн байна уу  ');
    expect(result.body).toBe('Сайн байна уу');
  });

  it('rejects a message that is only whitespace', async () => {
    const { svc } = makeService();
    await expect(svc.send('cust-1', 'conv-1', '   ')).rejects.toThrow();
  });

  it('will not open a thread against your own listing', async () => {
    const { svc } = makeService();
    await expect(svc.open('prov-1', 7)).rejects.toThrow('CANNOT_MESSAGE_SELF');
  });

  // Same rule the booking gate uses: a listing nobody can see is a listing
  // nobody should be able to start a conversation about.
  it('will not open a thread against a listing that is not live', async () => {
    const { svc, posts } = makeService();
    posts.findOne.mockResolvedValue({
      id: 7,
      approval_status: 'PENDING',
      user: { id: 'prov-1' },
    });
    await expect(svc.open('cust-1', 7)).rejects.toThrow('POST_NOT_AVAILABLE');
  });

  it('reuses the existing thread instead of opening a second one', async () => {
    const { svc, conversations } = makeService();
    await svc.open('cust-1', 7);
    expect(conversations.save).not.toHaveBeenCalled();
  });
});
