#!/usr/bin/env python3
"""
Export Linear projects from local IndexedDB cache to JSON.

Reads from Linear Desktop App's IndexedDB and exports project data
with recent issue titles. Outputs JSON to stdout, errors to stderr.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from typing import Any

# Setup vendor paths (local to this script)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
VENDOR_CCL = os.path.join(SCRIPT_DIR, "vendor", "ccl_chromium_reader")
VENDOR_SNAPPY = os.path.join(SCRIPT_DIR, "vendor", "ccl_simplesnappy")

LINEAR_DB_PATH = os.path.expanduser(
    "~/Library/Application Support/Linear/IndexedDB/https_linear.app_0.indexeddb.leveldb"
)
LINEAR_BLOB_PATH = os.path.expanduser(
    "~/Library/Application Support/Linear/IndexedDB/https_linear.app_0.indexeddb.blob"
)


def setup_pythonpath() -> None:
    """Add vendor directories to sys.path."""
    for path in [VENDOR_CCL, VENDOR_SNAPPY]:
        if path not in sys.path:
            sys.path.insert(0, path)


def is_project_record(record: dict[str, Any]) -> bool:
    """Check if a record looks like a Linear project."""
    required = {"name", "teamIds", "statusId", "organizationId"}
    if not required.issubset(record.keys()):
        return False
    team_ids = record.get("teamIds")
    return isinstance(team_ids, list)


def is_team_record(record: dict[str, Any]) -> bool:
    """Check if a record looks like a Linear team."""
    if not {"key", "name"}.issubset(record.keys()):
        return False
    key = record.get("key")
    if not isinstance(key, str):
        return False
    return key.isupper() and key.isalpha() and len(key) <= 10


def is_issue_record(record: dict[str, Any]) -> bool:
    """Check if a record looks like a Linear issue."""
    required = {"number", "teamId", "title"}
    return required.issubset(record.keys())


def is_workflow_state_record(record: dict[str, Any]) -> bool:
    """Check if a record looks like a Linear workflow state."""
    if not {"name", "type", "color", "teamId"}.issubset(record.keys()):
        return False
    state_type = record.get("type")
    valid_types = {"started", "unstarted", "completed", "canceled", "backlog"}
    return state_type in valid_types


def load_linear_data() -> tuple[dict, dict, dict, dict]:
    """
    Load projects, teams, issues, and workflow states from Linear IndexedDB.

    Returns: (projects, teams, issues, states)
    """
    setup_pythonpath()
    try:
        from ccl_chromium_reader import ccl_chromium_indexeddb  # type: ignore
    except ImportError as e:
        print(f"Error: Failed to import ccl_chromium_reader: {e}", file=sys.stderr)
        sys.exit(1)

    if not os.path.exists(LINEAR_DB_PATH):
        # Linear Desktop not installed - return empty gracefully
        return {}, {}, {}, {}

    try:
        wrapper = ccl_chromium_indexeddb.WrappedIndexDB(LINEAR_DB_PATH, LINEAR_BLOB_PATH)
    except Exception as e:
        print(f"Error: Failed to open IndexedDB: {e}", file=sys.stderr)
        return {}, {}, {}, {}

    db = None
    try:
        for db_id in wrapper.database_ids:
            if "linear_" in db_id.name and db_id.name != "linear_databases":
                candidate = wrapper[db_id.name, db_id.origin]
                if list(candidate.object_store_names):
                    db = candidate
                    break
    except Exception as e:
        print(f"Error: Failed to find Linear database: {e}", file=sys.stderr)
        return {}, {}, {}, {}

    if not db:
        # No Linear database found
        return {}, {}, {}, {}

    projects: dict[str, dict] = {}
    teams: dict[str, dict] = {}
    issues: dict[str, dict] = {}
    states: dict[str, dict] = {}

    try:
        for store_name in db.object_store_names:
            if store_name is None or store_name.startswith("_") or "_partial" in store_name:
                continue

            try:
                store = db[store_name]
                first_record = None

                for record in store.iterate_records():
                    val = record.value
                    if not isinstance(val, dict):
                        break
                    first_record = val
                    break

                if not first_record:
                    continue

                if is_project_record(first_record):
                    for record in store.iterate_records():
                        if isinstance(record.value, dict) and record.value.get("id"):
                            projects[record.value["id"]] = record.value
                elif is_team_record(first_record):
                    for record in store.iterate_records():
                        if isinstance(record.value, dict) and record.value.get("id"):
                            teams[record.value["id"]] = record.value
                elif is_issue_record(first_record):
                    for record in store.iterate_records():
                        if isinstance(record.value, dict) and record.value.get("id"):
                            issues[record.value["id"]] = record.value
                elif is_workflow_state_record(first_record):
                    for record in store.iterate_records():
                        if isinstance(record.value, dict) and record.value.get("id"):
                            states[record.value["id"]] = record.value

            except Exception:
                continue

    except Exception as e:
        print(f"Error: Failed to iterate object stores: {e}", file=sys.stderr)
        return {}, {}, {}, {}

    return projects, teams, issues, states


def get_team_info(project: dict[str, Any], teams: dict[str, Any]) -> tuple[str, str]:
    """Return (teamId, teamName) using first entry from teamIds array."""
    team_ids = project.get("teamIds", [])
    if not team_ids:
        return "", "Unknown"

    team_id = team_ids[0]
    team = teams.get(team_id, {})
    team_name = team.get("name", "Unknown")
    return team_id, team_name


def get_recent_issues(
    project_id: str, issues: dict[str, Any], states: dict[str, Any]
) -> list[str]:
    """
    Get top 10 recent non-completed/canceled issue titles for a project.

    Sorted by updatedAt descending. Includes issues without stateId (conservative).
    """

    def is_active(issue: dict[str, Any]) -> bool:
        state_id = issue.get("stateId")
        if not state_id:
            return True
        state = states.get(state_id, {})
        state_type = state.get("type", "")
        return state_type not in ("completed", "canceled")

    project_issues = [
        issue
        for issue in issues.values()
        if issue.get("projectId") == project_id and is_active(issue) and issue.get("title")
    ]

    sorted_issues = sorted(
        project_issues, key=lambda x: x.get("updatedAt", ""), reverse=True
    )

    return [issue["title"] for issue in sorted_issues[:10]]


def export_projects() -> dict[str, Any]:
    """Export all projects to JSON with recent issue titles."""
    projects_raw, teams, issues, states = load_linear_data()

    if not projects_raw:
        # No data found - return empty result
        return {
            "version": 2,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "projects": [],
        }

    cached_projects = []
    for project_id, project in projects_raw.items():
        team_id, team_name = get_team_info(project, teams)
        name = project.get("name", "")
        recent_issues = get_recent_issues(project_id, issues, states)

        cached_projects.append(
            {
                "id": project_id,
                "name": name,
                "teamId": team_id,
                "recentIssueTitles": recent_issues,
            }
        )

    result = {
        "version": 2,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "projects": cached_projects,
    }

    return result


def main():
    """Main entry point."""
    try:
        result = export_projects()
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback

        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
