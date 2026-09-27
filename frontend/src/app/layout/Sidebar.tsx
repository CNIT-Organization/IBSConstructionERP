import { useState, useCallback, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Logo, LogoWithText } from '@/shared/ui';
import { getAppDisplayName, getGithubRepoUrl } from '@/shared/lib/appBranding';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import {
  LayoutDashboard,
  FolderOpen,
  Table2,
  CalendarDays,
  Database,
  Layers,
  Boxes,
  Box,
  ShieldCheck,
  FileText,
  FileBarChart,
  Package,
  Settings,
  Info,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Ruler,
  Sparkles,
  MessageSquare,
  X,
  FileEdit,
  ShieldAlert,
  ClipboardCheck,
  ClipboardList,
  PenTool,
  PencilRuler,
  ListChecks,
  Camera,
  TableProperties,
  Wallet,
  HardHat,
  Users,
  HelpCircle,
  AlertOctagon,
  FileCheck,
  Mail,
  Send,
  History,
  BrainCircuit,
  SlidersHorizontal,
  Plus,
  Search,
  Pin,
  PinOff,
  Github,
  HardDrive,
  Link2,
  // 18-Modules Wave icons
  Wrench,
  Truck,
  BookOpen,
  Globe,
  FileSignature,
  Briefcase,
  Scale,
  GitBranch,
  Building2,
  ShoppingCart,
  BadgeCheck,
  Shield,
  Leaf,
  BarChart3,
  LineChart,
  type LucideIcon,
} from 'lucide-react';
import { useModuleStore } from '@/stores/useModuleStore';
import { UpdateNotification } from '@/shared/ui/UpdateChecker';
import { useViewModeStore } from '@/stores/useViewModeStore';
import { useRecentStore } from '@/stores/useRecentStore';
import { useGlobalSearchStore } from '@/stores/useGlobalSearchStore';
import { getModuleNavItems } from '@/modules/_registry';
import { APP_VERSION } from '@/shared/lib/version';
import { useSidebarBadges } from '@/shared/hooks/useSidebarBadges';
import { useIsRTL } from '@/shared/hooks/useIsRTL';
import {
  useSidebarCollapseStore,
  SIDEBAR_WIDTH_FULL,
  SIDEBAR_WIDTH_ICON,
} from '@/stores/useSidebarCollapseStore';
import { RequestCustomModuleDialog } from '@/features/modules/RequestCustomModuleDialog';
import { isCivilCoreDemo, isRouteHiddenInCivilCoreDemo } from '@/shared/lib/civilcoreDemo';


interface NavItem {
  labelKey: string;
  to: string;
  icon: LucideIcon;
  badge?: string;
  highlight?: boolean;
  moduleKey?: string;
  advancedOnly?: boolean; // Hidden in simple mode
  tourId?: string; // data-tour attribute for onboarding
}

interface NavGroup {
  id: string;
  labelKey: string;
  descriptionKey?: string;
  items: NavItem[];
  defaultOpen: boolean;
  hideInSimple?: boolean; // Entire group hidden in simple mode
}

