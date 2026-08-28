#!/bin/sh
# Supplies the Git credential over stdout so it never lands in .git/config,
# process arguments, or the workspace Hermes can read.
case "$1" in
  Username*) printf 'x-access-token\n' ;;
  Password*) printf '%s\n' "$GITHUB_TOKEN" ;;
esac
