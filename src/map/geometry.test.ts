import { expect, it } from 'vitest';
import { mkEdge, roundPolyline, type Pt } from './geometry';

it('preserves the diagonal and horizontal branch legs around duplicate corners', () => {
  const corners: Pt[] = [[0, 0], [96, 96], [186, 96]];
  const duplicateCorners: Pt[] = [[0, 0], [0, 0], [96, 96], [96, 96], [186, 96]];
  expect(roundPolyline(duplicateCorners, 26)).toEqual(roundPolyline(corners, 26));
  const e = mkEdge(duplicateCorners, '#5B6B7F', 'child');
  expect(e.pts[1][0]).toBeCloseTo(e.pts[1][1]);
  expect(e.pts.at(-2)![1]).toBe(96);
  expect(e.pts.at(-1)).toEqual([186, 96]);
});
