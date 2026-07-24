from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, Iterable, List
from urllib.parse import unquote

PROJECT_ROOT = Path(__file__).resolve().parent.parent
INDEX_PATH = PROJECT_ROOT / "docs" / "assets" / "json" / "exams-index.json"

VALID_LEVELS = {"free", "pro", "premium"}


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8-sig") as file_handle:
        return json.load(file_handle)


def save_json(path: Path, data: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file_handle:
        json.dump(data, file_handle, ensure_ascii=False, indent=2)


def resolve_docs_file(item: Dict[str, Any]) -> Path | None:
    file_value = str(item.get("file") or "").strip()
    if not file_value:
        return None

    decoded = unquote(file_value)
    return PROJECT_ROOT / "docs" / decoded


def resolve_source_file(item: Dict[str, Any]) -> Path | None:
    source_value = str(item.get("sourcePath") or "").strip()
    if not source_value:
        return None

    source_path = PROJECT_ROOT / source_value
    if source_path.exists():
        return source_path
    return None


def item_matches(item: Dict[str, Any], subject: str, partial: str, exam_uid_contains: str) -> bool:
    if subject and str(item.get("subject") or "") != subject:
        return False

    if partial and str(item.get("partial") or "") != partial:
        return False

    if exam_uid_contains and exam_uid_contains.lower() not in str(item.get("examUid") or "").lower():
        return False

    return True


def update_exam_file(path: Path, level: str, dry_run: bool) -> bool:
    if not path.exists():
        return False

    payload = load_json(path)
    if not isinstance(payload, dict):
        return False

    current = str(payload.get("accessLevel") or "free").strip().lower()
    if current == level:
        return False

    payload["accessLevel"] = level
    if not dry_run:
        save_json(path, payload)
    return True


def unique_paths(paths: Iterable[Path]) -> List[Path]:
    seen = set()
    output: List[Path] = []
    for path in paths:
        key = str(path.resolve()).lower()
        if key in seen:
            continue
        seen.add(key)
        output.append(path)
    return output


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Bulk assign accessLevel to exams in index and JSON payloads without creating duplicate paths."
    )
    parser.add_argument("--level", required=True, choices=sorted(VALID_LEVELS), help="Target access level")
    parser.add_argument("--subject", default="", help="Exact subject name to filter")
    parser.add_argument("--partial", default="", help="Exact partial name to filter")
    parser.add_argument("--exam-uid-contains", default="", help="Case-insensitive substring in examUid")
    parser.add_argument("--dry-run", action="store_true", help="Show changes without writing files")
    args = parser.parse_args()

    if not INDEX_PATH.exists():
        raise SystemExit(f"Index not found: {INDEX_PATH}")

    index_payload = load_json(INDEX_PATH)
    if not isinstance(index_payload, dict):
        raise SystemExit("Invalid index format")

    items = index_payload.get("items")
    if not isinstance(items, list):
        raise SystemExit("Invalid index format: items must be an array")

    matched = 0
    updated_index_items = 0
    updated_docs_files = 0
    updated_source_files = 0

    for item in items:
        if not isinstance(item, dict):
            continue

        if not item_matches(item, args.subject, args.partial, args.exam_uid_contains):
            continue

        matched += 1

        current_level = str(item.get("accessLevel") or "free").strip().lower()
        if current_level != args.level:
            item["accessLevel"] = args.level
            updated_index_items += 1

        paths = unique_paths(
            path
            for path in [resolve_docs_file(item), resolve_source_file(item)]
            if path is not None
        )

        for path in paths:
            changed = update_exam_file(path, args.level, args.dry_run)
            if not changed:
                continue

            if "/docs/" in path.as_posix() or "\\docs\\" in str(path):
                updated_docs_files += 1
            else:
                updated_source_files += 1

    if not args.dry_run and updated_index_items > 0:
        save_json(INDEX_PATH, index_payload)

    print(f"Matched exams: {matched}")
    print(f"Updated index items: {updated_index_items}")
    print(f"Updated docs exam files: {updated_docs_files}")
    print(f"Updated source exam files: {updated_source_files}")
    print(f"Dry run: {'yes' if args.dry_run else 'no'}")


if __name__ == "__main__":
    main()
