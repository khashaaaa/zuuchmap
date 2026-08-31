import { NotFoundException } from '@nestjs/common';
import { SeoService, jsonForScript } from './seo.service';

/** A query builder that answers with whatever the test hands it. */
const qb = (result: { getOne?: any; getMany?: any[]; getCount?: number }) => {
  const b: any = {};
  for (const m of ['select', 'where', 'andWhere', 'orderBy', 'take', 'skip'])
    b[m] = jest.fn().mockReturnValue(b);
  b.getOne = jest.fn().mockResolvedValue(result.getOne ?? null);
  b.getMany = jest.fn().mockResolvedValue(result.getMany ?? []);
  b.getCount = jest.fn().mockResolvedValue(result.getCount ?? 0);
  return b;
};

const service = (result: Parameters<typeof qb>[0]) => {
  const builder = qb(result);
  const posts = { createQueryBuilder: jest.fn().mockReturnValue(builder) };
  const categories = { getCategories: jest.fn().mockResolvedValue([]) };
  return { svc: new SeoService(posts as any, categories as any), builder };
};

describe('jsonForScript', () => {
  it('cannot close the surrounding <script>', () => {
    const out = jsonForScript({ d: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('</script>');
    expect(JSON.parse(out)).toEqual({
      d: '</script><script>alert(1)</script>',
    });
  });
});

describe('SeoService', () => {
  it('only publishes live listings — approved, not expired, inside the window', async () => {
    const { svc, builder } = service({ getMany: [], getCount: 0 });
    await svc.sitemapIndex();
    await svc.postSitemap(1);
    const clauses = [
      ...builder.where.mock.calls,
      ...builder.andWhere.mock.calls,
    ].map((c) => String(c[0]));
    for (const clause of clauses) {
      expect(clause).toContain("approval_status = 'APPROVED'");
      expect(clause).toContain('expires_at');
      expect(clause).toContain('status != :expired');
    }
    expect(clauses.length).toBe(2);
  });

  it('404s an expired or unapproved listing instead of rendering a card', async () => {
    const { svc } = service({ getOne: null });
    await expect(svc.postMetaHtml(7)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('escapes user text in every place it lands', async () => {
    const { svc } = service({
      getOne: {
        id: 7,
        title: 'Кран "20т" <b>',
        details: '</script><script>alert(1)</script> & more',
        images: ['https://cdn/x.jpg'],
        price_amount: 150000,
      },
    });
    const html = await svc.postMetaHtml(7);
    expect(html).not.toMatch(/<\/script><script>alert/);
    expect(html).toContain('&quot;20т&quot; &lt;b&gt;');
    expect(html).toContain('"priceCurrency":"MNT"');
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).toMatch(/content="2; url=https:\/\/zuuchmap\.com\/posts\/7"/);
    // Exactly the one ld+json script and nothing that could run.
    expect(html.match(/<script/g)).toHaveLength(1);
  });
});
