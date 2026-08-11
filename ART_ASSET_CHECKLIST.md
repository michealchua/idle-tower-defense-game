# tataKAI 美术/音乐资源总清单

这是游戏里**所有**视觉/听觉素材的完整盘点——已经做好的和还缺的都列进来了，按"角色/敌人/宠物/城堡/背景/音乐/UI界面"分类。状态标记：✅ 已完成可用 ・ ⚠️ 存在但有问题/不完整 ・ ❌ 完全缺失（当前显示程序化占位图形）。

**接入方式统一说明**：标为 ❌ 的文件，路径和命名已经在代码里写死了，做好之后直接放进对应目录、刷新页面即可自动生效，**不需要改任何代码**（`src/render/assetLoader.ts`/`AudioManager.ts` 就是"尝试加载，成功就用，失败就走占位"的容错设计）。

**美术方向**：现有立绘都是**精细写实插画风格**的静态图片（非像素图、非逐帧动图），长边约 300–440px、透明背景，走路/攻击各一张。新素材请延续这个风格——引擎技术上支持 32×32 像素逐帧动图，但从没真正用过，boss 立绘也是走"精细静态插画"路线，代码按图片尺寸自动判断走哪种渲染方式。

---

## 1. 英雄角色立绘

8 个职业，每个职业有基础立绘 + 2 条分支进化立绘。

### 1.1 基础职业立绘

| 职业 (class) | 中文名 | 走路 | 攻击 |
|---|---|---|---|
| warrior | 战士 | ✅ `heroes/warrior_walk.png` | ❌ `heroes/warrior_attack.png`（缺失时自动退回走路姿势，不影响显示） |
| mage | 法师 | ✅ `heroes/mage_walk.png` | ❌ `heroes/mage_attack.png` |
| paladin | 圣骑士 | ✅ `heroes/paladin_walk.png` | ❌ `heroes/paladin_attack.png` |
| summoner | 召唤师 | ✅ `heroes/summoner_walk.png` | ❌ `heroes/summoner_attack.png` |
| archer | 弓箭手 | ❌ `heroes/archer_walk.png` | ❌ `heroes/archer_attack.png` |
| assassin | 刺客 | ❌ `heroes/assassin_walk.png` | ❌ `heroes/assassin_attack.png` |
| priest | 牧师 | ❌ `heroes/priest_walk.png` | ❌ `heroes/priest_attack.png` |
| special | 特殊职业 | ❌ `heroes/special_walk.png` | ❌ `heroes/special_attack.png` |

### 1.2 分支进化立绘（每个职业 2 条，进化后优先显示，缺失则退回基础职业图）

| 分支 id | 中文名 | 走路 | 攻击 |
|---|---|---|---|
| warrior-berserker | 狂战士 | ✅ `heroes/evolved/warrior_berserker_walk.png` | ❌ `heroes/evolved/warrior_berserker_attack.png` |
| warrior-guardian | 守护战士 | ✅ `heroes/evolved/warrior_guardian_walk.png` | ✅ `heroes/evolved/warrior_guardian_attack.png` |
| mage-pyromancer | 爆炎法师 | ✅ `heroes/evolved/mage_pyromancer_walk.png` | ✅ `heroes/evolved/mage_pyromancer_attack.png` |
| mage-cryomancer | 极寒法师 | ✅ `heroes/evolved/mage_cryomancer_walk.png` | ✅ `heroes/evolved/mage_cryomancer_attack.png` |
| paladin-lightbringer | 圣光使者 | ✅ `heroes/evolved/paladin_lightbringer_walk.png` | ✅ `heroes/evolved/paladin_lightbringer_attack.png` |
| paladin-inquisitor | 审判官 | ✅ `heroes/evolved/paladin_inquisitor_walk.png` | ✅ `heroes/evolved/paladin_inquisitor_attack.png` |
| summoner-soul | 灵魂召唤师 | ✅ `heroes/evolved/summoner_soul_walk.png` | ✅ `heroes/evolved/summoner_soul_attack.png` |
| summoner-elemental | 元素召唤师 | ✅ `heroes/evolved/summoner_elemental_walk.png` | ✅ `heroes/evolved/summoner_elemental_attack.png` |
| archer-windrunner | 疾风游侠 | ❌ `heroes/evolved/archer_windrunner_walk.png` | ❌ `heroes/evolved/archer_windrunner_attack.png` |
| archer-deadeye | 神射手 | ❌ `heroes/evolved/archer_deadeye_walk.png` | ❌ `heroes/evolved/archer_deadeye_attack.png` |
| assassin-shadowfang | 暗影毒牙 | ❌ `heroes/evolved/assassin_shadowfang_walk.png` | ❌ `heroes/evolved/assassin_shadowfang_attack.png` |
| assassin-executioner | 处刑者 | ❌ `heroes/evolved/assassin_executioner_walk.png` | ❌ `heroes/evolved/assassin_executioner_attack.png` |
| priest-lightweaver | 光明使徒 | ❌ `heroes/evolved/priest_lightweaver_walk.png` | ❌ `heroes/evolved/priest_lightweaver_attack.png` |
| priest-oracle | 先知 | ❌ `heroes/evolved/priest_oracle_walk.png` | ❌ `heroes/evolved/priest_oracle_attack.png` |
| special-warden | 奥秘守卫 | ❌ `heroes/evolved/special_warden_walk.png` | ❌ `heroes/evolved/special_warden_attack.png` |
| special-arbiter | 裁决者 | ❌ `heroes/evolved/special_arbiter_walk.png` | ❌ `heroes/evolved/special_arbiter_attack.png` |

