import type { HelpId } from './registry';

// Attach a topic to a control: <button {...help('nav-animals')}>. Put it on the control
// itself, or on the smallest wrapper that is the control (a card, a radio group).
export const help = (id: HelpId): { 'data-help': HelpId } => ({ 'data-help': id });

// Mark a tour target that is not a help topic: <div {...tour('main-nav')}>.
// Every id used here must be listed in tours/ownTargets.ts.
export const tour = (id: string): { 'data-tour': string } => ({ 'data-tour': id });
