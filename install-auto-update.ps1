# Registers a Windows scheduled task that publishes usage data every 5 minutes.
# Remove it with: Unregister-ScheduledTask -TaskName "Claude usage auto-update" -Confirm:$false
$name = "Claude usage auto-update"
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$PSScriptRoot\auto-update.vbs`"" -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 4)
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings `
  -Description "Publishes Claude usage data to github.com/tanyagrr/claude-usage" -Force | Out-Null
Write-Output "Installed '$name' (every 5 minutes)."
