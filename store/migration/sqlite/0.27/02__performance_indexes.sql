-- Performance indexes for existing installations.
-- These are already included in LATEST.sql for fresh installs.
-- Safe to run multiple times (IF NOT EXISTS).

-- memo: cover the most common query patterns
CREATE INDEX IF NOT EXISTS `idx_memo_creator_id`  ON `memo` (`creator_id`);
CREATE INDEX IF NOT EXISTS `idx_memo_row_status`  ON `memo` (`row_status`);
CREATE INDEX IF NOT EXISTS `idx_memo_created_ts`  ON `memo` (`created_ts` DESC);
CREATE INDEX IF NOT EXISTS `idx_memo_updated_ts`  ON `memo` (`updated_ts` DESC);
CREATE INDEX IF NOT EXISTS `idx_memo_visibility`  ON `memo` (`visibility`);
-- composite: single-user timeline (the hot path for private memo feeds)
CREATE INDEX IF NOT EXISTS `idx_memo_creator_status_ts` ON `memo` (`creator_id`, `row_status`, `created_ts` DESC);

-- memo_relation: referenced in every ListMemos JOIN
CREATE INDEX IF NOT EXISTS `idx_memo_relation_memo_id`         ON `memo_relation` (`memo_id`);
CREATE INDEX IF NOT EXISTS `idx_memo_relation_related_memo_id` ON `memo_relation` (`related_memo_id`);

-- attachment
CREATE INDEX IF NOT EXISTS `idx_attachment_creator_id` ON `attachment` (`creator_id`);
CREATE INDEX IF NOT EXISTS `idx_attachment_memo_id`    ON `attachment` (`memo_id`);

-- activity: used by the activity-calendar heatmap
CREATE INDEX IF NOT EXISTS `idx_activity_creator_id` ON `activity` (`creator_id`);
CREATE INDEX IF NOT EXISTS `idx_activity_created_ts` ON `activity` (`created_ts`);

-- reaction: looked up by content_id on every memo detail page
CREATE INDEX IF NOT EXISTS `idx_reaction_content_id`  ON `reaction` (`content_id`);
CREATE INDEX IF NOT EXISTS `idx_reaction_creator_id`  ON `reaction` (`creator_id`);

-- inbox
CREATE INDEX IF NOT EXISTS `idx_inbox_receiver_id` ON `inbox` (`receiver_id`);
CREATE INDEX IF NOT EXISTS `idx_inbox_sender_id`   ON `inbox` (`sender_id`);
