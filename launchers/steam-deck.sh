#!/usr/bin/env bash
# Steam Deck / SteamOS launcher. Add this file to Steam with "Add a Non-Steam Game".
# Put the arcade's web address in the shortcut's Launch Options to play the hosted
# copy; leave it empty to serve this folder from the device itself (works offline).
exec "$(dirname "${BASH_SOURCE[0]}")/arcade.sh" "$@"
