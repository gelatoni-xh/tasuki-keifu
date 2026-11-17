import assert from "node:assert/strict";
import test from "node:test";
import { normalizePersonDisplayNameJa } from "./name-normalization";

test("display normalization removes spaces from kanji names", () => {
  assert.equal(normalizePersonDisplayNameJa("山田 太郎"), "山田太郎");
  assert.equal(normalizePersonDisplayNameJa("鄭　文皓"), "鄭文皓");
});

test("display normalization preserves separators for katakana and Latin names", () => {
  assert.equal(normalizePersonDisplayNameJa("ジョンソン　モゲニ"), "ジョンソン モゲニ");
  assert.equal(normalizePersonDisplayNameJa("John   Smith"), "John Smith");
  assert.equal(normalizePersonDisplayNameJa("DEJEN Tesufalemweldu"), "DEJEN Tesufalemweldu");
  assert.equal(normalizePersonDisplayNameJa("Александр Иванов"), "Александр Иванов");
});
