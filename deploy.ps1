# Leapbud 租赁系统 — Docker 蓝绿部署脚本 (PowerShell)
# 用法: .\deploy.ps1 [blue|green|switch|down-blue|down-green|status|cleanup|help] [blue|green]
#
# blue / green：仅构建并启动对应环境，不拆除对侧、不自动切流量。
# 验证通过后请自行：.\deploy.ps1 switch <blue|green>，再 .\deploy.ps1 down-<对侧> 清理旧环境。

param(
    [Parameter(Position=0)]
    [ValidateSet("blue", "green", "switch", "down-blue", "down-green", "status", "cleanup", "help")]
    [string]$Action = "help",

    [Parameter(Position=1)]
    [ValidateSet("blue", "green")]
    [string]$Target = ""
)

$NETWORK_NAME = "leapbud-lease-network"

function Write-Info { param([string]$Message) Write-Host "[INFO] $Message" -ForegroundColor Blue }
function Write-Success { param([string]$Message) Write-Host "[SUCCESS] $Message" -ForegroundColor Green }
function Write-Warn { param([string]$Message) Write-Host "[WARNING] $Message" -ForegroundColor Yellow }
function Write-Err { param([string]$Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }

function Test-Dependencies {
    Write-Info "检查依赖..."
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Err "未安装 Docker"
        exit 1
    }
    if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
        $script:COMPOSE_CMD = "docker-compose"
    } elseif (docker compose version 2>$null) {
        $script:COMPOSE_CMD = "docker compose"
    } else {
        Write-Err "未安装 Docker Compose"
        exit 1
    }
    Write-Success "依赖检查通过 (使用: $COMPOSE_CMD)"
}

function Initialize-EnvFile {
    if (-not (Test-Path .env)) {
        if (Test-Path env.production) {
            Write-Info "从 env.production 创建 .env ..."
            Copy-Item -Path "env.production" -Destination ".env"
            Write-Success ".env 已创建，请修改其中的密码与 JWT_SECRET"
        } else {
            Write-Warn "未找到 .env 或 env.production"
        }
    } else {
        Write-Info ".env 已存在"
    }
}

function New-Network {
    Write-Info "创建 Docker 网络 $NETWORK_NAME ..."
    docker network create $NETWORK_NAME 2>$null
    if ($LASTEXITCODE -eq 0) { Write-Success "网络已创建" } else { Write-Warn "网络可能已存在" }
}

function Start-BaseServices {
    Write-Info "启动 PostgreSQL、Adminer ..."
    & $COMPOSE_CMD -f docker-compose.base.yml up -d
    if ($LASTEXITCODE -ne 0) { Write-Err "基础服务启动失败"; exit 1 }
    Write-Success "PostgreSQL、Adminer 已启动 — Adminer: http://localhost:3401"
}

function Deploy-Blue {
    Write-Info "部署蓝环境（保留绿环境，不切流量）..."
    & $COMPOSE_CMD -f docker-compose.base.yml -f docker-compose.blue.yml up -d --build
    if ($LASTEXITCODE -ne 0) { Write-Err "蓝环境部署失败"; exit 1 }
    Write-Info "等待服务就绪（约 60 秒）..."
    Start-Sleep -Seconds 60
    Write-Success "蓝环境部署完成"
    Write-Warn "流量未切换。验证通过后执行: .\deploy.ps1 switch blue"
    Write-Warn "确认无问题后可清理绿环境: .\deploy.ps1 down-green"
}

function Deploy-Green {
    Write-Info "部署绿环境（保留蓝环境，不切流量）..."
    & $COMPOSE_CMD -f docker-compose.base.yml -f docker-compose.green.yml up -d --build
    if ($LASTEXITCODE -ne 0) { Write-Err "绿环境部署失败"; exit 1 }
    Write-Info "等待服务就绪（约 60 秒）..."
    Start-Sleep -Seconds 60
    Write-Success "绿环境部署完成"
    Write-Warn "流量未切换。验证通过后执行: .\deploy.ps1 switch green"
    Write-Warn "确认无问题后可清理蓝环境: .\deploy.ps1 down-blue"
}

function Apply-NginxEnvConf {
    param([ValidateSet("blue", "green")][string]$Env)
    $cert = "docker\nginx\ssl\cert.pem"
    $key = "docker\nginx\ssl\key.pem"
    $httpsConf = "docker\nginx\nginx.$Env.https.conf"
    if ((Test-Path $cert) -and (Test-Path $key) -and (Test-Path $httpsConf)) {
        Copy-Item -Path $httpsConf -Destination "docker\nginx\nginx.conf" -Force
        Write-Info "已应用 $Env 配置（HTTP + HTTPS）"
    } else {
        Copy-Item -Path "docker\nginx\nginx.$Env.conf" -Destination "docker\nginx\nginx.conf" -Force
        Write-Warn "未找到 SSL 证书，使用仅 HTTP 配置"
    }
}

function Switch-ToBlue {
    Write-Info "切换流量到蓝环境 ..."
    Apply-NginxEnvConf -Env blue
    & $COMPOSE_CMD -f docker-compose.nginx.yml up -d --force-recreate nginx
    if ($LASTEXITCODE -ne 0) { Write-Err "切换失败"; exit 1 }
    Write-Success "已切换到蓝环境"
}

function Switch-ToGreen {
    Write-Info "切换流量到绿环境 ..."
    Apply-NginxEnvConf -Env green
    & $COMPOSE_CMD -f docker-compose.nginx.yml up -d --force-recreate nginx
    if ($LASTEXITCODE -ne 0) { Write-Err "切换失败"; exit 1 }
    Write-Success "已切换到绿环境"
}