// Navigation groups — collapsible sections
const navGroups: NavGroup[] = [
  // ── CORE (always visible) ──────────────────────────────────────────
  {
    id: 'overview',
    labelKey: 'nav.group_overview',
    defaultOpen: true,
    items: [
      { labelKey: 'nav.dashboard', to: '/', icon: LayoutDashboard },
      { labelKey: 'projects.title', to: '/projects', icon: FolderOpen, tourId: 'projects' },
      // Files lives in Overview because it's the unified entry point
      // into a project's documents, photos, BIM and DWG — users land
      // here to pick what to work on, just like the dashboard.
      { labelKey: 'nav.project_files', to: '/files', icon: HardDrive },
    ],
  },
  {
    id: 'estimation',
    labelKey: 'nav.group_estimation',
    descriptionKey: 'nav.group_estimation_desc',
    defaultOpen: true,
    items: [
      { labelKey: 'boq.title', to: '/boq', icon: Table2, tourId: 'boq' },
      { labelKey: 'nav.match_elements', to: '/match-elements', icon: Link2, badge: 'NEW' },
      { labelKey: 'costs.title', to: '/costs', icon: Database, tourId: 'costs' },
      { labelKey: 'nav.assemblies', to: '/assemblies', icon: Layers },
      { labelKey: 'catalog.title', to: '/catalog', icon: Boxes },
      { labelKey: 'nav.quantity_rules', to: '/bim/rules', icon: ClipboardCheck, badge: 'BETA' },
    ],
  },
  {
    id: 'takeoff',
    labelKey: 'nav.group_takeoff',
    defaultOpen: true,
    items: [
      { labelKey: 'nav.pdf_measurements', to: '/takeoff?tab=measurements', icon: Ruler },
      { labelKey: 'nav.dwg_takeoff', to: '/dwg-takeoff', icon: PencilRuler },
      { labelKey: 'nav.cad_bim_explorer', to: '/data-explorer', icon: TableProperties },
      { labelKey: 'nav.bim_viewer', to: '/bim', icon: Box },
      { labelKey: 'nav.bim_rules', to: '/bim/rules?mode=requirements', icon: SlidersHorizontal, badge: 'BETA' },
    ],
  },
  {
    id: 'ai',
    labelKey: 'nav.group_ai_estimation',
    defaultOpen: true,
    hideInSimple: true,
    items: [
      { labelKey: 'nav.ai_estimate', to: '/ai-estimate', icon: Sparkles, badge: 'BETA' },
      { labelKey: 'nav.ai_advisor', to: '/advisor', icon: MessageSquare },
      { labelKey: 'nav.estimation_dashboard', to: '/project-intelligence', icon: BrainCircuit, badge: 'BETA' },
      { labelKey: 'nav.erp_chat', to: '/chat', icon: MessageSquare, badge: 'BETA' },
    ],
  },
  // ── PLANNING & CONTROL (advanced) ──────────────────────────────────
  {
    id: 'planning',
    labelKey: 'nav.group_planning',
    descriptionKey: 'nav.group_planning_desc',
    defaultOpen: false,
    hideInSimple: true,
    items: [
      { labelKey: 'schedule.title', to: '/schedule', icon: CalendarDays, moduleKey: 'schedule' },
      { labelKey: 'nav.schedule_advanced', to: '/schedule-advanced', icon: LineChart, advancedOnly: true },
      { labelKey: 'tasks.title', to: '/tasks', icon: ClipboardList },
      { labelKey: 'nav.5d_cost_model', to: '/5d', icon: TrendingUp, moduleKey: '5d', advancedOnly: true },
      // Requirements merged into /bim/rules — sidebar entry removed
      { labelKey: 'nav.risk_register', to: '/risks', icon: ShieldAlert, advancedOnly: true },
    ],
  },
  // ── FIELD OPERATIONS (18-Modules Wave) ─────────────────────────────
  // Day-to-day site operations: service tickets, equipment, daily diary,
  // subcontractor portal, resource/crew assignment. Most useful to PMs,
  // site engineers, and field supervisors.
  {
    id: 'operations',
    labelKey: 'nav.group_operations',
    descriptionKey: 'nav.group_operations_desc',
    defaultOpen: false,
    hideInSimple: true,
    items: [
      { labelKey: 'nav.daily_diary', to: '/daily-diary', icon: BookOpen },
      { labelKey: 'nav.equipment', to: '/equipment', icon: Truck },
      { labelKey: 'nav.resources', to: '/resources', icon: Users },
      { labelKey: 'nav.service', to: '/service', icon: Wrench },
      { labelKey: 'nav.portal', to: '/portal', icon: Globe },
    ],
  },
  {
    id: 'finance',
    labelKey: 'nav.group_finance',
    defaultOpen: false,
    hideInSimple: true,
    items: [
      { labelKey: 'finance.title', to: '/finance', icon: Wallet, advancedOnly: true },
      { labelKey: 'procurement.title', to: '/procurement', icon: Package, advancedOnly: true },
      { labelKey: 'tendering.title', to: '/tendering', icon: FileText, moduleKey: 'tendering', advancedOnly: true },
      { labelKey: 'nav.change_orders', to: '/changeorders', icon: FileEdit, advancedOnly: true },
    ],
  },
  // ── COMMERCIAL (18-Modules Wave) ───────────────────────────────────
  // Commercial pipeline — from CRM lead to contract award to variations,
  // including subcontractor management, bid management, supplier
  // catalogs, and property/asset development tracking.
  {
    id: 'commercial',
    labelKey: 'nav.group_commercial',
    descriptionKey: 'nav.group_commercial_desc',
    defaultOpen: false,
    hideInSimple: true,
    items: [
      { labelKey: 'nav.crm', to: '/crm', icon: Briefcase },
      { labelKey: 'nav.contracts', to: '/contracts', icon: FileSignature },
      { labelKey: 'nav.subcontractors', to: '/subcontractors', icon: HardHat },
      { labelKey: 'nav.bid_management', to: '/bid-management', icon: Scale },
      { labelKey: 'nav.variations', to: '/variations', icon: GitBranch },
      { labelKey: 'nav.supplier_catalogs', to: '/supplier-catalogs', icon: ShoppingCart },
      { labelKey: 'nav.property_dev', to: '/property-dev', icon: Building2 },
    ],
  },
  // ── COMMUNICATION ──────────────────────────────────────────────────
  {
    id: 'communication',
    labelKey: 'nav.group_communication',
    defaultOpen: false,
    hideInSimple: true,
    items: [
      { labelKey: 'contacts.title', to: '/contacts', icon: Users },
      { labelKey: 'meetings.title', to: '/meetings', icon: CalendarDays },
      { labelKey: 'rfi.title', to: '/rfi', icon: HelpCircle, advancedOnly: true },
      { labelKey: 'submittals.title', to: '/submittals', icon: FileCheck, advancedOnly: true },
      { labelKey: 'transmittals.title', to: '/transmittals', icon: Send, advancedOnly: true },
      { labelKey: 'correspondence.title', to: '/correspondence', icon: Mail, advancedOnly: true },
    ],
  },
  // ── DOCUMENTS ──────────────────────────────────────────────────────
  // /files moved to Overview (unified entry point); leaving the
  // narrower per-type entries here for users who jump straight to a
  // category-specific tool.
  {
    id: 'documentation',
    labelKey: 'nav.group_documentation',
    defaultOpen: false,
    hideInSimple: true,
    items: [
      { labelKey: 'nav.assets', to: '/assets', icon: Package, badge: 'NEW' },
      { labelKey: 'cde.title', to: '/cde', icon: Database },
      { labelKey: 'nav.photos', to: '/photos', icon: Camera },
      { labelKey: 'nav.markups', to: '/markups', icon: PenTool },
      { labelKey: 'nav.field_reports', to: '/field-reports', icon: ClipboardList, advancedOnly: true },
      { labelKey: 'nav.reports', to: '/reports', icon: FileBarChart, advancedOnly: true },
    ],
  },
  // ── QUALITY & SAFETY ───────────────────────────────────────────────
  {
    id: 'quality',
    labelKey: 'nav.group_quality',
    defaultOpen: false,
    hideInSimple: true,
    items: [
      { labelKey: 'validation.title', to: '/validation', icon: ShieldCheck, moduleKey: 'validation' },
      { labelKey: 'inspections.title', to: '/inspections', icon: ClipboardCheck },
      { labelKey: 'ncr.title', to: '/ncr', icon: AlertOctagon },
      { labelKey: 'safety.title', to: '/safety', icon: HardHat },
      { labelKey: 'nav.punchlist', to: '/punchlist', icon: ListChecks },
      // 18-Modules Wave additions
      { labelKey: 'nav.qms', to: '/qms', icon: BadgeCheck, advancedOnly: true },
      { labelKey: 'nav.hse_advanced', to: '/hse-advanced', icon: Shield, advancedOnly: true },
      { labelKey: 'nav.carbon', to: '/carbon', icon: Leaf, advancedOnly: true },
      // sustainability + cost-benchmark injected dynamically from module registry
    ],
  },
  // ── ANALYTICS (18-Modules Wave) ────────────────────────────────────
  // BI-style dashboards built on the warehouse projections — separate
  // from the operational /dashboards snapshot view because these run
  // against the OLAP path (pg_duckdb / projections), not the OLTP path.
  {
    id: 'bi',
    labelKey: 'nav.group_bi',
    descriptionKey: 'nav.group_bi_desc',
    defaultOpen: false,
    hideInSimple: true,
    items: [
      { labelKey: 'nav.bi_dashboards', to: '/bi-dashboards', icon: BarChart3, advancedOnly: true },
    ],
  },
  {
    id: 'regional',
    labelKey: 'modules.cat_regional',
    descriptionKey: 'modules.cat_regional_desc',
    defaultOpen: false,
    hideInSimple: true,
    items: [
      // All regional exchange modules injected dynamically from module registry
    ],
  },
];

const bottomNav: NavItem[] = [
  { labelKey: 'users.management', to: '/users', icon: Users },
  { labelKey: 'modules.title', to: '/modules', icon: Package },
  { labelKey: 'nav.settings', to: '/settings', icon: Settings },
  { labelKey: 'nav.about', to: '/about', icon: Info },
];

