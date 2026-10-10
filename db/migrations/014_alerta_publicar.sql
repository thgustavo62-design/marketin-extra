-- Fase 7 — novo tipo de alerta: lembrete de publicação (publicação manual/assistida chegou na hora).
alter table notification_events drop constraint notification_events_type_check;
alter table notification_events add constraint notification_events_type_check
  check (type in ('post_overdue', 'post_no_owner', 'approval_stale', 'campaign_unconfirmed', 'final_missing', 'integration_stale', 'collect_failed', 'target_pace', 'publish_due'));
