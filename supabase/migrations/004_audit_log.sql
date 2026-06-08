CREATE TABLE audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL,
  user_email  TEXT,
  entity_type TEXT NOT NULL,   -- 'event' | 'scheduled_post'
  entity_id   BIGINT NOT NULL,
  action      TEXT NOT NULL,   -- 'create' | 'update' | 'delete' | 'schedule' | 'revert' | 'mark_sent' | 'bulk_delete'
  detail      TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_user   ON audit_logs(user_id);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read all audit logs; no public access
CREATE POLICY "Admins can view audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (true);
