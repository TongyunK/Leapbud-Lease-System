-- WhatsApp 分类／模板说明统一为繁体中文（修正早期简体种子／恢复文案）

UPDATE "whatsapp_template_categories"
SET "label" = '月度賬單發送', "remark" = '每月租金／賬單發送', "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'monthly_invoice';

UPDATE "whatsapp_template_categories"
SET "label" = '繳費提醒', "remark" = '繳費截止前提醒', "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'payment_reminder';

UPDATE "whatsapp_template_categories"
SET "label" = '逾期手續費提醒', "remark" = '超時未繳費逾期 n 天加收手續費提醒', "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'overdue_handling_fee';

UPDATE "whatsapp_template_categories"
SET "label" = '收據確認', "remark" = '收款確認類模板', "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'receipt_confirm';

UPDATE "whatsapp_template_categories"
SET "label" = '待整理', "remark" = '遷移衝突／待人工歸類的舊模板', "updated_at" = CURRENT_TIMESTAMP
WHERE "code" IN ('legacy_unsorted', 'legacy_pending');

UPDATE "whatsapp_templates"
SET "remark" = replace("remark", '本月租金账单发送', '本月租金賬單發送'),
    "updated_at" = CURRENT_TIMESTAMP
WHERE "remark" LIKE '%本月租金账单发送%';

UPDATE "whatsapp_templates"
SET "remark" = replace("remark", '月度缴费截止日期提醒，今日是最后期限', '月度繳費截止日期提醒，今日是最後期限'),
    "updated_at" = CURRENT_TIMESTAMP
WHERE "remark" LIKE '%月度缴费截止日期提醒%';

UPDATE "whatsapp_templates"
SET "remark" = replace(
      replace("remark", '月度账单已逾期', '月度賬單已逾期'),
      '加收手续费',
      '加收手續費'
    ),
    "updated_at" = CURRENT_TIMESTAMP
WHERE "remark" LIKE '%月度账单已逾期%' OR "remark" LIKE '%加收手续费%';

UPDATE "whatsapp_templates"
SET "remark" = replace("remark", '【收据】收款确认', '【收據】收款確認'),
    "updated_at" = CURRENT_TIMESTAMP
WHERE "remark" LIKE '%【收据】收款确认%';

UPDATE "whatsapp_templates"
SET "remark" = '請改綁回紗廠3樓對應分類；示意圖檔案已保留。【紗廠工業大廈3樓】',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "template_name" = 'monthly_lastday_remark_sp03'
  AND "remark" LIKE '%请改绑%';
