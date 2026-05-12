"""‌⁠‍Project service — business logic for project management.

Stateless service layer. Handles:
- Project CRUD with ownership enforcement
- Project code auto-generation (PRJ-{YEAR}-{SEQ:04d})
- Soft-delete via status='archived'
- Event publishing on create/update/delete
"""

import logging
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.core.events import event_bus

_logger_ev = __import__("logging").getLogger(__name__ + ".events")
_logger_audit = __import__("logging").getLogger(__name__ + ".audit")


async def _safe_audit(
    session: AsyncSession,
    *,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    user_id: str | None = None,
    details: dict | None = None,
) -> None:
    """‌⁠‍Best-effort audit log — never blocks the caller on failure."""
    try:
        from app.core.audit import audit_log

        await audit_log(
            session,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            user_id=user_id,
            details=details,
        )
    except Exception:
        _logger_audit.debug("Audit log write skipped for %s %s", action, entity_type)


async def _safe_publish(name: str, data: dict, source_module: str = "") -> None:
    try:
        event_bus.publish_detached(name, data, source_module=source_module)
    except Exception:
        _logger_ev.debug("Event publish skipped: %s", name)


from app.modules.projects.models import Project
from app.modules.projects.repository import ProjectRepository
from app.modules.projects.schemas import ProjectCreate, ProjectUpdate

logger = logging.getLogger(__name__)


