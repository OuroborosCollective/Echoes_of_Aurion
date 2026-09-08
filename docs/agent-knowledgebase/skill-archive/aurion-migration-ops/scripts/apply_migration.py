#!/usr/bin/env python3
"""Compatibility tombstone for the removed direct SSH/SQL migration path.

Aurion production applies must go through the repository's canonical, revision- and
plan-bound GitHub Actions -> OIDC -> root-runner -> backup/recovery/apply lane.
"""
import json
import sys

print(json.dumps({
    "recordType": "aurion_migration_ops_legacy_apply_block",
    "schemaVersion": 1,
    "status": "BLOCKED",
    "mutationPerformed": False,
    "reason": "DIRECT_SSH_SQL_APPLY_REMOVED",
    "canonicalWorkflow": ".github/workflows/aurion-production-schema-apply.yml",
    "requiredBinding": ["exact_source_revision", "planSha256", "canonical_production_readback", "owner_scope"],
    "message": "Do not execute raw SQL or write __drizzle_migrations from this skill. Use the canonical Aurion production apply workflow and re-read the resulting root-owned receipt.",
}, indent=2))
sys.exit(64)
