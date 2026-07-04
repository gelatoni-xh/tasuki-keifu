UPDATE "CompetitionEdition" AS ce
SET
  "officialName" = '第' || ce."editionNumber" || '回全国高校駅伝',
  "shortName" = '第' || ce."editionNumber" || '回全国高校駅伝'
FROM "Competition" AS c
WHERE ce."competitionId" = c.id
  AND ce."editionNumber" IS NOT NULL
  AND c.slug = 'national-high-school-ekiden';
