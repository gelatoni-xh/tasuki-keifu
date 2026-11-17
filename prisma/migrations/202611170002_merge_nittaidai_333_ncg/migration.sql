-- Keep the 333rd meet consistent with the 332nd: NCG is a race group
-- within the same competition edition, rather than a separate empty edition.
DO $$
DECLARE
  target_edition_id TEXT;
  ncg_edition_id TEXT;
  ncg_competition_id TEXT;
BEGIN
  SELECT id INTO target_edition_id
  FROM "CompetitionEdition"
  WHERE slug = 'nittaidai-long-distance-meet-333';

  SELECT id, "competitionId" INTO ncg_edition_id, ncg_competition_id
  FROM "CompetitionEdition"
  WHERE slug = 'nittaidai-challenge-games-26';

  IF target_edition_id IS NULL OR ncg_edition_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE "Race"
  SET "competitionEditionId" = target_edition_id,
      slug = replace(slug, 'nittaidai-challenge-games-26', 'nittaidai-long-distance-meet-333-ncg')
  WHERE "competitionEditionId" = ncg_edition_id;

  UPDATE "CompetitionEdition"
  SET "officialName" = '第333回日本体育大学長距離競技会兼26th NITTAIDAI Challenge Games',
      "shortName" = '第333回日体大長距離競技会'
  WHERE id = target_edition_id;

  DELETE FROM "CompetitionEdition"
  WHERE id = ncg_edition_id
    AND NOT EXISTS (SELECT 1 FROM "Race" WHERE "competitionEditionId" = ncg_edition_id)
    AND NOT EXISTS (SELECT 1 FROM "TeamCompetitionResult" WHERE "competitionEditionId" = ncg_edition_id)
    AND NOT EXISTS (SELECT 1 FROM "SourceReference" WHERE "competitionEditionId" = ncg_edition_id);

  DELETE FROM "Competition"
  WHERE id = ncg_competition_id
    AND NOT EXISTS (SELECT 1 FROM "CompetitionEdition" WHERE "competitionId" = ncg_competition_id);
END $$;
