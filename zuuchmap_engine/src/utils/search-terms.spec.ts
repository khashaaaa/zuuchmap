import {
  matchesPost,
  postDocument,
  searchTerms,
  stripMongolianSuffix,
} from './search-terms';

describe('stripMongolianSuffix', () => {
  it.each([
    ['экскаваторын', 'экскаватор'],
    ['машинаас', 'машин'],
    ['краныг', 'кран'],
    ['ачаатай', 'ачаа'],
    ['цохилуурууд', 'цохилуур'],
  ])('reduces %s to %s', (input, stem) => {
    expect(stripMongolianSuffix(input)).toBe(stem);
  });

  /**
   * Where the list is imprecise it errs long, and that direction is free:
   * matching is prefix-based, so a stem cut one letter too short still reaches
   * every form of the word. Only precision pays, and only slightly.
   */
  it('stays a prefix of the word it came from', () => {
    for (const word of ['машины', 'ачааны', 'барилгачид', 'зөөврийн']) {
      expect(word.startsWith(stripMongolianSuffix(word))).toBe(true);
    }
  });

  it('leaves a term alone when stripping would leave a wildcard', () => {
    // 'цэг' is already at the floor; taking the 'г' would match half the corpus.
    expect(stripMongolianSuffix('цэг')).toBe('цэг');
    expect(stripMongolianSuffix('замд')).toBe('замд');
  });

  it('never touches a term that is not Cyrillic', () => {
    // Model numbers and brands have to stay literal — 'komatsu' does not end in
    // a Mongolian ablative, it just ends in a 'у'.
    expect(stripMongolianSuffix('komatsu')).toBe('komatsu');
    expect(stripMongolianSuffix('pc200')).toBe('pc200');
  });
});

describe('searchTerms + matchesPost', () => {
  const post = {
    title: 'Экскаватор түрээслүүлнэ',
    details: 'Сайн байдалтай',
    location: 'Хан-Уул дүүрэг',
    address: '5-р хороо',
    attributes: { manufacturer: 'Komatsu', model: 'PC-200', year: 2015 },
  };

  // The failure this exists for: prefix matching only reaches forward, so a
  // query typed in the case Mongolian actually speaks in was a prefix of
  // nothing — and because terms are ANDed, one such word emptied the page.
  it('finds a listing from the inflected form of its own title', () => {
    expect(matchesPost(searchTerms('экскаваторын'), post)).toBe(true);
    expect(matchesPost(searchTerms('экскаватор'), post)).toBe(true);
  });

  it('finds a listing by an attribute the form collected', () => {
    expect(matchesPost(searchTerms('Komatsu'), post)).toBe(true);
    expect(matchesPost(searchTerms('PC-200'), post)).toBe(true);
    expect(matchesPost(searchTerms('2015'), post)).toBe(true);
  });

  it('finds a listing by its district', () => {
    expect(matchesPost(searchTerms('Хан-Уул'), post)).toBe(true);
  });

  it('still requires every term to hit', () => {
    expect(matchesPost(searchTerms('экскаватор Volvo'), post)).toBe(false);
  });

  it('mirrors what the generated column stores, keys included', () => {
    // `attributes::text` in SQL carries the keys through the same punctuation
    // collapse, so the JS document has to as well or the two disagree.
    expect(postDocument(post)).toEqual(
      expect.arrayContaining(['manufacturer', 'komatsu', 'pc', '200', '2015']),
    );
  });
});
