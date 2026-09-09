# Leapbud Lease System — Frontend

Vue 3 + Vite + TypeScript + Pinia + Vue Router + Element Plus + Tailwind + axios + vue-i18n

## 开发

```powershell
cd frontend
npm install
npm run dev
```

浏览器打开提示的本地地址（默认 `http://127.0.0.1:5173`），入口为登录页。

### 演示账号（后端未就绪时）

- 账号：`admin`
- 密码：`admin123`

## 目录约定

- `src/api/` — 按域拆分的接口 + axios 单例
- `src/stores/` — Pinia（用户会话、全局错误）
- `src/views/` — 页面（登录 / 注册 / 忘记密码 / 首页占位）
- `src/i18n/` — 中 / EN
- `src/utils/` — API 配置、公开路由、校验

语言偏好保存在 `localStorage` 键 `lb_locale`（默认 `zh-TW`）。
