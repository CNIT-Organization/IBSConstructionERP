/** Product branding — override via Vite env (repo root `.env`). */

export const DEFAULT_APP_NAME = 'CivilCore';

const UPSTREAM_GITHUB = 'https://github.com/datadrivenconstruction/OpenConstructionERP';
const DEFAULT_GITHUB =
  'https://github.com/CNIT-Organization/IBSConstructionERP';

function envString(key: keyof ImportMetaEnv): string | undefined {
  const raw = import.meta.env[key];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Display name for browser title, sidebar, login, reports. */
export function getAppDisplayName(): string {
  return envString('VITE_APP_NAME') ?? DEFAULT_APP_NAME;
}

/** Short label for meta tags (e.g. application-name). */
export function getAppShortName(): string {
  return envString('VITE_APP_SHORT_NAME') ?? 'CivilCore';
}

export function getAppTagline(): string {
  return (
    envString('VITE_APP_TAGLINE') ??
    'Construction cost estimation & project control'
  );
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
  const name = getAppDisplayName();
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
