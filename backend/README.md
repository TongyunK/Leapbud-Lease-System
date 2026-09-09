# Leapbud Lease Backend

NestJS + Prisma + PostgreSQL（本阶段暂无 Docker）。

## 本地启动

1. 复制环境变量并填入 postgres 密码：

```powershell
Copy-Item .env.example .env
# 编辑 .env：DATABASE_URL=postgresql://postgres:你的密码@127.0.0.1:5432/leapbud_lease?schema=public
```

2. 迁移并写入演示数据：

```powershell
npx prisma migrate dev --name init_buildings_rooms
npm run prisma:seed
```

3. 启动 API：

```powershell
npm run start:dev
```

- Health: `http://127.0.0.1:3410/api/health`
- Swagger: `http://127.0.0.1:3410/api/docs`
- Buildings: `GET /api/buildings`
- Rooms: `GET /api/rooms`
- Auth: `POST /api/auth/login`、`POST /api/auth/change-password`
- Users: `GET/POST /api/users`、`PATCH/DELETE /api/users/:id`（admin）
- Room configs: `GET /api/room-configs`、`POST/PATCH/DELETE`（写操作 admin）

演示账号：`admin` / `admin123`（工程师/管理员）；`user` / `user123`（普通用户，无系统管理）

前端 Vite 已代理 `/api` → `127.0.0.1:3410`。
