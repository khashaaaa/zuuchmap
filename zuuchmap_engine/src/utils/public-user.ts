/**
 * Public projections for entities that carry credentials or device secrets.
 *
 * Never serialize a raw User to a client response: `push_token` must stay
 * server-side. Contact fields (phone/email/name)
 * stay — providers publish them on their marketplace listings by design.
 */
export function publicUser(user: any): any {
  if (!user) return user ?? null;
  const {
    id, type, phone_number, parent_name, given_name, email,
    profile_picture, is_verified, date_created,
  } = user;
  const out: any = {
    id, type, phone_number, parent_name, given_name, email,
    profile_picture, is_verified, date_created,
  };
  if (user.company !== undefined) out.company = publicCompany(user.company);
  return out;
}

/**
 * Derived display fields for profile responses. Was copy-pasted (with drifting
 * field lists) across UserController and UserAdminController.
 */
export function profileSummary(user: any): {
  fullName: string | null;
  hasCompany: boolean;
  isProfileComplete: boolean;
  profileCompleteness: number;
} {
  const fields = [
    user.parent_name, user.given_name, user.email,
    user.address, user.type, user.profile_picture,
  ];
  const completed = fields.filter(f => f !== null && f !== undefined && f !== '').length;
  return {
    fullName: user.parent_name && user.given_name
      ? `${user.parent_name} ${user.given_name}`
      : user.given_name || user.parent_name || null,
    hasCompany: !!user.company,
    isProfileComplete: !!(user.parent_name && user.given_name && user.type),
    profileCompleteness: Math.round((completed / fields.length) * 100),
  };
}

/**
 * Fields an admin checks against the state register before granting
 * `Company.is_verified`. `UpdateCompanyDto` calls the registration number "a
 * short opaque token, not free text" — they identify the business to the
 * registry, and nothing renders them outside the owner's own company form and
 * the admin user detail page.
 */
const COMPANY_PRIVATE_FIELDS = ['registration_number', 'tax_id'] as const;

/**
 * Most of a company is business-public — name, logo, website, address, contact.
 * Its credentials are not, and this used to strip only the `users` relation, so
 * `publicUser` carried a provider's tax ID and registration number out through
 * every public listing response (`GET /posts`, `/posts/:id`, `/posts/map`) and
 * through the unauthenticated `GET /company/:id`.
 *
 * `includePrivate` is opt-in, for the two callers entitled to them: the owner
 * managing their own company, and an admin.
 */
export function publicCompany(company: any, { includePrivate = false } = {}): any {
  if (!company) return company ?? null;
  const { users, ...rest } = company;
  if (!includePrivate) {
    for (const field of COMPANY_PRIVATE_FIELDS) delete rest[field];
  }
  return users === undefined ? rest : { ...rest, users: users.map(publicUser) };
}
