/**
 * Single source for the JWT signing secret.
 *
 * Never fall back to a literal: a committed default means anyone reading the
 * repo can forge tokens for any deployment that forgot to set JWT_SECRET.
 * Failing at boot is the correct behaviour.
 */
export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET is missing or shorter than 32 characters. Set it in config/variables/<env>.env before starting the engine.',
    );
  }
  return secret;
}
