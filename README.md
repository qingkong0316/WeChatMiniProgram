# 上海地铁打卡 · 星图

> 把走过的每一座地铁站，点亮成夜空里的一颗星。

一款**不依赖云开发**的微信小程序：在地铁站附近通过 GPS 打卡，所有记录保存在本机。除了基础的打卡与进度统计，还内置了一张可缩放的「星空地铁全图」、100 个探索成就，以及为上海全网每一座车站撰写的沿途简介。

> 「如果有一天，我们现在所经历的也会消失在回忆里，我希望它能以别的方式被记住。」
> —— 开发者序言

---

## 目录

- [核心功能](#核心功能)
- [界面一览](#界面一览)
- [快速开始](#快速开始)
- [目录结构](#目录结构)
- [数据模型](#数据模型)
- [成就系统](#成就系统)
- [数据来源与生成脚本](#数据来源与生成脚本)
- [验证脚本](#验证脚本)
- [常见开发调试](#常见开发调试)
- [隐私说明](#隐私说明)

---

## 核心功能

| 模块 | 说明 |
| --- | --- |
| **GPS 打卡** | 定位后自动计算最近的 3 座车站，进入某站 **200 米**范围内即可打卡；距离 >50km 时提示可能不在上海 |
| **线路浏览** | 左侧线路栏切换 18 条主线 + 3 条特殊线路，右侧列出站点、已打卡状态与打卡时间；支持**本线/全线**站点搜索 |
| **站点备注** | 每个已打卡站点可添加不超过 30 字的备注 |
| **撤销打卡** | 支持单站撤销，或在星图中按站名撤销全部相关记录 |
| **双进度统计** | 同时展示「全线路整体进度」与「当前线路进度」（均按去重站名计算） |
| **探索面板** | 本月打卡数、最近一站、连续探索天数；统计弹层可跳转星图聚焦站点 |
| **备份与恢复** | 导出打卡与成就 JSON 到剪贴板，支持合并/覆盖导入 |
| **星空地铁图** | 一张基于 Canvas 2D 绘制的示意图：已打卡站点点亮为星星/换乘站为月亮，可缩放、拖动、按线路/标签筛选 |
| **站点简介** | 点击任意站点弹出卡片，展示该站在所属线路的位置、周边地标与沿途故事 |
| **成就图鉴** | 100 个成就，分 10 个主题篇章，达成条件后自动解锁；主页显示「差一点」提示 |

## 界面一览

小程序共两个页面：

- **主页 `pages/index`** —— 打卡、线路/站点列表、进度与成就入口。
- **星图页 `pages/metro-map`** —— 全屏夜空线路图，支持双指缩放、拖拽、线路筛选（全部 / 各线路）与标签筛选（未点亮 / 换乘站 / 本周新点亮）。**线路筛选与标签筛选独立**：选线时始终高亮当前线；标签仅过滤点亮/站点显示。

两个页面共用 `station-sheet` 组件展示站点详情卡片（主页为「手账」风格，星图页为「夜空」风格）。

## 快速开始

1. 使用 **微信开发者工具** 打开项目根目录（`project.config.json` 中已配置 `miniprogramRoot: miniprogram/`）。
2. 项目使用 ES6 模块与本地存储，无需 `npm install`，也无需云开发环境。
3. 在模拟器中通过 **工具 → 位置 → 自定义**，选取某座车站附近的坐标，即可点击「打卡」测试。
   - 开发者工具默认模拟位置可能在广州等非上海区域，此时顶部距离会显示为「约 X 公里」并提示检查定位；请将模拟位置改到上海附近。
4. 需要在真机预览时，请确保已在小程序后台配置定位权限（`app.json` 已声明 `scope.userLocation` 与 `requiredPrivateInfos: getLocation`）。

> AppID 见 `project.config.json`；如需用自己的账号预览，替换为你的 AppID 即可。

## 目录结构

```
WeChatMiniProgram/
├── miniprogram/
│   ├── app.js / app.json / app.wxss     # 小程序入口与全局配置
│   ├── pages/
│   │   ├── index/                       # 主页：打卡 / 线路 / 进度 / 成就
│   │   │   └── statsSheet.js            # 统计弹层 open/close/payload
│   │   └── metro-map/                    # 星空地铁全图（Canvas 2D）
│   ├── components/
│   │   └── station-sheet/               # 站点详情卡片（主页与星图共用）
│   ├── data/
│   │   ├── lines.js                     # 全网线路站点 + GCJ-02 坐标（脚本生成）
│   │   ├── metroSchematic.js            # 星图布局坐标（脚本生成）
│   │   ├── stationIntros.js             # 各站沿途简介（脚本生成）
│   │   └── achievements.js              # 100 个成就的名称/描述/图标
│   ├── utils/
│   │   ├── checkin.js                   # 本地打卡记录读写（wx.setStorageSync）
│   │   ├── backup.js                    # 打卡/成就 JSON 导出与导入
│   │   ├── geo.js                       # 距离计算、格式化、远距离判定
│   │   ├── lineLabels.js                # 线路显示名（磁浮、浦江线等）
│   │   ├── achievementRules.js          # 100 个成就判定规则
│   │   ├── nearestStations.js           # 最近三站选取规则
│   │   ├── stationGraph.js              # 换乘图 / 连续段 / 完成线路等图算法
│   │   ├── progressStats.js             # 本月打卡、连续天数等统计
│   │   ├── achievementProgress.js       # 未解锁成就的「还差 N 站」提示
│   │   ├── metroMapState.js             # 站点详情、线路标签等状态封装
│   │   └── metroMapRenderer.js          # 星图 Canvas 绘制（线路/星星/月亮/夜空）
│   └── images/                          # SVG 图标
├── scripts/                             # 数据抓取、生成与校验脚本（Node 环境）
├── get_metro.js                         # 从高德抓取地铁数据，生成 lines/schematic
└── project.config.json
```

## 数据模型

**打卡记录**（`wx.getStorageSync('checkin_records')`）为数组，每条结构：

```js
{
  stationId,      // 站点唯一 id
  stationName,    // 站名
  line,           // 线路 key，如 '1' / 'Special21'
  checkInTime,    // 打卡时间戳（Date.now()）
  memo            // 可选，用户备注（≤30 字）
}
```

**成就解锁状态**（`wx.getStorageSync('achievement_unlocked')`）：

```js
{ unlockedIds: [1, 5, 41, ...] }
```

**站点定义**（`data/lines.js` 中，`allLines` 汇总全部线路）：

```js
{ id: 101, name: "莘庄", latitude: 31.111152, longitude: 121.385373, checked: false }
```

- 覆盖 **1～18 号线**及 3 条特殊线路：`Special21`（磁浮）、`Special22`（浦江线）、`Special23`（机场联络线）。
- `id` 规则：线路号 × 100 + 站序（如 3 号线第 5 站 → `305`）；进度统计按**站名去重**，因此换乘站不会被重复计数。
- 坐标使用 **GCJ-02**，与 `wx.getLocation({ type: 'gcj02' })` 一致。

## 成就系统

成就规则以纯函数形式集中定义在 `utils/achievementRules.js` 中，每次打卡/撤销后自动重新计算。100 个成就分为 10 个篇章：

| 篇章 | 编号 | 主题 |
| --- | --- | --- |
| 🌆 魔都地标篇 | 1–10 | 人民广场、陆家嘴等核心地标 |
| 🧩 趣味联动篇 | 11–20 | 迪士尼、双机场、三大火车站等组合打卡 |
| 🎓 高校青葱篇 | 21–30 | 各高校圈站点 |
| 💼 狂暴通勤篇 | 31–40 | 商务区、深夜打卡等 |
| 🏅 探索里程碑 | 41–50 | 累计站数、全线路进度等 |
| 🚇 线路征服篇 | 51–60 | 完整点亮整条线路 |
| 🔄 换乘枢纽篇 | 61–70 | 换乘站数量 |
| 🗺️ 区域联动篇 | 71–80 | 区域组合站点 |
| 🧭 旅程拓扑篇 | 81–90 | 打卡顺序、同日多线等 |
| ⭐ 进阶探索篇 | 91–100 | 高门槛累计与覆盖 |

支撑成就判定的图算法（连续区间、换乘枢纽、完整线路、打卡顺序、同日多线等）位于 `utils/stationGraph.js`。未解锁成就会在图鉴中显示「还差 N 站」这类提示（`utils/achievementProgress.js`）。

## 数据来源与生成脚本

`data/` 下的三个大文件均由脚本自动生成，**不建议手动编辑**：

| 脚本 | 作用 |
| --- | --- |
| `get_metro.js` | 从高德地图接口抓取上海全网线路，生成 `lines.js` 与 `metroSchematic.js` |
| `scripts/station-facts-*.js` | 分批维护各线路车站的事实资料（周边地标、开通时间等） |
| `scripts/enrich-station-facts.js` | 汇总/丰富站点事实数据 |
| `scripts/parse-maigoo-poi.js` | 解析 POI 原始资料（`scripts/agent-tools/`） |
| `scripts/station-intro-curated.js` | 人工精编的站点简介 |
| `scripts/generate-station-intros.js` | 结合事实资料与线路位置，生成 `stationIntros.js` |

在 Node 环境运行，例如：

```bash
node get_metro.js
node scripts/generate-station-intros.js
```

### 新增 / 更新线路（手动方式）

1. 在 `data/lines.js` 中新增 `export const lineNStations = [...]`（站点含 `id / name / latitude / longitude`）。
2. 在文件末尾的 `allLines` 中注册：`'N': lineNStations`。
3. 如需在星图中显示，还需在 `data/metroSchematic.js` 补充对应的示意图坐标（通常由 `get_metro.js` 统一生成）。

## 验证脚本

`scripts/` 提供多个 Node 校验脚本，可在不启动小程序的情况下检查数据与逻辑一致性：

```bash
node scripts/verify-all.js                 # 一键串联运行全部校验
node scripts/verify-checkin-core.js       # 打卡核心逻辑（距离/最近站/格式化）
node scripts/verify-nearest-stations.js   # 最近三站选取规则
node scripts/verify-backup.js             # 备份 JSON 校验与合并
node scripts/verify-achievements.js        # 成就规则自洽性
node scripts/verify-station-intros.js      # 站点简介覆盖率
node scripts/verify-metro-schematic.js     # 星图布局数据校验
node scripts/verify-progress-stats.js      # 统计弹层数据
```

## 交互说明

### 最近三站

1. **距离前三含未打卡站** → 三站纯按距离排序。
2. **距离前三皆已打卡** → 第一站替换为全网最近未打卡站（带「待打卡」高亮），第 2/3 站仍按距离且排除第一站。
3. 第一张卡片距离 ≤200m 且未打卡时，打卡按钮文案为「打卡 {站名}」。

### 统计弹层

点击整体进度、线路进度、本月打卡、连续探索天可展开列表；列表项可打开站点卡片，或点击「星图」跳转并聚焦对应线路/站点。

### 星图筛选

- **线路筛选**：选中某线时高亮该线、压暗其他线，并自动缩放适配整线。
- **标签筛选**（未点亮 / 换乘 / 本周新点亮）：与线路筛选独立，仅过滤点亮段与站点显示；选线 + 标签可同时生效。

## 常见开发调试

- **打卡距离阈值**：`pages/index/index.js` 中的 `CHECKIN_RADIUS = 200`（米）。
- **备注字数上限**：`MEMO_MAX_LEN = 30`。
- **清除本地数据**：开发者工具 **Storage** 面板删除 `checkin_records` / `achievement_unlocked`，或删除小程序重新编译。
- **备份与恢复**：主页右下角 FAB →「备份」，可导出 JSON 到剪贴板，或粘贴 JSON 合并/覆盖恢复。
- **星图不显示**：星图基于 Canvas 2D，切换页面后有重试初始化逻辑（`_initCanvas` / `MAX_INIT_RETRIES`）；若真机异常可留意 `pixelRatio` 与画布尺寸。
- **开通意见箱**：在 `pages/index/index.js` 将 `FEEDBACK_FORM_URL` 设为 WPS 表单分享链接（`https://...`）；留空则对用户显示「暂未上线」。

## 隐私说明

- 定位仅用于计算与最近车站的距离，**不上传任何服务器**。
- 所有打卡记录、备注、成就状态均保存在本机 `Storage`，卸载小程序即清除。

---

<sub>数据来自公开地图资料，仅供个人记录与娱乐使用。</sub>