**规格**：PNG，透明背景，长边 300–440px（参考 `mage_walk.png` 440×440、`paladin_walk.png` 270×440），不要求正方形。走路=待机循环姿态，攻击=挥武器/施法瞬间姿态。

**汇总**：25 张已完成，25 张缺失（4 基础攻击图 + 1 分支攻击图 + 20 张新 4 职业全套）。无立绘的英雄目前显示为**程序化渐变剪影**（我已用代码画了区分职业的简易造型：弓箭手带弓弧线、刺客带交叉双刃、牧师带光环、特殊职业带光环轨迹），不是纯色圆圈了，但仍是占位性质。

---

## 2. 敌人角色立绘

14 种敌人类型共享 5 套素材身份（渲染时按 `ENEMY_SPRITE_TYPE` 映射，不是每种类型单独一张图）。

| 素材文件 | 覆盖的敌人类型 | 状态 | 建议形象 |
|---|---|---|---|
| `enemies/demon_boss.png` | miniboss・boss | ✅ 已完成（1024×592） | — |
| `enemies/goblin.png` | normal・fast・tank・elite・brute・giant・berserker・shield（8种） | ❌ 缺失 | 通用哥布林/邪恶爪牙战士，不要太强调"精英"或"虚弱"，因为要代表最普通到最硬的杂兵 |
| `enemies/slime.png` | swarm | ❌ 缺失 | 史莱姆/小型软体怪，体型比哥布林小一圈 |
| `enemies/zombie.png` | zombie | ❌ 缺失 | 亡灵/僵尸 |
| `enemies/witch.png` | healer・witch | ❌ 缺失 | 巫婆/邪教徒，带法杖或法阵元素 |

**规格**：透明背景 PNG，**每种只需 1 张**（敌人没有走攻分离，单图直出）。boss 类渲染尺寸更大，普通杂兵 400px 长边级别足够。

**汇总**：1/5 已完成。无贴图的杂兵目前显示**程序化渐变剪影**（哥布林用直立人形、史莱姆是带高光的扁圆形、女巫头顶三角帽、僵尸的人形会歪斜代表蹒跚），不是纯色圆圈。

---

## 3. 宠物角色立绘

7 只宠物**全部**没有图，`spriteId` 已在 `src/data/petRosterConfig.ts` 里按稀有度配好主题名：

| 文件 | 稀有度 | 主题 | 状态 |
|---|---|---|---|
| `pets/baby_dragon.png` | 白 | 幼龙 | ❌ 缺失 |
| `pets/vine_sprite.png` | 绿 | 藤蔓精灵 | ❌ 缺失 |
| `pets/frost_kit.png` | 蓝 | 冰霜狐仔 | ❌ 缺失 |
| `pets/sun_phoenix_chick.png` | 金 | 幼凤凰 | ❌ 缺失 |
| `pets/shadow_wisp.png` | 紫 | 暗影灵体 | ❌ 缺失 |
| `pets/ember_hound.png` | 红 | 烈焰猎犬 | ❌ 缺失 |
| `pets/star_wyrmling.png` | 彩虹 | 星辰幼龙 | ❌ 缺失 |

