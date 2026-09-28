export { EstimateRegisterPage } from './EstimateRegisterPage';
export { PEWizardPage } from './PEWizardPage';
export { DEEditorPage } from './DEEditorPage';
export type {
  EstimateStage,
  EstimateRegisterItem,
  EstimateSanctionNotes,
  PEWizardState,
  AbstractOfCost,
  DEEditorState,
  DELine,
  DEAbstractOfCost,
  DSRItem,
  NSRateAnalysis,
} from './types';
export { ESTIMATE_STAGES, ESTIMATE_STAGE_LABELS, GST_WORKS_PCT } from './types';
export { computeAbstract, formatInr } from './peCompute';
export { computeDEAbstract, lineAmount } from './deCompute';
export {
  DSR_CATALOG,
  DSR_CATALOG_BANNER,
  DSR_CATALOG_COUNT,
  searchDSR,
  DEMO_DSR_CATALOG,
  DEMO_DSR_BANNER,
  getActiveDsrCatalog,
  getDsrCatalogMeta,
  getDsrCatalogBanner,
  formatDsrCatalogBanner,
} from './demoDSR';
export {
  importDsrCatalogFile,
  clearImportedDsrCatalog,
  saveImportedDsrCatalog,
  isUsingSampleDsrSeed,
  DSR_CATALOG_STORAGE_KEY,
  DSR_CATALOG_CHANGE_EVENT,
} from './dsrCatalogStore';
export type { DsrCatalogMeta, DsrCatalogSourceKind } from './dsrCatalogStore';
export { parseDsrCatalogFile, parseDsrCsvText } from './dsrCatalogParse';
export {
  nextStage,
  advanceRoleHint,
  advanceEstimateStage,
  setEstimateStage,
  saveSanctionNotes,
} from './estimateStore';
export {
  printAbstractOfCost,
  downloadAbstractCsv,
  printSOQ,
  downloadSOQCsv,
  buildPEAbstractPayload,
  buildDEAbstractPayload,
} from './estimateExport';
export {
  syncEstimateToBoq,
  queueSyncEstimateToBoq,
  estimateFromBoqMetadata,
  mergeBoqRowWithMetadata,
  PWD_ESTIMATE_META_KEY,
} from './estimateApiSync';


export {
  loadDemoWingRole,
  saveDemoWingRole,
  getEffectiveWingRole,
  resolveAuthWingRole,
  isDemoWingOverrideEnabled,
  canAdvanceFromStage,
  advanceBlockedReason,
  canCreateOrEditPE,
  peEditBlockedReason,
  canCreateOrEditDE,
  deEditBlockedReason,
  canImportDsrCatalog,
  dsrImportBlockedReason,
  canEditAaEsNote,
  canEditTsSanctionNotes,
  DEMO_ROLE_LABELS,
  DEMO_ROLE_BANNER,
  DEMO_WING_STORAGE_KEY,
  DEMO_WING_OVERRIDE_KEY,
} from './demoRoles';
export type { DemoWingRole } from './demoRoles';
export { DemoRoleSwitcher, useDemoWingRole, RoleGate } from './DemoRoleSwitcher';
export type { UseDemoWingRoleResult } from './DemoRoleSwitcher';
