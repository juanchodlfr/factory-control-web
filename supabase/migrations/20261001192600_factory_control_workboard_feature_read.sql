-- Factory Control's existing server role may read only the feature fields used by WorkBoard.
GRANT SELECT (id, feature_key, short_code, title, product, application, archived, created_at)
ON factory_lite.features TO service_role;
