-- 枚举类型注释
COMMENT ON TYPE "RoomStatus" IS '房间状态';
COMMENT ON TYPE "UserRole" IS '用户角色';
COMMENT ON TYPE "UserStatus" IS '用户状态';
COMMENT ON TYPE "RoomConfigType" IS '房间配置字典类型';

-- ========== users ==========
COMMENT ON TABLE "users" IS '系统用户';
COMMENT ON COLUMN "users"."id" IS '主键';
COMMENT ON COLUMN "users"."account" IS '登录账号（手机号或系统账号）';
COMMENT ON COLUMN "users"."password_hash" IS '密码哈希（不可明文存储）';
COMMENT ON COLUMN "users"."display_name" IS '显示名称';
COMMENT ON COLUMN "users"."role" IS '角色：admin=管理员，user=普通用户';
COMMENT ON COLUMN "users"."status" IS '账号状态：active=启用，disabled=停用';
COMMENT ON COLUMN "users"."phone" IS '联系电话';
COMMENT ON COLUMN "users"."email" IS '邮箱';
COMMENT ON COLUMN "users"."created_at" IS '创建时间';
COMMENT ON COLUMN "users"."updated_at" IS '更新时间';

-- ========== room_config_options ==========
COMMENT ON TABLE "room_config_options" IS '房间配置字典：尺寸区间 / 窗户 / 空调';
COMMENT ON COLUMN "room_config_options"."id" IS '主键';
COMMENT ON COLUMN "room_config_options"."type" IS '配置类型：size / window / ac';
COMMENT ON COLUMN "room_config_options"."label" IS '配置描述（展示用标签）';
COMMENT ON COLUMN "room_config_options"."min_sqft" IS '尺寸下限（平方呎，含下限；仅 size 类型使用）';
COMMENT ON COLUMN "room_config_options"."max_sqft" IS '尺寸上限（平方呎，不含上限；仅 size 类型使用）';
COMMENT ON COLUMN "room_config_options"."brand" IS '空调品牌（仅 ac 类型可选）';
COMMENT ON COLUMN "room_config_options"."model" IS '空调型号（仅 ac 类型可选）';
COMMENT ON COLUMN "room_config_options"."sort_order" IS '排序权重，越小越靠前';
COMMENT ON COLUMN "room_config_options"."active" IS '是否启用（停用后表单不下拉展示）';
COMMENT ON COLUMN "room_config_options"."created_at" IS '创建时间';
COMMENT ON COLUMN "room_config_options"."updated_at" IS '更新时间';

-- ========== buildings ==========
COMMENT ON TABLE "buildings" IS '大厦信息';
COMMENT ON COLUMN "buildings"."id" IS '主键';
COMMENT ON COLUMN "buildings"."name" IS '大厦名称';
COMMENT ON COLUMN "buildings"."address" IS '地址（中文）';
COMMENT ON COLUMN "buildings"."address_en" IS '地址（英文）';
COMMENT ON COLUMN "buildings"."manager" IS '负责人';
COMMENT ON COLUMN "buildings"."manager_phone" IS '负责人电话';
COMMENT ON COLUMN "buildings"."agreement_template" IS '协议书模板';
COMMENT ON COLUMN "buildings"."agreement_logo" IS '协议书 Logo';
COMMENT ON COLUMN "buildings"."api_template_suffix" IS 'API 模板名称后缀';
COMMENT ON COLUMN "buildings"."logo2" IS '备用 Logo';
COMMENT ON COLUMN "buildings"."email" IS '大厦邮箱';
COMMENT ON COLUMN "buildings"."working_hours" IS '工作时间';
COMMENT ON COLUMN "buildings"."invoice_template" IS '发票模板';
COMMENT ON COLUMN "buildings"."invoice_logo" IS '发票 Logo';
COMMENT ON COLUMN "buildings"."fps_id" IS 'FPS 收款标识';
COMMENT ON COLUMN "buildings"."bank_account_holder" IS '银行户主名称';
COMMENT ON COLUMN "buildings"."bank_account" IS '大厦银行账户';
COMMENT ON COLUMN "buildings"."cheque_payment_by" IS '支票付款抬头';
COMMENT ON COLUMN "buildings"."payment_advice" IS '付款提示 / Payment Advice';
COMMENT ON COLUMN "buildings"."receipt_template" IS '收据模板';
COMMENT ON COLUMN "buildings"."receipt_top_logo" IS '收据顶部 Logo';
COMMENT ON COLUMN "buildings"."receipt_left_logo" IS '收据左侧 Logo';
COMMENT ON COLUMN "buildings"."receipt_right_logo" IS '收据右侧 Logo';
COMMENT ON COLUMN "buildings"."building_config" IS '大厦配置（扩展 JSON/文本）';
COMMENT ON COLUMN "buildings"."use_wba_number" IS '是否使用 WBA_NUMBER';
COMMENT ON COLUMN "buildings"."created_at" IS '创建时间';
COMMENT ON COLUMN "buildings"."updated_at" IS '更新时间';

-- ========== rooms ==========
COMMENT ON TABLE "rooms" IS '房间信息';
COMMENT ON COLUMN "rooms"."id" IS '主键';
COMMENT ON COLUMN "rooms"."room_code" IS '房间编号（业务唯一）';
COMMENT ON COLUMN "rooms"."name" IS '房间名称';
COMMENT ON COLUMN "rooms"."room_type" IS '房间类型（如办公室、会议室等）';
COMMENT ON COLUMN "rooms"."building_id" IS '所属大厦 ID';
COMMENT ON COLUMN "rooms"."status" IS '房间状态';
COMMENT ON COLUMN "rooms"."serial_no" IS '内部序号 / 流水号';
COMMENT ON COLUMN "rooms"."monthly_rent" IS '月租';
COMMENT ON COLUMN "rooms"."daily_rent" IS '日租';
COMMENT ON COLUMN "rooms"."hourly_rent" IS '时租';
COMMENT ON COLUMN "rooms"."size_sqft" IS '房间呎寸（平方呎）';
COMMENT ON COLUMN "rooms"."image1" IS '房间图片 1';
COMMENT ON COLUMN "rooms"."image2" IS '房间图片 2';
COMMENT ON COLUMN "rooms"."image3" IS '房间图片 3';
COMMENT ON COLUMN "rooms"."description" IS '房间描述';
COMMENT ON COLUMN "rooms"."remark" IS '备注';
COMMENT ON COLUMN "rooms"."room_size_config" IS '房间大小配置（对应字典 label 或区间描述）';
COMMENT ON COLUMN "rooms"."window_config" IS '窗户配置';
COMMENT ON COLUMN "rooms"."ac_config" IS '空调配置';
COMMENT ON COLUMN "rooms"."latest_contract" IS '最新合约标识 / 编号';
COMMENT ON COLUMN "rooms"."contract_records" IS '历史合约记录列表';
COMMENT ON COLUMN "rooms"."created_by" IS '创建人';
COMMENT ON COLUMN "rooms"."sublease_mark" IS '分租标记';
COMMENT ON COLUMN "rooms"."created_at" IS '创建时间';
COMMENT ON COLUMN "rooms"."updated_at" IS '更新时间';
