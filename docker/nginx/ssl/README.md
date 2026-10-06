# SSL 证书目录

将证书放在此目录，供 Nginx HTTPS（容器内 `443`）使用：

| 文件 | 说明 |
|------|------|
| `cert.pem` | 证书 |
| `key.pem` | 私钥 |

## 开发环境：生成自签名证书

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

生成后重启 Nginx：

```powershell
docker compose -f docker-compose.nginx.yml up -d --force-recreate nginx
```

## 访问

- HTTP：`http://localhost:3400`
- HTTPS：`https://localhost:3443`（浏览器会提示自签名证书不受信任，属正常）

生产环境请使用 Let's Encrypt 等正式证书，勿将 `*.pem` 提交到 Git。
