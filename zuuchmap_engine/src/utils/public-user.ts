/**
 * Public projections for entities that carry credentials or device secrets.
 *
 * Never serialize a raw User to a client response: `biometric`, `device_info`
 * and `push_token` must stay server-side. Contact fields (phone/email/name)
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

/** Company is business-public; only its `users` relation needs projecting. */
export function publicCompany(company: any): any {
  if (!company) return company ?? null;
  const { users, ...rest } = company;
  return users === undefined ? rest : { ...rest, users: users.map(publicUser) };
}
