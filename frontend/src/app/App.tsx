import { Suspense, lazy, useState, useCallback, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppLayout } from './layout';
import { DashboardPage } from '@/features/dashboard';
import { LoginPage, LoginPageNext, PwdDelhiLoginPage, RegisterPage, ForgotPasswordPage } from '@/features/auth';
import { ProjectsPage, CreateProjectPage, ProjectDetailPage, ProjectSettingsPage } from '@/features/projects';
import { BOQListPage, CreateBOQPage, TemplatesPage } from '@/features/boq';
import { DEEditorPage, EstimateRegisterPage, PEWizardPage } from '@/features/estimates';
import { syncCustomUnitsFromServer } from '@/features/boq/boqHelpers';
import { CostsPage, ImportDatabasePage } from '@/features/costs';
import { OnboardingWizard } from '@/features/onboarding';
import { getBuildAttributionLine } from '@/shared/lib/appBranding';
import { AssembliesPage, AssemblyEditorPage, CreateAssemblyPage } from '@/features/assemblies';
import { ValidationPage } from '@/features/validation';
import { NlRuleBuilderPanel } from '@/features/compliance';
import { QuantitiesPage } from '@/features/quantities';
import { ModulesPage, ModuleDeveloperGuide } from '@/features/modules';
import { useModuleRouteElements } from '@/modules/ModuleRoutes';
import { SettingsPage } from '@/features/settings';
import { DatabaseSetupPage } from '@/features/setup';
import { IntegrationsPage } from '@/features/integrations';
import { AboutPage } from '@/features/about/AboutPage';
import { QuickEstimatePage } from '@/features/ai';
import { Logo, ShortcutsDialog, CommandPalette, ToastContainer, ErrorBoundary, NotFoundPage, OnboardingTour, OfflineBanner } from '@/shared/ui';
import GlobalSearchModal from '@/features/search/GlobalSearchModal';
import { useGlobalSearchStore } from '@/stores/useGlobalSearchStore';
import { FloatingQueuePanel } from './layout/FloatingQueuePanel';
import { useAuthStore } from '@/stores/useAuthStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { ddcVerifyIntegrity, ddcInjectMeta, DDC_ORIGIN } from '@/shared/lib/ddc-integrity';
import { useKeyboardShortcuts } from '@/shared/hooks/useKeyboardShortcuts';
import { useTranslation } from 'react-i18next';
import { getLanguageByCode } from './i18n';
import { initErrorLogger } from '@/shared/lib/errorLogger';
import { syncCivilCoreDemoFromHealth, isCivilCoreDemo } from '@/shared/lib/civilcoreDemo';
import { useModuleStore } from '@/stores/useModuleStore';

