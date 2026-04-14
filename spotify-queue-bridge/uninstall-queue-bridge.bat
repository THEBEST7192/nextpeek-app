set EXT=%LOCALAPPDATA%\spicetify\Extensions\nextpeek-extension.js
echo Uninstalling NextPeek Extension...

if exist "%EXT%" del "%EXT%" >nul

runas /trustlevel:0x20000
spicetify config extensions nextpeek-extension.js-
spicetify apply

echo Done!
pause
