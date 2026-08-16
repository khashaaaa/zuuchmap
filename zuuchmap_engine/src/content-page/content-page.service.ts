import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContentPage, ContentPageType } from './entities/content-page.entity';
import { CreateContentPageDto, UpdateContentPageDto } from './dto/content-page.dto';

@Injectable()
export class ContentPageService {
  constructor(
    @InjectRepository(ContentPage)
    private readonly repo: Repository<ContentPage>,
  ) {}

  create(type: ContentPageType, dto: CreateContentPageDto): Promise<ContentPage> {
    const page = this.repo.create({ type, content: dto.content });
    return this.repo.save(page);
  }

  findAll(type: ContentPageType): Promise<ContentPage[]> {
    return this.repo.find({ where: { type }, order: { id: 'ASC' } });
  }

  async findLatest(type: ContentPageType): Promise<ContentPage | null> {
    const all = await this.findAll(type);
    return all[all.length - 1] ?? null;
  }

  async findOne(id: number, type: ContentPageType): Promise<ContentPage> {
    const page = await this.repo.findOneBy({ id, type });
    if (!page) throw new NotFoundException(`Content page #${id} not found`);
    return page;
  }

  async update(id: number, type: ContentPageType, dto: UpdateContentPageDto): Promise<ContentPage> {
    const page = await this.findOne(id, type);
    Object.assign(page, dto);
    return this.repo.save(page);
  }

  async remove(id: number, type: ContentPageType): Promise<void> {
    const result = await this.repo.delete({ id, type });
    if (result.affected === 0) throw new NotFoundException(`Content page #${id} not found`);
  }

  escape(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  buildSectionsHtml(type: ContentPageType, content: any): string {
    const e = (s: string) => this.escape(s ?? '');

    if (type === 'ACCOUNT_DELETION') {
      const steps: string[] = content.steps || [];
      return steps.length
        ? `<ol>${steps.map(s => `<li>${e(s)}</li>`).join('')}</ol>`
        : '<p style="color:#aaa;">Steps coming soon.</p>';
    }

    const sections: { heading: string; body: string }[] = content.sections || [];
    return sections.length
      ? sections.map(s => `
        <section>
          <h2>${e(s.heading)}</h2>
          <p>${e(s.body).replace(/\n/g, '<br>')}</p>
        </section>`).join('')
      : '<p style="color:#aaa;">Content coming soon.</p>';
  }

  buildPageHtml(type: ContentPageType, page: ContentPage | null): string {
    const c = page?.content || {};
    const e = (s: string) => this.escape(s ?? '');
    const title = e(c.title || (type === 'ACCOUNT_DELETION' ? 'Account Deletion' : type === 'TERMS' ? 'Terms of Service' : 'Privacy Policy'));
    const lastUpdated = c.last_updated || '';
    const contactEmail = c.contact_email || '';
    const bodyHtml = this.buildSectionsHtml(type, c);

    const isAccountDeletion = type === 'ACCOUNT_DELETION';
    const description = isAccountDeletion && c.description
      ? `<div class="description">${e(c.description).replace(/\n/g, '<br>')}</div>`
      : '';
    const note = isAccountDeletion && c.note
      ? `<div class="note">${e(c.note).replace(/\n/g, '<br>')}</div>`
      : '';
    const stepsTitle = isAccountDeletion
      ? '<div class="steps-card"><h2>Бүртгэл устгах алхамууд</h2>' + bodyHtml + '</div>'
      : bodyHtml;

    return `<!DOCTYPE html>
<html lang="mn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #1a1208; color: #f0e8d8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.7; padding: 24px 16px 48px; }
    .container { max-width: 720px; margin: 0 auto; }
    header { margin-bottom: 32px; padding-bottom: 20px; border-bottom: 1px solid #3a2d1a; }
    header h1 { font-size: 28px; font-weight: 700; color: #FFA726; margin-bottom: 6px; }
    .meta { font-size: 13px; color: #8a7a60; }
    section, .steps-card, .description { background: #292018; border-radius: 10px; padding: 20px 24px; margin-bottom: 24px; }
    section h2, .steps-card h2 { font-size: 16px; font-weight: 600; color: #FFA726; margin-bottom: 10px; }
    section p, .description { font-size: 14px; color: #d0c4aa; }
    ol { padding-left: 20px; }
    ol li { font-size: 14px; color: #d0c4aa; margin-bottom: 8px; }
    .note { background: #2a1f0a; border-left: 3px solid #FFA726; border-radius: 6px; padding: 14px 18px; font-size: 13px; color: #c0a878; margin-bottom: 24px; }
    footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #3a2d1a; font-size: 13px; color: #8a7a60; }
    footer a { color: #FFA726; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${title}</h1>
      ${lastUpdated ? `<p class="meta">Last updated: ${e(lastUpdated)}</p>` : ''}
    </header>
    ${description}
    ${stepsTitle}
    ${note}
    ${contactEmail ? `<footer>Contact us: <a href="mailto:${e(contactEmail)}">${e(contactEmail)}</a></footer>` : ''}
  </div>
</body>
</html>`;
  }
}
