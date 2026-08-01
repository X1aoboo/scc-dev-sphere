#!/usr/bin/env bash

devsphere_path_sourced=false
[[ "${BASH_SOURCE[0]}" != "$0" ]] && devsphere_path_sourced=true

if ! devsphere_path_script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"; then
  printf '%s\n' 'Unable to resolve the setup script directory.' >&2
  if [[ "${devsphere_path_sourced}" == true ]]; then return 1; else exit 1; fi
fi
if ! devsphere_path_bin_dir="$(cd -- "${devsphere_path_script_dir}/../bin" && pwd -P)"; then
  printf '%s\n' 'Unable to resolve the plugin bin directory.' >&2
  if [[ "${devsphere_path_sourced}" == true ]]; then return 1; else exit 1; fi
fi
if [[ ! -x "${devsphere_path_bin_dir}/devsphere" ]]; then
  printf 'devsphere launcher is missing or not executable: %s\n' "${devsphere_path_bin_dir}/devsphere" >&2
  if [[ "${devsphere_path_sourced}" == true ]]; then return 1; else exit 1; fi
fi

if [[ "${devsphere_path_sourced}" == true ]]; then
  case ":${PATH-}:" in
    *":${devsphere_path_bin_dir}:"*) ;;
    *) export PATH="${devsphere_path_bin_dir}${PATH:+:${PATH}}" ;;
  esac
  unset devsphere_path_sourced devsphere_path_script_dir devsphere_path_bin_dir
  return 0
fi

if [[ "${1-}" == "--env-file" ]]; then
  if [[ -z "${2-}" || -n "${3-}" ]]; then
    printf 'Usage: %s --env-file <path>\n' "$0" >&2
    exit 1
  fi
  devsphere_path_env_file="$2"
  {
    printf 'DEVSPHERE_BIN=%q\n' "${devsphere_path_bin_dir}"
    printf 'case ":${PATH-}:" in *":${DEVSPHERE_BIN}:"*) ;; *) export PATH="${DEVSPHERE_BIN}${PATH:+:${PATH}}" ;; esac\n'
    printf 'unset DEVSPHERE_BIN\n'
  } >> "${devsphere_path_env_file}" || exit 1
  exit 0
fi

printf '%s\n' 'This script cannot modify its parent process when executed directly.' >&2
printf 'Use: source %q\n' "$0" >&2
printf 'Or:  %q --env-file <host-session-env-file>\n' "$0" >&2
exit 1
