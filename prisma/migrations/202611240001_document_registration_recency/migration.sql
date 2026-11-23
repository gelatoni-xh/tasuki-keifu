-- Association is a mutable sourced fact, independent of hometown. No payload/schema shape change.
COMMENT ON COLUMN public."Person"."registeredPrefecture" IS '登录陆协，独立于出身地，禁止互相推断。统一省略都/府/県，保留北海道/学連。按来源赛事日本日期取最新值，非导入时间；日期证据存 SourceReference.metadata.registeredAssociation（value, asOf, dateBasis）。缺失日期或同日不同值保留 unresolved。';
COMMENT ON COLUMN public."SourceReference".metadata IS '外部来源证据。registeredAssociation={value:规范陆协值,asOf:资料对应赛事日本日期YYYY-MM-DD,dateBasis:race_date_jst}；用于按资料日期维护最新陆协，与出身地无关。备份恢复须保留整个metadata。';
