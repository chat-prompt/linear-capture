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


def is_user_record(record: dict[str, Any]) -> bool:
    """Check if a record looks like a Linear user."""
    return {"name", "email", "id"}.issubset(record.keys()) and isinstance(record.get("email"), str)


def is_cycle_record(record: dict[str, Any]) -> bool:
    """Check if a record looks like a Linear cycle."""
    return {"number", "startsAt", "endsAt", "teamId"}.issubset(record.keys())


def is_label_record(record: dict[str, Any]) -> bool:
    """Check if a record looks like a Linear issue label."""
    if not {"name", "color", "isGroup", "id"}.issubset(record.keys()):
        return False
    color = record.get("color", "")
    return isinstance(color, str) and color.startswith("#") and len(color) <= 10


def load_linear_data() -> tuple[dict, dict, dict, dict, dict, dict, dict]:
    """
    Load projects, teams, issues, states, users, cycles, and labels from Linear IndexedDB.

    Returns: (projects, teams, issues, states, users, cycles, labels)
    """
    setup_pythonpath()
    try:
        from ccl_chromium_reader import ccl_chromium_indexeddb  # type: ignore
    except ImportError as e:
        print(f"Error: Failed to import ccl_chromium_reader: {e}", file=sys.stderr)
        sys.exit(1)

    _empty = {}, {}, {}, {}, {}, {}, {}

    if not os.path.exists(LINEAR_DB_PATH):
        return _empty

    try:
        wrapper = ccl_chromium_indexeddb.WrappedIndexDB(LINEAR_DB_PATH, LINEAR_BLOB_PATH)
    except Exception as e:
        print(f"Error: Failed to open IndexedDB: {e}", file=sys.stderr)
        return _empty

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
        return _empty

    if not db:
        return _empty

    projects: dict[str, dict] = {}
    teams: dict[str, dict] = {}
    issues: dict[str, dict] = {}
    states: dict[str, dict] = {}
    users: dict[str, dict] = {}
    cycles: dict[str, dict] = {}
    labels: dict[str, dict] = {}

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
                elif is_user_record(first_record):
                    for record in store.iterate_records():
                        if isinstance(record.value, dict) and record.value.get("id"):
                            users[record.value["id"]] = record.value
                elif is_cycle_record(first_record):
                    for record in store.iterate_records():
                        if isinstance(record.value, dict) and record.value.get("id"):
                            cycles[record.value["id"]] = record.value
                elif is_label_record(first_record):
                    for record in store.iterate_records():
                        if isinstance(record.value, dict) and record.value.get("id"):
                            labels[record.value["id"]] = record.value

            except Exception:
                continue

    except Exception as e:
        print(f"Error: Failed to iterate object stores: {e}", file=sys.stderr)
        return _empty

    return projects, teams, issues, states, users, cycles, labels


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