class ProjectService:
    """‌⁠‍Business logic for project operations."""

    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        self.session = session
        self.settings = settings
        self.repo = ProjectRepository(session)

    # ── Project code generation ───────────────────────────────────────────

    async def _generate_project_code(self) -> str:
        """Generate the next project code in the format PRJ-{YEAR}-{SEQ:04d}.

        Scans existing codes matching the current year's prefix and increments
        the sequence number.  Falls back to 0001 if no codes exist yet.
        """
        year = datetime.now(UTC).year
        prefix = f"PRJ-{year}-"
        max_seq = await self.repo.max_project_code_seq(prefix)
        next_seq = (max_seq or 0) + 1
        return f"{prefix}{next_seq:04d}"

    # ── Create ────────────────────────────────────────────────────────────

    async def create_project(
        self,
        data: ProjectCreate,
        owner_id: uuid.UUID,
    ) -> Project:
        """Create a new project owned by the given user."""
        # Auto-generate project_code if not explicitly provided
        project_code = data.project_code
        if not project_code:
            project_code = await self._generate_project_code()

        project = Project(
            name=data.name,
            description=data.description,
            region=data.region,
            classification_standard=data.classification_standard,
            currency=data.currency,
            locale=data.locale,
            validation_rule_sets=data.validation_rule_sets,
            owner_id=owner_id,
            # Phase 12 expansion fields
            project_code=project_code,
            project_type=data.project_type,
            phase=data.phase,
            client_id=data.client_id,
            parent_project_id=data.parent_project_id,
            address=data.address,
            contract_value=data.contract_value,
            planned_start_date=data.planned_start_date,
            planned_end_date=data.planned_end_date,
            actual_start_date=data.actual_start_date,
            actual_end_date=data.actual_end_date,
            budget_estimate=data.budget_estimate,
            contingency_pct=data.contingency_pct,
            custom_fields=data.custom_fields,
            work_calendar_id=data.work_calendar_id,
            # ── v2.6.0 multi-currency / VAT (RFC 37) ────────────────────
            fx_rates=list(data.fx_rates or []),
            default_vat_rate=data.default_vat_rate,
            custom_units=list(data.custom_units or []),
        )
        project = await self.repo.create(project)

        await _safe_publish(
            "projects.project.created",
            {
                "project_id": str(project.id),
                "owner_id": str(owner_id),
                "name": project.name,
            },
            source_module="oe_projects",
        )

        # Auto-create a default team for the new project
        try:
            from app.modules.teams.models import Team, TeamMembership

            default_team = Team(
                project_id=project.id,
                name="Default Team",
                is_default=True,
            )
            self.session.add(default_team)
            await self.session.flush()
            self.session.add(
                TeamMembership(team_id=default_team.id, user_id=owner_id, role="lead")
            )
            await self.session.flush()
            logger.info("Default team created for project %s", project.id)
        except Exception:
            logger.debug("Auto-create default team skipped (teams module may not be loaded)")

        await _safe_audit(
            self.session,
            action="create",
            entity_type="project",
            entity_id=str(project.id),
            user_id=str(owner_id),
            details={"name": project.name, "project_code": project_code},
        )

        logger.info("Project created: %s (owner=%s, code=%s)", project.name, owner_id, project_code)
        return project

    # ── Read ──────────────────────────────────────────────────────────────

    async def get_project(self, project_id: uuid.UUID, *, include_archived: bool = False) -> Project:
        """Get project by ID. Raises 404 if not found OR archived.

        Pass `include_archived=True` to also accept archived projects (used by
        admins, restore flows, and the soft-delete itself).
        """
        project = await self.repo.get_by_id(project_id)
        if project is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )
        if not include_archived and project.status == "archived":
            # Soft-deleted projects appear as gone to normal callers.
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )
        return project

    async def list_projects(
        self,
        owner_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 50,
        status_filter: str | None = None,
        is_admin: bool = False,
    ) -> tuple[list[Project], int]:
        """List projects for a user with pagination. Admins see all.

        Archived projects are excluded by default; pass status_filter='archived'
        explicitly to see soft-deleted ones.
        """
        return await self.repo.list_for_user(
            owner_id,
            offset=offset,
            limit=limit,
            status=status_filter,
            exclude_archived=(status_filter is None),
            is_admin=is_admin,
        )

    # ── Update ────────────────────────────────────────────────────────────

    async def update_project(
        self,
        project_id: uuid.UUID,
        data: ProjectUpdate,
    ) -> Project:
        """Update project fields. Raises 404 if not found."""
        project = await self.get_project(project_id)

        fields = data.model_dump(exclude_unset=True)

        # Map schema field 'metadata' to model column 'metadata_'
        if "metadata" in fields:
            fields["metadata_"] = fields.pop("metadata")

        if not fields:
            return project

        await self.repo.update_fields(project_id, **fields)

        # Refresh the project object
        await self.session.refresh(project)

        # If the region changed, drop it from the match-service region
        # cache so the boost layer sees the new value on the very next
        # match request — without this we'd carry stale region data for
        # up to 60 s after the PATCH.
        if "region" in fields:
            try:
                from app.core.match_service.region_cache import (
                    clear_project_region_cache,
                )

                clear_project_region_cache(project_id)
            except Exception:
                pass

        await _safe_publish(
            "projects.project.updated",
            {
                "project_id": str(project_id),
                "updated_fields": list(fields.keys()),
            },
            source_module="oe_projects",
        )

        await _safe_audit(
            self.session,
            action="update",
            entity_type="project",
            entity_id=str(project_id),
            details={"updated_fields": list(fields.keys()), "name": project.name},
        )

        logger.info("Project updated: %s (fields=%s)", project_id, list(fields.keys()))
        return project

    # ── Duplicate (deep clone) ───────────────────────────────────────────

    async def duplicate_project(
        self,
        project_id: uuid.UUID,
        owner_id: uuid.UUID,
    ) -> Project:
        """Deep-clone a project including its child collections.

        Inside a single transaction we:
          1. Fetch the source project + its WBS tree + milestones +
             MatchProjectSettings.
          2. Insert a new ``Project`` row with a fresh UUID, a freshly
             generated ``project_code``, ``name = f"{source.name} (Copy)"``
             and ``owner_id`` from the caller. Every other column is
             copied verbatim — including JSON fields (``validation_rule_sets``,
             ``custom_fields``, ``address``, ``fx_rates``, ``custom_units``,
             ``metadata_``).
          3. Re-key each child collection onto the new project id with
             fresh UUIDs. For ``ProjectWBS`` we do this in two passes so the
             hierarchical ``parent_id`` links inside the tree are preserved
             through the new id mapping. Ordinals (``sort_order``), levels
             and dates are kept verbatim.
          4. Copy ``MatchProjectSettings`` (one-to-one with the project) so
             the cloned project keeps catalogue binding, classifier choice,
             auto-link thresholds, source toggles, etc.

        The whole operation runs in the request's session — the request
        dependency (``get_session``) commits on success and rolls back on
        any raise, so a child insert failure cleanly aborts the parent
        insert too. Returns the new ``Project`` ORM row (caller wraps it
        in ``ProjectResponse``).
        """
        from app.modules.projects.models import (
            MatchProjectSettings,
            Project,
            ProjectMilestone,
            ProjectWBS,
        )

        # 1. Load source with its eager-loaded child collections.
        source = await self.get_project(project_id)

        # 2. Build the new Project row. Every persisted column is enumerated
        #    explicitly so adding a field later forces a conscious decision
        #    about whether it should clone — much safer than a sweeping
        #    ``copy.deepcopy`` that could silently propagate IDs/timestamps.
        new_project_code = await self._generate_project_code()
        new_project = Project(
            name=f"{source.name} (Copy)",
            description=source.description,
            region=source.region,
            classification_standard=source.classification_standard,
            currency=source.currency,
            locale=source.locale,
            validation_rule_sets=list(source.validation_rule_sets or []),
            status="active",
            owner_id=owner_id,
            # Phase 12 expansion fields
            project_code=new_project_code,
            project_type=source.project_type,
            phase=source.phase,
            client_id=source.client_id,
            parent_project_id=source.parent_project_id,
            address=dict(source.address) if source.address else None,
            contract_value=source.contract_value,
            planned_start_date=source.planned_start_date,
            planned_end_date=source.planned_end_date,
            actual_start_date=source.actual_start_date,
            actual_end_date=source.actual_end_date,
            budget_estimate=source.budget_estimate,
            contingency_pct=source.contingency_pct,
            custom_fields=(
                dict(source.custom_fields) if source.custom_fields else None
            ),
            work_calendar_id=source.work_calendar_id,
            # v2.6.0 multi-currency / VAT
            fx_rates=list(source.fx_rates or []),
            default_vat_rate=source.default_vat_rate,
            custom_units=list(source.custom_units or []),
            metadata_=dict(source.metadata_ or {}),
            # v2.9.4 per-project storage override
            storage_path_override=source.storage_path_override,
            storage_uses_default=source.storage_uses_default,
        )
        self.session.add(new_project)
        await self.session.flush()  # populates new_project.id

        # 3a. Clone WBS tree.
        #    Pass 1: insert every node with parent_id=NULL, keeping a
        #    mapping of old id → new ORM row. Pass 2: re-set parent_id
        #    inside the tree using the mapping. This decouples the inserts
        #    from the source ordering and avoids FK-not-found races.
        wbs_id_map: dict[uuid.UUID, uuid.UUID] = {}
        new_wbs_rows: list[tuple[ProjectWBS, uuid.UUID | None]] = []
        for src_node in source.wbs_nodes:
            new_node = ProjectWBS(
                project_id=new_project.id,
                parent_id=None,  # rewired in pass 2
                code=src_node.code,
                name=src_node.name,
                name_translations=(
                    dict(src_node.name_translations)
                    if src_node.name_translations
                    else None
                ),
                level=src_node.level,
                sort_order=src_node.sort_order,
                wbs_type=src_node.wbs_type,
                planned_cost=src_node.planned_cost,
                planned_hours=src_node.planned_hours,
                metadata_=dict(src_node.metadata_ or {}),
            )
            self.session.add(new_node)
            new_wbs_rows.append((new_node, src_node.parent_id))
        if new_wbs_rows:
            await self.session.flush()
            # Pair each newly-flushed row with its source node (same order)
            # so we can build the id mapping needed to rewire parent_id.
            for (new_node, _src_parent_id), src_node in zip(
                new_wbs_rows, source.wbs_nodes, strict=True,
            ):
                wbs_id_map[src_node.id] = new_node.id
            # Pass 2 — rewire parent_id within the new tree.
            for new_node, src_parent_id in new_wbs_rows:
                if src_parent_id is not None and src_parent_id in wbs_id_map:
                    new_node.parent_id = wbs_id_map[src_parent_id]
            await self.session.flush()

        # 3b. Clone milestones. Flat list, no internal references.
        for src_ms in source.milestones:
            self.session.add(
                ProjectMilestone(
                    project_id=new_project.id,
                    name=src_ms.name,
                    milestone_type=src_ms.milestone_type,
                    planned_date=src_ms.planned_date,
                    actual_date=src_ms.actual_date,
                    status=src_ms.status,
                    linked_payment_pct=src_ms.linked_payment_pct,
                    metadata_=dict(src_ms.metadata_ or {}),
                )
            )

        # 3c. Clone MatchProjectSettings (one-to-one, no relationship on
        #     Project — fetched directly via the unique FK).
        from sqlalchemy import select as _sa_select

        src_match_stmt = _sa_select(MatchProjectSettings).where(
            MatchProjectSettings.project_id == project_id,
        )
        src_match = (
            await self.session.execute(src_match_stmt)
        ).scalar_one_or_none()
        if src_match is not None:
            self.session.add(
                MatchProjectSettings(
                    project_id=new_project.id,
                    target_language=src_match.target_language,
                    classifier=src_match.classifier,
                    auto_link_threshold=src_match.auto_link_threshold,
                    auto_link_enabled=src_match.auto_link_enabled,
                    mode=src_match.mode,
                    sources_enabled=list(src_match.sources_enabled or []),
                    cost_database_id=src_match.cost_database_id,
                )
            )

        await self.session.flush()
        await self.session.refresh(new_project)

        # 4. Auto-create a default team for the cloned project (mirrors
        #    ``create_project``). Wrapped in a SAVEPOINT so a missing teams
        #    table (test environments / minimal installs) doesn't poison
        #    the outer transaction with the parent + child inserts already
        #    in flight.
        try:
            from app.modules.teams.models import Team, TeamMembership

            async with self.session.begin_nested():
                default_team = Team(
                    project_id=new_project.id,
                    name="Default Team",
                    is_default=True,
                )
                self.session.add(default_team)
                await self.session.flush()
                self.session.add(
                    TeamMembership(
                        team_id=default_team.id,
                        user_id=owner_id,
                        role="lead",
                    )
                )
                await self.session.flush()
        except Exception:
            logger.debug(
                "Auto-create default team skipped on duplicate "
                "(teams module may not be loaded)",
            )

        await _safe_publish(
            "projects.project.created",
            {
                "project_id": str(new_project.id),
                "owner_id": str(owner_id),
                "name": new_project.name,
                "duplicated_from": str(project_id),
            },
            source_module="oe_projects",
        )

        await _safe_audit(
            self.session,
            action="duplicate",
            entity_type="project",
            entity_id=str(new_project.id),
            user_id=str(owner_id),
            details={
                "source_project_id": str(project_id),
                "name": new_project.name,
                "project_code": new_project_code,
                "wbs_count": len(source.wbs_nodes),
                "milestone_count": len(source.milestones),
            },
        )

        logger.info(
            "Project duplicated: src=%s -> new=%s (owner=%s, code=%s, "
            "wbs=%d, milestones=%d)",
            project_id,
            new_project.id,
            owner_id,
            new_project_code,
            len(source.wbs_nodes),
            len(source.milestones),
        )
        return new_project

    # ── Delete (soft) ─────────────────────────────────────────────────────

    async def delete_project(self, project_id: uuid.UUID) -> None:
        """Soft-delete a project by setting status to 'archived'.

        Also hard-deletes child records (tasks, RFIs, etc.) that reference
        the project so they don't remain accessible after the project is
        archived.  The DB FK constraints use ``ondelete=CASCADE`` for real
        deletes, but since the project row itself is kept (soft-delete) those
        cascades never trigger — we do it explicitly here.

        Raises 404 if not found. Idempotent — re-archiving an archived
        project is a no-op (returns 204) so the user gets a clean delete UX.
        """
        from sqlalchemy import delete as sa_delete

        project = await self.get_project(project_id, include_archived=True)
        if project.status == "archived":
            return  # Already archived — silently succeed
        # Snapshot fields before update_fields() — that calls session.expire_all(),
        # after which any attribute access on `project` would trigger lazy IO and
        # crash with greenlet_spawn / MissingGreenlet under the async session.
        owner_id = str(project.owner_id)
        project_name = project.name

        # Cascade-delete child records that belong to this project.
        # These models all have project_id FK with ondelete=CASCADE, but
        # since we only soft-delete the project row the DB cascade never
        # fires.  Delete them explicitly so they don't remain accessible.
        child_models: list[type] = []
        try:
            from app.modules.tasks.models import Task
            child_models.append(Task)
        except ImportError:
            pass
        try:
            from app.modules.rfi.models import RFI
            child_models.append(RFI)
        except ImportError:
            pass
        try:
            from app.modules.meetings.models import Meeting
            child_models.append(Meeting)
        except ImportError:
            pass
        try:
            from app.modules.punchlist.models import PunchItem
            child_models.append(PunchItem)
        except ImportError:
            pass
        try:
            from app.modules.inspections.models import Inspection
            child_models.append(Inspection)
        except ImportError:
            pass
        try:
            from app.modules.ncr.models import NCR
            child_models.append(NCR)
        except ImportError:
            pass
        try:
            from app.modules.fieldreports.models import FieldReport
            child_models.append(FieldReport)
        except ImportError:
            pass
        try:
            from app.modules.risk.models import Risk
            child_models.append(Risk)
        except ImportError:
            pass

        for model in child_models:
            try:
                stmt = sa_delete(model).where(model.project_id == project_id)  # type: ignore[attr-defined]
                await self.session.execute(stmt)
            except Exception as exc:
                logger.debug(
                    "Cascade delete for %s skipped: %s",
                    model.__tablename__,  # type: ignore[attr-defined]
                    exc,
                )

        await self.repo.update_fields(project_id, status="archived")

        await _safe_publish(
            "projects.project.deleted",
            {
                "project_id": str(project_id),
                "owner_id": owner_id,
            },
            source_module="oe_projects",
        )

        await _safe_audit(
            self.session,
            action="delete",
            entity_type="project",
            entity_id=str(project_id),
            details={"name": project_name},
        )

        logger.info("Project archived: %s", project_id)

    # ── Restore (un-archive) ─────────────────────────────────────────────

    async def restore_project(self, project_id: uuid.UUID) -> Project:
        """Restore a previously archived project back to active status.

        Raises 404 if project not found (including never-archived ones that
        don't exist). Raises 400 if project is already active.
        """
        project = await self.get_project(project_id, include_archived=True)
        if project.status != "archived":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Project is not archived — nothing to restore",
            )
        owner_id = str(project.owner_id)

        await self.repo.update_fields(project_id, status="active")

        await _safe_publish(
            "projects.project.restored",
            {
                "project_id": str(project_id),
                "owner_id": owner_id,
            },
            source_module="oe_projects",
        )

        logger.info("Project restored: %s", project_id)

        # Re-fetch to return fresh data
        return await self.get_project(project_id)


