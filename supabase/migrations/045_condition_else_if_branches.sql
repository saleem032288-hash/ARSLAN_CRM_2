-- ============================================================
-- 045_condition_else_if_branches.sql
--
-- Extends the automation condition step from a binary IF/ELSE into
-- an IF -> ELSE IF -> OTHER chain.
--
-- Branch children under a condition step are still keyed by
-- `parent_step_id` + `branch`. The branch vocabulary widens from
-- ('yes','no') to:
--
--   'yes'        — first IF condition matched
--   'else_if_N'  — the Nth ELSE IF condition matched (N starts at 1)
--   'no'         — OTHER / every condition failed (unchanged legacy)
--
-- The ordered ELSE IF conditions themselves live on the condition
-- step's `step_config` JSONB as `else_ifs` (the same convention as
-- flow_nodes.config), so no new columns are introduced. Existing
-- yes/no rows keep working untouched.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- automation_steps.branch
ALTER TABLE automation_steps
  DROP CONSTRAINT IF EXISTS automation_steps_branch_check;

ALTER TABLE automation_steps
  ADD CONSTRAINT automation_steps_branch_check
    CHECK (
      branch IS NULL
        OR branch IN ('yes', 'no')
        OR branch ~ '^else_if_[1-9][0-9]*$'
    );

-- automation_pending_executions.branch (a `wait` step nested inside
-- an else_if branch must be resumable with the same branch label).
ALTER TABLE automation_pending_executions
  DROP CONSTRAINT IF EXISTS automation_pending_executions_branch_check;

ALTER TABLE automation_pending_executions
  ADD CONSTRAINT automation_pending_executions_branch_check
    CHECK (
      branch IS NULL
        OR branch IN ('yes', 'no')
        OR branch ~ '^else_if_[1-9][0-9]*$'
    );