/** Flat lookup of every NavItem in the sidebar, keyed by `to`. The
 *  Pinned section uses this to resolve a stored route string into a
 *  full NavItem (with icon, labelKey, badge etc.) without duplicating
 *  the source-of-truth list. */
const ALL_NAV_ITEMS: Record<string, NavItem> = (() => {
  const map: Record<string, NavItem> = {};
  for (const group of navGroups) for (const item of group.items) map[item.to] = item;
  for (const item of bottomNav) map[item.to] = item;
  return map;
})();

// localStorage key for collapsed state
const COLLAPSED_KEY = 'oe_sidebar_collapsed';
const PINNED_KEY = 'oe_sidebar_pinned';

function readCollapsedState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {};
}

function writeCollapsedState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function readPinned(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((p) => typeof p === 'string');
    }
  } catch {
    /* ignore */
  }
  return [];
}

function writePinned(arr: string[]) {
  try {
    localStorage.setItem(PINNED_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

// Two-key keyboard shortcuts for the most-trafficked routes. The
// sequence is `G` then a single letter — same convention Linear and
// GitHub use, so muscle memory transfers. We surface the hint inline
// next to the item so users can discover the shortcut without docs.
const KBD_HINTS: Record<string, string> = {
  '/': 'G D',
  '/projects': 'G P',
  '/boq': 'G B',
  '/costs': 'G C',
  '/bim': 'G M',
  '/ai-estimate': 'G A',
  '/settings': 'G ,',
};
const KBD_BY_LETTER: Record<string, string> = {
  d: '/',
  p: '/projects',
  b: '/boq',
  c: '/costs',
  m: '/bim',
  a: '/ai-estimate',
  ',': '/settings',
};

/** Compute the single best-matching nav route for the current location.
 *  React Router's NavLink uses prefix matching, which lights up BOTH
 *  `/bim` and `/bim/rules` when the user is on `/bim/rules`. We pick
 *  the most specific match instead — query-aware exact match wins,
 *  then plain pathname match, then the longest prefix among nav items.
 *  Returns the chosen item's `to` string, or null when nothing matches.
 */
function pickActiveRoute(
  location: { pathname: string; search: string },
  routes: string[],
): string | null {
  const currentParams = new URLSearchParams(location.search);

  // 1) Query-aware exact match — `/takeoff?tab=measurements` wins over
  //    `/takeoff` and over the broader `/takeoff?tab=...` siblings when
  //    every required param value is present in the current URL.
  const queryMatches = routes
    .filter((r) => r.includes('?'))
    .filter((r) => {
      const [pathname, qs] = r.split('?');
      if (location.pathname !== pathname) return false;
      const want = new URLSearchParams(qs);
      for (const [k, v] of want) {
        if (currentParams.get(k) !== v) return false;
      }
      return true;
    });
  if (queryMatches.length > 0) {
    return queryMatches.sort((a, b) => b.length - a.length)[0]!;
  }

  // 2) Plain pathname matches: exact wins; otherwise longest prefix.
  let best: string | null = null;
  let bestLen = -1;
  for (const route of routes) {
    if (route.includes('?')) continue;
    if (route === location.pathname) {
      if (route.length > bestLen) {
        best = route;
        bestLen = route.length;
      }
      continue;
    }
    if (route !== '/' && location.pathname.startsWith(route + '/')) {
      if (route.length > bestLen) {
        best = route;
        bestLen = route.length;
      }
    } else if (route === '/' && location.pathname === '/') {
      if (route.length > bestLen) {
        best = route;
        bestLen = route.length;
      }
    }
  }
  return best;
}

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { isModuleEnabled } = useModuleStore();
  const civilCoreDemo = useModuleStore((s) => s.civilCoreDemo);
  const isAdvanced = useViewModeStore((s) => s.isAdvanced);
  const hideAiNav = civilCoreDemo || isCivilCoreDemo();
  const badgeCounts = useSidebarBadges();
  const openSearch = useGlobalSearchStore((s) => s.openModal);
  const iconified = useSidebarCollapseStore((s) => s.iconified);
  const toggleIconified = useSidebarCollapseStore((s) => s.toggle);
  const isRTL = useIsRTL();

  // Drive the global CSS variable so both the aside (`w-sidebar`) and
  // the main-content offset (`lg:pl-sidebar`) shrink/grow in lockstep.
  // The variable lives on :root so it survives across remounts; we
  // reset it to the full width when the component unmounts only if it
  // was the one that shrunk it, to avoid stranding a 64px gutter when
  // the user logs out.
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--oe-sidebar-width',
      iconified ? SIDEBAR_WIDTH_ICON : SIDEBAR_WIDTH_FULL,
    );
  }, [iconified]);

  // Map route paths → open-item counts for sidebar badges
  const badgeMap: Record<string, number> = {
    '/tasks': badgeCounts.tasks,
    '/rfi': badgeCounts.rfi,
    '/safety': badgeCounts.safety,
  };

  // Initialize collapsed state from localStorage, falling back to group defaults
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const stored = readCollapsedState();
    const initial: Record<string, boolean> = {};
    for (const group of navGroups) {
      initial[group.id] = stored[group.id] ?? !group.defaultOpen;
    }
    return initial;
  });

  // Pinned routes — small starter section above the first group. Users
  // pin/unpin via the small icon-button that appears on item hover.
  const [pinned, setPinned] = useState<string[]>(() => readPinned());

  // Custom-module request dialog — opens from the "Request a custom
  // module" CTA at the bottom of the nav (below the "+ Add module"
  // developer-guide tile). The dialog itself handles community vs
  // bespoke routing.
  const [customModuleOpen, setCustomModuleOpen] = useState(false);

  // Persist collapsed state to localStorage
  useEffect(() => {
    writeCollapsedState(collapsed);
  }, [collapsed]);

  // Persist pinned state to localStorage
  useEffect(() => {
    writePinned(pinned);
  }, [pinned]);

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsed((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  const togglePin = useCallback((route: string) => {
    setPinned((prev) =>
      prev.includes(route) ? prev.filter((p) => p !== route) : [...prev, route],
    );
  }, []);

  // ── Two-key navigation shortcuts (G then X) ──────────────────────────
  // Linear/GitHub-style. We listen at document level for the leading
  // `G`, then within 1.5 s any single letter from KBD_BY_LETTER fires
  // the matching navigation. Ignores all keystrokes that originate
  // from text fields so it doesn't conflict with form input.
  const firstKeyRef = useRef<string | null>(null);
  const firstKeyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearFirst = () => {
      firstKeyRef.current = null;
      if (firstKeyTimerRef.current != null) {
        window.clearTimeout(firstKeyTimerRef.current);
        firstKeyTimerRef.current = null;
      }
    };

    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const editable = (e.target as HTMLElement | null)?.isContentEditable;
      if (editable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();

      if (firstKeyRef.current === 'g') {
        const route = KBD_BY_LETTER[key];
        if (route) {
          e.preventDefault();
          // The dashboard chord must reach the dashboard even on fresh
          // installs — DashboardPage normally redirects to /onboarding
          // until the wizard is finished, but a deliberate chord nav
          // means "show me the dashboard now". Sentinel is read+cleared
          // by DashboardPage's first-launch effect.
          if (key === 'd') {
            try {
              sessionStorage.setItem('oe_skip_onboarding_redirect', '1');
            } catch {
              /* storage unavailable */
            }
          }
          navigate(route);
        }
        clearFirst();
        return;
      }

      if (key === 'g') {
        firstKeyRef.current = 'g';
        firstKeyTimerRef.current = window.setTimeout(clearFirst, 1500);
      }
    };

    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      clearFirst();
    };
  }, [navigate]);

  // Resolve pinned route strings into full NavItems (skipping any
  // routes that are no longer in the registry — e.g. a module the user
  // pinned earlier has been disabled).
  const pinnedItems: NavItem[] = pinned
    .map((route) => ALL_NAV_ITEMS[route])
    .filter((item): item is NavItem => Boolean(item))
    .filter((item) => !hideAiNav || !isRouteHiddenInCivilCoreDemo(item.to.split('?')[0] ?? item.to));

  // Pick a single winning route for highlighting. Without this, both
  // `/bim` (parent) and `/bim/rules` (child) would render as "active"
  // because `/bim/rules` starts with `/bim/`. We hand the chosen
  // string down to every `SidebarItem` so only one row lights up.
  const activeRoute = pickActiveRoute(location, Object.keys(ALL_NAV_ITEMS));

  return (
    <aside
      data-tour="sidebar"
      className="oe-sidebar relative flex h-full w-sidebar flex-col bg-surface-primary"
      style={{
        // Right-edge depth — 1px hairline + a soft 12px fade. Replaces
        // the hard `border-r border-border-light` for a Linear/Vercel
        // feel: definition without rigidity.
        boxShadow:
          '1px 0 0 rgba(15, 23, 42, 0.05), 4px 0 12px -8px rgba(15, 23, 42, 0.06)',
      }}
    >
      {/* Page-scoped CSS — sidebar-only animations. Defined inline to
          keep this component fully self-contained. */}
      <style>{`
        @keyframes oeStaggerIn {
          0%   { opacity: 0; transform: translateY(-4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .oe-sidebar .oe-stagger {
          animation: oeStaggerIn 220ms cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
        }
        /* Hover-arrow: a subtle right-pointing chevron that fades in
           on hover — hints "click to navigate" without taking space
           when idle. The opacity transition keeps the layout stable. */
        .oe-sidebar a .oe-hover-arrow {
          opacity: 0;
          transform: translateX(-4px);
          transition: opacity 0.18s ease, transform 0.18s ease;
        }
        .oe-sidebar a:hover .oe-hover-arrow,
        .oe-sidebar a:focus-visible .oe-hover-arrow {
          opacity: 0.55;
          transform: translateX(0);
        }
        /* Pin button on items — invisible until item is hovered, then
           fades in from the right. Click does not navigate (handled by
           preventDefault + stopPropagation in the handler). */
        .oe-sidebar a .oe-pin-btn {
          opacity: 0;
          transition: opacity 0.18s ease, color 0.18s ease;
        }
        .oe-sidebar a:hover .oe-pin-btn,
        .oe-sidebar a:focus-within .oe-pin-btn,
        .oe-sidebar a .oe-pin-btn[data-pinned="true"] {
          opacity: 1;
        }
      `}</style>

      {/* Logo + mobile close button. The desktop collapse/expand
          toggle lives as a floating pill on the right edge — see the
          <CollapseTab/> right below — not in the header. */}
      <div
        className={clsx(
          'relative flex h-header items-center px-5',
          iconified ? 'justify-center px-0' : 'justify-between',
        )}
      >
        <a
          href={getGithubRepoUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:opacity-80 transition-opacity"
          title={iconified ? getAppDisplayName() : undefined}
        >
          {iconified ? <Logo size="sm" /> : <LogoWithText size="xs" />}
        </a>
        {!iconified && onClose && (
          <button
            onClick={onClose}
            className="lg:hidden flex h-7 w-7 min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-content-tertiary hover:bg-surface-secondary hover:text-content-primary transition-colors"
            aria-label={t('common.close', { defaultValue: 'Close' })}
          >
            <X size={16} />
          </button>
        )}
        {/* Soft hairline separator instead of a hard 1px border. */}
        <div className="absolute bottom-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      {/* Floating collapse/expand tab — pill-shaped, half-protruding
          from the right edge of the sidebar at vertical centre.
          Desktop-only (mobile uses overlay drawer with its own X).
          Same button toggles both directions; the chevron flips to
          show which way the click will move the panel. */}
      <button
        onClick={toggleIconified}
        aria-label={
          iconified
            ? t('sidebar.expand', { defaultValue: 'Expand sidebar' })
            : t('sidebar.collapse', { defaultValue: 'Collapse sidebar' })
        }
        title={
          iconified
            ? t('sidebar.expand', { defaultValue: 'Expand sidebar' })
            : t('sidebar.collapse', { defaultValue: 'Collapse sidebar' })
        }
        className={clsx(
          // Position: vertical centre, sitting on the outer border with
          // half its width protruding into the main content area.
          // LTR → outer = right; RTL → outer = left.
          'hidden lg:flex absolute top-1/2 z-10',
          isRTL ? 'left-0' : 'right-0',
          // Size + shape: tall pill, narrow.
          'h-12 w-5 items-center justify-center rounded-full',
          // Surface: clean white with a subtle ring; hover lifts to the
          // brand colour. Smooth transition on both background and the
          // chevron rotation, so the toggle feels intentional.
          'border border-border-light bg-surface-primary text-content-tertiary shadow-sm',
          'hover:border-oe-blue hover:bg-oe-blue hover:text-white hover:shadow-md hover:shadow-oe-blue/20',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oe-blue/40',
          'transition-all duration-200 ease-oe',
        )}
        style={{
          // Manual translate: Tailwind has no logical translate-x, so
          // we compose Y-centre and X-protrude in one transform.
          // RTL flips the X sign so the pill still protrudes outward.
          transform: isRTL
            ? 'translateY(-50%) translateX(-50%)'
            : 'translateY(-50%) translateX(50%)',
        }}
      >
        <ChevronRight
          size={12}
          strokeWidth={2.5}
          className={clsx(
            'transition-transform duration-200 ease-oe',
            // The chevron always points in the direction the click will
            // move the panel. In RTL the outward direction flips, so
            // the rotation logic flips too.
            isRTL
              ? iconified
                ? 'rotate-180'
                : 'rotate-0'
              : iconified
                ? 'rotate-0'
                : 'rotate-180',
          )}
        />
      </button>

      {/* Search-as-jumper — Linear-style. Triggers the existing global
          semantic-search palette. Keeps the visible affordance for
          users who don't know the ⌘K shortcut, while still surfacing
          it for those who do. When iconified, collapses to a single
          icon button — the ⌘K shortcut still works regardless. */}
      <div className={clsx('pt-3 pb-1', iconified ? 'px-2 flex justify-center' : 'px-3')}>
        <button
          type="button"
          onClick={() => openSearch()}
          className={clsx(
            'group flex items-center gap-2 rounded-md border border-border-light bg-surface-secondary/60 text-[12px] text-content-tertiary hover:border-content-quaternary/30 hover:bg-surface-secondary hover:text-content-secondary transition-colors',
            iconified ? 'h-8 w-8 justify-center' : 'w-full px-2.5 py-1.5',
          )}
          aria-label={t('search.open', { defaultValue: 'Open search' })}
          title={iconified ? t('search.open', { defaultValue: 'Open search' }) : undefined}
        >
          <Search size={13} strokeWidth={1.75} className="shrink-0" />
          {!iconified && (
            <>
              <span className="truncate">
                {t('search.placeholder', { defaultValue: 'Search…' })}
              </span>
              <kbd className="ms-auto hidden sm:inline-flex items-center gap-0.5 rounded border border-border-light bg-surface-primary px-1 py-px text-[9px] font-medium text-content-quaternary group-hover:text-content-tertiary">
                ⌘K
              </kbd>
            </>
          )}
        </button>
      </div>

      {/* Main navigation — grouped with collapsible headers */}
      <nav
        className={clsx(
          'flex-1 overflow-y-auto pt-2 pb-3',
          iconified ? 'px-2' : 'px-3',
        )}
        data-engine="cwicr"
      >
        {/* Pinned section — appears at the top when the user has
            pinned at least one item. No collapsible chevron; just a
            small label + the pinned items in their stored order. */}
        {pinnedItems.length > 0 && (
          <div className="mb-2">
            {!iconified && (
              <div className="mt-2 mb-0.5 flex items-center gap-1.5 px-2.5">
                <Pin size={9} strokeWidth={2.25} className="text-content-quaternary" />
                <span className="text-2xs font-medium uppercase tracking-wider text-content-tertiary">
                  {t('nav.pinned', { defaultValue: 'Pinned' })}
                </span>
              </div>
            )}
            <ul className="space-y-0.5">
              {pinnedItems.map((item, i) => (
                <li
                  key={item.to}
                  className="oe-stagger"
                  style={{ animationDelay: `${i * 18}ms` }}
                >
                  <SidebarItem
                    item={item}
                    label={t(item.labelKey)}
                    onClick={onClose}
                    badge={badgeMap[item.to]}
                    isPinned={true}
                    onTogglePin={togglePin}
                    activeRoute={activeRoute}
                    iconified={iconified}
                  />
                </li>
              ))}
            </ul>
            {iconified && (
              <div className="my-2 mx-auto h-px w-6 bg-border-light" aria-hidden />
            )}
          </div>
        )}
        {navGroups.map((group) => {
          if (hideAiNav && group.id === 'ai') return null;
          // Hide entire group in simple mode if flagged
          if (group.hideInSimple && !isAdvanced) return null;

          // Merge static items + dynamic module items for this group
          const dynamicItems: NavItem[] = getModuleNavItems(group.id)
            .filter((mi) => {
              const moduleId = mi.labelKey.split('.')[1] ?? mi.to.slice(1);
              return isModuleEnabled(moduleId);
            })
            .map((mi) => ({
              labelKey: mi.labelKey,
              to: mi.to,
              icon: mi.icon,
              moduleKey: mi.to.slice(1), // e.g. '/sustainability' → 'sustainability'
              advancedOnly: mi.advancedOnly,
            }));

          // Filter items by module enabled and advanced mode
          const allItems = [...group.items, ...dynamicItems];
          const visibleItems = allItems.filter(
            (item) =>
              (!hideAiNav || !isRouteHiddenInCivilCoreDemo(item.to.split('?')[0] ?? item.to)) &&
              (!item.moduleKey || isModuleEnabled(item.moduleKey)) &&
              (!item.advancedOnly || isAdvanced),
          );

          // Skip group if no visible items
          if (visibleItems.length === 0) return null;

          const isCollapsed = collapsed[group.id] ?? false;

          return (
            <NavGroupSection
              key={group.id}
              label={t(group.labelKey, { defaultValue: group.id })}
              isCollapsed={isCollapsed}
              onToggle={() => toggleGroup(group.id)}
              iconified={iconified}
            >
              <ul className="space-y-0.5">
                {visibleItems.map((item, i) => (
                  <li
                    key={item.to}
                    className="oe-stagger"
                    style={{ animationDelay: `${i * 18}ms` }}
                  >
                    <SidebarItem
                      item={item}
                      label={t(item.labelKey)}
                      onClick={onClose}
                      badge={badgeMap[item.to]}
                      isPinned={pinned.includes(item.to)}
                      onTogglePin={togglePin}
                      activeRoute={activeRoute}
                      iconified={iconified}
                    />
                  </li>
                ))}
              </ul>
            </NavGroupSection>
          );
        })}
        {/* Add-a-module CTA — dashed-border tile with a plus icon. Sits at
             the very end of the main nav groups so it reads as "keep going,
             there's more — build your own". Navigates into the in-app
             developer guide rather than to the marketplace, which gives
             contributors a clearer first step. When iconified, shrinks
             to a centred icon-only square — the dashed border still
             signals "add something". */}
        <li className={clsx('pt-2 pb-1', iconified ? 'px-0 flex justify-center' : 'px-3')}>
          <NavLink
            to="/modules/developer-guide"
            onClick={onClose}
            title={iconified ? t('nav.add_module', { defaultValue: 'Add module' }) : undefined}
            className={clsx(
              'group flex items-center rounded-lg border border-dashed border-oe-blue/40 bg-gradient-to-br from-oe-blue/5 via-transparent to-blue-50/40 dark:from-oe-blue/10 dark:via-transparent dark:to-slate-900/30 hover:border-oe-blue hover:from-oe-blue/10 hover:shadow-sm transition-all',
              iconified ? 'h-9 w-9 justify-center' : 'gap-2.5 px-2.5 py-2',
            )}
          >
            <span className="shrink-0 flex h-7 w-7 items-center justify-center rounded-md bg-oe-blue/10 text-oe-blue group-hover:bg-oe-blue group-hover:text-white transition-colors">
              <Plus size={14} strokeWidth={2.5} />
            </span>
            {!iconified && (
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-content-primary leading-tight">
                  {t('nav.add_module', { defaultValue: 'Add module‌⁠‍' })}
                </span>
                <span className="block text-[10px] text-content-tertiary leading-tight mt-0.5 truncate">
                  {t('nav.add_module_hint', { defaultValue: 'Build your own · developer guide‌⁠‍' })}
                </span>
              </span>
            )}
          </NavLink>
        </li>
        {/* Request-a-custom-module CTA — second dashed tile, purple
             accent, opens a popup instead of navigating. The popup
             routes the request to two destinations depending on the
             user's choice:
               • "Could help others too"  → community / GitHub backlog
                 → ends up in a future open-source release.
               • "Only for my company"    → private / bespoke quote
                 → DDC team replies with scope + price.
             We keep this distinct from the developer-guide tile above
             on purpose: contributors who want to build a module
             themselves use the guide; users who want us to build it
             for them use this dialog. */}
        <li className={clsx('pt-1 pb-3', iconified ? 'px-0 flex justify-center' : 'px-3')}>
          <button
            type="button"
            onClick={() => {
              setCustomModuleOpen(true);
              onClose?.();
            }}
            title={
              iconified
                ? t('nav.request_custom_module', { defaultValue: 'Request a custom module' })
                : undefined
            }
            className={clsx(
              'group flex items-center rounded-lg border border-dashed border-purple-400/40 bg-gradient-to-br from-purple-500/5 via-transparent to-purple-50/40 dark:from-purple-500/10 dark:via-transparent dark:to-slate-900/30 hover:border-purple-500 hover:from-purple-500/10 hover:shadow-sm transition-all text-left',
              iconified ? 'h-9 w-9 justify-center' : 'w-full gap-2.5 px-2.5 py-2',
            )}
            aria-haspopup="dialog"
            aria-expanded={customModuleOpen}
          >
            <span className="shrink-0 flex h-7 w-7 items-center justify-center rounded-md bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <Sparkles size={14} strokeWidth={2.25} />
            </span>
            {!iconified && (
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-content-primary leading-tight">
                  {t('nav.request_custom_module', {
                    defaultValue: 'Request a custom module‌⁠‍',
                  })}
                </span>
                <span className="block text-[10px] text-content-tertiary leading-tight mt-0.5 truncate">
                  {t('nav.request_custom_module_hint', {
                    defaultValue: 'Missing something? Tell us what you need‌⁠‍',
                  })}
                </span>
              </span>
            )}
          </button>
        </li>
      </nav>

      {/* Bottom navigation — soft hairline separator instead of a hard
          1px border; subtle paper-tint background. */}
      <div
        className={clsx(
          'relative py-2 bg-black/[0.02] dark:bg-white/[0.02]',
          iconified ? 'px-2' : 'px-3',
        )}
      >
        <div
          className={clsx(
            'absolute top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent',
            iconified ? 'left-2 right-2' : 'left-3 right-3',
          )}
        />
        <ul className="space-y-0.5">
          {bottomNav.map((item) => (
            <li key={item.to}>
              <SidebarItem
                item={item}
                label={t(item.labelKey)}
                onClick={onClose}
                isPinned={pinned.includes(item.to)}
                onTogglePin={togglePin}
                activeRoute={activeRoute}
                iconified={iconified}
              />
            </li>
          ))}
        </ul>

        {/* Update notification — compact clickable card in the sidebar; the
            whole card opens a full-screen modal with highlights + install
            commands when the user clicks it. Hidden in icon-only mode
            because the card is text-heavy; users will still see it after
            expanding the sidebar. */}
        {!iconified && <UpdateNotification />}

        {/* Version + AGPL + GitHub link
            Layout: GitHub icon (left) · version · AGPL link.
            The GitHub link uses Lucide's Github mark — keeps the row aligned
            with the rest of the sidebar's lucide icons and gives a clear
            visual entry point to the source repo. */}
        {iconified ? (
          // Icon-only footer: GitHub + Telegram stacked. The expand
          // toggle lives on the floating edge-pill, not down here, so
          // users see only one toggle entry-point — no duplicate UI.
          <div className="pt-2 pb-1 flex flex-col items-center gap-1">
            <a
              href={getGithubRepoUrl()}
              target="_blank"
              rel="noopener noreferrer"
              title={`GitHub repository (v${APP_VERSION})`}
              aria-label="GitHub repository"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border-light bg-surface-primary hover:bg-surface-elevated transition-all"
            >
              <Github size={13} strokeWidth={1.75} className="text-content-secondary" />
            </a>
            <a
              href="https://t.me/datadrivenconstruction"
              target="_blank"
              rel="noopener noreferrer"
              title={t('sidebar.community_title', { defaultValue: 'Community' })}
              aria-label="Telegram community"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border-light bg-surface-primary hover:bg-surface-elevated transition-all"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-[13px] w-[13px] text-content-secondary" aria-hidden>
                <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71l-4.14-3.06-1.99 1.93c-.23.23-.42.42-.83.42z" />
              </svg>
            </a>
          </div>
        ) : (
          <div className="px-2 pb-2 pt-1 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <a
                href={getGithubRepoUrl()}
                target="_blank"
                rel="noopener noreferrer"
                title="GitHub repository"
                aria-label="GitHub repository"
                className="flex-1 flex items-center justify-center gap-1.5 rounded-md border border-border-light bg-surface-primary hover:bg-surface-elevated hover:border-border-medium px-2 py-1.5 transition-all"
              >
                <Github size={13} strokeWidth={1.75} className="text-content-secondary" />
                <span className="text-xs font-medium text-content-secondary">GitHub</span>
              </a>
              <a
                href="https://t.me/datadrivenconstruction"
                target="_blank"
                rel="noopener noreferrer"
                title="Join the Telegram community"
                aria-label="Telegram community"
                className="flex-1 flex items-center justify-center gap-1.5 rounded-md border border-border-light bg-surface-primary hover:bg-surface-elevated hover:border-border-medium px-2 py-1.5 transition-all"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-[13px] w-[13px] text-content-secondary" aria-hidden>
                  <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71l-4.14-3.06-1.99 1.93c-.23.23-.42.42-.83.42z" />
                </svg>
                <span className="text-xs font-medium text-content-secondary">
                  {t('sidebar.community_title', { defaultValue: 'Community' })}
                </span>
              </a>
            </div>
            <div className="flex items-center justify-center gap-1.5 min-w-0">
              <span className="text-2xs text-content-tertiary">v{APP_VERSION}</span>
              <span className="text-2xs text-content-quaternary/40">·</span>
              <a
                href="/api/source"
                target="_blank"
                rel="noopener noreferrer"
                className="text-2xs text-content-tertiary hover:text-content-secondary transition-colors"
              >
                AGPL-3.0
              </a>
            </div>
          </div>
        )}
      </div>
      {/* Mounted at the aside root so the dialog escapes any
          z-index / overflow trap imposed by the inner nav scroller.
          The dialog itself is full-screen modal (fixed inset-0) and
          self-renders only when open=true. */}
      <RequestCustomModuleDialog
        open={customModuleOpen}
        onClose={() => setCustomModuleOpen(false)}
      />
    </aside>
  );
}