# ── Match-settings service helpers (v2.8.0) ──────────────────────────────


def _settings_snapshot(row: object) -> dict:
    """Pure dict snapshot of a MatchProjectSettings row for audit trails."""
    return {
        "target_language": getattr(row, "target_language", None),
        "classifier": getattr(row, "classifier", None),
        "auto_link_threshold": getattr(row, "auto_link_threshold", None),
        "auto_link_enabled": getattr(row, "auto_link_enabled", None),
        "mode": getattr(row, "mode", None),
        "sources_enabled": list(getattr(row, "sources_enabled", []) or []),
        "cost_database_id": getattr(row, "cost_database_id", None),
    }


async def auto_bind_dominant_catalogue(
    db: AsyncSession,
    project_id: uuid.UUID,
) -> str | None:
    """Bind the project's match settings to the dominant loaded CWICR catalogue.

    Used to make /match-elements (and any other matcher consumer) Just Work
    on a fresh project — without this, ``cost_database_id`` stays NULL and
    the ranker short-circuits with ``status="no_catalog_selected"``.

    Selection rule (language-aware, since 2.9.34):

    1. **Prefer a vectorised catalogue whose language matches the project's
       region**, even if a different-language catalogue has more rows.
       Without this, a US project with the Russian CWICR catalogue loaded
       (which has the most rows globally) would auto-bind to ``RU_MOSCOW``
       and surface Russian descriptions on /match-elements. The project's
       region resolves to a language via :func:`region_language.language_for`;
       any catalogue with the same language wins ahead of any other.

    2. **Fall back to the dominant vectorised catalogue** (most rows, any
       language) when no language match is available. Better cross-language
       BGE-M3 recall than no catalogue at all.

    Returns the bound catalogue id (e.g. ``"USA_NEWYORK"``), or ``None``
    when no catalogue qualifies (fresh install, vectoriser not run yet).
    Idempotent: callers can invoke this on every session create; if the
    project already has a non-NULL ``cost_database_id`` this is a no-op.
    """
    from sqlalchemy import func, select  # noqa: PLC0415

    from app.core.match_service.region_language import language_for  # noqa: PLC0415
    from app.core.vector import vector_count_with_payload_substring  # noqa: PLC0415
    from app.core.vector_index import COLLECTION_COSTS  # noqa: PLC0415
    from app.modules.costs.models import CostItem  # noqa: PLC0415
    from app.modules.projects.models import Project  # noqa: PLC0415

    row = await get_or_create_match_settings(db, project_id)
    # Resolve the project's preferred catalogue language early — we need
    # it both to decide whether to keep the current binding and to seed
    # Pass 1 below. Two signals, in order of trust:
    #   1. ``match_settings.target_language`` — explicit user choice, the
    #      most direct signal of what language descriptions they want.
    #   2. ``project.region`` → ``language_for()`` — geographic inference,
    #      used when the user hasn't picked a target language.
    # Without the target_language fallback, projects with an empty region
    # (E2E fixtures, freshly-created projects, or anything imported without
    # a country tag) get ``project_lang=None`` and skip Pass 1+1b entirely,
    # falling through to Pass 2 which binds whichever catalogue has the
    # most SQL rows — typically Russian.
    project_lang: str | None = None
    try:
        proj = await db.get(Project, project_id)
        if proj and proj.region:
            project_lang = language_for(proj.region)
    except Exception:
        project_lang = None
    if not project_lang:
        tl = (getattr(row, "target_language", None) or "").strip().lower()
        if tl:
            project_lang = tl
    logger.debug(
        "auto_bind_dominant_catalogue: project=%s project_lang=%r current_binding=%r",
        project_id, project_lang, row.cost_database_id,
    )

    if row.cost_database_id:
        # Verify the current binding still has rows AND speaks the same
        # language as the project's region. A project that bound to a
        # catalogue which was later unloaded otherwise stays pinned to a
        # zero-row binding and every match returns empty; an ASIA_PAC
        # project that auto-bound to RU_STPETERSBURG once stays pinned
        # there forever and the matcher works against Russian payloads.
        # Re-bind when stale or language-mismatched; keep otherwise.
        try:
            current_count = (
                await db.execute(
                    select(func.count(CostItem.id))
                    .where(CostItem.is_active.is_(True))
                    .where(CostItem.region == row.cost_database_id)
                )
            ).scalar() or 0
        except Exception:
            current_count = 1  # defensive: keep current binding on lookup error
        current_lang = language_for(row.cost_database_id) if row.cost_database_id else None
        # Language mismatch is only a reason to re-bind when we actually
        # have a language target — otherwise we'd thrash on projects with
        # no resolvable region.
        lang_mismatch = bool(
            project_lang and current_lang and project_lang != current_lang
        )
        if current_count > 0 and not lang_mismatch:
            return row.cost_database_id
        reason = "0 rows" if current_count == 0 else f"language {current_lang!r} != project {project_lang!r}"
        logger.info(
            "auto_bind_dominant_catalogue: re-binding %s — current %r %s",
            project_id, row.cost_database_id, reason,
        )
        row.cost_database_id = None

    # ``project_lang`` resolved above; Pass 1 below uses it as a hard
    # prefer-language gate (only consider catalogues whose language
    # matches the project's region language). Pass 2 is the unlanguaged
    # fallback that takes whatever has rows.

    try:
        candidates = (
            await db.execute(
                select(CostItem.region, func.count().label("c"))
                .where(CostItem.is_active.is_(True))
                .where(CostItem.region.is_not(None))
                .group_by(CostItem.region)
                .order_by(func.count().desc())
                .limit(16)
            )
        ).all()
    except Exception:  # pragma: no cover — defensive
        return None

    def _bind(region: str) -> str:
        row.cost_database_id = region
        return region

    # Pass 1 — prefer same-language catalogues from SQL.
    if project_lang:
        for region, _count in candidates:
            if not region:
                continue
            if language_for(region) != project_lang:
                continue
            try:
                vec = vector_count_with_payload_substring(COLLECTION_COSTS, region)
            except Exception:
                vec = 0
            if vec > 0:
                bound = _bind(region)
                await db.flush()
                await db.refresh(row)
                return bound

    # Pass 1b — SQL has no language match but the language-specific
    # Qdrant collection might still hold rates. Bind to a representative
    # country code for that language so the matcher reads from the
    # right collection. ``country_to_collection`` and
    # ``country_filter_for`` understand bare two-letter codes — see
    # qdrant_adapter.py for the contract. Pinned to a representative
    # country per language so the country payload predicate doesn't
    # over-narrow (US is the most populous English country in CWICR,
    # CN_SHANGHAI for zh, RU for ru, etc).
    _LANG_TO_REGION: dict[str, str] = {
        "en": "US",
        "zh": "CN_SHANGHAI",
        "ru": "RU",
        "vi": "VN",
        "es": "ES",
        "de": "DE",
        "fr": "FR",
        "pt": "PT",
        "it": "IT",
        "ja": "JP",
        "ko": "KR",
        "tr": "TR",
        "pl": "PL",
        "ar": "AE",
    }
    if project_lang:
        fallback_region = _LANG_TO_REGION.get(project_lang)
        if fallback_region:
            try:
                # Qdrant scroll with country payload — quick check that
                # the language collection actually carries rows for this
                # country. Cheap (single call) and only runs in this
                # cold-bind path.
                from app.modules.costs.qdrant_adapter import (
                    _get_client,
                    country_filter_for,
                    country_to_collection,
                )

                client = _get_client()
                coll = country_to_collection(fallback_region)
                cf = country_filter_for(fallback_region)
                try:
                    info = client.get_collection(coll)
                except Exception:
                    base = coll.rsplit("_v", 1)[0] if "_v" in coll else coll
                    info = client.get_collection(base) if base != coll else None
                vec_present = bool(
                    info and (
                        getattr(info, "points_count", 0)
                        or getattr(info, "vectors_count", 0)
                    )
                )
                if vec_present:
                    logger.info(
                        "auto_bind: SQL has no %s catalogue — binding language "
                        "fallback %r so Qdrant %r is searched",
                        project_lang, fallback_region, coll,
                    )
                    bound = _bind(fallback_region)
                    await db.flush()
                    await db.refresh(row)
                    return bound
                # cf reference keeps the helper imported even when
                # the collection probe short-circuits.
                _ = cf
            except Exception as exc:  # pragma: no cover — defensive
                logger.debug("auto_bind: language fallback probe failed: %s", exc)

    # Pass 2 — fall back to dominant catalogue regardless of language.
    for region, _count in candidates:
        if not region:
            continue
        try:
            vec = vector_count_with_payload_substring(COLLECTION_COSTS, region)
        except Exception:
            vec = 0
        if vec > 0:
            bound = _bind(region)
            await db.flush()
            await db.refresh(row)
            return bound
    return None


