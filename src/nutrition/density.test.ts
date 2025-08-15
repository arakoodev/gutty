import { computeDensities, toGramsUsingDensity } from './density';
import { expect, test } from 'vitest';

test('computeDensities aggregates volume and piece data', () => {
  const food = {
    foodPortions: [
      { measureUnit: { name: 'milliliter' }, amount: 1, gramWeight: 1 },
      { measureUnit: { name: 'milliliter' }, amount: 1, gramWeight: 2 },
      { measureUnit: { name: 'milliliter' }, amount: 1, gramWeight: 3 },
      { portionDescription: 'slice, thin', amount: 1, gramWeight: 30 },
    ],
  };
  const dens = computeDensities(food);
  expect(dens.byVolume.ml).toBeCloseTo(2); // median of [1,2,3]
  expect(dens.byPiece['slice, thin']).toBeCloseTo(30);

  const gramsVol = toGramsUsingDensity(10, 'ml', dens);
  expect(gramsVol).toBeCloseTo(20);

  const gramsPiece = toGramsUsingDensity(2, 'slices', dens);
  expect(gramsPiece).toBeCloseTo(60);
});

