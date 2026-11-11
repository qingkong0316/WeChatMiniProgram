# 项目审查报告：上海地铁打卡小程序

- 审查日期：2026-11-11
- 审查范围：`E:\自己开发的小玩具\WeChatMiniProgram`（微信小程序，共 91 个文件，约 8,100 行 JS）
- 审查方式：3 个审查 agent 并行扫描 + 主会话逐条实测验证（真实数据跑 Node、代码链路复读）
- 已复核文件：19 个核心文件（pages/index、pages/metro-map、utils 全部、data 关键文件、scripts/verify-*.js）

## 总体评级：B-（中等质量）

核心打卡链路有 storage 实时校验兜底，没有灾难级数据损坏路径；但存在 **3 个实锤功能/数据问题、4 个竞态隐患**，且自检脚本存在系统性盲区——「7 项全绿」不代表线上无 bug。

> 注：审查过程中子代理报告的「geo.js 距离单位错误→全局可作弊打卡」经实测为**误报**（haversine 输出乘以 6378.137 km 后乘 10000/10 恰好等于米，与标准库比对一致），不列为问题。

---

## CRITICAL — 实锤，必修

### 1. 线路 5/10/11 数据复制事故：首页站点列表显示重复站台

- **位置**：`miniprogram/data/lines.js`（5 号线 7 站、10 号线 33 站、11 号线 23 站被整段同序复制）
- **实测证据**：
  - 5 号线莘庄 `id:501` 与 `id:512` 坐标差为 **0**，顺序方向相同（非反向、非微偏移）
  - 10 号线 67 站实际是 **34 个物理站**，11 号线 70 站实际是 **47 个物理站**
- **触发路径**：首页切到 5/10/11 号线 → `pages/index/index.js:780-795` 直接把 26/67/70 个「站台」全量渲染为 `stations`，同站名出现两次、各占一张卡片。
- **影响**：
  - 用户切换线路时看到重复站名（10 号线尤其严重，33 个站名重复）
  - 成就 `lineComplete` 用站名比较侥幸躲过，但列表、进度数字、筛选全部被污染
  - `metroSchematic.js`（418 物理站）与 `lines.js`（599 条目含重复）是两套数据，地图渲染只吃 schematic，所以本地图没炸，问题全炸在首页
- **修复**：对 5/10/11 按站名去重。**已确认安全**——metro-map 页不引用 `allLines`，渲染不受影响。
- **连带教训**：verify 脚本声称校验了 418 物理站，但**没校验「同线内重复站台」这个不变量**——这正是自检盲区。

### 2. 星图「去打卡」跳首页后目标站丢失（跨页契约断链）

- **写入端**：`pages/metro-map/metro-map.js:936-939` 写入 `pendingNav = { line, stationName }`
- **读取端**：`pages/index/index.js:306-313` 只读 `pending.line`，`stationName` 全页零消费（已确认无其他读取点）
- **触发路径**：星图点「撤销打卡→去打卡」，回到首页后：不滚动定位、不打开站点卡片，且**无论用户在不在 200 米内都弹「请在200米内打卡」**——不只断链还误导。
- **附加问题**：`pendingNav` 挂在 `app.globalData` 无过期机制，中途不进首页则目标静默残留，在后续误触发时被消费。
- **修复**：index 端补 `focusLineAndStation(pending.line, pending.stationName)`；toast 改为基于 `canCheckIn` 动态判断；或在 metro-map 端删除不再使用的 `stationName` 写入，消除半截契约。

### 3. 双击打卡竞态：一次操作可能变成两次打卡 + 解锁队列被覆盖

- **位置**：`pages/index/index.js:1155-1191`（`handleCheckIn` 无防抖/busy 守卫）
- **机制**：`checkin.addRecord`（`utils/checkin.js:48-58`）先写 storage，但 `nearestStations`（data 中）要到 `updateNearestFromCoords` 才刷新。
- **触发路径**：用户连点两次「打卡」，间隔小于一次渲染周期（常见 100~300ms）：
  - 第一次已写 storage，第二次读到的 data 仍是旧的
  - `target` 查找（index.js:1162-1164）若附近还有第二个未打卡站，**第二次点击会再打一次卡**
  - `_pendingAchievementUnlock` 在 index.js:1184 被无条件覆盖，解锁弹窗内容与实际解锁事件错乱
  - 若附近只有刚打过的站，则弹「该站已打卡」——用户看到混乱反馈
