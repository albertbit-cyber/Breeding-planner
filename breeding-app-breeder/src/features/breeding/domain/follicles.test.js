import { describe, it, expect } from 'vitest';
import {
  createExam,
  validateExam,
  comparableChange,
  latestMeasurement,
  latestChange,
  buildFollicleSeries,
  associateExamsWithCycle,
  relativeDay,
  setInterpretationOverride,
} from './follicles';
import { recordPairingSession, findActiveCycle } from './cycleModel';

const NOW = '2026-03-01T10:00:00.000Z';
const us = (date, mm, extra = {}) => createExam({ femaleId: 'F1', date, method: 'ultrasound', result: 'follicles_seen', largestDiameterMm: mm, ...extra }, { now: NOW });

describe('I. follicle entry', () => {
  it('accepts an exam with no measurement, an incomplete scan, attachments and extra measurements', () => {
    const exam = createExam({
      femaleId: 'F1',
      date: '2026-02-10',
      method: 'ultrasound',
      result: 'inconclusive',
      coverage: 'partial',
      attachments: [{ kind: 'image', name: 'scan.jpg', url: 'data:image/jpeg;base64,abc' }],
      measurements: [{ valueMm: 12.4, axis: 'length' }, { valueMm: 9, axis: 'width' }],
    }, { now: NOW });
    expect(exam.largestDiameterMm).toBeNull();
    expect(exam.coverage).toBe('partial');
    expect(exam.attachments).toHaveLength(1);
    expect(exam.measurements).toHaveLength(2);
  });

  it('an external observation cannot become a measured diameter; palpation values are estimates', () => {
    expect(validateExam({ femaleId: 'F1', date: '2026-02-10', method: 'external', largestDiameterMm: 20 })).toContain('external_cannot_measure');
    expect(() => createExam({ femaleId: 'F1', date: '2026-02-10', method: 'external', largestDiameterMm: 20 })).toThrow();
    const palpation = createExam({ femaleId: 'F1', date: '2026-02-10', method: 'palpation', result: 'follicles_seen', largestDiameterMm: 20 }, { now: NOW });
    expect(palpation.largestIsEstimate).toBe(true);
    expect(latestMeasurement([palpation])).toBeNull(); // default series is measured ultrasound
    expect(latestMeasurement([palpation], { method: 'palpation' })).toMatchObject({ valueMm: 20, isEstimate: true });
  });

  it('keeps not visualized distinct from zero and from confirmed absence', () => {
    const exam = createExam({ femaleId: 'F1', date: '2026-02-10', method: 'ultrasound', result: 'not_visualized' }, { now: NOW });
    expect(exam.largestDiameterMm).toBeNull();
    expect(exam.result).toBe('not_visualized');
    expect(validateExam({ femaleId: 'F1', date: '2026-02-10', largestDiameterMm: 0 })).toContain('diameter_must_be_positive');
    expect(validateExam({ femaleId: 'F1', date: '2026-02-10', visibleCount: -1 })).toContain('count_must_be_non_negative');
  });
});

describe('J. measured change and rate', () => {
  it('19 mm to 24 mm over 14 days shows +5 mm and about 0.36 mm/day', () => {
    const change = comparableChange(us('2026-02-01', 19), us('2026-02-15', 24));
    expect(change.comparable).toBe(true);
    expect(change.deltaMm).toBe(5);
    expect(change.days).toBe(14);
    expect(change.ratePerDay).toBeCloseTo(0.357, 2);
    expect(change.direction).toBe('higher');
    expect(change.suggestReview).toBe(false);
  });

  it('refuses zero-day intervals and incompatible methods or results', () => {
    expect(comparableChange(us('2026-02-01', 19), us('2026-02-01', 21))).toMatchObject({ comparable: false, reason: 'zero_day_interval' });
    const palpation = createExam({ femaleId: 'F1', date: '2026-02-15', method: 'palpation', result: 'follicles_seen', largestDiameterMm: 24 }, { now: NOW });
    expect(comparableChange(us('2026-02-01', 19), palpation)).toMatchObject({ comparable: false, reason: 'different_method' });
    const postOv = createExam({ femaleId: 'F1', date: '2026-03-01', method: 'ultrasound', result: 'post_ovulation', largestDiameterMm: 40 }, { now: NOW });
    expect(comparableChange(us('2026-02-15', 24), postOv)).toMatchObject({ comparable: false, reason: 'not_on_curve' });
    expect(buildFollicleSeries([us('2026-02-15', 24), postOv]).ultrasound).toHaveLength(1);
  });

  it('a lower measurement suggests review and never diagnoses; overrides need a reason and keep the scan', () => {
    const exams = [us('2026-02-01', 24), us('2026-02-20', 21)];
    const change = latestChange(exams);
    expect(change).toMatchObject({ direction: 'lower', suggestReview: true, deltaMm: -3 });
    expect(Object.keys(change)).not.toContain('diagnosis');
    expect(() => setInterpretationOverride(exams[1], { text: 'Measured on the other side', reason: '' })).toThrow(/reason/);
    const overridden = setInterpretationOverride(exams[1], { text: 'Different follicle measured', reason: 'Operator note' }, { now: NOW });
    expect(overridden.largestDiameterMm).toBe(21);
    expect(overridden.interpretationOverride.reason).toBe('Operator note');
  });
});

describe('H. pre-pairing scans', () => {
  it('a scan before the first pairing links to the later cycle without moving the cycle start', () => {
    const scan = us('2026-01-15', 14);
    expect(findActiveCycle([], 'F1')).toBeNull(); // the scan started nothing
    const state = recordPairingSession([], { femaleId: 'F1', maleId: 'M1', introductionDate: '2026-03-01', sessionId: 's1' }, { now: NOW });
    expect(state.cycle.startDate).toBe('2026-03-01');
    const { exams, associated } = associateExamsWithCycle([scan], state.cycle, { now: NOW });
    expect(associated).toEqual([scan.id]);
    expect(exams[0].cycleId).toBe(state.cycle.id);
    expect(exams[0].date).toBe('2026-01-15');
    expect(state.cycle.startDate).toBe('2026-03-01');
    expect(relativeDay(exams[0], state.cycle)).toBe(-45);
  });

  it('does not pull scans from before a previous closed cycle', () => {
    const old = us('2025-01-10', 12);
    const state = recordPairingSession([], { femaleId: 'F1', maleId: 'M1', introductionDate: '2026-03-01', sessionId: 's1' }, { now: NOW });
    const { associated } = associateExamsWithCycle([old], state.cycle, { previousCycleEnd: '2025-09-01', now: NOW });
    expect(associated).toEqual([]);
  });
});
