import { Controller, Get, Header, Param, ParseIntPipe } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { SeoService } from './seo.service';

/**
 * Crawler-facing routes, proxied under the site's own origin by nginx (see
 * `.claude/skills/deploy/SKILL.md`) — a sitemap on a different host than the
 * pages it lists is ignored, and an OG tag has to come back from the URL that
 * was actually shared.
 *
 * `@SkipThrottle()`: Googlebot crawls in bursts from a small set of addresses,
 * and rate-limiting it is indistinguishable from being down.
 */
@SkipThrottle()
@Controller('seo')
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  sitemapIndex() {
    return this.seo.sitemapIndex();
  }

  @Get('sitemap-static.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  staticSitemap() {
    return this.seo.staticSitemap();
  }

  @Get('sitemap-posts-:page.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  postSitemap(@Param('page', ParseIntPipe) page: number) {
    return this.seo.postSitemap(page);
  }

  @Get('post/:id')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=600')
  postMeta(@Param('id', ParseIntPipe) id: number) {
    return this.seo.postMetaHtml(id);
  }
}
