import { describe, it, expect } from 'vitest';
import { resolveCollapseView } from './pairingsViewReturn';

const fromDashboard = { pairingId: 'p1', view: 'dashboard' };

describe('resolveCollapseView', () => {
  it('returns to the dashboard when the dashboard opened this pairing', () => {
    expect(resolveCollapseView('active', fromDashboard, 'p1')).toBe('dashboard');
  });

  it('returns to the dashboard from a completed project too', () => {
    expect(resolveCollapseView('completed', fromDashboard, 'p1')).toBe('dashboard');
  });

  it('stays put when the keeper opened the view by hand', () => {
    expect(resolveCollapseView('active', null, 'p1')).toBe('active');
    expect(resolveCollapseView('completed', null, 'p1')).toBe('completed');
  });

  it('stays put when the pairing was opened from somewhere else', () => {
    expect(resolveCollapseView('active', { pairingId: 'p1', view: 'calendar' }, 'p1')).toBe('active');
  });

  it('does not let a different pairing inherit the return trip', () => {
    expect(resolveCollapseView('active', fromDashboard, 'p2')).toBe('active');
  });

  it('stays put when the collapsing card has no id to match', () => {
    expect(resolveCollapseView('active', fromDashboard, null)).toBe('active');
  });

  it('never bounces a view that has no expandable cards', () => {
    expect(resolveCollapseView('dashboard', fromDashboard, 'p1')).toBe('dashboard');
    expect(resolveCollapseView('incubator', fromDashboard, 'p1')).toBe('incubator');
  });
});