**规格**：透明背景 PNG，只需 1 张（无攻击动作）。渲染直径约24px，造型可比英雄立绘更简化/卡通，辨识度优先于细节。

**汇总**：0/7。目前显示**程序化渐变剪影**（三角耳朵+圆身体+小尾巴的简易萌宠造型），不是纯色圆点。

---

## 4. 城堡贴图

| 文件 | 状态 | 说明 |
|---|---|---|
| `towers/castle.png` | ❌ 缺失 | 玩家城堡/主基地，游戏视觉焦点之一，建议给到 boss 立绘同级精细度 |

目前显示**程序化渲染**的石墙+双塔+城门+旗帜（渐变阴影，不是纯色方块了），但仍是占位性质，真正的手绘/AI插画会好得多。

（进阶可选项：想让城堡随 `castleLevel` 升级有视觉成长感，可以画 3–5 个等级版本，这需要额外代码接入分级显示——先出 1 张能用的，之后想做分级再告诉我。）

---

## 5. 地图背景（已全部完成 ✅）

10 张地图背景全部到位，无需补充：

| 文件 | 地图 |
|---|---|
| `backgrounds/forest.jpg` | 森林（第1章） |
| `backgrounds/desert.jpg` | 沙漠 |
| `backgrounds/ocean.png` | 海洋 |
| `backgrounds/snow-mountain.jpg` | 雪山 |
| `backgrounds/poison-swamp.png` | 毒沼 |
| `backgrounds/dark-cave.png` | 暗洞 |
| `backgrounds/ancient-ruins.jpg` | 遗迹 |
| `backgrounds/volcano.jpg` | 火山 |
| `backgrounds/sky-realm.jpg` | 天空领域 |
| `backgrounds/demon-abyss.jpg` | 深渊（最终章） |

标题页背景复用了 `forest.jpg` 做慢速缩放动效，没有单独的标题页背景，如果想要更有"标题画面感"的专属插画（比如城堡全景+英雄群像），可以加一张，但不是必需的。

---

## 6. 背景音乐（12首，全部存在但⚠️内容有问题）

`public/audio/` 里 12 个 `.wav` 文件**全部存在**，但经 MD5 校验**逐字节完全相同**——本质上只有"一个占位音效"复制了12次改名，且时长只有几秒。这是当前最需要优先解决的问题。

音频播放系统本身（`src/audio/AudioManager.ts`）没有问题：单曲循环、地图切换自动换曲、boss战自动切战斗曲、静音按钮都正常，纯粹是文件**内容**需要替换成真正不同的音乐。

| 文件 | 场景 | 氛围建议 |
|---|---|---|
| `audio/forest.wav` | 森林 | 轻快、田园、木管/弦乐为主 |
| `audio/desert.wav` | 沙漠 | 干燥、悠远，可加民族打击乐 |
| `audio/ocean.wav` | 海洋 | 神秘、流动感，水波音效/竖琴 |
| `audio/snow-mountain.wav` | 雪山 | 寒冷、孤寂，弦乐长音+风声 |
| `audio/poison-swamp.wav` | 毒沼 | 阴森、粘稠感，低音贝斯+不和谐音 |
| `audio/dark-cave.wav` | 暗洞 | 压抑、幽闭，稀疏音效+回响 |
| `audio/ancient-ruins.wav` | 遗迹 | 古老、庄严，合唱/管风琴质感 |
| `audio/volcano.wav` | 火山 | 炽热、紧张，强节奏打击乐 |
| `audio/sky-realm.wav` | 天空领域 | 空灵、开阔，高音色+空气感 |
| `audio/demon-abyss.wav` | 深渊 | 邪恶、压迫感，最强战斗张力 |
| `audio/miniboss.wav` | 精英怪战斗 | 比地图曲更紧张，中等强度 |
| `audio/boss.wav` | Boss战 | 全曲最高强度，鼓点/管弦齐上 |

