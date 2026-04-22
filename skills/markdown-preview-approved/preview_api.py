#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


DEFAULT_BASE_URL = "http://localhost:3180"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Call the TalkAnnotate preview service without writing ad-hoc scripts.",
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"Preview service base URL (default: {DEFAULT_BASE_URL})",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("documents")

    document_parser = subparsers.add_parser("document")
    document_parser.add_argument("--id", required=True)
    document_parser.add_argument("--version", type=int)

    versions_parser = subparsers.add_parser("versions")
    versions_parser.add_argument("--id", required=True)

    annotations_parser = subparsers.add_parser("annotations")
    annotations_parser.add_argument("--id", required=True)
    annotations_parser.add_argument("--version", type=int)

    publish_parser = subparsers.add_parser("publish")
    publish_parser.add_argument("--title", required=True)
    publish_parser.add_argument("--id")
    add_text_source_args(publish_parser)

    changelog_parser = subparsers.add_parser("set-changelog")
    changelog_parser.add_argument("--id", required=True)
    changelog_parser.add_argument("--version", type=int, required=True)
    add_text_source_args(changelog_parser)

    args = parser.parse_args()

    try:
        if args.command == "documents":
            payload = request_json(args.base_url, "/api/documents")
        elif args.command == "document":
            payload = request_json(
                args.base_url,
                build_path(f"/api/documents/{args.id}/content", args.version),
            )
        elif args.command == "versions":
            payload = request_json(args.base_url, f"/api/documents/{args.id}/versions")
        elif args.command == "annotations":
            payload = request_json(
                args.base_url,
                build_path(f"/api/documents/{args.id}/annotations", args.version),
            )
        elif args.command == "publish":
            content = read_text_input(args)
            body = {
                "title": args.title,
                "content": content,
            }
            if args.id:
                body["id"] = args.id
            payload = request_json(
                args.base_url,
                "/api/documents",
                method="POST",
                body=body,
            )
        else:
            change_log = read_text_input(args)
            payload = request_json(
                args.base_url,
                f"/api/documents/{args.id}/versions/{args.version}/change-log",
                method="PUT",
                body={"changeLog": change_log},
            )
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        return 1

    json.dump(payload, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


def add_text_source_args(parser: argparse.ArgumentParser) -> None:
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--text")
    group.add_argument("--file", type=Path)


def build_path(pathname: str, version: int | None) -> str:
    if version is None:
        return pathname

    return f"{pathname}?{urllib.parse.urlencode({'version': version})}"


def read_text_input(args: argparse.Namespace) -> str:
    if args.text is not None:
        return args.text

    return args.file.read_text(encoding="utf-8")


def request_json(
    base_url: str,
    path: str,
    *,
    method: str = "GET",
    body: dict[str, object] | None = None,
) -> object:
    url = f"{base_url.rstrip('/')}{path}"
    data = None if body is None else json.dumps(body).encode("utf-8")

    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method=method,
    )

    try:
        with urllib.request.urlopen(request) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        payload = error.read().decode("utf-8", errors="replace")
        message = payload
        try:
            parsed = json.loads(payload)
            if isinstance(parsed, dict) and isinstance(parsed.get("message"), str):
                message = parsed["message"]
        except json.JSONDecodeError:
            pass

        raise RuntimeError(f"Request failed ({error.code}): {message}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Request failed: {error.reason}") from error


if __name__ == "__main__":
    raise SystemExit(main())
