import { User } from '@prisma/client';

/** 对齐前端用户列表 / 登录返回（不含密码） */
export function toUserDto(user: User) {
  return {
    id: user.id,
    account: user.account,
    displayName: user.displayName,
    role: user.role,
    roles: [user.role],
    status: user.status,
    phone: user.phone,
    email: user.email,
    createdAt: formatDateTime(user.createdAt),
    updatedAt: formatDateTime(user.updatedAt),
  };
}

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