function NavGroupSection({
  label,
  isCollapsed,
  onToggle,
  children,
  iconified,
}: {
  label: string;
  isCollapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  iconified?: boolean;
}) {
  const { t } = useTranslation();
  // In icon-only mode there is no room for the group header chevron;
  // we surface group boundaries as a thin centred hairline and keep
  // the items always-expanded (per-group collapse is irrelevant when
  // labels aren't visible).
  if (iconified) {
    return (
      <div className="mb-1">
        <div className="my-1.5 mx-auto h-px w-6 bg-border-light/60" aria-hidden />
        {children}
      </div>
    );
  }
  return (
    <div className="mb-0.5">
      <button
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        aria-label={isCollapsed ? t('common.expand_section', { defaultValue: 'Expand {{label}}‌⁠‍', label }) : t('common.collapse_section', { defaultValue: 'Collapse {{label}}‌⁠‍', label })}
        className="mt-3 mb-0.5 flex w-full items-center justify-between px-2.5 group cursor-pointer"
      >
        <span className="text-2xs font-medium uppercase tracking-wider text-content-tertiary group-hover:text-content-secondary transition-colors">
          {label}
        </span>
        <ChevronDown
          size={12}
          strokeWidth={2}
          className={clsx(
            'text-content-quaternary group-hover:text-content-secondary',
            'transition-transform duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
            isCollapsed && '-rotate-90',
          )}
        />
      </button>
      {!isCollapsed && children}
    </div>
  );
}

