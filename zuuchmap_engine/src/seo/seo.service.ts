import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '../post/entities/post.entity';
import { Status } from '../enums/status';
import { CategoryService } from '../post/category.service';

/** Sitemaps are capped at 50k URLs / 50MB by the protocol; 5k keeps each one small. */
const PAGE_SIZE = 5000;

// One escaper for both the sitemap XML and the OG HTML: the five entities
// are valid in either, and text never lands anywhere an unescaped `'` is safe.
const escape = (s: string) =>
  s.replace(
    /[<>&'"]/g,
    (c) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        "'": '&#39;',
        '"': '&quot;',
      })[c] as string,
  );

// Inside <script>, JSON.stringify is not enough: it leaves `<` alone, so a
// details field containing `</script>` closes the element and the rest runs on
// the site origin. `\u003c` is still valid JSON and still parses as `<`.
export const jsonForScript = (v: unknown) =>
  JSON.stringify(v).replace(/</g, '\\u003c');

/**
 * What counts as a live listing for crawlers — the same rule browse applies
 * (`post.service.ts` applyFilters): approved, not flipped to EXPIRED by the
 * cron, and not past its window either. Without the second half a rental
 * nobody can book sat in the sitemap for weeks.
 */
const LIVE_WHERE = `post.approval_status = 'APPROVED' AND post.status != :expired AND (post.expires_at IS NULL OR post.expires_at > NOW())`;
const LIVE_PARAMS = { expired: Status.EXPIRED };

@Injectable()
export class SeoService {
  private readonly logger = new Logger(SeoService.name);

  constructor(
    @InjectRepository(Post)
    private readonly posts: Repository<Post>,
    private readonly categories: CategoryService,
  ) {}

  private siteUrl(): string {
    return (process.env.PUBLIC_WEB_URL || 'https://zuuchmap.com').replace(
      /\/+$/,
      '',
    );
  }

