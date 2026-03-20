!include "LogicLib.nsh"
!include "StrFunc.nsh"

# Prompt user to close the app before continuing an upgrade install.
!macro customInit
upgradeCheck:
  nsExec::ExecToStack 'tasklist /FI "IMAGENAME eq Breeding Planner.exe" /NH'
  Pop $1
  Pop $2

  ${StrStr} $3 $2 "Breeding Planner.exe"
  StrCmp $3 "" done

  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Breeding Planner is currently running. Please close it before continuing the install." IDRETRY upgradeCheck IDCANCEL cancelInstall

cancelInstall:
  Abort

done:
!macroend