// Lazy-loaded heavy pages — code-split into separate chunks
const BOQEditorPage = lazy(() =>
  import('@/features/boq/BOQEditorPage').then((m) => ({ default: m.BOQEditorPage }))
);
const CostModelPage = lazy(() =>
  import('@/features/costmodel/CostModelPage').then((m) => ({ default: m.CostModelPage }))
);
const SchedulePage = lazy(() =>
  import('@/features/schedule/SchedulePage').then((m) => ({ default: m.SchedulePage }))
);
const TakeoffPage = lazy(() =>
  import('@/features/takeoff/TakeoffPage').then((m) => ({ default: m.TakeoffPage }))
);
const CadDataExplorerPage = lazy(() =>
  import('@/features/cad-explorer/CadDataExplorerPage').then((m) => ({ default: m.CadDataExplorerPage }))
);
const MatchElementsPage = lazy(() =>
  import('@/features/match-elements/MatchElementsPage').then((m) => ({ default: m.MatchElementsPage }))
);
const NotificationsPage = lazy(() =>
  import('@/features/notifications/NotificationsPage').then((m) => ({ default: m.NotificationsPage }))
);
const TenderingPage = lazy(() =>
  import('@/features/tendering/TenderingPage').then((m) => ({ default: m.TenderingPage }))
);
const ReportsPage = lazy(() =>
  import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage }))
);
const CatalogPage = lazy(() =>
  import('@/features/catalog/CatalogPage').then((m) => ({ default: m.CatalogPage }))
);
const AdvisorPage = lazy(() =>
  import('@/features/ai/AdvisorPage').then((m) => ({ default: m.AdvisorPage }))
);
const ERPChatPage = lazy(() =>
  import('@/features/erp-chat/full-page/ChatFullPage')
);
const ChangeOrdersPage = lazy(() =>
  import('@/features/changeorders/ChangeOrdersPage').then((m) => ({ default: m.ChangeOrdersPage }))
);
const AnalyticsPage = lazy(() =>
  import('@/features/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage }))
);
const RiskRegisterPage = lazy(() =>
  import('@/features/risk/RiskRegisterPage').then((m) => ({ default: m.RiskRegisterPage }))
);
// DocumentsPage merged into the unified File Manager — /documents now
// redirects to /files. Keeping the source file on disk for cleanup in a
// later release; nothing imports DocumentsPage today.
const PhotoGalleryPage = lazy(() =>
  import('@/features/documents/PhotoGalleryPage').then((m) => ({ default: m.PhotoGalleryPage }))
);
// RequirementsPage merged into /bim/rules — route removed, redirect added
// const RequirementsPage = lazy(() =>
//   import('@/features/requirements/RequirementsPage').then((m) => ({ default: m.RequirementsPage }))
// );
const MarkupsPage = lazy(() =>
  import('@/features/markups/MarkupsPage').then((m) => ({ default: m.MarkupsPage }))
);
const PunchListPage = lazy(() =>
  import('@/features/punchlist/PunchListPage').then((m) => ({ default: m.PunchListPage }))
);
const FieldReportsPage = lazy(() =>
  import('@/features/fieldreports/FieldReportsPage').then((m) => ({ default: m.FieldReportsPage }))
);
const FinancePage = lazy(() =>
  import('@/features/finance/FinancePage').then((m) => ({ default: m.FinancePage }))
);
const ProcurementPage = lazy(() =>
  import('@/features/procurement/ProcurementPage').then((m) => ({ default: m.ProcurementPage }))
);
const SafetyPage = lazy(() =>
  import('@/features/safety/SafetyPage').then((m) => ({ default: m.SafetyPage }))
);
const ContactsPage = lazy(() =>
  import('@/features/contacts/ContactsPage').then((m) => ({ default: m.ContactsPage }))
);
const TasksPage = lazy(() =>
  import('@/features/tasks/TasksPage').then((m) => ({ default: m.TasksPage }))
);
const RFIPage = lazy(() =>
  import('@/features/rfi/RFIPage').then((m) => ({ default: m.RFIPage }))
);
const SubmittalsPage = lazy(() =>
  import('@/features/submittals/SubmittalsPage').then((m) => ({ default: m.SubmittalsPage }))
);
const CorrespondencePage = lazy(() =>
  import('@/features/correspondence/CorrespondencePage').then((m) => ({ default: m.CorrespondencePage }))
);
const CDEPage = lazy(() =>
  import('@/features/cde/CDEPage').then((m) => ({ default: m.CDEPage }))
);
const TransmittalsPage = lazy(() =>
  import('@/features/transmittals/TransmittalsPage').then((m) => ({ default: m.TransmittalsPage }))
);
const MeetingsPage = lazy(() =>
  import('@/features/meetings/MeetingsPage').then((m) => ({ default: m.MeetingsPage }))
);
const InspectionsPage = lazy(() =>
  import('@/features/inspections/InspectionsPage').then((m) => ({ default: m.InspectionsPage }))
);
const NCRPage = lazy(() =>
  import('@/features/ncr/NCRPage').then((m) => ({ default: m.NCRPage }))
);
const ReportingPage = lazy(() =>
  import('@/features/reporting/ReportingPage').then((m) => ({ default: m.ReportingPage }))
);
const DwgTakeoffPage = lazy(() =>
  import('@/features/dwg-takeoff/DwgTakeoffPage').then((m) => ({ default: m.DwgTakeoffPage }))
);
const AssetsPage = lazy(() =>
  import('@/features/bim/AssetsPage').then((m) => ({ default: m.AssetsPage }))
);
const BIMPage = lazy(() =>
  import('@/features/bim/BIMPage').then((m) => ({ default: m.BIMPage }))
);
const BIMQuantityRulesPage = lazy(() =>
  import('@/features/bim/BIMQuantityRulesPage').then((m) => ({ default: m.BIMQuantityRulesPage }))
);
const UserManagementPage = lazy(() =>
  import('@/features/users/UserManagementPage').then((m) => ({ default: m.UserManagementPage }))
);
const ArchitectureMapPage = lazy(() =>
  import('@/features/architecture/ArchitectureMapPage').then((m) => ({ default: m.ArchitectureMapPage }))
);
const ProjectIntelligencePage = lazy(() =>
  import('@/features/project-intelligence/ProjectIntelligencePage').then((m) => ({ default: m.ProjectIntelligencePage }))
);
const FileManagerPage = lazy(() =>
  import('@/features/file-manager/FileManagerPage').then((m) => ({ default: m.FileManagerPage }))
);
const SharePage = lazy(() =>
  import('@/features/file-manager/SharePage').then((m) => ({ default: m.SharePage }))
);
const SnapshotsPage = lazy(() =>
  import('@/features/dashboards').then((m) => ({ default: m.SnapshotsPage }))
);
// EAC-3.1 scaffolding (RFC 35 §7) — block primitives preview. Dev-only route.
const EacDemoPage = lazy(() =>
  import('@/features/eac/pages/EacDemoPage').then((m) => ({ default: m.EacDemoPage }))
);
// EAC-3.2 — visual block editor canvas (xyflow). Per-ruleset editing UI.
const EACBlockEditorPage = lazy(() =>
  import('@/features/eac/EACBlockEditorPage').then((m) => ({ default: m.EACBlockEditorPage }))
);
// Styles Lab — internal design exploration page (modern style variants).
const StylesLabPage = lazy(() =>
  import('@/features/styles-lab/StylesLabPage').then((m) => ({ default: m.StylesLabPage }))
);

// 18-Modules Wave — Field Operations / Commercial / Schedule & Quality.
// Each module is its own lazy chunk so the boot bundle stays small.
const ServicePage = lazy(() =>
  import('@/features/service').then((m) => ({ default: m.ServicePage }))
);
const SubcontractorsPage = lazy(() =>
  import('@/features/subcontractors').then((m) => ({ default: m.SubcontractorsPage }))
);
const EquipmentPage = lazy(() =>
  import('@/features/equipment').then((m) => ({ default: m.EquipmentPage }))
);
const PortalPage = lazy(() =>
  import('@/features/portal').then((m) => ({ default: m.PortalPage }))
);
const ResourcesPage = lazy(() =>
  import('@/features/resources').then((m) => ({ default: m.ResourcesPage }))
);
const ContractsPage = lazy(() =>
  import('@/features/contracts').then((m) => ({ default: m.ContractsPage }))
);
const CRMPage = lazy(() =>
  import('@/features/crm').then((m) => ({ default: m.CRMPage }))
);
const CarbonPage = lazy(() =>
  import('@/features/carbon').then((m) => ({ default: m.CarbonPage }))
);
const PropertyDevPage = lazy(() =>
  import('@/features/property-dev').then((m) => ({ default: m.PropertyDevPage }))
);
const BidManagementPage = lazy(() =>
  import('@/features/bid-management').then((m) => ({ default: m.BidManagementPage }))
);
const VariationsPage = lazy(() =>
  import('@/features/variations').then((m) => ({ default: m.VariationsPage }))
);
const ScheduleAdvancedPage = lazy(() =>
  import('@/features/schedule-advanced').then((m) => ({ default: m.ScheduleAdvancedPage }))
);
const HSEAdvancedPage = lazy(() =>
  import('@/features/hse-advanced').then((m) => ({ default: m.HSEAdvancedPage }))
);
const DailyDiaryPage = lazy(() =>
  import('@/features/daily-diary').then((m) => ({ default: m.DailyDiaryPage }))
);
const QMSPage = lazy(() =>
  import('@/features/qms').then((m) => ({ default: m.QMSPage }))
);
const SupplierCatalogsPage = lazy(() =>
  import('@/features/supplier-catalogs').then((m) => ({ default: m.SupplierCatalogsPage }))
);
const BIDashboardsPage = lazy(() =>
  import('@/features/bi-dashboards').then((m) => ({ default: m.BIDashboardsPage }))
);

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-surface-secondary">
      <div className="flex flex-col items-center gap-3 animate-fade-in">
        <Logo size="lg" animate />
        <div className="h-1 w-16 overflow-hidden rounded-full bg-surface-secondary">
          <div className="h-full w-8 animate-shimmer rounded-full bg-oe-blue opacity-60" />
        </div>
      </div>
    </div>
  );
}

