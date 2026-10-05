import { describe, expect, it } from 'vitest';
import { compareCzech, fold, matchesQuery, stemCzech } from './text';

describe('fold', () => {
  it('removes Czech diacritics', () => {
    expect(fold('Příliš žluťoučký kůň úpěl ďábelské ódy')).toBe(
      'prilis zlutoucky kun upel dabelske ody',
    );
  });
});

describe('matchesQuery', () => {
  it('finds inflected forms by prefix', () => {
    expect(matchesQuery('Ve Lipnově se nic neděje', 'Lipnov')).toBe(true);
    expect(matchesQuery('Pevnost na hranici', 'pev hran')).toBe(true);
    expect(matchesQuery('Pevnost na hranici', 'hrad')).toBe(false);
  });
  it('ignores diacritics in the query', () => {
    expect(matchesQuery('Zámek Šternberk', 'zamek stern')).toBe(true);
  });
});

describe('compareCzech', () => {
  it('sorts the Czech way', () => {
    expect(['Chalupa', 'Čáp', 'Cibule', 'Hora'].sort(compareCzech)).toEqual([
      'Cibule',
      'Čáp',
      'Hora',
      'Chalupa',
    ]);
  });
});

describe('stemCzech', () => {
  it('strips one case ending and keeps at least three letters', () => {
    expect(stemCzech('hraběnkami')).toBe('hrabenk');
    expect(stemCzech('Hraběnka')).toBe('hrabenk');
    expect(stemCzech('Lipnově')).toBe('lipn');
    expect(stemCzech('dům')).toBe('dum');
    expect(stemCzech('Voják12')).toBe('vojak12');
  });
});
