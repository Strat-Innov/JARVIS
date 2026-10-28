/**
 * Demo suit data.
 *
 * FICTIONAL SAMPLE DATA: every value below is invented for party entertainment.
 * It is not real hardware telemetry. Edit it in the Workshop screen; changes persist in localStorage.
 */
import type { Suit } from '../types/jarvis';
import { durations } from '../utils/time';

export const PRIMARY_SUIT_ID = 'mark-43';

/** Builds the demo roster. Repair completion times are relative to `now` so the demo always counts down. */
export function createDemoSuits(now: number = Date.now()): Suit[] {
  const at = (hours: number, minutes: number) =>
    new Date(now + hours * durations.HOUR_MS + minutes * durations.MINUTE_MS).toISOString();

  return [
    {
      id: PRIMARY_SUIT_ID,
      name: 'Mark XLIII',
      designation: 'Mark XLIII',
      repairStatus: 'repairing',
      repairProgress: 68,
      repairCompletesAt: at(2, 40),
      powerLevel: 74,
      diagnosticStatus: 'warning',
      notes: 'Left repulsor recalibration and chest plate refit in progress.',
      fictional: true,
    },
    {
      id: 'mark-42',
      name: 'Mark XLII',
      designation: 'Mark XLII',
      repairStatus: 'operational',
      repairProgress: 100,
      repairCompletesAt: null,
      powerLevel: 91,
      diagnosticStatus: 'nominal',
      notes: 'Prehensile deployment system responding normally.',
      fictional: true,
    },
    {
      id: 'mark-44',
      name: 'Hulkbuster',
      designation: 'Mark XLIV',
      repairStatus: 'damaged',
      repairProgress: 35,
      repairCompletesAt: at(9, 15),
      powerLevel: 42,
      diagnosticStatus: 'critical',
      notes: 'Right gauntlet actuators require replacement.',
      fictional: true,
    },
    {
      id: 'mark-7',
      name: 'Mark VII',
      designation: 'Mark VII',
      repairStatus: 'offline',
      repairProgress: null,
      repairCompletesAt: null,
      powerLevel: null,
      diagnosticStatus: 'unknown',
      notes: 'In storage. No current telemetry on file.',
      fictional: true,
    },
  ];
}
