# 同机其他 Docker 项目启用 HTTPS

本机已有共用 ACME Edge 与 IP 证书，**不必重新申请**。各业务只挂载同一份证书，并用自己的端口对外。

## 已有资源

| 项 | 路径 / 说明 |
|----|-------------|
| Edge（仅 :80） | `~/Documents/acme-edge`，容器名 `acme-edge` |
| 共用证书 | `/home/proj_deploy/Documents/acme-edge/ssl/`（`cert.pem` / `key.pem`） |
| 订房示例 | HTTP `3200` / HTTPS `3243` |

## 步骤（约 4 步）

### 1. 选未占用的 HTTPS 端口

例如 HTTP 为 `3400`，HTTPS 用 `3443`。不要占用宿主机 **80**（给 Edge）和业务已占用的端口。

### 2. Compose：映射 443 + 挂载共用 ssl

```yaml
ports:
  - "3400:80"
  - "3443:443"
volumes:
  - /home/proj_deploy/Documents/acme-edge/ssl:/etc/nginx/ssl:ro
```

### 3. Nginx：增加 HTTPS server

```nginx
server {
    listen 443 ssl;
    ssl_certificate     /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    # 反代规则与 HTTP 段相同
}
```

然后 recreate 该项目的 Nginx 容器。

访问：`https://<公网IP>:<HTTPS端口>/`

### 4. 续期后自动重启该容器

root crontab 中 `LE_RECREATE_NGINX` 加上该 Nginx **容器名**，例如：

```cron
0 */12 * * * LE_IP=103.68.62.241 LE_RECREATE_NGINX="tkho-booking-nginx leapbud-lease-nginx <你的nginx容器名>" /home/proj_deploy/Documents/acme-edge/scripts/letsencrypt-ip-cert.sh renew >> /var/log/le-ip-renew.log 2>&1
```

本仓库（Leapbud）已接好：HTTP `3400` / HTTPS `3443`，容器名 `leapbud-lease-nginx`，`.env` 中 `SSL_HOST_PATH` 指向上表共用证书目录。

## 不要做

- 再跑一遍 Let's Encrypt / 再签一张证  
- 把 `cert.pem` 拷贝到各项目目录（续期易漏更新）  
- 让业务占用宿主机 `:80`

## 自检

```bash
ls /home/proj_deploy/Documents/acme-edge/ssl/
openssl x509 -in /home/proj_deploy/Documents/acme-edge/ssl/cert.pem -noout -dates
docker inspect <nginx容器名> --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
```

挂载源应为：`/home/proj_deploy/Documents/acme-edge/ssl`。

更完整的从零签发说明见同目录 `README.md`。