- **修复**：入口加一次性闸门 `if (this._checkinBusy) return;`，置位/复位标志；或用 `addRecord` 返回值（是否真的写入）决定弹不弹窗。

---

## HIGH — 高概率踩坑

### 4. 定位刷新无竞态防护，旧坐标可覆盖新坐标

- **位置**：`pages/index/index.js:410-427`（`refreshNearestStation`）
- **机制**：onLoad/onShow/手动「重新定位」/设置页返回后会反复调用。`wx.getLocation` 是真实硬件回调，多次并发调用不保证按调用顺序返回。
- **后果**：先返回的「旧位置」覆盖「新位置」——用户移动后站列表短暂回到上一位置；先返回的失败分支会清空站列表、置 `locationFailed`，随后成功返回再覆盖回来，状态乱跳。
- **修复**：token 守卫——`const t = ++this._locRefreshToken;`，回调里 `if (t !== this._locRefreshToken) return;`。

### 5. backup.js 导入：零回滚 + 无版本校验 + 把重复记录带进存储

- **位置**：`utils/backup.js:73-107`（`applyBackup`）、`utils/backup.js:30-48`（`normalizeBackup`）
- **问题**：
  - `applyBackup('replace')` 先写 records 后写 achievements，二次写入失败无回滚（部分写入）
  - `normalizeBackup` 不校验 `version`/`app` 字段，只过滤记录形状——跨版本/跨应用备份可被导入
  - 导入的**重复站名记录**直接进入 raw storage
- **连带效应（窄但真实）**：重复记录进入存储后，`getRecords()` 的 `dedupeByName`（`utils/checkin.js:3-14`）会静默重写存储；此时 `pages/index/index.js:60-70` `saveMemo` 写入的备注可能挂在被丢弃的那条重复记录上，一并消失且无告警——成就 40/98 依赖 `r.memo`，存在「成就永久卡死且无任何提示」的路径。
- **附加陷阱**：`addRecord` 对重复打卡**静默 return**，无 toast 无返回值——数据没坏，但用户无任何反馈，离线连点会丢记录。
- **修复**：`normalizeBackup` 增加版本/来源校验并按站名去重；`saveMemo` 改为通过 `getRecords()` 后的记录写入再 `saveRecords`；`addRecord` 返回是否写入，供 UI 反馈。

### 6. 成就判定用 `includes` 子串匹配，站名变体必漏

- **位置**：`pages/index/index.js:130-132`（`ctx.has/hasAny/hasAll`）、`utils/stationGraph.js:100`（`hasCheckinOrder`）
- **机制**：`r.stationName.includes(name)` 子串匹配。
- **例子**：规则 73 要求「国家会展中心(2号线)」——若用户打卡记录是「国家会展中心」这种不带后缀的写法就直接漏判。链式成就（规则 81-83、90）同样用 includes 宽松匹配。
- **修复**：判定改为「站名归一化后精确或前缀匹配」；在 verify 脚本里加一条不变量校验（见自检审计）。

### 7. statsSheet 双标志竞态

- **位置**：`pages/index/statsSheet.js:100-115`
- **机制**：关闭动画 340ms 窗口内 `statsSheetVisible` 仍为 true，期间数据变更（`loadLineData`/`updateNearestFromCoords` 都会触发 `refreshStatsSheetData`）会继续向一个正在消失的弹层 setData；`openStatsSheet`（:86-89）虽清旧 timer，但 `statsSheetOpen`/`statsSheetVisible` 双标志 + timer 三态纠缠。
- **后果**：偶发闪旧数据；`closeStatsSheet` 判空条件与 timer 纠缠，是下一个 bug 的温床。
- **修复**：改为单一布尔状态 + `observers` 驱动，关闭即置 false 并立即清理待渲染数据。

---

## MEDIUM — 技术债与优化

