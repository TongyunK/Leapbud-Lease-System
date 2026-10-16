#!/bin/sh
set -e

echo "[entrypoint] 等待数据库并执行迁移..."
attempt=1
max_attempts=30
resolved_failed=0

try_resolve_failed_migration() {
  log_file=$(mktemp)
  npx prisma migrate deploy >"$log_file" 2>&1 && {
    cat "$log_file"
    rm -f "$log_file"
    return 0
  }
  cat "$log_file"
  if grep -q "P3009" "$log_file"; then
    failed=$(sed -n 's/.*`\([^`]*\)` migration started.*/\1/p' "$log_file" | head -1)
    if [ -n "$failed" ] && [ "$resolved_failed" -eq 0 ]; then
      echo "[entrypoint] 发现失败迁移 $failed，标记为已回滚后重试一次..."
      npx prisma migrate resolve --rolled-back "$failed" || true
      resolved_failed=1
      rm -f "$log_file"
      npx prisma migrate deploy && return 0
    fi
  fi
  rm -f "$log_file"
  return 1
}

while [ "$attempt" -le "$max_attempts" ]; do
  if try_resolve_failed_migration; then
    echo "[entrypoint] 数据库迁移完成"
    break
  fi
  echo "[entrypoint] 迁移失败（第 ${attempt}/${max_attempts} 次），5 秒后重试..."
  attempt=$((attempt + 1))
  sleep 5
done

if [ "$attempt" -gt "$max_attempts" ]; then
  echo "[entrypoint] 数据库迁移超时，退出"
  exit 1
fi

echo "[entrypoint] 启动应用..."
exec "$@"
