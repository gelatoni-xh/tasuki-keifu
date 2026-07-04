ALTER TABLE "Person"
ADD COLUMN "displayNameJaSearch" TEXT NOT NULL DEFAULT '';

UPDATE "Person"
SET "displayNameJa" = CASE
    WHEN "displayNameJa" ~ '[一-龯々]' THEN regexp_replace(replace("displayNameJa", '　', ' '), '\s+', '', 'g')
    ELSE trim(regexp_replace(replace("displayNameJa", '　', ' '), '\s+', ' ', 'g'))
  END,
  "displayNameJaSearch" = regexp_replace(replace("displayNameJa", '　', ' '), '\s+', '', 'g');
