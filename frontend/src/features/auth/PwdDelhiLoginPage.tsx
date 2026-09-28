/**
 * GNCTD-style login card for PWD Delhi — Works Estimating.
 * Used when CivilCore / PWD demo mode is active. Keeps demo accounts working.
 */
import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, Globe, ChevronDown, Building2 } from 'lucide-react';
import { Button, Input, CountryFlag } from '@/shared/ui';
import {
  getAppDisplayName,
  getAppDisplayNameHi,
  getAppTagline,
} from '@/shared/lib/appBranding';
import { useAuthStore } from '@/stores/useAuthStore';
import { extractErrorMessageFromBody } from '@/shared/lib/api';
import { SUPPORTED_LANGUAGES } from '@/app/i18n';

const DEMO_PASSWORD = 'DemoPass1234!';

export function PwdDelhiLoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const setTokens = useAuthStore((s) => s.setTokens);

  const nextPath = (() => {
    try {
      const params = new URLSearchParams(location.search);
      const next = params.get('next');
      if (next && next.startsWith('/') && !next.startsWith('//')) return next;
    } catch {
      /* ignore */
    }
    return '/';
  })();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(
    () => localStorage.getItem('oe_remember') === '1',
  );
  const [langOpen, setLangOpen] = useState(false);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  const langRef = useRef<HTMLDivElement>(null);

  const currentLang =
    SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ?? SUPPORTED_LANGUAGES[0]!;

  const appName = getAppDisplayName();
  const appNameHi = getAppDisplayNameHi();
  const tagline = getAppTagline();

  useEffect(() => {
    setEmail('');
    setPassword('');
    setError('');
  }, []);

  useEffect(() => {
    document.title = `${t('auth.login', 'Sign in')} | ${appName}`;
  }, [t, appName]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/v1/users/auth/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const parsed = extractErrorMessageFromBody(data);
        setError(parsed || t('auth.invalid_credentials', 'Invalid email or password'));
        return;
      }
      const data = await res.json();
      setTokens(data.access_token, data.refresh_token, rememberMe, email);
      navigate(nextPath, { replace: true });
    } catch {
      setError(t('auth.connection_error', 'Unable to connect to server. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const demoAccounts = [
    {
      email: 'demo@openestimator.io',
      name: t('auth.demo_role_admin', 'Administrator'),
      role: 'Planning / Admin',
      letter: 'A',
    },
    {
      email: 'estimator@openestimator.io',
      name: 'Estimator',
      role: t('auth.demo_role_estimator', 'Engineer / Estimator'),
      letter: 'E',
    },
    {
      email: 'manager@openestimator.io',
      name: 'Manager',
      role: t('auth.demo_role_manager', 'Manager'),
      letter: 'M',
    },
  ];

  const handleDemoLogin = async (demoEmail: string) => {
    setDemoLoading(demoEmail);
    setError('');
    setEmail('');
    setPassword('');
    try {
      let res = await fetch('/api/v1/users/auth/demo-login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: demoEmail }),
      });

      if (res.status === 404) {
        res = await fetch('/api/v1/users/auth/login/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: demoEmail, password: DEMO_PASSWORD }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          const parsedMsg = extractErrorMessageFromBody(errData) ?? '';
          if (
            parsedMsg.includes('Invalid') ||
            parsedMsg.includes('not found') ||
            res.status === 401
          ) {
            const regRes = await fetch('/api/v1/users/auth/register/', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: demoEmail,
                password: DEMO_PASSWORD,
                full_name: (demoEmail.split('@')[0] ?? 'Demo User')
                  .replace(/[._]/g, ' ')
                  .replace(/\b\w/g, (c) => c.toUpperCase()),
              }),
            });
            if (regRes.ok || regRes.status === 409) {
              res = await fetch('/api/v1/users/auth/login/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: demoEmail, password: DEMO_PASSWORD }),
              });
            }
          }
        }
      }

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const parsed = extractErrorMessageFromBody(data);
        setError(parsed || t('auth.demo_login_failed', 'Demo login failed. Please try again.'));
        return;
      }
      const data = await res.json();
      setTokens(data.access_token, data.refresh_token, false, demoEmail);
      navigate(nextPath, { replace: true });
    } catch {
      setError(t('auth.connection_error', 'Unable to connect to server. Please try again.'));
    } finally {
      setDemoLoading(null);
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-[#F5F7FA] flex flex-col">
      {/* Top navy bar — department chrome */}
      <header className="pwd-navy-bar w-full px-4 py-3 sm:px-8 flex items-center gap-3 shadow-sm">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white/15 ring-1 ring-white/25">
          <Building2 size={22} className="text-white" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm sm:text-base font-semibold tracking-tight truncate">
            {appName}
          </div>
          {appNameHi ? (
            <div className="text-[11px] sm:text-xs text-white/85 truncate font-medium">
              {appNameHi}
            </div>
          ) : null}
        </div>
        <div className="relative shrink-0" ref={langRef}>
          <button
            type="button"
            onClick={() => setLangOpen(!langOpen)}
            className="flex items-center gap-1.5 rounded-md border border-white/25 bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition-colors"
            aria-label="Language"
          >
            <Globe size={14} />
            <CountryFlag code={currentLang.country} size={16} />
            <ChevronDown size={12} className={langOpen ? 'rotate-180' : ''} />
          </button>
          {langOpen && (
            <div className="absolute right-0 mt-2 w-56 max-h-72 overflow-y-auto rounded-md border border-border-light bg-white shadow-lg py-1 z-30">
              {SUPPORTED_LANGUAGES.map((lang) => {
                const isActive = i18n.language === lang.code;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => {
                      i18n.changeLanguage(lang.code);
                      setLangOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-sm ${
                      isActive
                        ? 'bg-[#0B3A6E]/8 text-[#0B3A6E] font-medium'
                        : 'text-content-primary hover:bg-surface-secondary'
                    }`}
                  >
                    <CountryFlag code={lang.country} size={16} />
                    <span className="truncate">{lang.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </header>

      {/* Saffron accent strip */}
      <div className="h-1 w-full pwd-accent-bg" aria-hidden />

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[420px] rounded-lg border border-[#cfd6e0] bg-white shadow-md overflow-hidden">
          <div className="px-6 pt-6 pb-4 border-b border-[#e2e7ef]">
            <h1 className="text-lg font-semibold text-[#0B3A6E]">
              {t('auth.login', 'Sign in')}
            </h1>
            <p className="mt-1 text-sm text-content-secondary leading-snug">{tagline}</p>
            <p className="mt-2 text-[11px] text-content-tertiary">
              Government of NCT of Delhi · Public Works Department (demo)
            </p>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            {error ? (
              <div
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {error}
              </div>
            ) : null}

            <div>
              <label htmlFor="pwd-email" className="block text-sm font-medium text-content-primary mb-1.5">
                {t('auth.email', 'Email')}
              </label>
              <Input
                id="pwd-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="pwd-password" className="block text-sm font-medium text-content-primary mb-1.5">
                {t('auth.password', 'Password')}
              </label>
              <div className="relative">
                <Input
                  id="pwd-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-content-tertiary hover:text-content-primary"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-content-secondary">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => {
                  setRememberMe(e.target.checked);
                  localStorage.setItem('oe_remember', e.target.checked ? '1' : '0');
                }}
                className="rounded border-border"
              />
              {t('auth.remember_me', 'Remember me')}
            </label>

            <Button
              type="submit"
              disabled={loading}
              className="w-full !bg-[#0B3A6E] hover:!bg-[#0d457f] !text-white"
            >
              {loading ? t('auth.signing_in', 'Signing in…') : t('auth.login', 'Sign in')}
            </Button>
          </form>

          <div className="px-6 pb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-[#e2e7ef]" />
              <span className="text-[11px] uppercase tracking-wide text-content-tertiary font-medium">
                {t('auth.demo_accounts', 'Demo accounts')}
              </span>
              <div className="h-px flex-1 bg-[#e2e7ef]" />
            </div>
            <ul className="space-y-2">
              {demoAccounts.map((acct) => (
                <li key={acct.email}>
                  <button
                    type="button"
                    disabled={demoLoading !== null}
                    onClick={() => handleDemoLogin(acct.email)}
                    className="w-full flex items-center gap-3 rounded-md border border-[#e2e7ef] bg-[#F5F7FA] px-3 py-2.5 text-left hover:border-[#0B3A6E]/40 hover:bg-white transition-colors disabled:opacity-60"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0B3A6E] text-white text-xs font-bold">
                      {acct.letter}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-content-primary truncate">
                        {demoLoading === acct.email
                          ? t('auth.signing_in', 'Signing in…')
                          : acct.name}
                      </span>
                      <span className="block text-[11px] text-content-tertiary truncate">
                        {acct.role} · {acct.email}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[10px] text-content-quaternary leading-snug">
              Demo password (legacy fallback): {DEMO_PASSWORD}
            </p>
          </div>
        </div>
      </main>

      <footer className="px-4 py-3 text-center text-[11px] text-content-tertiary border-t border-[#e2e7ef] bg-white">
        Planning wing + Engineer wing · Works cost calculator (not citizen Sewa)
      </footer>
    </div>
  );
}
