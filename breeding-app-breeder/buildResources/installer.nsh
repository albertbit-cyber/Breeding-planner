!include "LogicLib.nsh"

; Prompt user to close the app before continuing installation/upgrade.
!macro customInit
upgradeCheck:
  nsExec::ExecToStack 'cmd /C tasklist /FI "IMAGENAME eq Serpentora.exe" /NH ^| find /I "Serpentora.exe"'
  Pop $1
  Pop $2

  StrCmp $1 "0" running done

running:

  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Serpentora is currently running. Please close it before continuing the install." IDRETRY upgradeCheck IDCANCEL cancelInstall

cancelInstall:
  Abort

done:
!macroend
