import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Company, CompanyWriteRequest, PublicCompany } from '@zuuchmap/core';
import type { RequestUser } from '../auth/request-user';

export interface CompanyRow {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  logo: string | null;
  website: string | null;
  address: string | null;
  phone_number: string | null;
  email: string | null;
  registration_number: string | null;
  tax_id: string | null;
  service_area: string[];
  is_verified: boolean;
  date_created: Date;
  date_updated: Date;
}

/** The public face: no registration or tax number. */
export const toPublicCompany = (c: CompanyRow): PublicCompany => ({
  id: c.id,
  name: c.name,
  description: c.description,
  logo: c.logo,
  website: c.website,
  address: c.address,
  phone_number: c.phone_number,
  email: c.email,
  service_area: c.service_area,
  is_verified: c.is_verified,
  date_created: c.date_created.toISOString(),
  date_updated: c.date_updated.toISOString(),
});

const toCompany = (c: CompanyRow): Company => ({ ...toPublicCompany(c), registration_number: c.registration_number, tax_id: c.tax_id });

/** Fields whose change sends the company back to an admin: verification vouches for exactly these. */
const VERIFIED_FIELDS = ['name', 'registration_number', 'tax_id'] as const;
const WRITABLE = ['name', 'description', 'website', 'address', 'phone_number', 'email', 'registration_number', 'tax_id'] as const;

const blank = (v: string | null | undefined): string | null => (v === undefined || v === null || v.trim() === '' ? null : v.trim());

/**
 * One company per account. Providers create it (customers have nothing to brand); verification
 * is an admin's (phase 9) and is dropped when the name, registration or tax number changes.
 */
@Injectable()
export class CompanyService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async mine(me: RequestUser): Promise<Company | null> {
    const rows = await this.ds.query<CompanyRow[]>('SELECT * FROM companies WHERE owner_id = $1', [me.id]);
    return rows.length ? toCompany(rows[0]) : null;
  }

  async create(me: RequestUser, dto: CompanyWriteRequest): Promise<Company> {
    if (me.type !== 'PROVIDER' && !me.is_admin) throw new ForbiddenException({ message: 'Providers only', code: 'PROVIDER_ONLY' });
    const values = WRITABLE.map((k) => (k === 'name' ? (dto.name ?? '').trim() : blank(dto[k])));
    const rows = await this.ds.query<CompanyRow[]>(
      `INSERT INTO companies (owner_id, ${WRITABLE.join(', ')}, service_area)
       VALUES ($1, ${WRITABLE.map((_, i) => `$${String(i + 2)}`).join(', ')}, $${String(WRITABLE.length + 2)}::jsonb)
       ON CONFLICT (owner_id) DO NOTHING RETURNING *`,
      [me.id, ...values, JSON.stringify([...new Set(dto.service_area ?? [])])],
    );
    if (!rows.length) throw new ConflictException({ message: 'This account already has a company', code: 'COMPANY_EXISTS' });
    return toCompany(rows[0]);
  }

  async update(me: RequestUser, dto: CompanyWriteRequest): Promise<Company> {
    const current = await this.ds.query<CompanyRow[]>('SELECT * FROM companies WHERE owner_id = $1', [me.id]);
    const c = current.at(0);
    if (!c) throw new NotFoundException({ message: 'No company yet' });
    const sets: string[] = [];
    const params: unknown[] = [c.id];
    for (const k of WRITABLE) {
      if (dto[k] === undefined) continue;
      params.push(k === 'name' ? (dto.name ?? '').trim() : blank(dto[k]));
      sets.push(`${k} = $${String(params.length)}`);
    }
    if (dto.service_area !== undefined) {
      params.push(JSON.stringify([...new Set(dto.service_area)]));
      sets.push(`service_area = $${String(params.length)}::jsonb`);
    }
    const changesVerified = VERIFIED_FIELDS.some((k) => dto[k] !== undefined && (k === 'name' ? (dto.name ?? '').trim() : blank(dto[k])) !== c[k]);
    if (changesVerified) sets.push('is_verified = false', 'verified_at = NULL');
    if (!sets.length) return toCompany(c);
    const rows = await this.ds.query<[CompanyRow[], number]>(
      `UPDATE companies SET ${sets.join(', ')}, date_updated = now() WHERE id = $1 RETURNING *`,
      params,
    );
    return toCompany(rows[0][0]);
  }

  /** Providers with a verified company: the landing counter. */
  async verifiedCount(): Promise<number> {
    const rows = await this.ds.query<Array<{ n: number }>>('SELECT COUNT(*)::int AS n FROM companies WHERE is_verified');
    return rows[0]?.n ?? 0;
  }
}
