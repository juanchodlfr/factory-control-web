-- Run through an administrative SQL connection after applying migrations.
-- Exercise the actual production role and columns, even when features is empty.
BEGIN;
SET LOCAL ROLE service_role;
SELECT id, feature_key, short_code, title, product, application, archived
FROM factory_lite.features ORDER BY created_at DESC LIMIT 200;
SELECT id, work_key, short_code, title, status, owner_agent_id,
       current_executor_agent_id, workflow_stage, feature_id, payload, updated_at
FROM factory_lite.work_items ORDER BY updated_at DESC LIMIT 0;
SELECT id, code, name, status FROM factory_lite.agents ORDER BY code ASC LIMIT 0;
SELECT id, work_item_id, from_agent_id, to_agent_id, status,
       created_at, accepted_at, completed_at
FROM factory_lite.handoffs ORDER BY created_at ASC LIMIT 0;
ROLLBACK;
