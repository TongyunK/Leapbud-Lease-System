# SSL 证书目录

Nginx HTTPS（容器内 `443`，宿主机 **`3443`**）读取容器路径 `/etc/nginx/ssl/cert.pem` 与 `key.pem`。

## 生产（推荐）：挂载同机共用 ACME 证书

按 `docs/HTTPS-其他项目.md`：**不要**把证书拷进本仓库。Compose 默认：

```text
SSL_HOST_PATH=/home/proj_deploy/Documents/acme-edge/ssl
→ 容器 /etc/nginx/ssl
```

在 `.env`（可由 `env.production` 复制）中确认 `SSL_HOST_PATH`，然后：

```bash
./deploy.sh blue          # 或已有环境时
./switch-nginx-env.sh blue
# 或强制重建入口
docker compose -f docker-compose.nginx.yml up -d --force-recreate nginx
```

访问：`https://<公网IP>:3443/`

续期后需 recreate 本项目 Nginx。root crontab 的 `LE_RECREATE_NGINX` 须包含容器名 **`leapbud-lease-nginx`**，例如：

```cron
0 */12 * * * LE_IP=103.68.62.241 LE_RECREATE_NGINX="tkho-booking-nginx leapbud-lease-nginx" /home/proj_deploy/Documents/acme-edge/scripts/letsencrypt-ip-cert.sh renew >> /var/log/le-ip-renew.log 2>&1
```

自检：

```bash
ls /home/proj_deploy/Documents/acme-edge/ssl/
docker inspect leapbud-lease-nginx --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
```

挂载源应为：`/home/proj_deploy/Documents/acme-edge/ssl`。

## 本机开发：自签名（可选）

`.env` 设：

```env
SSL_HOST_PATH=./docker/nginx/ssl
```

然后生成 pem（勿提交 Git）：

```powershell
cd docker\nginx\ssl
openssl genrsa -out key.pem 2048
openssl req -new -x509 -key key.pem -out cert.pem -days 365 -subj "/C=CN/ST=HongKong/L=HongKong/O=Leapbud/CN=localhost"
```

```bash
cd docker/nginx/ssl
openssl genrsa -out key.pem 2048
openssl req -new -x509 -key key.pem -out cert.pem -days 365 -subj "/C=CN/ST=HongKong/L=HongKong/O=Leapbud/CN=localhost"
```

- HTTP：`http://localhost:3400`
- HTTPS：`https://localhost:3443`（自签名浏览器会提示不受信任，属正常）
