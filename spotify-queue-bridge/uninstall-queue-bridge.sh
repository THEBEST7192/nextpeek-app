#!/bin/bash
set -e
EXT="$HOME/.config/spicetify/Extensions/nextpeek-extension.js"
echo "Uninstalling NextPeek Extension..."

rm -f "$EXT"
spicetify config extensions nextpeek-extension.js-
spicetify apply

echo "Done!"
