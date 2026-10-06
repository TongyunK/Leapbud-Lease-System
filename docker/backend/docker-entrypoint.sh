#!/bin/sh
set -e

echo "[entrypoint] 等待数据库并执行迁移..."
attempt=1
max_attempts=30
while [ "$attempt" -le "$max_attempts" ]; do
  if npx prisma migrate deploy; then
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