async def get_or_create_match_settings(
    db: AsyncSession,
    project_id: uuid.UUID,
):
    """Fetch the project's match settings, creating a default row on first read.

    Lazy initialisation keeps existing projects (created before v2.8.0)
    backwards-compatible — they get a default row the first time the UI or
    matcher service asks for it. Callers receive the ORM row so the router
    can ``model_validate`` it into a Pydantic response.
    """
    from sqlalchemy import select

    from app.modules.projects.models import (
        MATCH_DEFAULT_AUTO_LINK_ENABLED,
        MATCH_DEFAULT_AUTO_LINK_THRESHOLD,
        MATCH_DEFAULT_CLASSIFIER,
        MATCH_DEFAULT_MODE,
        MATCH_DEFAULT_SOURCES,
        MATCH_DEFAULT_TARGET_LANGUAGE,
        MatchProjectSettings,
    )

    stmt = select(MatchProjectSettings).where(
        MatchProjectSettings.project_id == project_id,
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is not None:
        return row

    row = MatchProjectSettings(
        project_id=project_id,
        target_language=MATCH_DEFAULT_TARGET_LANGUAGE,
        classifier=MATCH_DEFAULT_CLASSIFIER,
        auto_link_threshold=MATCH_DEFAULT_AUTO_LINK_THRESHOLD,
        auto_link_enabled=MATCH_DEFAULT_AUTO_LINK_ENABLED,
        mode=MATCH_DEFAULT_MODE,
        sources_enabled=list(MATCH_DEFAULT_SOURCES),
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def update_match_settings(
    db: AsyncSession,
    project_id: uuid.UUID,
    patch,  # MatchProjectSettingsUpdate — typed lazily to avoid circular import
    *,
    user_id: str | None = None,
):
    """Apply a partial PATCH to the project's match settings.

    Audit-logs the change with both ``before`` and ``after`` snapshots so
    the audit trail is self-contained. Returns the refreshed ORM row.
    """
    row = await get_or_create_match_settings(db, project_id)
    before = _settings_snapshot(row)

    fields = patch.model_dump(exclude_unset=True)
    if not fields:
        return row

    for key, value in fields.items():
        setattr(row, key, value)
    await db.flush()
    await db.refresh(row)

    await _safe_audit(
        db,
        action="update",
        entity_type="project_match_settings",
        entity_id=str(project_id),
        user_id=user_id,
        details={
            "before": before,
            "after": _settings_snapshot(row),
            "updated_fields": list(fields.keys()),
        },
    )
    return row


async def reset_match_settings(
    db: AsyncSession,
    project_id: uuid.UUID,
    *,
    user_id: str | None = None,
):
    """Reset the project's match settings to factory defaults.

    Audit-logs the reset with a ``before`` snapshot of the prior state and
    the canonical default ``after`` snapshot.
    """
    from app.modules.projects.models import (
        MATCH_DEFAULT_AUTO_LINK_ENABLED,
        MATCH_DEFAULT_AUTO_LINK_THRESHOLD,
        MATCH_DEFAULT_CLASSIFIER,
        MATCH_DEFAULT_MODE,
        MATCH_DEFAULT_SOURCES,
        MATCH_DEFAULT_TARGET_LANGUAGE,
    )

    row = await get_or_create_match_settings(db, project_id)
    before = _settings_snapshot(row)

    row.target_language = MATCH_DEFAULT_TARGET_LANGUAGE
    row.classifier = MATCH_DEFAULT_CLASSIFIER
    row.auto_link_threshold = MATCH_DEFAULT_AUTO_LINK_THRESHOLD
    row.auto_link_enabled = MATCH_DEFAULT_AUTO_LINK_ENABLED
    row.mode = MATCH_DEFAULT_MODE
    row.sources_enabled = list(MATCH_DEFAULT_SOURCES)
    row.cost_database_id = None
    await db.flush()
    await db.refresh(row)

    await _safe_audit(
        db,
        action="reset",
        entity_type="project_match_settings",
        entity_id=str(project_id),
        user_id=user_id,
        details={
            "before": before,
            "after": _settings_snapshot(row),
        },
    )
    return row