**技术要求**：无缝循环（`<audio loop>` 直接首尾相接，无淡入淡出，首尾拼接处音量/节拍要对上）；单曲 30–90 秒循环段落即可；`.wav`或`.mp3`均可；单曲 1–3MB 是合理体积。

**汇总**：0/12 内容合格（文件都在，但都是同一个占位音）。

---

## 7. UI 图标系统（已全部完成 ✅）

之前界面上所有的系统 emoji（🏰🌟💎📖🏆🎰🐾✨🎒⚔️💰🔇🔊💾🧱等）已经全部替换成自绘 SVG 图标（`src/components/icons.tsx`，30个，扁平剪影风格，深色主题配色），**不需要额外制作**，除非你想要更精致的手绘/像素风图标来进一步升级观感（这是锦上添花，不是缺口）：

| 分类 | 图标 |
|---|---|
| 导航栏/HUD | 城堡、星标(升华/进化用)、钻石、书本(图鉴)、奖杯(记录)、礼物盒(扭蛋)、爪印(宠物)、背包(装备)、剑(英雄)、金币、砖块(建材)、静音开/关、存档 |
| 元素系统 | 火、水、土、风、光、暗（6个） |
| 职业/羁绊 | 法杖水晶球(法师/秘法)、弓、盾(守护/圣骑)、匕首(刺客)、幽灵(召唤师)、十字(牧师) |
| 装备/天赋/任务 | 靴子、旗帜(任务)、准心(暴击)、心形(生命值) |
| 剧情 | 城堡管家头像(兜帽剪影) |

**如果想升级**：这批图标是我用代码里的几何图形（矩形/圆/简单路径）手工画的，风格统一但细节有限；如果你希望换成手绘/像素风或者更精致的商业级图标，可以告诉我具体想要哪几个先换，或者交给你熟悉的图标/UI设计师参考现有的深色配色（`--accent: #5b8cff` 蓝、`--gold-currency: #ffc857` 金、`--diamond-currency: #6be3ff` 青）来配一套。

---

## 8. 字体与排版

| 用途 | 状态 | 说明 |
|---|---|---|
| 标题Logo"tataKAI" | ✅ 已完成 | 自托管 Cinzel 衬线字体（`public/fonts/cinzel-800.woff2`），带渐变+发光效果 |
| 其余中文界面文字 | ✅ 使用系统字体 | PingFang SC / Microsoft YaHei 等系统自带字体栈，不需要额外制作，除非想要更有个性的中文游戏字体（比如更粗犷/更古风的免费商用字体），这属于锦上添花 |

---

## 9. 应用图标（已完成 ✅）

| 文件 | 用途 | 状态 |
|---|---|---|
| `public/icon.svg` | 浏览器/网页 favicon | ✅ 已存在 |
| `public/icon.png` | 应用内引用 | ✅ 已存在 |
| `build/icon.png` | Electron 安装包/桌面快捷方式图标 | ✅ 已存在 |

没有审查这几个图标本身画得好不好——如果你觉得当前的应用图标不够有辨识度/不够精致，也可以列入制作清单，告诉我我再看代码里怎么接入。

---

## 总览统计

| 类别 | 完成 | 缺失/有问题 |
|---|---|---|
| 英雄立绘（含分支进化） | 25/50 张 | 25 张 |
| 敌人立绘 | 1/5 套 | 4 套 |
| 宠物立绘 | 0/7 | 7 |
| 城堡贴图 | 0/1 | 1 |
| 地图背景 | 10/10 | 0 |
| 背景音乐 | 0/12（文件都在但内容重复） | 12 |
| UI图标 | 30/30 | 0（除非想升级） |
| 字体 | 完成 | 0 |
| 应用图标 | 完成 | 未审查画质 |

**优先级建议**（如果要分批做）：
1. 背景音乐（12首，现在等于没有背景音乐，是最容易被玩家感知到"缺东西"的地方）
2. 城堡贴图（1张，游戏视觉焦点，性价比最高）
3. 4个新职业基础立绘（8张：archer/assassin/priest/special 各走路+攻击）
4. 敌人贴图（4张：goblin/slime/zombie/witch）
5. 宠物贴图（7张）
6. 4个新职业的进化分支立绘（16张）
7. 已有职业缺的攻击姿势（5张，优先级最低，缺失时有合理的回退效果）
