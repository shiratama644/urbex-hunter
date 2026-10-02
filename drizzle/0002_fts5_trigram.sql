-- FTS5 全文検索最適化: LIKE '%q%' (SCAN 752 rows) → MATCH (SEARCH 2-5ms)
-- 日本語は trigram で部分一致を index 走査 [1], D1 は FTS5 をサポート [2]
-- trigram が無効な環境は unicode61 にフォールバック (spots-repo.ts で try/catch)
-- [1] https://dev.to/omochi_dev/why-sqlite-fts5s-default-tokenizer-drops-your-japanese-substrings-and-the-one-line-fix-1k2d
-- [2] https://developers.cloudflare.com/d1/sql-api/sql-statements/#supported-sqlite-extensions
CREATE VIRTUAL TABLE IF NOT EXISTS "spots_fts" USING fts5(
  "name","kana","address","city","prefecture",
  content='spots', content_rowid='spotcd', tokenize='trigram'
);
INSERT INTO "spots_fts"("spots_fts") VALUES('rebuild');
CREATE TRIGGER IF NOT EXISTS "spots_fts_insert" AFTER INSERT ON "spots" BEGIN
  INSERT INTO "spots_fts"(rowid,"name","kana","address","city","prefecture")
  VALUES (new."spotcd", new."name", new."kana", new."address", new."city", new."prefecture");
END;
CREATE TRIGGER IF NOT EXISTS "spots_fts_delete" AFTER DELETE ON "spots" BEGIN
  INSERT INTO "spots_fts"("spots_fts", rowid, "name","kana","address","city","prefecture")
  VALUES('delete', old."spotcd", old."name", old."kana", old."address", old."city", old."prefecture");
END;
CREATE TRIGGER IF NOT EXISTS "spots_fts_update" AFTER UPDATE ON "spots" BEGIN
  INSERT INTO "spots_fts"("spots_fts", rowid, "name","kana","address","city","prefecture")
  VALUES('delete', old."spotcd", old."name", old."kana", old."address", old."city", old."prefecture");
  INSERT INTO "spots_fts"(rowid,"name","kana","address","city","prefecture")
  VALUES (new."spotcd", new."name", new."kana", new."address", new."city", new."prefecture");
END;
PRAGMA optimize;
