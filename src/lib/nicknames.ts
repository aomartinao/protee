/**
 * Easter egg: Personalized nicknames for friends
 * When a user signs up with one of these emails, the app will use their nickname
 */

const NICKNAME_MAP: Record<string, string> = {
  'sima@vostry.cz': 'Arnie',
  'simon@salted.cx': 'Arnie',
  'kveta@salted.cx': 'Xena',
  'kveta.vostra@gmail.com': 'Xena',
  'caty@catyhartung.com': 'Catushka',
  'martin.holecko@gmail.com': 'Marcho',
};

/**
 * Get personalized nickname for a user based on their email
 * Returns undefined if no nickname is configured
 */
export function getNickname(email: string | undefined | null): string | undefined {
  if (!email) return undefined;
  return NICKNAME_MAP[email.toLowerCase()];
}

/**
 * Check if user has a personalized nickname
 */
export function hasNickname(email: string | undefined | null): boolean {
  return getNickname(email) !== undefined;
}
