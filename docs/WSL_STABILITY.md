# WSL2 + 代理环境下的 OpenClaw / 钉钉 Connector 稳定性

本文总结本机踩坑与社区调研结论，目标是：**Gateway 不静默死亡**，且 **WSL 能按需用上 Clash**（不必强行走 mirrored）。

## 现象

- 钉钉机器人「有时能回、有时完全没反应」
- WSL 启动提示：`检测到 localhost 代理配置，但未镜像到 WSL。NAT 模式下的 WSL 不支持 localhost 代理。`
- `systemctl --user status openclaw-gateway` 为 `failed`，`18789` 无监听

根因通常是两层叠加：

1. **Gateway 进程崩溃后被 systemd 熔断**（默认约 10 次 / 300s），之后彻底不再拉起 → 看起来像「偶发失灵」。
2. **Clash Verge 系统代理写死 `127.0.0.1:7897` 且 `allow-lan: false`** → WSL2 NAT 访问不到代理；海外依赖抖动时放大失败面。

## 社区调研结论（2025–2026）

| 方案 | 结论 |
|------|------|
| `networkingMode=mirrored` | 理论上可用 `127.0.0.1` 访问宿主机代理，但与 Clash 组合有多起报告：启动顺序依赖、休眠后断网、甚至静默回退 NAT（[WSL#12807](https://github.com/microsoft/WSL/issues/12807)、[#13210](https://github.com/microsoft/WSL/issues/13210)、[#13456](https://github.com/microsoft/WSL/issues/13456)）。**不作为默认推荐。** |
| NAT + `allow-lan` + 非本机 loopback 的 `proxy_host` | Clash Verge 社区推荐路径（[PR#2963](https://github.com/clash-verge-rev/clash-verge-rev/pull/2963)）：系统代理主机改为 WSL 虚拟网卡 IP，并允许局域网，WSL/Docker 才能继承代理。 |
| 国内钉钉 / DeepSeek | 多数场景 **可不走代理**；Gateway 侧应设置宽 `NO_PROXY`，避免错误代理把国内 API 拖死。 |

微软官方 mirrored 说明见：[Accessing network applications with WSL](https://learn.microsoft.com/windows/wsl/networking)。

## 推荐稳态配置

### 1. Windows：`%USERPROFILE%\.wslconfig`

保持 **NAT**（不要默认开 mirrored），可启用：

```ini
[wsl2]
localhostForwarding=true
dnsTunneling=true

[experimental]
autoMemoryReclaim=gradual
bestEffortDnsParsing=true
```

修改后执行：`wsl --shutdown`，再重新打开 WSL。

### 2. Clash Verge Rev

1. 设置 → **允许局域网连接**（`allow-lan: true`）
2. 系统代理 → **代理主机** 改为 `vEthernet (WSL)` 的 IPv4（例如 `172.22.32.1`，以本机为准）
3. 关闭再打开一次「系统代理」使设置生效

也可**管理员**运行仓库脚本：

```powershell
powershell -ExecutionPolicy Bypass -File .\docs\enable-clash-wsl-proxy.ps1
```

验证（在 WSL）：

```bash
GW=$(ip route show default | awk '{print $3; exit}')
curl -I -m 5 -x "http://$GW:7897" https://www.baidu.com
```

### 3. OpenClaw Gateway（WSL systemd user）

本机已落地：

- drop-in `~/.config/systemd/user/openclaw-gateway.service.d/stability.conf`
  - 放宽 `StartLimit*`，拉长 `TimeoutStartSec` / `RestartSec`
  - `NO_PROXY` 覆盖 localhost + 钉钉/阿里云/DeepSeek
  - 启动前刷新 `%t/openclaw-proxy.env`（仅当 Clash 局域网端口可达才写入 `HTTP_PROXY`）
- `openclaw-gateway-watchdog.timer`：每分钟探测 `18789`，挂了自动 `reset-failed` + `restart`

常用命令：

```bash
systemctl --user status openclaw-gateway
systemctl --user status openclaw-gateway-watchdog.timer
tail -f ~/.openclaw/logs/gateway-watchdog.log
journalctl --user -u openclaw-gateway -f
```

确保用户服务注销后仍在：`loginctl enable-linger $USER`。

## 排障顺序

1. `ss -lntp | grep 18789` —— 端口在不在  
2. `systemctl --user status openclaw-gateway` —— 是否 `failed` / 熔断  
3. Windows 代理是否仍是 `127.0.0.1:7897` 且 Clash 未开局域网  
4. 不要为了「消掉 WSL 那行代理警告」盲目切 mirrored；先走 allow-lan 路径  

## 不在本文范围

- `dws` skill 缺失导致「文档/日程」业务失败（消息通道可能仍正常）  
- 模型未在 `models.providers` 完整注册时的工具 schema 告警（见 `openclaw doctor`）
