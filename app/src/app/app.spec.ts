import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { App } from './app';

describe('App', () => {
  it('exposes the application title', () => {
    const instance = new App();
    expect((instance as unknown as { title: string }).title).toBe('autodep-v2');
  });
});
