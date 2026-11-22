ALTER TABLE "Person" ADD COLUMN "registeredPrefecture" TEXT;

COMMENT ON COLUMN "Person"."nationality" IS '已废弃，仅保留历史数据';
COMMENT ON COLUMN "Person"."hometown" IS '出身地；与登录陆协是独立事实，不得互相推断';
COMMENT ON COLUMN "Person"."registeredPrefecture" IS '登录陆协；与出身地是独立事实，不得互相推断';