function SidebarItem({
  item,
  label,
  onClick,
  badge: numericBadge,
  isPinned,
  onTogglePin,
  activeRoute,
  iconified,
}: {
  item: NavItem;
  label: string;
  onClick?: () => void;
  badge?: number;
  isPinned?: boolean;
  onTogglePin?: (route: string) => void;
  activeRoute?: string | null;
  iconified?: boolean;
}) {
  const { t } = useTranslation();
  const Icon = item.icon;
  const kbdHint = KBD_HINTS[item.to];

  const handlePinClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onTogglePin?.(item.to);
  };

  // Single source of truth for active state — Sidebar picks one winning
  // route across all visible items, so only the most-specific match
  // lights up (no more "/bim" + "/bim/rules" both glowing blue).
  const isActive = activeRoute === item.to;
  const hasQuery = item.to.includes('?');

  // Icon-only branch — short-circuits the full row layout. Native
  // `title` surfaces the label on hover; the active-state dot replaces
  // the 2px accent bar (which would clip the centred icon at 48px wide).
  if (iconified) {
    const hasBadge =
      (numericBadge != null && numericBadge > 0) || Boolean(item.badge);
    return (
      <NavLink
        to={item.to}
        end={item.to === '/' || hasQuery}
        onClick={onClick}
        title={label}
        aria-label={label}
        {...(item.tourId ? { 'data-tour': item.tourId } : {})}
        className={() =>
          clsx(
            'relative mx-auto flex h-9 w-9 items-center justify-center rounded-md transition-colors duration-fast ease-oe',
            isActive
              ? 'bg-oe-blue/[0.14] text-oe-blue shadow-[inset_0_0_0_1px_rgba(0,122,255,0.18)] dark:bg-oe-blue/25'
              : 'text-content-secondary hover:bg-surface-secondary hover:text-content-primary',
          )
        }
      >
        <Icon size={16} strokeWidth={isActive ? 2 : 1.75} />
        {hasBadge && (
          <span
            className={clsx(
              'absolute top-1 right-1 h-1.5 w-1.5 rounded-full',
              isActive ? 'bg-oe-blue' : 'bg-semantic-error/80',
            )}
            aria-hidden
          />
        )}
      </NavLink>
    );
  }

  return (
      <NavLink
        to={item.to}
        end={item.to === '/' || hasQuery}
        onClick={onClick}
        title={label}
        {...(item.tourId ? { 'data-tour': item.tourId } : {})}
        className={() => {
          const active = isActive;
          return clsx(
            // 2px transparent left border on every item — when active
            // it flips to oe-blue. No layout shift between states. The
            // accent bar is the entire visual change for "active",
            // alongside the subtle background tint and bolded label.
            // This is the Linear/Vercel pattern — solid, calm, fast.
            'relative flex items-center gap-2 rounded-md pl-[10px] pr-2.5 py-1',
            'text-[13px] transition-colors duration-fast ease-oe',
            'border-l-2 border-transparent',
            item.highlight && !active
              ? 'font-medium bg-gradient-to-r from-[#7c3aed]/10 to-[#0ea5e9]/10 text-[#6d28d9] hover:from-[#7c3aed]/15 hover:to-[#0ea5e9]/15'
              : active
                ? 'font-semibold border-oe-blue bg-oe-blue/[0.14] text-oe-blue shadow-[inset_0_0_0_1px_rgba(0,122,255,0.06)] dark:bg-oe-blue/25'
                : 'font-medium text-content-secondary hover:bg-surface-secondary hover:text-content-primary',
          );
        }}
      >
        <Icon size={16} strokeWidth={isActive ? 2 : 1.75} className="shrink-0" />
        {/* Hover-tooltip via title falls back to the full label even when
            CSS truncates with an ellipsis. The visible width is now
            264px (was 232) so most labels render in full at default
            zoom; this is the safety net for narrow sidebars / dense
            translations / large-text accessibility settings. */}
        <span className="truncate" title={label}>
          {label}
        </span>
        {/* Right-edge cluster — kbd hint first, badges last, so the
            BETA / NEW chips always sit at the absolute right margin
            (flush against the row edge) instead of being pushed inward
            by the fixed-width keyboard hint column. Reserve the 26px
            kbd column ONLY when this row actually has a shortcut —
            empty rows previously paid the same 26px tax for nothing,
            squeezing the label width and triggering avoidable
            ellipsis truncation. */}
        <span className="ms-auto flex items-center gap-1.5 shrink-0 ps-1.5">
          <span
            className={clsx(
              'hidden lg:inline-flex justify-end items-center gap-0.5 text-[9px] font-medium tracking-wide tabular-nums',
              kbdHint ? 'min-w-[26px]' : 'min-w-0',
              isActive ? 'text-oe-blue/60' : 'text-content-quaternary',
            )}
          >
            {kbdHint ?? (
              <ChevronRight
                size={12}
                className="oe-hover-arrow text-content-tertiary"
              />
            )}
          </span>
          {numericBadge != null && numericBadge > 0 && (
            <span
              className={clsx(
                'flex h-4 min-w-[1.25rem] items-center justify-center rounded-full text-2xs font-bold px-1 transition-colors',
                isActive
                  ? 'bg-oe-blue text-white'
                  : 'bg-surface-tertiary text-content-secondary',
              )}
            >
              {numericBadge > 99 ? '99+' : numericBadge}
            </span>
          )}
          {item.badge && (
            <span
              className={clsx(
                item.badge === 'BETA'
                  ? 'text-[9px] font-medium uppercase tracking-wide px-1.5 py-px rounded text-content-quaternary bg-surface-tertiary/60 dark:bg-surface-tertiary/40'
                  : item.highlight
                    ? 'text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-gradient-to-r from-[#7c3aed] to-[#0ea5e9] text-white'
                    : 'text-2xs font-semibold px-1.5 py-0.5 rounded-full text-content-tertiary',
              )}
            >
              {item.badge === 'BETA' ? 'beta' : item.badge}
            </span>
          )}
        </span>
        {/* Pin / unpin button — only shown when the item supports it
            (any item with an onTogglePin handler). Visible on hover or
            persistently when pinned. Click does not navigate. */}
        {onTogglePin && (
          <button
            type="button"
            onClick={handlePinClick}
            data-pinned={isPinned ? 'true' : undefined}
            aria-label={
              isPinned
                ? t('nav.unpin', { defaultValue: 'Unpin {{label}}', label })
                : t('nav.pin', { defaultValue: 'Pin {{label}}', label })
            }
            title={isPinned ? t('nav.unpin', { defaultValue: 'Unpin' }) : t('nav.pin', { defaultValue: 'Pin' })}
            className={clsx(
              'oe-pin-btn ms-1 flex h-4 w-4 shrink-0 items-center justify-center rounded',
              'text-content-quaternary hover:text-oe-blue hover:bg-oe-blue/10',
              isPinned && 'text-oe-blue',
            )}
          >
            {isPinned ? <PinOff size={10} strokeWidth={2} /> : <Pin size={10} strokeWidth={2} />}
          </button>
        )}
      </NavLink>
  );
}

