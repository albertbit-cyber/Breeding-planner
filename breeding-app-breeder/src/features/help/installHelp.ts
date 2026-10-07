import { installHelpGuard } from './helpGuard';
import { helpStore } from './helpStore';

// Called once from index.jsx before React renders: the guard has to be the first
// window-capture listener so it runs ahead of everything the app adds later.
let uninstall: (() => void) | null = null;

export const installHelp = () => {
  if (uninstall || typeof window === 'undefined') return;
  uninstall = installHelpGuard(window, {
    isActive: () => helpStore.getState().mode,
    onExplain: explanation => helpStore.explain(explanation),
  });
};
