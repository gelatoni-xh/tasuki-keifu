import assert from 'node:assert/strict';
import test from 'node:test';
import { compareRaceUnits, formatCompetitionDate } from './competition-display';

test('relay legs follow numeric course order even when later legs are shorter', () => {
  const races = [
    { name: '4区', discipline: 'ekiden_leg', leg: 4, distanceMeters: 11800 },
    { name: '3区', discipline: 'ekiden_leg', leg: 3, distanceMeters: 11900 },
    { name: '2区', discipline: 'ekiden_leg', leg: 2, distanceMeters: 11100 },
    { name: '1区', discipline: 'ekiden_leg', leg: 1, distanceMeters: 9500 },
    { name: '10区', discipline: 'ekiden_leg', leg: 10, distanceMeters: 10000 },
  ];
  assert.deepEqual(races.sort(compareRaceUnits).map(r => r.leg), [1, 2, 3, 4, 10]);
});

test('Izumo starts with leg 1 despite leg 2 being shorter', () => {
  const races = [8000, 5800, 8500, 6200, 6400, 10200].map((distanceMeters, i) => ({
    name: `${i + 1}区`, discipline: 'ekiden_leg', leg: i + 1, distanceMeters,
  }));
  assert.deepEqual(races.reverse().sort(compareRaceUnits).map(r => r.leg), [1, 2, 3, 4, 5, 6]);
});

test('track meetings retain distance and numeric heat order', () => {
  const races = [
    { name: '10000m', discipline: 'm10000', heat: '1組' },
    { name: '5000m 10組', discipline: 'm5000', heat: '10組' },
    { name: '5000m 2組', discipline: 'm5000', heat: '2組' },
    { name: '1500m', discipline: 'm1500', heat: '1組' },
  ];
  assert.deepEqual(races.sort(compareRaceUnits).map(r => r.name), ['1500m', '5000m 2組', '5000m 10組', '10000m']);
});

test('competition dates use the event timezone for both UTC and Japanese midnight imports', () => {
  assert.equal(formatCompetitionDate(new Date('2026-10-31T15:00:00Z')), '2026-11-01');
  assert.equal(formatCompetitionDate(new Date('2026-10-12T00:00:00Z')), '2026-10-12');
  assert.equal(formatCompetitionDate(null), '');
});