def export_all() -> dict[str, Any]:
    """Export all 6 data types from Linear IndexedDB as version 3 JSON."""
    projects_raw, teams_raw, issues_raw, states_raw, users_raw, cycles_raw, labels_raw = (
        load_linear_data()
    )

    now = datetime.now(timezone.utc).isoformat()

    cached_teams = []
    teams_has_estimation = False
    for team in teams_raw.values():
        entry = {
            "id": team.get("id", ""),
            "name": team.get("name", ""),
            "key": team.get("key", ""),
            "issueEstimationType": team.get("issueEstimationType", "fibonacci"),
            "issueEstimationAllowZero": team.get("issueEstimationAllowZero", False),
            "issueEstimationExtended": team.get("issueEstimationExtended", False),
        }
        if "issueEstimationType" in team:
            teams_has_estimation = True
        cached_teams.append(entry)

    cached_projects = []
    for project_id, project in projects_raw.items():
        recent_issues = get_recent_issues(project_id, issues_raw, states_raw)
        cached_projects.append({
            "id": project_id,
            "name": project.get("name", ""),
            "teamIds": project.get("teamIds", []),
            "statusId": project.get("statusId", ""),
            "description": project.get("description", ""),
            "recentIssueTitles": recent_issues,
        })

    cached_users = []
    for user in users_raw.values():
        entry = {
            "id": user.get("id", ""),
            "name": user.get("name", ""),
            "email": user.get("email", ""),
        }
        if user.get("avatarUrl"):
            entry["avatarUrl"] = user["avatarUrl"]
        if user.get("displayName"):
            entry["displayName"] = user["displayName"]
        cached_users.append(entry)

    cached_states = []
    for state in states_raw.values():
        cached_states.append({
            "id": state.get("id", ""),
            "name": state.get("name", ""),
            "type": state.get("type", ""),
            "color": state.get("color", ""),
            "teamId": state.get("teamId", ""),
        })

    cached_cycles = []
    for cycle in cycles_raw.values():
        ends_at = cycle.get("endsAt", "")
        if ends_at and ends_at > now:
            cached_cycles.append({
                "id": cycle.get("id", ""),
                "number": cycle.get("number", 0),
                "startsAt": cycle.get("startsAt", ""),
                "endsAt": ends_at,
                "teamId": cycle.get("teamId", ""),
            })

    cached_labels = []
    for label in labels_raw.values():
        cached_labels.append({
            "id": label.get("id", ""),
            "name": label.get("name", ""),
            "color": label.get("color", ""),
            "isGroup": label.get("isGroup", False),
        })

    sample_label_keys = set()
    if labels_raw:
        sample_label_keys = set(next(iter(labels_raw.values())).keys())

    sample_cycle_keys = set()
    if cycles_raw:
        sample_cycle_keys = set(next(iter(cycles_raw.values())).keys())

    sample_project_keys = set()
    if projects_raw:
        sample_project_keys = set(next(iter(projects_raw.values())).keys())

    return {
        "version": 3,
        "updatedAt": now,
        "teams": cached_teams,
        "projects": cached_projects,
        "users": cached_users,
        "states": cached_states,
        "cycles": cached_cycles,
        "labels": cached_labels,
        "issues": [],
        "_meta": {
            "exportedAt": now,
            "teams_found": bool(teams_raw),
            "projects_found": bool(projects_raw),
            "users_found": bool(users_raw),
            "states_found": bool(states_raw),
            "cycles_found": bool(cycles_raw),
            "labels_found": bool(labels_raw),
            "teams_has_estimation_fields": teams_has_estimation,
            "projects_has_state_field": "state" in sample_project_keys,
            "labels_has_team_id": "teamId" in sample_label_keys,
            "labels_has_parent_id": "parentId" in sample_label_keys,
            "cycles_has_name": "name" in sample_cycle_keys,
        },
    }


def export_projects() -> dict[str, Any]:
    """Deprecated: Use export_all() instead."""
    return export_all()


