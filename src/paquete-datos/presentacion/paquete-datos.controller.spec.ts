import { coincide } from './paquete-datos.controller.js';

describe('If-None-Match', () => {
  it.each([
    ['"abc"', true],
    ['W/"abc"', true],
    ['"otra", "abc"', true],
    ['*', true],
    ['"otra"', false],
    ['abc', false],
    ['', false],
    [undefined, false],
  ])('%s → %s', (encabezado, esperado) => {
    expect(coincide(encabezado, 'abc')).toBe(esperado);
  });
});