  /**
   * A sitemap index rather than one file.
   *
   * The hand-written `public/sitemap.xml` listed five URLs — the landing page,
   * browse, and the policy pages — so every one of the thousands of live
   * listings was invisible to search. Listings are the entire long tail of a
   * marketplace, and they change constantly, which is precisely what a
   * generated sitemap is for.
   */
  async sitemapIndex(): Promise<string> {
    const total = await this.posts
      .createQueryBuilder('post')
      .where(LIVE_WHERE, LIVE_PARAMS)
      .getCount();
    const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
    const base = this.siteUrl();

    const entries = [
      `<sitemap><loc>${base}/sitemap-static.xml</loc></sitemap>`,
      ...Array.from(
        { length: pages },
        (_, i) =>
          `<sitemap><loc>${base}/sitemap-posts-${i + 1}.xml</loc></sitemap>`,
      ),
    ];

    return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</sitemapindex>`;
  }

  /** The pages that exist whether or not anyone has posted anything. */
  async staticSitemap(): Promise<string> {
    const base = this.siteUrl();
    const schemas = await this.categories.getCategories().catch(() => []);
    const urls = [
      { loc: `${base}/`, freq: 'daily', priority: '1.0' },
      { loc: `${base}/browse`, freq: 'daily', priority: '0.9' },
      { loc: `${base}/help`, freq: 'monthly', priority: '0.3' },
      { loc: `${base}/terms`, freq: 'yearly', priority: '0.2' },
      { loc: `${base}/privacy`, freq: 'yearly', priority: '0.2' },
      // One landing URL per category. These are the queries people actually
      // type ("суудлын машин түрээс"), and they were unreachable from search.
      ...schemas
        .filter((c: any) => c.is_active !== false)
        .map((c: any) => ({
          loc: `${base}/browse?category=${encodeURIComponent(c.key)}`,
          freq: 'daily',
          priority: '0.7',
        })),
    ];
    return this.urlset(
      urls.map(
        (u) =>
          `<url><loc>${escape(u.loc)}</loc><changefreq>${u.freq}</changefreq><priority>${u.priority}</priority></url>`,
      ),
    );
  }

  /** One page of live listings, oldest id first so page boundaries stay stable. */
  async postSitemap(page: number): Promise<string> {
    const safePage = Math.max(Math.floor(page) || 1, 1);
    const rows = await this.posts
      .createQueryBuilder('post')
      .select(['post.id', 'post.date_updated'])
      .where(LIVE_WHERE, LIVE_PARAMS)
      .orderBy('post.id', 'ASC')
      .take(PAGE_SIZE)
      .skip((safePage - 1) * PAGE_SIZE)
      .getMany();
    const base = this.siteUrl();
    return this.urlset(
      rows.map((p) => {
        const lastmod = p.date_updated
          ? new Date(p.date_updated).toISOString().slice(0, 10)
          : null;
        return `<url><loc>${base}/posts/${p.id}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>weekly</changefreq><priority>0.6</priority></url>`;
      }),
    );
  }

  /**
   * A crawler-facing render of one listing.
   *
   * The web app is a client-rendered SPA with one set of meta tags in
   * `index.html`, so every listing shared to Messenger or Facebook — the way
   * links actually travel in Mongolia — showed the site's generic title, blurb
   * and OG image. Those crawlers do not run JavaScript, so no client-side fix
   * reaches them; the tags have to exist in the HTML that comes back.
   *
   * Humans who land here (a mis-routed request, someone opening the URL) get
   * sent on to the real app, so this is never a page anyone reads. The hand-off
   * is a link plus a *delayed* refresh, not an instant one: nginx used to send
   * Googlebot here too, and Google treats a 0-second meta refresh as a redirect
   * — back to the very URL it was fetching, with the same UA, so the listing
   * reported as a redirect loop and never indexed. Search engines render the
   * SPA themselves and are no longer routed here; the delay is a backstop.
   */
  async postMetaHtml(id: number): Promise<string> {
    const post = await this.posts
      .createQueryBuilder('post')
      .where('post.id = :id', { id })
      .andWhere(LIVE_WHERE, LIVE_PARAMS)
      .getOne();
    if (!post) throw new NotFoundException('Post not found');

    const base = this.siteUrl();
    const url = `${base}/posts/${post.id}`;
    const title = (post.title || 'Зар').slice(0, 90);
    const description = (
      post.details ||
      post.title ||
      'Zuuchmap — Монголын барилгын зах зээл'
    )
      .replace(/\s+/g, ' ')
      .slice(0, 200);
    const image =
      Array.isArray(post.images) && post.images.length
        ? post.images[0]
        : `${base}/og.png`;

    return `<!doctype html>
<html lang="mn">
<head>
<meta charset="utf-8" />
<title>${escape(title)} — ZuuchMap</title>
<meta name="description" content="${escape(description)}" />
<link rel="canonical" href="${escape(url)}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="ZuuchMap" />
<meta property="og:locale" content="mn_MN" />
<meta property="og:url" content="${escape(url)}" />
<meta property="og:title" content="${escape(title)}" />
<meta property="og:description" content="${escape(description)}" />
<meta property="og:image" content="${escape(image)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escape(title)}" />
<meta name="twitter:description" content="${escape(description)}" />
<meta name="twitter:image" content="${escape(image)}" />
<script type="application/ld+json">${jsonForScript({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: title,
      description,
      image,
      url,
      ...(post.price_amount
        ? {
            offers: {
              '@type': 'Offer',
              price: String(post.price_amount),
              priceCurrency: 'MNT',
              availability: 'https://schema.org/InStock',
            },
          }
        : {}),
    })}</script>
<meta name="robots" content="noindex" />
<meta http-equiv="refresh" content="2; url=${escape(url)}" />
</head>
<body><a href="${escape(url)}">${escape(title)}</a></body>
</html>`;
  }

  private urlset(entries: string[]): string {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>`;
  }
}
