' Runs auto-update.ps1 without flashing a console window.
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "powershell -NoProfile -ExecutionPolicy Bypass -File """ & dir & "\auto-update.ps1""", 0, True
