export function buildCompetitionSeoTitle(name: string, year: number) {
  const normalizedName = name.normalize("NFKC");
  const hasYear = new RegExp(`(^|\\D)${year}(?!\\d)`).test(normalizedName);
  const otherYears = Array.from(
    normalizedName.matchAll(/(?:^|[^0-9])((?:19|20)[0-9]{2})(?![0-9])/g),
    (match) => Number(match[1]),
  ).filter((value) => value !== year);
  const titleName = hasYear || otherYears.length > 0 ? name : `${name} ${year}`;

  return {
    title: `${titleName} | 結果・出場選手・大会記録`,
    conflictingYears: Array.from(new Set(otherYears)),
  };
}