def discover_stores() -> dict[str, Any]:
    """
    Discover all object stores in Linear IndexedDB with field-level detail.

    Returns JSON with store info including sample keys, sample record, and
    analysis of critical fields needed for cache integration.
    """
    setup_pythonpath()
    try:
        from ccl_chromium_reader import ccl_chromium_indexeddb  # type: ignore
    except ImportError as e:
        print(f"Error: Failed to import ccl_chromium_reader: {e}", file=sys.stderr)
        return {"stores": [], "error": str(e)}

    if not os.path.exists(LINEAR_DB_PATH):
        return {"stores": [], "note": "Linear Desktop App not installed"}

    try:
        wrapper = ccl_chromium_indexeddb.WrappedIndexDB(LINEAR_DB_PATH, LINEAR_BLOB_PATH)
    except Exception as e:
        print(f"Error: Failed to open IndexedDB: {e}", file=sys.stderr)
        return {"stores": [], "error": str(e)}

    db = None
    try:
        for db_id in wrapper.database_ids:
            if "linear_" in db_id.name and db_id.name != "linear_databases":
                candidate = wrapper[db_id.name, db_id.origin]
                if list(candidate.object_store_names):
                    db = candidate
                    break
    except Exception as e:
        return {"stores": [], "error": f"Failed to find Linear database: {e}"}

    if not db:
        return {"stores": [], "note": "No Linear database found"}

    stores_info: list[dict[str, Any]] = []

    try:
        for store_name in db.object_store_names:
            if store_name is None or store_name.startswith("_") or "_partial" in store_name:
                continue

            store_data: dict[str, Any] = {
                "name": store_name,
                "sample_keys": [],
                "sample_record": None,
                "record_count_estimate": 0,
                "detected_type": None,
            }

            try:
                store = db[store_name]
                count = 0
                first_record = None

                for record in store.iterate_records():
                    val = record.value
                    if not isinstance(val, dict):
                        break
                    if first_record is None:
                        first_record = val
                    count += 1

                store_data["record_count_estimate"] = count

                if first_record:
                    store_data["sample_keys"] = sorted(list(first_record.keys()))
                    sanitized = {}
                    for k, v in first_record.items():
                        if isinstance(v, str) and len(v) > 100:
                            sanitized[k] = v[:100] + "..."
                        elif isinstance(v, list) and len(v) > 5:
                            sanitized[k] = v[:5]
                        else:
                            sanitized[k] = v
                    store_data["sample_record"] = sanitized

                    if is_project_record(first_record):
                        store_data["detected_type"] = "project"
                    elif is_team_record(first_record):
                        store_data["detected_type"] = "team"
                    elif is_issue_record(first_record):
                        store_data["detected_type"] = "issue"
                    elif is_workflow_state_record(first_record):
                        store_data["detected_type"] = "workflow_state"
                    elif _is_user_like(first_record):
                        store_data["detected_type"] = "user"
                    elif _is_cycle_like(first_record):
                        store_data["detected_type"] = "cycle"
                    elif _is_label_like(first_record):
                        store_data["detected_type"] = "label"

            except Exception:
                store_data["error"] = "Failed to read store"

            stores_info.append(store_data)

    except Exception as e:
        return {"stores": stores_info, "error": f"Failed to iterate stores: {e}"}

    field_analysis: dict[str, Any] = {}
    for store in stores_info:
        dtype = store.get("detected_type")
        keys = store.get("sample_keys", [])
        if dtype == "team":
            field_analysis["teams_has_estimation_fields"] = all(
                f in keys for f in ["issueEstimationType", "issueEstimationAllowZero", "issueEstimationExtended"]
            )
        elif dtype == "project":
            field_analysis["projects_has_state_field"] = "state" in keys
            field_analysis["projects_has_statusId"] = "statusId" in keys
        elif dtype == "label":
            field_analysis["labels_has_team_id"] = "teamId" in keys
            field_analysis["labels_has_parent_id"] = "parentId" in keys
        elif dtype == "cycle":
            field_analysis["cycles_has_team_id"] = "teamId" in keys
            field_analysis["cycles_has_name"] = "name" in keys
        elif dtype == "user":
            field_analysis["users_has_email"] = "email" in keys

    return {
        "stores": stores_info,
        "field_analysis": field_analysis,
        "detected_types": [s["detected_type"] for s in stores_info if s.get("detected_type")],
    }


def _is_user_like(record: dict[str, Any]) -> bool:
    """Heuristic: record has name + email → likely a user."""
    return {"name", "email"}.issubset(record.keys()) and isinstance(record.get("email"), str)


def _is_cycle_like(record: dict[str, Any]) -> bool:
    """Heuristic: record has number + startsAt + endsAt → likely a cycle."""
    return {"number", "startsAt", "endsAt"}.issubset(record.keys())


def _is_label_like(record: dict[str, Any]) -> bool:
    """Heuristic: record has name + color + isGroup → likely an issue label."""
    if not {"name", "color", "isGroup"}.issubset(record.keys()):
        return False
    color = record.get("color", "")
    if not isinstance(color, str):
        return False
    return color.startswith("#") and len(color) <= 10


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Export Linear data from local IndexedDB cache")
    parser.add_argument(
        "--discover",
        action="store_true",
        help="Discover IndexedDB structure with field-level detail (does not export data)",
    )
    args = parser.parse_args()

    try:
        if args.discover:
            result = discover_stores()
        else:
            result = export_all()
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback

        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
