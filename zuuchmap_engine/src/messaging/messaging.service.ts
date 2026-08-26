import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { Post } from '../post/entities/post.entity';
import { User } from '../user/entities/user.entity';
import { EventsGateway } from '../events/events.gateway';
import { PostNotificationService } from '../post/post-notification.service';

const PREVIEW_LENGTH = 200;
const PAGE_SIZE = 30;

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    @InjectRepository(Conversation)
    private readonly conversations: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messages: Repository<Message>,
    @InjectRepository(Post)
    private readonly posts: Repository<Post>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly events: EventsGateway,
    private readonly notifications: PostNotificationService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Open the thread for (post, customer), or hand back the existing one.
   *
   * Idempotent by design: the client's "Message provider" button is a tap that
   * can be double-fired, and two threads about one listing would split the
   * conversation in half with no way to merge them.
   */
  async open(customerId: string, postId: number, body?: string) {
    const post = await this.posts.findOne({
      where: { id: postId },
      relations: ['user'],
    });
    if (!post) throw new NotFoundException('Post not found');
    if (!post.user) throw new BadRequestException('POST_HAS_NO_OWNER');
    if (post.user.id === customerId)
      throw new BadRequestException('CANNOT_MESSAGE_SELF');

    // Same rule the booking gate uses: a listing nobody can see is a listing
    // nobody should be able to open a thread against.
    if (post.approval_status !== 'APPROVED') {
      throw new BadRequestException('POST_NOT_AVAILABLE');
    }

    let conversation = await this.conversations.findOne({
      where: { post: { id: postId }, customer: { id: customerId } },
      relations: ['post', 'customer', 'provider'],
    });

    if (!conversation) {
      const customer = await this.users.findOne({ where: { id: customerId } });
      if (!customer) throw new NotFoundException('User not found');
      conversation = await this.conversations.save(
        this.conversations.create({ post, customer, provider: post.user }),
      );
    }

    if (body?.trim()) await this.send(customerId, conversation.id, body);

    return this.detail(conversation.id, customerId);
  }

  /** The inbox. One row per thread, newest activity first. */
  async list(userId: string) {
    const rows = await this.conversations.find({
      where: [{ customer: { id: userId } }, { provider: { id: userId } }],
      relations: ['post', 'customer', 'provider'],
      order: { last_message_at: 'DESC', date_created: 'DESC' },
      take: 100,
    });
    return rows.map((c) => this.shape(c, userId));
  }

  async unreadCount(userId: string): Promise<{ unread: number }> {
    const rows = await this.conversations.find({
      where: [{ customer: { id: userId } }, { provider: { id: userId } }],
      select: { id: true, customer_unread: true, provider_unread: true },
      relations: ['customer', 'provider'],
    });
    const unread = rows.reduce(
      (sum, c) =>
        sum +
        (c.customer.id === userId ? c.customer_unread : c.provider_unread),
      0,
    );
    return { unread };
  }

  async detail(conversationId: string, userId: string) {
    const conversation = await this.mustParticipate(conversationId, userId);
    return this.shape(conversation, userId);
  }

  /**
   * Messages, newest-first and cursor-paginated on `date_created`.
   *
   * An offset would drift under the thread: every new message shifts the whole
   * page boundary, so scrolling back while the other side is typing skips or
   * repeats rows.
   */
  async history(conversationId: string, userId: string, before?: string) {
    await this.mustParticipate(conversationId, userId);
    const cutoff = before ? new Date(before) : null;
    const rows = await this.messages.find({
      where: {
        conversation: { id: conversationId },
        ...(cutoff && !Number.isNaN(cutoff.getTime())
          ? { date_created: LessThan(cutoff) }
          : {}),
      },
      relations: ['sender'],
      order: { date_created: 'DESC' },
      take: PAGE_SIZE,
    });
    return rows
      .map((m) => ({
        id: m.id,
        body: m.body,
        sender_id: m.sender?.id ?? null,
        mine: m.sender?.id === userId,
        read_at: m.read_at,
        date_created: m.date_created,
      }))
      .reverse();
  }

  /**
   * Append a message.
   *
   * The insert and the thread's denormalised counters move together in one
   * transaction — a message that exists without bumping the recipient's unread
   * count is a message they are never told about.
   */
  async send(senderId: string, conversationId: string, body: string) {
    const conversation = await this.mustParticipate(conversationId, senderId);
    const text = body.trim();
    if (!text) throw new BadRequestException('EMPTY_MESSAGE');

    const isCustomer = conversation.customer.id === senderId;
    const recipientId = isCustomer
      ? conversation.provider.id
      : conversation.customer.id;

    const saved = await this.dataSource.transaction(async (em) => {
      const sender = await em.findOne(User, { where: { id: senderId } });
      const message = await em.save(
        em.create(Message, { conversation, sender, body: text }),
      );
      await em.update(
        Conversation,
        { id: conversationId },
        {
          last_message_at: message.date_created,
          last_message_preview: text.slice(0, PREVIEW_LENGTH),
          // Only the recipient's side moves. Incrementing in SQL rather than
          // reading-then-writing keeps two simultaneous sends from losing one.
          ...((isCustomer
            ? { provider_unread: () => '"provider_unread" + 1' }
            : { customer_unread: () => '"customer_unread" + 1' }) as any),
        },
      );
      return message;
    });

    this.events.emitMessage(recipientId, {
      conversationId,
      messageId: saved.id,
      postId: conversation.post?.id ?? null,
      senderId,
      preview: text.slice(0, PREVIEW_LENGTH),
    });

    // Push as well as socket: the recipient is usually not looking at the app,
    // which is the entire reason a message needs delivering at all.
    const senderName = isCustomer
      ? [conversation.customer.given_name].filter(Boolean).join(' ')
      : [conversation.provider.given_name].filter(Boolean).join(' ');
    void this.notifications
      .notifyUsers(
        [recipientId],
        senderName || 'Шинэ мессеж',
        text.slice(0, 120),
        {
          type: 'message',
          conversationId,
          postId: conversation.post?.id ?? null,
        },
      )
      .catch((err) => this.logger.warn(`Message push failed: ${err?.message}`));

    return {
      id: saved.id,
      body: saved.body,
      sender_id: senderId,
      mine: true,
      read_at: null,
      date_created: saved.date_created,
    };
  }

  /** Mark the caller's side read. Idempotent — the client calls it on every open. */
  async markRead(conversationId: string, userId: string) {
    const conversation = await this.mustParticipate(conversationId, userId);
    const isCustomer = conversation.customer.id === userId;

    await this.dataSource.transaction(async (em) => {
      await em.update(
        Conversation,
        { id: conversationId },
        isCustomer ? { customer_unread: 0 } : { provider_unread: 0 },
      );
      // Read receipts are per-message so the *sender* can see them; the
      // counter alone only serves the reader's own badge.
      await em
        .createQueryBuilder()
        .update(Message)
        .set({ read_at: new Date() })
        .where('"conversationId" = :id', { id: conversationId })
        .andWhere('read_at IS NULL')
        .andWhere('("senderId" IS NULL OR "senderId" != :userId)', { userId })
        .execute();
    });

    return { ok: true };
  }

  private async mustParticipate(
    conversationId: string,
    userId: string,
  ): Promise<Conversation> {
    const conversation = await this.conversations.findOne({
      where: { id: conversationId },
      relations: ['post', 'customer', 'provider'],
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (
      conversation.customer.id !== userId &&
      conversation.provider.id !== userId
    ) {
      // Not a 404: the id is a uuid the caller had to be given, and a 403 is
      // the honest answer. Nothing about the thread is disclosed either way.
      throw new ForbiddenException('NOT_A_PARTICIPANT');
    }
    return conversation;
  }

  private shape(c: Conversation, userId: string) {
    const isCustomer = c.customer.id === userId;
    const other = isCustomer ? c.provider : c.customer;
    return {
      id: c.id,
      post: c.post
        ? {
            id: c.post.id,
            title: (c.post as any).title,
            images: (c.post as any).images ?? null,
          }
        : null,
      other_party: other
        ? {
            id: other.id,
            given_name: other.given_name,
            profile_picture: other.profile_picture,
          }
        : null,
      role: isCustomer ? 'CUSTOMER' : 'PROVIDER',
      unread: isCustomer ? c.customer_unread : c.provider_unread,
      last_message_at: c.last_message_at,
      last_message_preview: c.last_message_preview,
      date_created: c.date_created,
    };
  }
}
