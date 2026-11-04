const NOTIFICATION_RETENTION_DAYS = 7;

export function getNotificationCutoff() {
  const retentionWindowMs =
    NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - retentionWindowMs).toISOString();
}
