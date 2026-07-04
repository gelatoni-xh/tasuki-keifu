UPDATE "CompetitionEdition" AS ce
SET
  "officialName" = CASE c.slug
    WHEN 'hakone-ekiden' THEN '第' || ce."editionNumber" || '回箱根駅伝'
    WHEN 'izumo-ekiden' THEN '第' || ce."editionNumber" || '回出雲駅伝'
    WHEN 'all-japan-university-ekiden' THEN '第' || ce."editionNumber" || '回全日本大学駅伝'
    WHEN 'new-year-ekiden' THEN '第' || ce."editionNumber" || '回ニューイヤー駅伝'
    WHEN 'national-prefectural-ekiden-men' THEN '第' || ce."editionNumber" || '回全国男子駅伝'
    WHEN 'national-high-school-ekiden' THEN '第' || ce."editionNumber" || '回全国高校駅伝 男子'
    ELSE ce."officialName"
  END,
  "shortName" = CASE c.slug
    WHEN 'hakone-ekiden' THEN '第' || ce."editionNumber" || '回箱根駅伝'
    WHEN 'izumo-ekiden' THEN '第' || ce."editionNumber" || '回出雲駅伝'
    WHEN 'all-japan-university-ekiden' THEN '第' || ce."editionNumber" || '回全日本大学駅伝'
    WHEN 'new-year-ekiden' THEN '第' || ce."editionNumber" || '回ニューイヤー駅伝'
    WHEN 'national-prefectural-ekiden-men' THEN '第' || ce."editionNumber" || '回全国男子駅伝'
    WHEN 'national-high-school-ekiden' THEN '第' || ce."editionNumber" || '回全国高校駅伝 男子'
    ELSE ce."shortName"
  END
FROM "Competition" AS c
WHERE ce."competitionId" = c.id
  AND ce."editionNumber" IS NOT NULL
  AND c.slug IN (
    'hakone-ekiden',
    'izumo-ekiden',
    'all-japan-university-ekiden',
    'new-year-ekiden',
    'national-prefectural-ekiden-men',
    'national-high-school-ekiden'
  );
