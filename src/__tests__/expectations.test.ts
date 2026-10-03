import { expect, it } from '@jest/globals';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import expectations from '../../fixtures/expectations.json';
import { PdfThumbnailErrorCodes } from '../index';

const fixtures = path.resolve(__dirname, '../../fixtures');

it('contains exactly 28 uniquely named executable cases', () => {
  expect(expectations).toHaveLength(28);
  expect(new Set(expectations.map((test) => test.name)).size).toBe(28);
});

it.each(expectations)('validates the schema and input of $name', (test) => {
  expect(
    Object.keys(test).every((key) =>
      [
        'name',
        'file',
        'missingFile',
        'path',
        'absolute',
        'page',
        'all',
        'options',
        'expected',
      ].includes(key)
    )
  ).toBe(true);
  expect(test.name).toMatch(/^[a-zA-Z0-9-]+$/);
  expect(
    [test.file, test.missingFile, test.path].filter(
      (value) => value !== undefined
    )
  ).toHaveLength(1);
  if (test.file !== undefined) {
    expect(test.file).toMatch(/^[a-zA-Z0-9-]+\.pdf$/);
    expect(existsSync(path.join(fixtures, test.file))).toBe(true);
  }
  // This is an intentionally absent input, not a bundled fixture reference.
  if (test.missingFile !== undefined) {
    expect(test.missingFile).toMatch(/^[a-zA-Z0-9-]+\.pdf$/);
    expect(existsSync(path.join(fixtures, test.missingFile))).toBe(false);
    expect(test.expected.code).toBe(PdfThumbnailErrorCodes.FILE_NOT_FOUND);
  }
  if (test.path !== undefined) expect(typeof test.path).toBe('string');
  if (test.absolute !== undefined) {
    expect(test.absolute).toBe(true);
    expect(test.file).toBeDefined();
  }
  if (test.page !== undefined) expect(Number.isFinite(test.page)).toBe(true);
  if (test.all !== undefined) {
    expect(test.all).toBe(true);
    expect(test.page).toBeUndefined();
  }
  if (test.options !== undefined) {
    if (typeof test.options === 'number') {
      expect(Number.isFinite(test.options)).toBe(true);
    } else {
      expect(
        Object.keys(test.options).every((key) =>
          ['quality', 'maxWidth', 'maxHeight'].includes(key)
        )
      ).toBe(true);
      for (const value of Object.values(test.options)) {
        expect(Number.isFinite(value) && value > 0).toBe(true);
      }
    }
  }
  expect(
    Object.keys(test.expected).every((key) =>
      ['description', 'sizes', 'code'].includes(key)
    )
  ).toBe(true);
  expect(typeof test.expected.description).toBe('string');
  expect(test.expected.description.length).toBeGreaterThan(0);
  expect(
    [test.expected.code, test.expected.sizes].filter(
      (value) => value !== undefined
    )
  ).toHaveLength(1);
  if (test.expected.code !== undefined) {
    expect(Object.values(PdfThumbnailErrorCodes)).toContain(test.expected.code);
  } else {
    expect(test.expected.sizes?.length).toBeGreaterThan(0);
    if (!test.all) expect(test.expected.sizes).toHaveLength(1);
    for (const size of test.expected.sizes ?? []) {
      expect(size).toHaveLength(2);
      for (const value of size)
        expect(Number.isInteger(value) && value > 0).toBe(true);
    }
  }
});

it('covers every bundled PDF fixture', () => {
  const referenced = new Set(
    expectations.map((test) => test.file).filter(Boolean)
  );
  expect([...referenced].sort()).toEqual(
    readdirSync(fixtures)
      .filter((file) => file.endsWith('.pdf'))
      .sort()
  );
});
