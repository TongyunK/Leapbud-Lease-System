-- 定时任务 + 执行日志

CREATE TABLE "scheduled_jobs" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "handler_key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "schedule_kind" TEXT NOT NULL DEFAULT 'recurring',
  "recurrence" TEXT NOT NULL DEFAULT 'daily',
  "run_time" TEXT NOT NULL DEFAULT '01:00',
  "recurrence_config" TEXT NOT NULL DEFAULT '{}',
  "once_at" TIMESTAMP(3),
  "last_run_at" TIMESTAMP(3),
  "last_run_status" TEXT NOT NULL DEFAULT '',
  "last_run_message" TEXT NOT NULL DEFAULT '',
  "next_run_at" TIMESTAMP(3),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "remark" TEXT NOT NULL DEFAULT '',
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "scheduled_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "scheduled_jobs_code_key" ON "scheduled_jobs"("code");
CREATE INDEX "scheduled_jobs_enabled_schedule_kind_sort_order_idx" ON "scheduled_jobs"("enabled", "schedule_kind", "sort_order");
CREATE INDEX "scheduled_jobs_handler_key_idx" ON "scheduled_jobs"("handler_key");
CREATE INDEX "scheduled_jobs_next_run_at_idx" ON "scheduled_jobs"("next_run_at");
CREATE INDEX "scheduled_jobs_created_by_idx" ON "scheduled_jobs"("created_by");
CREATE INDEX "scheduled_jobs_updated_by_idx" ON "scheduled_jobs"("updated_by");

ALTER TABLE "scheduled_jobs"
  ADD CONSTRAINT "scheduled_jobs_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "scheduled_jobs"
  ADD CONSTRAINT "scheduled_jobs_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON TABLE "scheduled_jobs" IS '定时任务（系统预置；可开关/改调度，不可删除）';
COMMENT ON COLUMN "scheduled_jobs"."id" IS '主键';
COMMENT ON COLUMN "scheduled_jobs"."code" IS '任务编码（业务唯一，如 rent_invoice_due）';
COMMENT ON COLUMN "scheduled_jobs"."name" IS '任务名称（可编辑）';
COMMENT ON COLUMN "scheduled_jobs"."handler_key" IS '执行处理器键（代码注册表；决定跑哪段业务）';
COMMENT ON COLUMN "scheduled_jobs"."enabled" IS '是否启用（关闭后不自动跑；仍可手动运行）';
COMMENT ON COLUMN "scheduled_jobs"."schedule_kind" IS '调度类型：recurring=周期；once=时间点（一次性）';
COMMENT ON COLUMN "scheduled_jobs"."recurrence" IS '重复周期：daily / weekly / monthly_days / monthly_weekday / yearly';
COMMENT ON COLUMN "scheduled_jobs"."run_time" IS '执行时刻 HH:mm（Asia/Hong_Kong）';
COMMENT ON COLUMN "scheduled_jobs"."recurrence_config" IS '周期扩展配置 JSON（如周几、每月哪几天）';
COMMENT ON COLUMN "scheduled_jobs"."once_at" IS '一次性执行的目标日期时间（scheduleKind=once 时）';
COMMENT ON COLUMN "scheduled_jobs"."last_run_at" IS '上次运行时间';
COMMENT ON COLUMN "scheduled_jobs"."last_run_status" IS '上次运行状态：success / failed / skipped';
COMMENT ON COLUMN "scheduled_jobs"."last_run_message" IS '上次运行摘要';
COMMENT ON COLUMN "scheduled_jobs"."next_run_at" IS '下次计划运行时间（展示用；调度器会刷新）';
COMMENT ON COLUMN "scheduled_jobs"."sort_order" IS '排序权重，越小越靠前';
COMMENT ON COLUMN "scheduled_jobs"."remark" IS '备注';
COMMENT ON COLUMN "scheduled_jobs"."created_by" IS '创建人用户 ID';
COMMENT ON COLUMN "scheduled_jobs"."updated_by" IS '更新人用户 ID';
COMMENT ON COLUMN "scheduled_jobs"."created_at" IS '创建时间';
COMMENT ON COLUMN "scheduled_jobs"."updated_at" IS '更新时间';

CREATE TABLE "scheduled_job_logs" (
  "id" TEXT NOT NULL,
  "job_id" TEXT NOT NULL,
  "trigger" TEXT NOT NULL DEFAULT 'auto',
  "started_at" TIMESTAMP(3) NOT NULL,
  "finished_at" TIMESTAMP(3),
  "status" TEXT NOT NULL,
  "message" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "scheduled_job_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scheduled_job_logs_job_id_started_at_idx" ON "scheduled_job_logs"("job_id", "started_at");
CREATE INDEX "scheduled_job_logs_status_idx" ON "scheduled_job_logs"("status");

ALTER TABLE "scheduled_job_logs"
  ADD CONSTRAINT "scheduled_job_logs_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "scheduled_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMENT ON TABLE "scheduled_job_logs" IS '定时任务执行日志';
COMMENT ON COLUMN "scheduled_job_logs"."id" IS '主键';
COMMENT ON COLUMN "scheduled_job_logs"."job_id" IS '所属定时任务 ID';
COMMENT ON COLUMN "scheduled_job_logs"."trigger" IS '触发方式：auto=调度 / manual=手动';
COMMENT ON COLUMN "scheduled_job_logs"."started_at" IS '开始时间';
COMMENT ON COLUMN "scheduled_job_logs"."finished_at" IS '结束时间';
COMMENT ON COLUMN "scheduled_job_logs"."status" IS '状态：success / failed / skipped';
COMMENT ON COLUMN "scheduled_job_logs"."message" IS '结果摘要';
COMMENT ON COLUMN "scheduled_job_logs"."created_at" IS '创建时间';

INSERT INTO "scheduled_jobs" (
  "id", "code", "name", "handler_key", "enabled", "schedule_kind", "recurrence",
  "run_time", "recurrence_config", "sort_order", "remark", "created_at", "updated_at"
) VALUES (
  'sjob_rent_invoice_due',
  'rent_invoice_due',
  '租金自動開票',
  'rent_invoice_due',
  true,
  'recurring',
  'daily',
  '01:00',
  '{}',
  10,
  '按系統設置「繳費期前自動開票天數」為租賃中合約開立到期租金發票',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "menus" (
  "id", "parent_id", "type", "name", "name_en", "name_key", "route_name", "path", "icon",
  "sort_order", "active", "created_at", "updated_at"
) VALUES (
  'menu_scheduled_jobs',
  'menu_system',
  'menu',
  '定時任務',
  'Scheduled jobs',
  'menu.scheduledJobs',
  'scheduledJobs',
  'system/scheduled-jobs',
  'Timer',
  45,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
  "parent_id" = EXCLUDED."parent_id",
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "name_en" = EXCLUDED."name_en",
  "name_key" = EXCLUDED."name_key",
  "route_name" = EXCLUDED."route_name",
  "path" = EXCLUDED."path",
  "icon" = EXCLUDED."icon",
  "sort_order" = EXCLUDED."sort_order",
  "active" = true,
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "role_menus" ("role_id", "menu_id", "created_at")
SELECT r."id", 'menu_scheduled_jobs', CURRENT_TIMESTAMP
FROM "roles" r
WHERE r."code" IN ('admin', 'superAdmin')
ON CONFLICT ("role_id", "menu_id") DO NOTHING;