// Small inline loader for lazy page chunks — shown inside the main content
// area while the layout (sidebar + header) stays visible. Prevents the
// full-screen dark flash when navigating between code-split routes (e.g.
// clicking a notification that links to /tasks or /cde).
function PageLoadingInline() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-oe-blue border-t-transparent" />
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();
  if (!isAuthenticated) {
    // Preserve intended destination so the user lands where they wanted
    // after signing in (BUG-047). Avoids the "bookmarked /boq then sent
    // back to /" UX papercut.
    const next = `${location.pathname}${location.search}`;
    const qs = next && next !== '/' ? `?next=${encodeURIComponent(next)}` : '';
    return <Navigate to={`/login${qs}`} replace />;
  }
  return <>{children}</>;
}

function P({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AppLayout title={title}>
        <ErrorBoundary>
          <Suspense fallback={<PageLoadingInline />}>{children}</Suspense>
        </ErrorBoundary>
      </AppLayout>
    </RequireAuth>
  );
}

/** Mounts global keyboard shortcuts, the shortcuts help dialog, and the command palette. */
function GlobalShortcuts() {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const handleToggleShortcuts = useCallback(() => {
    setShortcutsOpen((prev) => !prev);
  }, []);

  // The `/` shortcut for search is already handled by Header's own keydown
  // listener, so we pass a no-op here to avoid duplicate triggers.
  const noop = useCallback(() => {}, []);

  useKeyboardShortcuts({
    onOpenSearch: noop,
    onToggleShortcutsDialog: handleToggleShortcuts,
  });

  // Ctrl+K / Cmd+K to open command palette
  // / to open command palette (when not typing)
  // Note: Ctrl+N / Ctrl+Shift+N are reserved by the browser (new window/incognito)
  // and cannot be intercepted reliably — use the `n p` two-key sequence instead.
  // Ctrl+Shift+V is reserved for Excel paste in BOQ Editor — don't bind it globally.

  const openGlobalSearch = useGlobalSearchStore((s) => s.openModal);
  const toggleGlobalSearch = useGlobalSearchStore((s) => s.toggleModal);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const tag = (e.target as HTMLElement)?.tagName;
      const isTextField =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      // Cmd/Ctrl+Shift+K → semantic search modal (cross-module vector search).
      // Bound BEFORE the plain Cmd+K branch so the shift modifier short-
      // circuits the navigation palette.  Works even from text fields so
      // estimators can trigger semantic search while editing a BOQ row.
      if (mod && e.shiftKey && (e.key === 'K' || e.key === 'k')) {
        e.preventDefault();
        toggleGlobalSearch();
        return;
      }

      if (isTextField) return;

      if (mod && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
      if (e.key === '/' && !mod) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [toggleGlobalSearch, openGlobalSearch]);

  return (
    <>
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <GlobalSearchModal />
    </>
  );
}

