-- 合并同一结算／按金退还下的多张未取消退款单，并回写 partial／paid／pending

-- 1) 同一 settlement 多单合并
DO $$
DECLARE
  sid text;
  primary_id text;
  total_amt numeric(14, 2);
  paid_sum numeric(14, 2);
  last_date date;
  last_method text;
  new_status "RefundOrderStatus";
  oid text;
  max_sort int;
BEGIN
  FOR sid IN
    SELECT settlement_id
    FROM refund_orders
    WHERE settlement_id IS NOT NULL
      AND status <> 'cancelled'
    GROUP BY settlement_id
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO primary_id
    FROM refund_orders
    WHERE settlement_id = sid AND status <> 'cancelled'
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    SELECT COALESCE(SUM(amount), 0) INTO total_amt
    FROM refund_orders
    WHERE settlement_id = sid AND status <> 'cancelled';

    UPDATE cash_flows cf
    SET
      refund_order_id = primary_id,
      source_id = CASE
        WHEN cf.source_type = 'refund_order'
          THEN md5(cf.id || clock_timestamp()::text || random()::text)
        ELSE cf.source_id
      END,
      updated_at = NOW()
    WHERE cf.refund_order_id IN (
      SELECT id FROM refund_orders
      WHERE settlement_id = sid AND status <> 'cancelled' AND id <> primary_id
    );

    SELECT COALESCE(MAX(sort_order), -1) INTO max_sort
    FROM refund_items
    WHERE refund_order_id = primary_id;

    FOR oid IN
      SELECT id FROM refund_orders
      WHERE settlement_id = sid AND status <> 'cancelled' AND id <> primary_id
      ORDER BY created_at ASC, id ASC
    LOOP
      UPDATE refund_items
      SET
        refund_order_id = primary_id,
        sort_order = sort_order + max_sort + 1,
        updated_at = NOW()
      WHERE refund_order_id = oid;

      SELECT COALESCE(MAX(sort_order), -1) INTO max_sort
      FROM refund_items
      WHERE refund_order_id = primary_id;

      UPDATE refund_order_attachments
      SET refund_order_id = primary_id, updated_at = NOW()
      WHERE refund_order_id = oid;

      UPDATE refund_orders
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = oid;
    END LOOP;

    SELECT COALESCE(SUM(amount), 0), MAX(flow_date)
    INTO paid_sum, last_date
    FROM cash_flows
    WHERE refund_order_id = primary_id AND direction = 'out';

    SELECT payment_method INTO last_method
    FROM cash_flows
    WHERE refund_order_id = primary_id AND direction = 'out'
    ORDER BY flow_date DESC, created_at DESC
    LIMIT 1;

    IF paid_sum <= 0.009 THEN
      new_status := 'pending';
    ELSIF paid_sum + 0.009 >= total_amt THEN
      new_status := 'paid';
    ELSE
      new_status := 'partial';
    END IF;

    UPDATE refund_orders
    SET
      amount = total_amt,
      paid_amount = paid_sum,
      refund_date = last_date,
      payment_method = COALESCE(last_method, payment_method),
      status = new_status,
      updated_at = NOW()
    WHERE id = primary_id;
  END LOOP;
END $$;

-- 2) 无 settlement、同一 deposit_refund_id 多单合并
DO $$
DECLARE
  did text;
  primary_id text;
  total_amt numeric(14, 2);
  paid_sum numeric(14, 2);
  last_date date;
  last_method text;
  new_status "RefundOrderStatus";
  oid text;
  max_sort int;
