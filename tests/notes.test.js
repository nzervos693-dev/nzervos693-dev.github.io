import { describe, it, expect } from 'vitest';
import {
  createNote, isBlank, sanitize, parseStored, serialize, merge, matches, view,
} from '../public/notes/notes-store.js';

const n = (o) => ({ ...createNote(1000), ...o });

describe('notes store', () => {
  it('blank detection ignores whitespace', () => {
    expect(isBlank(n({ title: '  ', body: '\n' }))).toBe(true);
    expect(isBlank(n({ body: 'x' }))).toBe(false);
  });

  it('sanitize rejects junk and fixes fields', () => {
    expect(sanitize(null)).toBe(null);
    expect(sanitize({ title: 'no id' })).toBe(null);
    const s = sanitize({ id: 'a', title: 5, color: 'neon', pinned: 'yes', created: 10 });
    expect(s).toEqual({ id: 'a', title: '', body: '', pinned: false, color: '', created: 10, updated: 10 });
  });

  it('round-trips a backup and accepts a bare array', () => {
    const list = [n({ id: 'a', body: 'hi' })];
    expect(parseStored(serialize(list))).toEqual(list);
    expect(parseStored(JSON.stringify(list))).toEqual(list);
    expect(parseStored('not json')).toBe(null);
    expect(parseStored('{"x":1}')).toBe(null);
  });

  it('merge keeps the most recently edited copy', () => {
    const cur = [n({ id: 'a', body: 'old', updated: 5 }), n({ id: 'b', body: 'mine', updated: 9 })];
    const inc = [n({ id: 'a', body: 'new', updated: 7 }), n({ id: 'b', body: 'stale', updated: 1 }), n({ id: 'c' })];
    const r = merge(cur, inc);
    expect(r.added).toBe(1);
    expect(r.updated).toBe(1);
    const by = Object.fromEntries(r.notes.map((x) => [x.id, x.body]));
    expect(by).toEqual({ a: 'new', b: 'mine', c: '' });
  });

  it('search is case-insensitive over title and body', () => {
    const x = n({ title: 'Shopping', body: 'Milk and EGGS' });
    expect(matches(x, 'eggs')).toBe(true);
    expect(matches(x, 'shop')).toBe(true);
    expect(matches(x, 'bread')).toBe(false);
    expect(matches(x, '  ')).toBe(true);
  });

  it('view puts pinned first and sorts by last edit', () => {
    const list = [
      n({ id: 'a', body: 'a', updated: 1 }),
      n({ id: 'b', body: 'b', updated: 3 }),
      n({ id: 'c', body: 'c', updated: 2, pinned: true }),
    ];
    const v = view(list);
    expect(v.pinned.map((x) => x.id)).toEqual(['c']);
    expect(v.others.map((x) => x.id)).toEqual(['b', 'a']);
    expect(view(list, '', 'title').others.map((x) => x.id)).toEqual(['a', 'b']);
  });
});
