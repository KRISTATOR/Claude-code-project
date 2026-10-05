import { describe, expect, it } from 'vitest';
import { SearchIndex, snippet } from './search';

function index() {
  const search = new SearchIndex();
  search.addAll([
    {
      id: '1',
      kind: 'file',
      title: 'Dopis č. 12.docx',
      body: 'Milý příteli, ve Lipnově se nic neděje. Hrabě odjel.',
    },
    {
      id: '2',
      kind: 'file',
      title: 'Pravidla v2.pdf',
      body: 'Boj probíhá na dotek. Zranění se hlásí.',
    },
    {
      id: '3',
      kind: 'world',
      title: 'Pohraniční pevnost',
      body: 'Vesnice Lipnice leží u hranice.',
    },
    { id: '4', kind: 'file', title: 'Zámek Šternberk.png', body: '' },
  ]);
  return search;
}

describe('SearchIndex', () => {
  it('finds inflected Czech forms by prefix', () => {
    expect(
      index()
        .search('Lipnov')
        .map((hit) => hit.id),
    ).toEqual(['1']);
  });
  it('ignores diacritics and case in both directions', () => {
    expect(
      index()
        .search('zamek sternberk')
        .map((hit) => hit.id),
    ).toEqual(['4']);
    expect(
      index()
        .search('HRABĚ')
        .map((hit) => hit.id),
    ).toEqual(['1']);
  });
  it('prefers title matches', () => {
    const hits = index().search('pevnost');
    expect(hits[0]?.id).toBe('3');
  });
  it('requires all words', () => {
    expect(
      index()
        .search('boj dotek')
        .map((hit) => hit.id),
    ).toEqual(['2']);
    expect(index().search('boj lipnov')).toEqual([]);
  });
  it('tolerates one typo in longer words', () => {
    expect(
      index()
        .search('pravydla')
        .map((hit) => hit.id),
    ).toEqual(['2']);
  });
  it('keeps the index current', () => {
    const search = index();
    search.replace({ id: '2', kind: 'file', title: 'Pravidla v3.pdf', body: 'Nová pravidla.' });
    expect(search.search('dotek')).toEqual([]);
    search.remove('1');
    expect(search.search('lipnov')).toEqual([]);
  });
});

describe('snippet', () => {
  it('shows text around the first match', () => {
    const body = `${'a '.repeat(100)}Lipnově se nic neděje ${'b '.repeat(100)}`;
    const result = snippet(body, ['lipnove']);
    expect(result.startsWith('…')).toBe(true);
    expect(result).toContain('Lipnově se nic neděje');
  });
});

describe('Czech stems', () => {
  it('finds other case forms of a word', () => {
    const search = new SearchIndex();
    search.addAll([
      { id: 'a', kind: 'page', title: 'Hraběnka z Lipnova', body: '' },
      { id: 'b', kind: 'page', title: 'Kovárna', body: 'Kovář pracuje s hraběnkami.' },
    ]);
    expect(
      search
        .search('hraběnkami')
        .map((hit) => hit.id)
        .sort(),
    ).toEqual(['a', 'b']);
    expect(search.search('Lipnově').map((hit) => hit.id)).toEqual(['a']);
  });
});
