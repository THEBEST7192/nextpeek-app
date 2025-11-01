#!/bin/bash
set -e
EXT="$HOME/.config/spicetify/Extensions/spotify-queue-bridge.js"
echo "Installing Spotify Queue Bridge..."

cp spotify-queue-bridge.js "$EXT"
spicetify config extensions spotify-queue-bridge.js
spicetify apply

echo "Done!"
