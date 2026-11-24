#!/bin/bash
set -eu

tool="$1"
shift
folder="$STAND_IN"
{
  printf '%s' "$tool"
  printf '\037%s' "$@"
  printf '\036'
} >>"$folder/calls"

count() {
  local file="$folder/count-$1" value=0
  if [ -f "$file" ]; then
    read -r value <"$file"
  fi
  echo $((value + 1)) >"$file"
  counted=$value
}

line_at() {
  local index=0 item
  found=""
  while IFS= read -r item || [ -n "$item" ]; do
    found="$item"
    if [ "$index" -eq "$2" ]; then
      return
    fi
    index=$((index + 1))
  done <"$1"
}

stand_in_aws() {
  local service="$1" action="$2" parameters="" command="" query="" kind unclaimed=0
  shift 2
  while [ $# -gt 0 ]; do
    case "$1" in
      --parameters) parameters="$2" ;;
      --command-id) command="$2" ;;
      --query) query="$2" ;;
    esac
    shift
  done
  if [ "$service" != ssm ]; then
    echo "the stand-in knows no aws $service" >&2
    exit 2
  fi
  if [ -f "$folder/denied" ]; then
    echo "An error occurred (AccessDeniedException) when calling the $action operation" >&2
    exit 254
  fi
  if [ "$action" = send-command ]; then
    kind="${parameters#*\"action\":[\"}"
    echo "cmd-${kind%%\"*}"
    return
  fi
  kind="${command#cmd-}"
  case "$action" in
    list-command-invocations)
      count "list-$kind"
      read -r unclaimed <"$folder/command-$kind-unclaimed"
      if [ "$counted" -lt "$unclaimed" ]; then
        echo None
      else
        echo i-0123456789abcdef0
      fi
      ;;
    get-command-invocation)
      if [ "$query" = Status ]; then
        count "status-$kind"
        line_at "$folder/command-$kind-statuses" "$counted"
        case "$found" in
          error:*)
            echo "An error occurred (${found#error:}) when calling the GetCommandInvocation operation" >&2
            exit 254
            ;;
        esac
        echo "$found"
      else
        cat "$folder/command-$kind-output"
        echo
      fi
      ;;
    *)
      echo "the stand-in knows no aws ssm $action" >&2
      exit 2
      ;;
  esac
}

stand_in_docker() {
  local real name value digest=""
  case "$1 ${2:-}" in
    "compose "*)
      read -r real <"$folder/docker"
      exec "$real" "$@"
      ;;
    "buildx imagetools")
      while read -r name value; do
        if [ "$name" = "$4" ]; then
          digest="$value"
        fi
      done <"$folder/digests"
      if [ -z "$digest" ]; then
        echo "ERROR: $4: not found" >&2
        exit 1
      fi
      printf '{"mediaType":"application/vnd.oci.image.index.v1+json","digest":"%s"}\n' "$digest"
      ;;
    "buildx build")
      if [ -f "$folder/build-fails" ]; then
        echo "ERROR: failed to build" >&2
        exit 1
      fi
      ;;
    *)
      echo "the stand-in knows no docker $*" >&2
      exit 2
      ;;
  esac
}

stand_in_gh() {
  local subject="${3#oci://}" item
  while IFS= read -r item; do
    if [ "$item" = "$subject" ]; then
      echo "Loaded 1 attestation from GitHub API"
      return
    fi
  done <"$folder/attested"
  echo "Error: failed to fetch attestations for subject: $subject" >&2
  exit 1
}

stand_in_curl() {
  local total index status
  count curl
  read -r total <"$folder/health-count"
  index=$counted
  if [ "$index" -ge "$total" ]; then
    index=$((total - 1))
  fi
  read -r status <"$folder/health-$index-status"
  if [ "$status" = 0 ]; then
    echo "curl: (28) Operation timed out after 5001 milliseconds" >&2
    exit 28
  fi
  if [ "$status" -ge 400 ]; then
    echo "curl: (22) The requested URL returned error: $status" >&2
    exit 22
  fi
  cat "$folder/health-$index-body"
}

case "$tool" in
  aws | docker | gh | curl) "stand_in_$tool" "$@" ;;
  *)
    echo "the stand-in knows no $tool" >&2
    exit 2
    ;;
esac
