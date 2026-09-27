/// <reference types="vite/client" />

/** App version injected by Vite from package.json at build time. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_CIVILCORE_DEMO?: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_APP_SHORT_NAME?: string;
  readonly VITE_APP_TAGLINE?: string;
  readonly VITE_APP_WEBSITE?: string;
  readonly VITE_APP_GITHUB?: string;
  readonly VITE_APP_UPSTREAM_GITHUB?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
