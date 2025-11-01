set EXT=%LOCALAPPDATA%\spicetify\Extensions\spotify-queue-bridge.js
echo Installing Spotify Queue Bridge...

copy spotify-queue-bridge.js "%EXT%" >nul

runas /trustlevel:0x20000
spicetify config extensions spotify-queue-bridge.js
spicetify apply

echo Done!
pause
