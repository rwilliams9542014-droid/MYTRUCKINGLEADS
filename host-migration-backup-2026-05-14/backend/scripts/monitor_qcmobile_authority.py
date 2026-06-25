#!/usr/bin/env python3
"""
Monitor known USDOT numbers through the FMCSA QCMobile authority endpoint.

This is intentionally standalone while the data source is being validated.
It does not replace the bulk insurance cancellation feed.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from typing import Any


BASE_URL = "https://mobile.fmcsa.dot.gov/qc/services"
DEFAULT_TIMEOUT_SECONDS = 20


def normalize_dot(value: Any) -> str:
    digits = re.sub(r"\D", "", str(value or ""))
    if not digits:
        return ""
    normalized = str(int(digits))
    return "" if normalized == "0" else normalized


def read_dot_numbers(path: str) -> list[str]:
    dots: list[str] = []
    seen: set[str] = set()

    with open(path, newline="", encoding="utf-8-sig") as handle:
        sample = handle.read(4096)
        handle.seek(0)
        has_header = csv.Sniffer().has_header(sample) if sample.strip() else False
        reader = csv.DictReader(handle) if has_header else csv.reader(handle)

        if has_header:
            for row in reader:
                raw = (
                    row.get("dot_number")
                    or row.get("dotNumber")
                    or row.get("usdot")
                    or row.get("USDOT")
                    or next((value for value in row.values() if normalize_dot(value)), "")
                )
                dot = normalize_dot(raw)
                if dot and dot not in seen:
                    seen.add(dot)
                    dots.append(dot)
        else:
            for row in reader:
                if not row:
                    continue
                dot = normalize_dot(row[0])
                if dot and dot not in seen:
                    seen.add(dot)
                    dots.append(dot)

    return dots


def find_first_value(node: Any, patterns: list[str]) -> str:
    if isinstance(node, dict):
        for key, value in node.items():
            normalized_key = re.sub(r"[^a-z0-9]", "", str(key).lower())
            if any(pattern in normalized_key for pattern in patterns):
                if value is not None and not isinstance(value, (dict, list)):
                    return str(value).strip()
            nested = find_first_value(value, patterns)
            if nested:
                return nested
    elif isinstance(node, list):
        for item in node:
            nested = find_first_value(item, patterns)
            if nested:
                return nested
    return ""


def collect_matching_values(node: Any, patterns: list[str]) -> dict[str, str]:
    matches: dict[str, str] = {}

    def walk(value: Any, prefix: str = "") -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                path = f"{prefix}.{key}" if prefix else str(key)
                normalized_key = re.sub(r"[^a-z0-9]", "", str(key).lower())
                if any(pattern in normalized_key for pattern in patterns):
                    if child is not None and not isinstance(child, (dict, list)):
                        matches[path] = str(child).strip()
                walk(child, path)
        elif isinstance(value, list):
            for index, child in enumerate(value):
                walk(child, f"{prefix}[{index}]")

    walk(node)
    return matches


def parse_authority_payload(dot_number: str, payload: Any) -> dict[str, Any]:
    authority_status = find_first_value(payload, ["authoritystatus", "operatingauthoritystatus", "status"])
    operating_status = find_first_value(payload, ["operatingstatus"])
    allow_to_operate = find_first_value(payload, ["allowtooperate", "allowedtooperate"])
    out_of_service = find_first_value(payload, ["outofservice", "oosstatus"])
    out_of_service_date = find_first_value(payload, ["outofservicedate", "oosdate"])
    insurance_matches = collect_matching_values(
        payload,
        ["insurance", "policy", "cancel", "cancellation", "effective", "filing"],
    )

    status_text = " ".join([
        authority_status,
        operating_status,
        allow_to_operate,
        out_of_service,
    ]).lower()

    allow_text = str(allow_to_operate).strip().lower()
    oos_text = str(out_of_service).strip().lower()

    flagged_reasons: list[str] = []
    if allow_text in {"false", "no", "n", "0"}:
        flagged_reasons.append("not allowed to operate")
    if any(term in status_text for term in ["inactive", "revoked", "suspended", "not authorized"]):
        flagged_reasons.append("authority/operating status is not active")
    if oos_text in {"true", "yes", "y", "1"} or "out-of-service" in status_text or "out of service" in status_text:
        flagged_reasons.append("out-of-service status present")
    if out_of_service_date:
        flagged_reasons.append("out-of-service date present")
    if insurance_matches:
        flagged_reasons.append("authority payload contains insurance/filing-related fields")

    return {
        "dot_number": dot_number,
        "authority_status": authority_status,
        "operating_status": operating_status,
        "allow_to_operate": allow_to_operate,
        "out_of_service_status": out_of_service,
        "out_of_service_date": out_of_service_date,
        "insurance_related_fields": insurance_matches,
        "flagged": bool(flagged_reasons),
        "flagged_reasons": flagged_reasons,
    }


def fetch_authority(dot_number: str, webkey: str, timeout: int) -> tuple[dict[str, Any] | None, str | None]:
    try:
        import requests
    except ImportError:
        return None, "missing Python package: requests"

    url = f"{BASE_URL}/carriers/{dot_number}/authority"
    try:
        response = requests.get(
            url,
            params={"webKey": webkey},
            headers={"Accept": "application/json"},
            timeout=timeout,
        )
    except requests.Timeout:
        return None, "timeout"
    except requests.RequestException as exc:
        return None, f"request_error: {exc}"

    if response.status_code == 404:
        return None, "not_found"
    if response.status_code in {400, 401, 403}:
        return None, f"{response.status_code}: invalid request, invalid DOT, or unauthorized webkey"
    if response.status_code >= 500:
        return None, f"{response.status_code}: FMCSA server error"
    if not response.ok:
        return None, f"{response.status_code}: {response.text[:200]}"

    try:
        return response.json(), None
    except ValueError:
        return None, "invalid_json"


def write_csv(path: str, rows: list[dict[str, Any]]) -> None:
    fieldnames = [
        "dot_number",
        "flagged",
        "flagged_reasons",
        "authority_status",
        "operating_status",
        "allow_to_operate",
        "out_of_service_status",
        "out_of_service_date",
        "error",
        "checked_at",
    ]
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({
                **{field: row.get(field, "") for field in fieldnames},
                "flagged_reasons": "; ".join(row.get("flagged_reasons") or []),
            })


def main() -> int:
    parser = argparse.ArgumentParser(description="Monitor QCMobile authority status for known USDOT numbers.")
    parser.add_argument("input", help="CSV or text file containing USDOT numbers.")
    parser.add_argument("--webkey", default=os.getenv("FMCSA_WEBKEY"), help="FMCSA WebKey. Defaults to FMCSA_WEBKEY env var.")
    parser.add_argument("--output", default="qcmobile_authority_monitor_results.csv", help="CSV output path.")
    parser.add_argument("--json-output", default="", help="Optional JSON output path with raw parsed details.")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_SECONDS, help="HTTP timeout in seconds.")
    parser.add_argument("--delay", type=float, default=0.25, help="Delay between API calls in seconds.")
    args = parser.parse_args()

    if not args.webkey:
        print("Missing webkey. Set FMCSA_WEBKEY or pass --webkey.", file=sys.stderr)
        return 2

    dot_numbers = read_dot_numbers(args.input)
    if not dot_numbers:
        print("No valid USDOT numbers found.", file=sys.stderr)
        return 2

    checked_at = datetime.now(timezone.utc).isoformat()
    results: list[dict[str, Any]] = []

    for index, dot_number in enumerate(dot_numbers, start=1):
        payload, error = fetch_authority(dot_number, args.webkey, args.timeout)
        if error:
            row = {
                "dot_number": dot_number,
                "flagged": False,
                "flagged_reasons": [],
                "error": error,
                "checked_at": checked_at,
            }
        else:
            row = {
                **parse_authority_payload(dot_number, payload),
                "error": "",
                "checked_at": checked_at,
            }
        results.append(row)

        status = "FLAGGED" if row.get("flagged") else "ok"
        if row.get("error"):
            status = f"error: {row['error']}"
        print(f"[{index}/{len(dot_numbers)}] DOT {dot_number}: {status}")
        if args.delay > 0 and index < len(dot_numbers):
            time.sleep(args.delay)

    write_csv(args.output, results)
    if args.json_output:
        with open(args.json_output, "w", encoding="utf-8") as handle:
            json.dump(results, handle, indent=2)

    flagged = sum(1 for row in results if row.get("flagged"))
    errors = sum(1 for row in results if row.get("error"))
    print(f"Done. Checked {len(results)} DOTs, flagged {flagged}, errors {errors}.")
    print(f"CSV written to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