BEGIN
  FOR did IN
    SELECT deposit_refund_id
    FROM refund_orders
    WHERE deposit_refund_id IS NOT NULL
      AND settlement_id IS NULL
      AND status <> 'cancelled'
    GROUP BY deposit_refund_id
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO primary_id
    FROM refund_orders
    WHERE deposit_refund_id = did
      AND settlement_id IS NULL
      AND status <> 'cancelled'
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    SELECT COALESCE(SUM(amount), 0) INTO total_amt
    FROM refund_orders
    WHERE deposit_refund_id = did
      AND settlement_id IS NULL
      AND status <> 'cancelled';

    UPDATE cash_flows cf
    SET
      refund_order_id = primary_id,
      source_id = CASE
        WHEN cf.source_type = 'refund_order'
          THEN md5(cf.id || clock_timestamp()::text || random()::text)
        ELSE cf.source_id
      END,
      updated_at = NOW()
    WHERE cf.refund_order_id IN (
      SELECT id FROM refund_orders
      WHERE deposit_refund_id = did
        AND settlement_id IS NULL
        AND status <> 'cancelled'
        AND id <> primary_id
    );

    SELECT COALESCE(MAX(sort_order), -1) INTO max_sort
    FROM refund_items
    WHERE refund_order_id = primary_id;

    FOR oid IN
      SELECT id FROM refund_orders
      WHERE deposit_refund_id = did
        AND settlement_id IS NULL
        AND status <> 'cancelled'
        AND id <> primary_id
      ORDER BY created_at ASC, id ASC
    LOOP
      UPDATE refund_items
      SET
        refund_order_id = primary_id,
        sort_order = sort_order + max_sort + 1,
        updated_at = NOW()
      WHERE refund_order_id = oid;

      SELECT COALESCE(MAX(sort_order), -1) INTO max_sort
      FROM refund_items
      WHERE refund_order_id = primary_id;

      UPDATE refund_order_attachments
      SET refund_order_id = primary_id, updated_at = NOW()
      WHERE refund_order_id = oid;

      UPDATE refund_orders
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = oid;
    END LOOP;

    SELECT COALESCE(SUM(amount), 0), MAX(flow_date)
    INTO paid_sum, last_date
    FROM cash_flows
    WHERE refund_order_id = primary_id AND direction = 'out';

    SELECT payment_method INTO last_method
    FROM cash_flows
    WHERE refund_order_id = primary_id AND direction = 'out'
    ORDER BY flow_date DESC, created_at DESC
    LIMIT 1;

    IF paid_sum <= 0.009 THEN
      new_status := 'pending';
    ELSIF paid_sum + 0.009 >= total_amt THEN
      new_status := 'paid';
    ELSE
      new_status := 'partial';
    END IF;

    UPDATE refund_orders
    SET
      amount = total_amt,
      paid_amount = paid_sum,
      refund_date = last_date,
      payment_method = COALESCE(last_method, payment_method),
      status = new_status,
      updated_at = NOW()
    WHERE id = primary_id;
  END LOOP;
END $$;

-- 3) 全部未取消单按流水回写 paid_amount / status
UPDATE refund_orders ro
SET
  paid_amount = COALESCE((
    SELECT SUM(cf.amount)
    FROM cash_flows cf
    WHERE cf.refund_order_id = ro.id AND cf.direction = 'out'
  ), 0),
  refund_date = COALESCE((
    SELECT MAX(cf.flow_date)
    FROM cash_flows cf
    WHERE cf.refund_order_id = ro.id AND cf.direction = 'out'
  ), ro.refund_date),
  status = CASE
    WHEN COALESCE((
      SELECT SUM(cf.amount)
      FROM cash_flows cf
      WHERE cf.refund_order_id = ro.id AND cf.direction = 'out'
    ), 0) <= 0.009 THEN 'pending'::"RefundOrderStatus"
    WHEN COALESCE((
      SELECT SUM(cf.amount)
      FROM cash_flows cf
      WHERE cf.refund_order_id = ro.id AND cf.direction = 'out'
    ), 0) + 0.009 >= ro.amount THEN 'paid'::"RefundOrderStatus"
    ELSE 'partial'::"RefundOrderStatus"
  END,
  updated_at = NOW()
WHERE ro.status <> 'cancelled';
