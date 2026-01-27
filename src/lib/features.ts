// Feature flags for gradual rollout
// Only martin.holecko@gmail.com gets access to experimental features

const BETA_USERS = [
  'martin.holecko@gmail.com',
];

export function isBetaUser(email: string | undefined | null): boolean {
  if (!email) return false;
  return BETA_USERS.includes(email.toLowerCase());
}

export function hasFeature(_feature: 'buddy-v2' | 'proactive-coach', email: string | undefined | null): boolean {
  // All experimental features are gated to beta users for now
  return isBetaUser(email);
}
