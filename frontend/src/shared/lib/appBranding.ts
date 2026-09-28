/** Product branding — override via Vite env (repo root `.env`). */

import { isCivilCoreDemo } from './civilcoreDemo';

export const DEFAULT_APP_NAME = 'CivilCore';

/** PWD Delhi Works Estimating face (Planning + Engineer — not citizen Sewa). */
export const PWD_DELHI_APP_NAME = 'PWD Delhi — Works Estimating';
export const PWD_DELHI_APP_NAME_HI = 'लोक निर्माण विभाग — लागत अनुमान';
export const PWD_DELHI_SHORT_NAME = 'PWD Delhi';
export const PWD_DELHI_TAGLINE =
  'Planning & Engineer works cost calculator · NCT of Delhi';

const UPSTREAM_GITHUB = 'https://github.com/datadrivenconstruction/OpenConstructionERP';
const DEFAULT_GITHUB =
  'https://github.com/santosh-k/IBSConstructionERP';

function envString(key: keyof ImportMetaEnv): string | undefined {
  const raw = import.meta.env[key];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Display name for browser title, sidebar, login, reports. */
export function getAppDisplayName(): string {
  const fromEnv = envString('VITE_APP_NAME');
  if (fromEnv) return fromEnv;
  if (isCivilCoreDemo()) return PWD_DELHI_APP_NAME;
  return DEFAULT_APP_NAME;
}

/** Short label for meta tags / compact chrome. */
export function getAppShortName(): string {
  const fromEnv = envString('VITE_APP_SHORT_NAME');
  if (fromEnv) return fromEnv;
  if (isCivilCoreDemo()) return PWD_DELHI_SHORT_NAME;
  return 'CivilCore';
}

export function getAppTagline(): string {
  const fromEnv = envString('VITE_APP_TAGLINE');
  if (fromEnv) return fromEnv;
  if (isCivilCoreDemo()) return PWD_DELHI_TAGLINE;
  return 'Construction cost estimation & project control';
}

/** Hindi product line for login / shell (empty when not PWD demo). */
export function getAppDisplayNameHi(): string {
  if (isCivilCoreDemo() || envString('VITE_APP_NAME')?.includes('PWD')) {
    return envString('VITE_APP_NAME_HI') ?? PWD_DELHI_APP_NAME_HI;
  }
  return '';
}

/** Public marketing site (optional). Falls back to GitHub repo when unset. */
export function getProductWebsiteUrl(): string {
  return envString('VITE_APP_WEBSITE') ?? getGithubRepoUrl();
}

export function getGithubRepoUrl(): string {
  return envString('VITE_APP_GITHUB') ?? DEFAULT_GITHUB;
}

export function getUpstreamGithubUrl(): string {
  return envString('VITE_APP_UPSTREAM_GITHUB') ?? UPSTREAM_GITHUB;
}

/** Hidden integrity / attribution line (AGPL upstream). */
export function getBuildAttributionLine(): string {
  const name = getAppShortName();
  return `DataDrivenConstruction·CWICR·${name}·2026`;
}

export type BrandWordmarkOptions = {
  /** Legacy OpenConstructionERP-style grey "ERP" suffix when name is OCE. */
  showLegacyErpSuffix?: boolean;
};

/** Plain-text wordmark (use {@link BrandWordmark} in UI for styled markup). */
export function getBrandWordmarkText(options?: BrandWordmarkOptions): string {
  const name = getAppDisplayName();
  if (name === 'OpenConstructionERP' && options?.showLegacyErpSuffix !== false) {
    return name;
  }
  return name;
}