| 项 | 位置 | 问题 |
|---|---|---|
| 每帧重建数据 | `pages/metro-map/metro-map.js:650-651`、:719 | `_draw` 每帧重建 `checkedSet`/`weekNewSet`/`litSegments`（后者对 418 站逐站扫并跑最近点算法）；叠加 metro-map.js:195-204 **空闲时 10fps 重绘**（100ms 轮询），低端机必掉帧。lit/week 集合缓存到 `_records` 变化时即可。 |
| 三份 `formatCheckTime` | `pages/index/index.js:46`、`utils/progressStats.js:15`、`utils/metroMapState.js:6` | 独立复制，改日期格式要改三处；metroMapState 导出的那份无人消费，是死代码。 |
| 死代码 | `utils/metroMapRenderer.js:68+604`（`drawNightSkyStatic` 全项目零调用）、`data/metroSchematic.js:3`（`schematicBounds` 无人引用）、`utils/checkin.js:42/60`（`isChecked`/`removeRecord` 无调用方，且 `isChecked` 语义与被替代的 `isCheckedByName` 不符） | 累计 3 处，累计维护噪音。 |
| 死字段 | `utils/nearestStations.js:14-20` | 日常分支（top3 含未打卡）`isPrimary` 恒 false → WXML 的 `--primary` 样式类永不命中；`allCompleted` 下发后无人消费。要么如实标 primary，要么删死样式。 |
| 裸写 data | `pages/metro-map/metro-map.js:300` | `this.data.filterTags = filterTags` 后紧跟 setData，裸写无效果且误导，删一行。 |
| canvasRect 不随 resize | metro-map.js 无 `onResize` 处理 | 屏幕旋转/尺寸变化后触摸命中坐标会偏移，需真机验证。 |
| 大页面 | `pages/index/index.js` 1324 行、`pages/metro-map/metro-map.js` 943 行 | 已达「上帝对象」临界点。`statsSheet.js` 的 mixin 方式方向正确，但状态散落在页面级实例字段（`_tick`/`_frozenTick`/`_mapCacheKey` 等），后续维护成本持续上涨。 |

---

## 自检脚本审计（最需要正视的问题）

项目有 7 个 verify 脚本且全部能跑通，但存在**结构性盲区**：

1. **自证**：`scripts/verify-checkin-core.js:68-92` 自建 `addRecord/removeRecordsByName/dedupeByName` 副本，**从不调用真实 checkin.js**——存储层逻辑零覆盖。真实代码里的 dedupe 语义（保留最早记录）bug 不会被抓住。
2. **子串误匹配检查形同虚设**：`scripts/verify-achievements.js:123-127` 只抽查 3 个站名、**只 WARN 不 FAIL**（实测：打印标题后无输出，脚本仍报通过）。
3. **没测不变量**：CRITICAL #1 的线路 5/10/11 重复站台问题，`verify-metro-schematic.js` 只做集合大小比对（418==418），恰好被重复数据掩盖，全绿通过。
4. **自造数据**：`verify-progress-stats` / `verify-nearest-stations` / `verify-backup` 全部用自建数据跑通过，没有端到端喂过真实 418 站。

---

## 快速修复清单（按性价比排序）

1. lines.js 对 5/10/11 去重（S 量级，立刻恢复首页列表正确性）— 已确认安全
2. index.js:1155 打卡入口加 busy 守卫（S）
3. index.js:306 补上 stationName 消费 + 动态 toast（S）
4. refreshNearestStation 加 token 守卫（S）
5. verify 脚本补 3 条实打实的不变量：同线站名唯一、打卡/统计字段对齐、子串误匹配 WARN→FAIL（S）

## Strengths（值得保留）

- 纯函数分层清晰（nearestStations/progressStats 可 Node 单测）
- metroSchematic 与 lines.js 数据分离——所以地图没被重复数据污染
- verify 传统本身是好习惯，上面说的只是盲区优化

## 一句话总结

能跑、没致命安全问题，但「3 个实锤功能问题 + 4 个竞态隐患 + 自检声称全绿但抓不住真 bug」三件套同时存在——按快速修复清单修完前 3 项，再看一遍竞态，项目质量可以到 A。