function Stop-Blue {
    Write-Info "停止并移除蓝环境容器 ..."
    & $COMPOSE_CMD -f docker-compose.blue.yml down
    Write-Success "蓝环境已停止（数据卷保留）"
}

function Stop-Green {
    Write-Info "停止并移除绿环境容器 ..."
    & $COMPOSE_CMD -f docker-compose.green.yml down
    Write-Success "绿环境已停止（数据卷保留）"
}

function Initialize-SslCerts {
    $sslDir = "docker\nginx\ssl"
    $cert = Join-Path $sslDir "cert.pem"
    $key = Join-Path $sslDir "key.pem"
    if ((Test-Path $cert) -and (Test-Path $key)) {
        Write-Success "SSL 证书已就绪"
        return
    }
    if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) {
        Write-Warn "未找到证书且本机无 openssl，请先按 docker\nginx\ssl\README.md 生成 cert.pem / key.pem"
        return
    }
    Write-Info "生成开发用自签名 SSL 证书 ..."
    Push-Location $sslDir
    openssl genrsa -out key.pem 2048 2>$null
    openssl req -new -x509 -key key.pem -out cert.pem -days 365 -subj "/CN=localhost" 2>$null
    Pop-Location
    if ((Test-Path $cert) -and (Test-Path $key)) {
        Write-Success "自签名证书已生成"
    } else {
        Write-Warn "证书生成失败，HTTPS 可能不可用"
    }
}

function Start-Nginx {
    Write-Info "启动 Nginx 入口 (HTTP 3400 / HTTPS 3443) ..."
    Initialize-SslCerts
    if (-not (Test-Path "docker\nginx\nginx.conf")) {
        Apply-NginxEnvConf -Env blue
    }
    & $COMPOSE_CMD -f docker-compose.nginx.yml up -d
    if ($LASTEXITCODE -ne 0) { Write-Err "Nginx 启动失败"; exit 1 }
    Write-Success "Nginx 已启动 — HTTP: http://localhost:3400  HTTPS: https://localhost:3443"
}

function Show-Status {
    Write-Info "系统状态:"
    Write-Host "`n--- PostgreSQL / Adminer ---"
    & $COMPOSE_CMD -f docker-compose.base.yml ps
    Write-Host "`n--- 蓝环境 ---"
    & $COMPOSE_CMD -f docker-compose.blue.yml ps 2>$null
    Write-Host "`n--- 绿环境 ---"
    & $COMPOSE_CMD -f docker-compose.green.yml ps 2>$null
    Write-Host "`n--- Nginx ---"
    & $COMPOSE_CMD -f docker-compose.nginx.yml ps 2>$null
}

function Clear-AllServices {
    Write-Warn "停止并清理所有 Leapbud Docker 服务 ..."
    & $COMPOSE_CMD -f docker-compose.blue.yml down 2>$null
    & $COMPOSE_CMD -f docker-compose.green.yml down 2>$null
    & $COMPOSE_CMD -f docker-compose.nginx.yml down 2>$null
    & $COMPOSE_CMD -f docker-compose.base.yml down 2>$null
    docker network rm $NETWORK_NAME 2>$null
    Write-Success "清理完成（数据卷默认保留，需手动 docker volume rm 才会删库）"
}

function Show-Help {
    Write-Host "Leapbud 租赁系统 — Docker 蓝绿部署" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  .\deploy.ps1 blue              # 仅构建并启动蓝环境（不拆绿、不切流量）"
    Write-Host "  .\deploy.ps1 green             # 仅构建并启动绿环境（不拆蓝、不切流量）"
    Write-Host "  .\deploy.ps1 switch blue       # 切换入口流量到蓝环境"
    Write-Host "  .\deploy.ps1 switch green      # 切换入口流量到绿环境"
    Write-Host "  .\deploy.ps1 down-blue         # 停止并移除蓝环境容器"
    Write-Host "  .\deploy.ps1 down-green        # 停止并移除绿环境容器"
    Write-Host "  .\deploy.ps1 status            # 查看状态"
    Write-Host "  .\deploy.ps1 cleanup           # 停止所有容器"
    Write-Host ""
    Write-Host "推荐发布流程（当前绿环境在线时发新版到蓝）:"
    Write-Host "  1. .\deploy.ps1 blue"
    Write-Host "  2. 在蓝环境验证"
    Write-Host "  3. .\deploy.ps1 switch blue"
    Write-Host "  4. .\deploy.ps1 down-green"
    Write-Host ""
    Write-Host "HTTP:    http://localhost:3400"
    Write-Host "HTTPS:   https://localhost:3443"
    Write-Host "Adminer: http://localhost:3401"
    Write-Host "Swagger: http://localhost:3400/api/docs"
}

switch ($Action) {
    "blue" {
        Test-Dependencies
        Initialize-EnvFile
        New-Network
        Start-BaseServices
        Deploy-Blue
        Start-Nginx
        Show-Status
    }
    "green" {
        Test-Dependencies
        Initialize-EnvFile
        New-Network
        Start-BaseServices
        Deploy-Green
        Start-Nginx
        Show-Status
    }
    "switch" {
        if ([string]::IsNullOrEmpty($Target)) {
            Write-Err "请指定 blue 或 green"
            exit 1
        }
        Test-Dependencies
        if ($Target -eq "blue") { Switch-ToBlue } else { Switch-ToGreen }
        Show-Status
    }
    "down-blue" { Test-Dependencies; Stop-Blue; Show-Status }
    "down-green" { Test-Dependencies; Stop-Green; Show-Status }
    "status" { Test-Dependencies; Show-Status }
    "cleanup" { Test-Dependencies; Clear-AllServices }
    default { Show-Help }
}
