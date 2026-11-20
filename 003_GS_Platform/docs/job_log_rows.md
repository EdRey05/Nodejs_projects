# job_log_rows view

[All conventions](database_conventions.md)

Retained Layouts/Logs compatibility view over the draft `job_log` table. It is not the new Progress Tracker and does not define a separate data store.

```sql
CREATE VIEW job_log_rows AS SELECT rowid AS jt_rowid, * FROM job_log;
```