const RECENT_TYPE_ICONS: Record<string, LucideIcon> = {
  project: FolderOpen,
  boq: Table2,
  schedule: CalendarDays,
  task: ClipboardList,
  rfi: HelpCircle,
  contact: Users,
};

/** Floating Recent button — rendered by AppLayout in the bottom-right corner. */
export function FloatingRecentButton() {
  const { t } = useTranslation();
  const recentItems = useRecentStore((s) => s.items);
  const [open, setOpen] = useState(false);

  if (recentItems.length === 0) return null;
  const displayed = recentItems.slice(0, 5);

  return (
    // Smaller, slightly higher than the Chat FAB so they stack visually
    <div className="fixed bottom-24 end-4 z-40">
      {/* Popover */}
      {open && (
        <div className="absolute bottom-12 end-0 w-72 rounded-xl border border-border-light bg-surface-primary shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-light">
            <span className="text-xs font-semibold text-content-primary">{t('nav.recent', { defaultValue: 'Recent‌⁠‍' })}</span>
            <button onClick={() => setOpen(false)} className="p-0.5 rounded text-content-tertiary hover:text-content-primary">
              <X size={14} />
            </button>
          </div>
          <ul className="py-1.5 max-h-60 overflow-y-auto">
            {displayed.map((item) => {
              const Icon = RECENT_TYPE_ICONS[item.type] || FolderOpen;
              return (
                <li key={item.id}>
                  <NavLink
                    to={item.url}
                    onClick={() => setOpen(false)}
                    title={item.title}
                    className="flex items-center gap-2.5 px-4 py-2 text-[13px] font-medium text-content-secondary hover:bg-surface-secondary hover:text-content-primary transition-all"
                  >
                    <Icon size={14} strokeWidth={1.75} className="shrink-0 text-content-tertiary" />
                    <span className="truncate flex-1">{item.title}</span>
                    <span className="text-[10px] text-content-quaternary shrink-0 tabular-nums">
                      {new Date(item.visitedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={() => setOpen((p) => !p)}
        className={clsx(
          'w-10 h-10 rounded-full flex items-center justify-center shadow-lg border transition-all duration-200 hover:scale-105 active:scale-95',
          open
            ? 'bg-oe-blue text-white border-oe-blue shadow-oe-blue/20'
            : 'bg-surface-primary text-content-secondary border-border-light hover:border-oe-blue/30 hover:text-oe-blue',
        )}
        title={t('nav.recent', { defaultValue: 'Recent' })}
      >
        <History size={18} strokeWidth={2} />
      </button>
    </div>
  );
}

/** Floating AI Chat button — large pill-shaped FAB in bottom-right that
 *  navigates to /chat. Hidden when already on the chat page. */
export function FloatingChatButton() {
  const { t } = useTranslation();
  const location = useLocation();
  const civilCoreDemo = useModuleStore((s) => s.civilCoreDemo);

  if (civilCoreDemo || isCivilCoreDemo()) return null;

  // Hide when already on the chat page so it doesn't overlap the chat itself
  if (location.pathname.startsWith('/chat')) return null;

  return (
    <NavLink
      to="/chat"
      className="fixed bottom-6 end-6 z-40 group flex items-center gap-2.5 px-5 py-3.5 rounded-full bg-gradient-to-r from-oe-blue to-blue-600 text-white shadow-xl shadow-oe-blue/30 hover:shadow-2xl hover:shadow-oe-blue/40 hover:scale-105 active:scale-95 transition-all duration-200 border border-oe-blue/50"
      title={t('nav.erp_chat', { defaultValue: 'AI Chat' })}
    >
      <MessageSquare size={20} strokeWidth={2.25} className="shrink-0" />
      <span className="text-sm font-semibold whitespace-nowrap">
        {t('nav.erp_chat', { defaultValue: 'AI Chat' })}
      </span>
      {/* Subtle pulse indicator */}
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
      </span>
    </NavLink>
  );
}
