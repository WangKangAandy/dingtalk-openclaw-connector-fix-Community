#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Clash Verge + WSL2 NAT 代理互通一键修复（社区推荐路径，非 mirrored）

.DESCRIPTION
  调研结论（微软 WSL issue #12807/#13210/#13456 + Clash Verge PR #2963）：
  - mirrored + 系统代理 127.0.0.1 不稳定（启动顺序、休眠、静默回退 NAT）
  - 更稳：保持 NAT，开启 allow-lan，并把系统代理主机改成 WSL 虚拟网卡 IP

  本脚本会：
  1) 在当前订阅的 Merge 配置写入 allow-lan
  2) 把 verge.yaml 的 proxy_host 设为 vEthernet (WSL) IPv4
  3) 重启 clash_verge_service，使 mixed-port 监听 0.0.0.0
  4) 刷新系统代理为 <WSL-IP>:7897
#>

$ErrorActionPreference = 'Stop'
$vergeDir = Join-Path $env:APPDATA 'io.github.clash-verge-rev.clash-verge-rev'
$vergeYaml = Join-Path $vergeDir 'verge.yaml'
$mergeYaml = Join-Path $vergeDir 'profiles\mVcXuVmLZIG7.yaml'
$port = 7897

$wslIp = (
  Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.InterfaceAlias -like '*WSL*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -First 1 -ExpandProperty IPAddress
)
if (-not $wslIp) { throw '未找到 vEthernet (WSL) IPv4，请先打开一次 WSL。' }
Write-Host "WSL host IP = $wslIp"

@'
# Profile Enhancement Merge Template for Clash Verge
allow-lan: true
bind-address: "*"
'@ | Set-Content -Path $mergeYaml -Encoding utf8

if (-not (Test-Path $vergeYaml)) { throw "缺少 $vergeYaml" }
$content = Get-Content $vergeYaml -Raw
if ($content -match '(?m)^proxy_host:\s*.+$') {
  $content = [regex]::Replace($content, '(?m)^proxy_host:\s*.+$', "proxy_host: $wslIp")
} else {
  $content += "`nproxy_host: $wslIp`n"
}
Set-Content -Path $vergeYaml -Value $content -Encoding utf8

foreach ($f in @('clash-verge.yaml', 'config.yaml')) {
  $p = Join-Path $vergeDir $f
  if (Test-Path $p) {
    (Get-Content $p -Raw) -replace '(?m)^allow-lan:\s*false\s*$', 'allow-lan: true' |
      Set-Content -Path $p -Encoding utf8
  }
}

Write-Host 'Restarting clash_verge_service...'
Restart-Service clash_verge_service -Force
Start-Sleep -Seconds 5

$listen = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
$listen | Select-Object LocalAddress, LocalPort | Format-Table -AutoSize
if (-not ($listen | Where-Object { $_.LocalAddress -in @('0.0.0.0', $wslIp, '::') })) {
  Write-Warning "mixed-port 仍可能只绑 127.0.0.1。请打开 Clash Verge → 设置 → 开启「允许局域网」，再开关一次系统代理。"
}

Set-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -Name ProxyEnable -Value 1
Set-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -Name ProxyServer -Value "${wslIp}:$port"
Write-Host "System proxy => ${wslIp}:$port"
Write-Host 'Done. 在 WSL 执行: curl -I -x http://$(ip route show default | awk "{print \$3}"):7897 https://www.baidu.com'
