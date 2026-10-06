#!/bin/bash

# Leapbud 租赁系统 — Docker Nginx 蓝绿流量切换
# 用法: ./switch-nginx-env.sh [blue|green|status|help]

set -e

NGINX_CONTAINER="leapbud-lease-nginx"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

detect_compose_cmd() {
    if command -v docker-compose >/dev/null 2>&1; then
        COMPOSE_CMD="docker-compose"
    elif docker compose version >/dev/null 2>&1; then
        COMPOSE_CMD="docker compose"
    else
        log_error "Docker Compose 未安装"
        exit 1
    fi
}

check_nginx() {
    if ! docker ps --format '{{.Names}}' | grep -q "^${NGINX_CONTAINER}$"; then
        log_warning "Nginx 容器未运行，正在启动..."
        start_nginx
    else
        log_success "Nginx 容器运行正常"
    fi
}

start_nginx() {
    log_info "启动 Nginx 容器..."
    $COMPOSE_CMD -f docker-compose.nginx.yml up -d
    sleep 3
    if docker ps --format '{{.Names}}' | grep -q "^${NGINX_CONTAINER}$"; then
        log_success "Nginx 容器启动成功"
    else
        log_error "Nginx 容器启动失败"
        exit 1
    fi
}

reload_nginx() {
    log_info "测试并重新加载 Nginx 配置..."
    if docker exec "$NGINX_CONTAINER" nginx -t 2>&1; then
        docker exec "$NGINX_CONTAINER" nginx -s reload
        return 0
    fi
    return 1
}

rollback_nginx_conf() {
    local latest_backup
    latest_backup=$(ls -t docker/nginx/nginx.conf.backup.* 2>/dev/null | head -1)
    if [ -n "$latest_backup" ]; then
        cp "$latest_backup" docker/nginx/nginx.conf
        reload_nginx || true
        log_warning "已回滚到之前的 Nginx 配置"
    fi
}

apply_nginx_env_conf() {
    local env="$1"
    local cert="docker/nginx/ssl/cert.pem"
    local key="docker/nginx/ssl/key.pem"
    local http_conf="docker/nginx/nginx.${env}.conf"
    local https_conf="docker/nginx/nginx.${env}.https.conf"

    if [ ! -f "$http_conf" ]; then
        log_error "缺少 $http_conf"
        exit 1
    fi

    if [ -f "$cert" ] && [ -f "$key" ] && [ -f "$https_conf" ]; then
        cp "$https_conf" docker/nginx/nginx.conf
        log_info "已应用 ${env} 配置（HTTP + HTTPS）"
    else
        cp "$http_conf" docker/nginx/nginx.conf
        log_warning "未找到 SSL 证书，使用仅 HTTP 配置（入口 http://服务器:3400）"
    fi
}

activate_nginx_config() {
    if docker ps --format '{{.Names}}' | grep -q "^${NGINX_CONTAINER}$"; then
        if reload_nginx; then
            return 0
        fi
    fi
    log_info "重新创建 Nginx 容器以加载新配置..."
    $COMPOSE_CMD -f docker-compose.nginx.yml up -d --force-recreate nginx
    sleep 3
    if docker ps --format '{{.Names}}' | grep -q "^${NGINX_CONTAINER}$"; then
        docker exec "$NGINX_CONTAINER" nginx -t
        return 0
    fi
    return 1
}

switch_to_blue() {
    log_info "切换到蓝环境..."

    if [ -f "docker/nginx/nginx.conf" ]; then
        cp docker/nginx/nginx.conf "docker/nginx/nginx.conf.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
        log_info "已备份当前 nginx.conf"
    fi

    apply_nginx_env_conf blue

    if activate_nginx_config; then
        log_success "已切换到蓝环境 (前端: leapbud-lease-frontend-blue:80, 后端: leapbud-lease-backend-blue:3410)"
    else
        log_error "Nginx 启动失败，请执行: docker logs leapbud-lease-nginx"
        rollback_nginx_conf
        exit 1
    fi
}

switch_to_green() {
    log_info "切换到绿环境..."

    if [ -f "docker/nginx/nginx.conf" ]; then
        cp docker/nginx/nginx.conf "docker/nginx/nginx.conf.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
        log_info "已备份当前 nginx.conf"
    fi

    apply_nginx_env_conf green

    if activate_nginx_config; then
        log_success "已切换到绿环境 (前端: leapbud-lease-frontend-green:80, 后端: leapbud-lease-backend-green:3410)"
    else
        log_error "Nginx 启动失败，请执行: docker logs leapbud-lease-nginx"
        rollback_nginx_conf
        exit 1
    fi
}

show_status() {
    log_info "Nginx 蓝绿状态:"
    echo ""

    if docker ps --format '{{.Names}}\t{{.Status}}' | grep -q "$NGINX_CONTAINER"; then
        echo -e "${GREEN}✓${NC} Nginx: $(docker ps --format '{{.Status}}' --filter name=$NGINX_CONTAINER)"
    else
        echo -e "${RED}✗${NC} Nginx: 未运行"
    fi

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    if [ -f "docker/nginx/nginx.conf" ]; then
        if grep -q "leapbud-lease-frontend-blue" docker/nginx/nginx.conf 2>/dev/null; then
            echo -e "📍 当前流量: ${BLUE}蓝环境 (BLUE)${NC}"
        elif grep -q "leapbud-lease-frontend-green" docker/nginx/nginx.conf 2>/dev/null; then
            echo -e "📍 当前流量: ${GREEN}绿环境 (GREEN)${NC}"
        else
            echo -e "📍 当前流量: ${YELLOW}未知${NC}"
        fi
    else
        echo -e "📍 当前流量: ${RED}nginx.conf 不存在${NC}"
    fi

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    echo "🔵 蓝环境:"
    for c in leapbud-lease-backend-blue leapbud-lease-frontend-blue; do
        if docker ps --format '{{.Names}}' | grep -q "^${c}$"; then
            echo -e "   ${GREEN}✓${NC} $c: $(docker ps --format '{{.Status}}' --filter name=$c)"
        else
            echo -e "   ${RED}✗${NC} $c: 未运行"
        fi
    done

    echo ""
    echo "🟢 绿环境:"
    for c in leapbud-lease-backend-green leapbud-lease-frontend-green; do
        if docker ps --format '{{.Names}}' | grep -q "^${c}$"; then
            echo -e "   ${GREEN}✓${NC} $c: $(docker ps --format '{{.Status}}' --filter name=$c)"
        else
            echo -e "   ${RED}✗${NC} $c: 未运行"
        fi
    done

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "🌐 访问地址:"
    echo "   入口 HTTP:  http://localhost:3400"
    echo "   入口 HTTPS: https://localhost:3443"
    echo "   蓝后端直连: http://localhost:3411"
    echo "   蓝前端直连: http://localhost:3412"
    echo "   绿后端直连: http://localhost:3413"
    echo "   绿前端直连: http://localhost:3414"
    echo ""
}

main() {
    detect_compose_cmd

    case "${1:-help}" in
        blue)
            check_nginx
            switch_to_blue
            echo ""
            show_status
            ;;
        green)
            check_nginx
            switch_to_green
            echo ""
            show_status
            ;;
        status)
            show_status
            ;;
        help|*)
            echo "Leapbud Nginx 蓝绿流量切换"
            echo ""
            echo "用法:"
            echo "  \$0 blue      # 切换入口流量到蓝环境"
            echo "  \$0 green     # 切换入口流量到绿环境"
            echo "  \$0 status    # 查看当前流量指向与容器状态"
            echo ""
            ;;
    esac
}

main "$@"