// Run once at module load — synchronous, before any render
useAuthStore.getState().loadFromStorage();
useThemeStore.getState().init();

// Initialize the anonymized error logger (global handlers for unhandled errors)
initErrorLogger();

// Inject DDC origin meta tags + subtle console banner. These provide
// provenance fingerprints: if someone clones the UI and serves it
// unmodified, the meta tags and console message are direct evidence of
// the origin. Removing them is not a functional break, but does prove
// the distribution was tampered with.
if (typeof document !== 'undefined') {
  ddcInjectMeta();
}
if (typeof window !== 'undefined' && typeof console !== 'undefined') {
  try {
    // eslint-disable-next-line no-console
    console.info(
      `%c${DDC_ORIGIN}%c · Artem Boiko · datadrivenconstruction.io`,
      'color:#0071E3;font-weight:700',
      'color:#64748b',
    );
  } catch { /* noop */ }
}

/** Keeps <html dir="..."> and lang attribute in sync with the active i18n language. */
function useDocumentDirection() {
  const { i18n } = useTranslation();

  // Set dir immediately on mount (not just on language change)
  useEffect(() => {
    const lang = getLanguageByCode(i18n.language);
    const dir = (lang && 'dir' in lang && lang.dir === 'rtl') ? 'rtl' : 'ltr';
    document.documentElement.dir = dir;
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  // Also listen for runtime language changes
  useEffect(() => {
    const handler = (lng: string) => {
      const lang = getLanguageByCode(lng);
      const dir = (lang && 'dir' in lang && lang.dir === 'rtl') ? 'rtl' : 'ltr';
      document.documentElement.dir = dir;
      document.documentElement.lang = lng;
    };
    i18n.on('languageChanged', handler);
    return () => { i18n.off('languageChanged', handler); };
  }, [i18n]);
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setCivilCoreDemo = useModuleStore((s) => s.setCivilCoreDemo);
  useDocumentDirection();

  useEffect(() => {
    void syncCivilCoreDemoFromHealth().then((enabled) => {
      if (enabled) setCivilCoreDemo(true);
    });
  }, [setCivilCoreDemo]);

  // DDC-CWICR-OE integrity verification
  if (typeof window !== 'undefined') {
    (window as any).__ddc_oe = ddcVerifyIntegrity();
  }

  // Pull the user's saved custom-unit catalogue once after auth resolves.
  // Fire-and-forget — the BOQ Unit dropdown still works from localStorage
  // before this completes; the server merge just keeps it consistent across
  // browsers and sessions.
  useEffect(() => {
    if (!isAuthenticated) return;
    void syncCustomUnitsFromServer();
  }, [isAuthenticated]);

  // Dynamic routes from the module registry (lazy-loaded)
  const moduleRoutes = useModuleRouteElements({ Wrapper: P });

  return (
    <Suspense fallback={<LoadingScreen />}>
      <OfflineBanner />
      {isAuthenticated && <GlobalShortcuts />}
      {/* OnboardingTour mounted once at app top — moving it out of
          AppLayout was the fix for BUG-UI02-TOUR-PERSISTENT.  When the
          tour was inside AppLayout (which is recreated per-route by the
          ``P`` page wrapper), every navigation re-mounted the tour and
          a click-but-not-completed flow restarted from step 1 on the
          next page. */}
      {isAuthenticated && <OnboardingTour />}
      <Routes>
        {/* Public share-link landing page — no auth required, no app shell */}
        <Route path="/share/:token" element={<SharePage />} />

        {/* Auth — public */}
        <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : (isCivilCoreDemo() ? <PwdDelhiLoginPage /> : <LoginPage />)} />
        <Route path="/login-next" element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPageNext />} />
        <Route path="/register" element={isAuthenticated ? <Navigate to="/" replace /> : <RegisterPage />} />
        <Route path="/forgot-password" element={isAuthenticated ? <Navigate to="/" replace /> : <ForgotPasswordPage />} />

        {/* Onboarding — full-screen, no layout */}
        <Route path="/onboarding" element={
          <RequireAuth><OnboardingWizard /></RequireAuth>
        } />

        {/* App — all protected, all real pages */}
        <Route path="/" element={<P title="Dashboard"><DashboardPage /></P>} />

        <Route path="/ai-estimate" element={<P title="AI Quick Estimate"><QuickEstimatePage /></P>} />
        <Route path="/advisor" element={<P title="AI Cost Advisor"><AdvisorPage /></P>} />
        <Route path="/chat" element={<P title="AI Chat"><ERPChatPage /></P>} />
        <Route path="/cad-takeoff" element={<Navigate to="/data-explorer" replace />} />
        <Route path="/data-explorer" element={<P title="Data Explorer"><CadDataExplorerPage /></P>} />
        <Route path="/match-elements" element={<P title="Match Elements"><MatchElementsPage /></P>} />
        <Route path="/bim" element={<P title="BIM Viewer"><BIMPage /></P>} />
        <Route path="/bim/rules" element={<P title="BIM Rules"><BIMQuantityRulesPage /></P>} />
        {/* Legacy alias — must come BEFORE /bim/:modelId so the literal
            "quantity-rules" segment isn't swallowed as a UUID model id. */}
        <Route path="/bim/quantity-rules" element={<Navigate to="/bim/rules" replace />} />
        <Route path="/assets" element={<P title="Asset Register"><AssetsPage /></P>} />
        <Route path="/bim/:modelId" element={<P title="BIM Viewer"><BIMPage /></P>} />
        <Route path="/projects/:projectId/bim" element={<P title="BIM Viewer"><BIMPage /></P>} />
        <Route path="/projects/:projectId/bim/:modelId" element={<P title="BIM Viewer"><BIMPage /></P>} />

        <Route path="/projects" element={<P title="Projects"><ProjectsPage /></P>} />
        <Route path="/projects/new" element={<P title="New Project"><CreateProjectPage /></P>} />
        <Route path="/projects/:projectId" element={<P title="Project"><ProjectDetailPage /></P>} />
        <Route path="/projects/:projectId/settings" element={<P title="Project Settings"><ProjectSettingsPage /></P>} />
        <Route path="/projects/:projectId/boq/new" element={<P title="New BOQ"><CreateBOQPage /></P>} />
        <Route path="/projects/:projectId/boq" element={<P title="Bill of Quantities"><BOQListPage /></P>} />

        <Route path="/boq" element={<P title="Bill of Quantities"><BOQListPage /></P>} />
        <Route path="/boq/:boqId" element={<P title="BOQ Editor"><BOQEditorPage /></P>} />
        <Route path="/templates" element={<P title="BOQ Templates"><TemplatesPage /></P>} />

        <Route path="/costs" element={<P title="Cost Database"><CostsPage /></P>} />
        <Route path="/costs/import" element={<P title="Import Cost Database"><ImportDatabasePage /></P>} />

        <Route path="/catalog" element={<P title="Resource Catalog"><CatalogPage /></P>} />

        <Route path="/assemblies" element={<P title="Assemblies"><AssembliesPage /></P>} />
        <Route path="/assemblies/new" element={<P title="New Assembly"><CreateAssemblyPage /></P>} />
        <Route path="/assemblies/:assemblyId" element={<P title="Assembly Editor"><AssemblyEditorPage /></P>} />

        <Route path="/validation" element={<P title="Validation"><ValidationPage /></P>} />
        <Route path="/compliance/builder" element={<P title="Compliance Rule Builder"><NlRuleBuilderPanel /></P>} />

        <Route path="/quantities" element={<P title="Quantity Takeoff"><QuantitiesPage /></P>} />
        <Route path="/takeoff" element={<P title="PDF Takeoff"><TakeoffPage /></P>} />
        <Route path="/dwg-takeoff" element={<P title="DWG Takeoff"><DwgTakeoffPage /></P>} />

        <Route path="/schedule" element={<P title="4D Schedule"><SchedulePage /></P>} />

        <Route path="/5d" element={<P title="5D Cost Model"><CostModelPage /></P>} />

        <Route path="/analytics" element={<P title="Analytics"><AnalyticsPage /></P>} />

        <Route path="/dashboards" element={<P title="Dashboards"><SnapshotsPage /></P>} />
        <Route path="/projects/:projectId/dashboards" element={<P title="Dashboards"><SnapshotsPage /></P>} />

        <Route path="/reports" element={<P title="Reports"><ReportsPage /></P>} />
        <Route path="/reporting" element={<P title="Reporting Dashboards"><ReportingPage /></P>} />

        <Route path="/tendering" element={<P title="Tendering"><TenderingPage /></P>} />

        <Route path="/changeorders" element={<P title="Change Orders"><ChangeOrdersPage /></P>} />
        <Route path="/documents" element={<Navigate to="/files" replace />} />
        <Route path="/photos" element={<P title="Project Photos"><PhotoGalleryPage /></P>} />
        <Route path="/files" element={<P title="Project Files"><FileManagerPage /></P>} />
        <Route path="/projects/:projectId/files" element={<P title="Project Files"><FileManagerPage /></P>} />

        <Route path="/risks" element={<P title="Risk Register"><RiskRegisterPage /></P>} />

        {/* Requirements merged into BIM Rules page */}
        <Route path="/requirements" element={<Navigate to="/bim/rules" replace />} />

        <Route path="/markups" element={<P title="Markups"><MarkupsPage /></P>} />
        <Route path="/punchlist" element={<P title="Punch List"><PunchListPage /></P>} />
        <Route path="/field-reports" element={<P title="Field Reports"><FieldReportsPage /></P>} />

        <Route path="/finance" element={<P title="Finance"><FinancePage /></P>} />
        <Route path="/projects/:projectId/finance" element={<P title="Finance"><FinancePage /></P>} />

        <Route path="/procurement" element={<P title="Procurement"><ProcurementPage /></P>} />
        <Route path="/projects/:projectId/procurement" element={<P title="Procurement"><ProcurementPage /></P>} />

        <Route path="/safety" element={<P title="Safety"><SafetyPage /></P>} />
        <Route path="/projects/:projectId/safety" element={<P title="Safety"><SafetyPage /></P>} />

        <Route path="/contacts" element={<P title="Contacts"><ContactsPage /></P>} />
        <Route path="/projects/:projectId/tasks" element={<P title="Tasks"><TasksPage /></P>} />
        <Route path="/tasks" element={<P title="Tasks"><TasksPage /></P>} />
        <Route path="/projects/:projectId/rfi" element={<P title="RFI"><RFIPage /></P>} />
        <Route path="/rfi" element={<P title="RFI"><RFIPage /></P>} />
        <Route path="/projects/:projectId/submittals" element={<P title="Submittals"><SubmittalsPage /></P>} />
        <Route path="/submittals" element={<P title="Submittals"><SubmittalsPage /></P>} />
        <Route path="/projects/:projectId/correspondence" element={<P title="Correspondence"><CorrespondencePage /></P>} />
        <Route path="/correspondence" element={<P title="Correspondence"><CorrespondencePage /></P>} />
        <Route path="/projects/:projectId/cde" element={<P title="CDE"><CDEPage /></P>} />
        <Route path="/cde" element={<P title="CDE"><CDEPage /></P>} />
        <Route path="/projects/:projectId/transmittals" element={<P title="Transmittals"><TransmittalsPage /></P>} />
        <Route path="/transmittals" element={<P title="Transmittals"><TransmittalsPage /></P>} />
        <Route path="/projects/:projectId/meetings" element={<P title="Meetings"><MeetingsPage /></P>} />
        <Route path="/meetings" element={<P title="Meetings"><MeetingsPage /></P>} />
        <Route path="/projects/:projectId/inspections" element={<P title="Inspections"><InspectionsPage /></P>} />
        <Route path="/inspections" element={<P title="Inspections"><InspectionsPage /></P>} />
        <Route path="/projects/:projectId/ncr" element={<P title="NCR"><NCRPage /></P>} />
        <Route path="/ncr" element={<P title="NCR"><NCRPage /></P>} />

        <Route path="/users" element={<P title="User Management"><UserManagementPage /></P>} />
        <Route path="/modules" element={<P title="Modules"><ModulesPage /></P>} />
        <Route path="/modules/developer-guide" element={<P title="Module Developer Guide"><ModuleDeveloperGuide /></P>} />

        <Route path="/setup/databases" element={<P title="Databases & Resources"><DatabaseSetupPage /></P>} />
        <Route path="/settings" element={<P title="Settings"><SettingsPage /></P>} />
        <Route path="/integrations" element={<P title="Integrations"><IntegrationsPage /></P>} />
        <Route path="/about" element={<P title="About"><AboutPage /></P>} />
        <Route path="/project-intelligence" element={<P title="Project Intelligence"><ProjectIntelligencePage /></P>} />
        <Route path="/architecture" element={<P title="Architecture Map"><ArchitectureMapPage /></P>} />

        {/* EAC v2 (RFC 35) — block editor primitives preview, dev-only */}
        <Route path="/eac/demo" element={<P title="EAC Block Primitives"><EacDemoPage /></P>} />
        <Route path="/eac/blocks/:eacId" element={<P title="EAC Block Editor"><EACBlockEditorPage /></P>} />

        {/* Styles Lab — design exploration, internal */}
        <Route path="/styles-lab" element={<P title="Styles Lab"><StylesLabPage /></P>} />

        {/* 18-Modules Wave — Field Operations */}
        <Route path="/service" element={<P title="Service & Maintenance"><ServicePage /></P>} />
        <Route path="/projects/:projectId/service" element={<P title="Service & Maintenance"><ServicePage /></P>} />
        <Route path="/equipment" element={<P title="Equipment & Fleet"><EquipmentPage /></P>} />
        <Route path="/projects/:projectId/equipment" element={<P title="Equipment & Fleet"><EquipmentPage /></P>} />
        <Route path="/daily-diary" element={<P title="Daily Diary"><DailyDiaryPage /></P>} />
        <Route path="/projects/:projectId/daily-diary" element={<P title="Daily Diary"><DailyDiaryPage /></P>} />
        <Route path="/portal" element={<P title="Subcontractor Portal"><PortalPage /></P>} />
        <Route path="/projects/:projectId/portal" element={<P title="Subcontractor Portal"><PortalPage /></P>} />
        <Route path="/resources" element={<P title="Resources & Crew"><ResourcesPage /></P>} />
        <Route path="/projects/:projectId/resources" element={<P title="Resources & Crew"><ResourcesPage /></P>} />

        {/* 18-Modules Wave — Commercial */}
        <Route path="/contracts" element={<P title="Contracts"><ContractsPage /></P>} />
        <Route path="/projects/:projectId/contracts" element={<P title="Contracts"><ContractsPage /></P>} />
        <Route path="/subcontractors" element={<P title="Subcontractors"><SubcontractorsPage /></P>} />
        <Route path="/projects/:projectId/subcontractors" element={<P title="Subcontractors"><SubcontractorsPage /></P>} />
        <Route path="/bid-management" element={<P title="Bid Management"><BidManagementPage /></P>} />
        <Route path="/projects/:projectId/bid-management" element={<P title="Bid Management"><BidManagementPage /></P>} />
        <Route path="/crm" element={<P title="CRM"><CRMPage /></P>} />
        <Route path="/property-dev" element={<P title="Property Development"><PropertyDevPage /></P>} />
        <Route path="/supplier-catalogs" element={<P title="Supplier Catalogs"><SupplierCatalogsPage /></P>} />

        {/* 18-Modules Wave — Schedule & Quality */}
        <Route path="/schedule-advanced" element={<P title="Advanced Schedule"><ScheduleAdvancedPage /></P>} />
        <Route path="/projects/:projectId/schedule-advanced" element={<P title="Advanced Schedule"><ScheduleAdvancedPage /></P>} />
        <Route path="/qms" element={<P title="Quality Management"><QMSPage /></P>} />
        <Route path="/projects/:projectId/qms" element={<P title="Quality Management"><QMSPage /></P>} />
        <Route path="/hse-advanced" element={<P title="HSE Management"><HSEAdvancedPage /></P>} />
        <Route path="/projects/:projectId/hse-advanced" element={<P title="HSE Management"><HSEAdvancedPage /></P>} />
        <Route path="/carbon" element={<P title="Carbon & ESG"><CarbonPage /></P>} />
        <Route path="/projects/:projectId/carbon" element={<P title="Carbon & ESG"><CarbonPage /></P>} />
        <Route path="/bi-dashboards" element={<P title="BI Dashboards"><BIDashboardsPage /></P>} />
        <Route path="/projects/:projectId/bi-dashboards" element={<P title="BI Dashboards"><BIDashboardsPage /></P>} />

        {/* Convenience route aliases — redirect to canonical paths */}
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/change-orders" element={<Navigate to="/changeorders" replace />} />
        <Route path="/punch-list" element={<Navigate to="/punchlist" replace />} />
        {/* Variations (FIDIC/JCT VOs) — distinct from generic change-orders;
            its own register tracks contractual variation instructions with
            day-works, instructions, time-impact analysis. */}
        <Route path="/variations" element={<P title="Variations"><VariationsPage /></P>} />
        <Route path="/projects/:projectId/variations" element={<P title="Variations"><VariationsPage /></P>} />
        {/* PWD Phase A+: Estimate register + PE wizard + DE editor. */}
        <Route path="/estimates" element={<P title="Estimate Register"><EstimateRegisterPage /></P>} />
        <Route path="/estimates/register" element={<P title="Estimate Register"><EstimateRegisterPage /></P>} />
        <Route path="/estimates/pe" element={<P title="Preliminary Estimate"><PEWizardPage /></P>} />
        <Route path="/estimates/pe/:estimateId" element={<P title="Preliminary Estimate"><PEWizardPage /></P>} />
        <Route path="/estimates/de" element={<P title="Detailed Estimate"><DEEditorPage /></P>} />
        <Route path="/estimates/:estimateId/de" element={<P title="Detailed Estimate"><DEEditorPage /></P>} />
        <Route path="/profile" element={<Navigate to="/settings" replace />} />
        <Route path="/notifications" element={<P title="Notifications"><NotificationsPage /></P>} />

        {/* Plugin module routes — lazy-loaded */}
        {moduleRoutes}

        {/* 404 — catch-all for unknown routes */}
        <Route path="*" element={isAuthenticated ? <P title="Not Found"><NotFoundPage /></P> : <Navigate to="/login" replace />} />
      </Routes>
      <ToastContainer />
      <FloatingQueuePanel />
      {/* DDC-CWICR-OE */}
      <span aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
        {'\u200B\u200C\u200D\u200B\u200C\u200D\u200B'}
        {getBuildAttributionLine()}
      </span>
    </Suspense>
  );
}
