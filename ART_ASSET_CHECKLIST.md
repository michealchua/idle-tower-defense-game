# tataKAI 美术/音乐素材需求清单

这份清单是代码审查后整理出的**实际缺失素材**列表，不是"锦上添花"的建议——每一项在游戏里现在都是纯色占位图形（圆圈/方块+字母）或静音占位音效。好消息是：**接入零代码改动**。每个文件的路径、命名都已经在代码里写死了，只要把对应文件放进对应目录，刷新页面就会自动显示真实素材、不再显示占位图形（`src/render/assetLoader.ts` + `CanvasRenderer.ts` 的容错设计就是为此准备的）。

## 美术方向

现有立绘（法师/圣骑士/战士/召唤师，及各自的分支进化立绘）都是**精细写实插画风格**的静态图片（非像素图、非逐帧动图），长边约 300–440px、透明背景、走路/攻击两个姿势各一张图。**新素材请延续这个风格**，不要做成 32×32 像素块拼接风——虽然引擎技术上支持像素动图（`SPRITE_SHEET_CONFIG`），但目前从没真正用上过，boss 立绘（`demon_boss.png`，1024×592）也是走的"精细静态插画"这条路径，代码会自动按图片尺寸判断走哪种渲染方式，只要不是刻意做成 32px 网格倍数的尺寸，就会自动走静态插画渲染。

---

## 1. 英雄立绘（最高优先级）

8 个职业里，只有 4 个画过：战士 `warrior`、法师 `mage`、圣骑士 `paladin`、召唤师 `summoner`。以下 4 个职业**完全没有立绘**，游戏里显示为纯色圆圈+字母：

| 职业 (class) | 中文名 | 走路姿势 | 攻击姿势 |
|---|---|---|---|
| archer | 弓箭手 | `public/sprites/heroes/archer_walk.png` | `public/sprites/heroes/archer_attack.png` |
| assassin | 刺客 | `public/sprites/heroes/assassin_walk.png` | `public/sprites/heroes/assassin_attack.png` |
| priest | 牧师 | `public/sprites/heroes/priest_walk.png` | `public/sprites/heroes/priest_attack.png` |
| special | 特殊职业 | `public/sprites/heroes/special_walk.png` | `public/sprites/heroes/special_attack.png` |

这 4 个职业各自还有 2 条分支进化路线，进化后的英雄优先显示分支立绘（没有则退回职业立绘），所以理想情况下每个分支也要有一套：

| 分支 id | 中文名 | 走路 | 攻击 |
|---|---|---|---|
| archer-windrunner | 疾风游侠 | `heroes/evolved/archer_windrunner_walk.png` | `heroes/evolved/archer_windrunner_attack.png` |
| archer-deadeye | 神射手 | `heroes/evolved/archer_deadeye_walk.png` | `heroes/evolved/archer_deadeye_attack.png` |
| assassin-shadowfang | 暗影毒牙 | `heroes/evolved/assassin_shadowfang_walk.png` | `heroes/evolved/assassin_shadowfang_attack.png` |
| assassin-executioner | 处刑者 | `heroes/evolved/assassin_executioner_walk.png` | `heroes/evolved/assassin_executioner_attack.png` |
| priest-lightweaver | 光明使徒 | `heroes/evolved/priest_lightweaver_walk.png` | `heroes/evolved/priest_lightweaver_attack.png` |
| priest-oracle | 先知 | `heroes/evolved/priest_oracle_walk.png` | `heroes/evolved/priest_oracle_attack.png` |
| special-warden | 奥秘守卫 | `heroes/evolved/special_warden_walk.png` | `heroes/evolved/special_warden_attack.png` |
| special-arbiter | 裁决者 | `heroes/evolved/special_arbiter_walk.png` | `heroes/evolved/special_arbiter_attack.png` |

（路径都以 `evolved/{分支id把-换成_}_{walk|attack}.png` 规律命名，上表已经换算好。）

**规格**：PNG，透明背景，长边 300–440px（参考现有 `mage_walk.png` 440×440、`paladin_walk.png` 270×440），不要求正方形。走路姿势=站立/待机的姿态即可（英雄在场上不移动，这张图其实是"待机循环"），攻击姿势=挥武器/施法瞬间的姿态。

**次要缺口**（不影响显示，攻击时会自动退回走路姿势顶替，但补上会更好）：
- `warrior_attack.png`、`mage_attack.png`、`paladin_attack.png`、`summoner_attack.png` —— 这 4 个已有立绘的职业其实也只画了走路姿势
- `heroes/evolved/warrior_berserker_attack.png` —— 8 条已有分支里唯一缺攻击姿势的

---

## 2. 敌人立绘

14 种敌人类型（杂兵/精英/boss）在渲染时共享 5 套素材身份，但目录里**实际只有 1 个文件**：`public/sprites/enemies/demon_boss.png`（miniboss 和 boss 两种都用它）。以下 4 个身份完全没有图，对应的杂兵全部显示纯色圆圈+字母：

| 素材文件 | 覆盖的敌人类型 | 建议形象 |
|---|---|---|
| `public/sprites/enemies/goblin.png` | normal・fast・tank・elite・brute・giant・berserker・shield（8种数值不同的杂兵共用同一形象） | 通用哥布林/邪恶爪牙战士，不要带太强烈的"精英感"或"虚弱感"，因为要同时代表最普通和最硬的杂兵 |
| `public/sprites/enemies/slime.png` | swarm（数量多、单体脆） | 史莱姆/小型软体怪，体型比哥布林小一圈 |
| `public/sprites/enemies/zombie.png` | zombie（死而复生） | 亡灵/僵尸 |
| `public/sprites/enemies/witch.png` | healer・witch（治疗/召唤爪牙的施法者） | 巫婆/邪教徒，带法杖或法阵元素 |

**规格**：和英雄立绘同规格（透明背景 PNG），但**每种只需要 1 张图**，不需要走路/攻击两张——敌人渲染目前是单图直出，没有走攻分离（这点和英雄不同）。boss 类因为渲染尺寸更大（`demon_boss.png` 是 1024×592），普通杂兵可以画小一些，400px 长边级别足够。

---

## 3. 宠物立绘

7 只宠物全部没有图，目前显示纯色圆点+编号。已经在代码里按稀有度顺序配好了主题名（`src/data/petRosterConfig.ts` 的 `spriteId`），文件名直接对应：

| 文件 | 稀有度 | 主题 |
|---|---|---|
| `public/sprites/pets/baby_dragon.png` | 白 | 幼龙 |
| `public/sprites/pets/vine_sprite.png` | 绿 | 藤蔓精灵 |
| `public/sprites/pets/frost_kit.png` | 蓝 | 冰霜狐仔 |
| `public/sprites/pets/sun_phoenix_chick.png` | 金 | 幼凤凰 |
| `public/sprites/pets/shadow_wisp.png` | 紫 | 暗影灵体 |
| `public/sprites/pets/ember_hound.png` | 红 | 烈焰猎犬 |
| `public/sprites/pets/star_wyrmling.png` | 彩虹 | 星辰幼龙 |

**规格**：透明背景 PNG，只需要 1 张（宠物没有攻击动作，只会飘浮跟随）。宠物在场上渲染得很小（直径约24px），造型可以比英雄立绘更简化/更卡通一点，色彩和轮廓的辨识度比细节更重要。

---

## 4. 城堡贴图

`public/sprites/towers/` 目录**根本不存在**，城堡在战场上是一个纯色棕色方块。只需要 1 张：

- `public/sprites/towers/castle.png` —— 玩家的城堡/主基地，游戏视觉焦点之一，建议给到和 boss 立绘同级的精细度。

（进阶可选项：如果想让城堡随 `castleLevel` 升级有视觉成长感，可以画 3–5 个等级的版本，但这需要额外的代码改动来接入分级显示——先出 1 张能用的，之后想做分级再告诉我。）

---

## 5. 背景音乐（12 首）

**现状说明**：这是目前最严重的音频问题——`public/audio/` 里的 12 个 `.wav` 文件经 MD5 校验**逐字节完全相同**，也就是说游戏里其实只有"一个占位音效"被复制了 12 次改名，10 张地图 + boss + miniboss 听起来都是同一个东西，且时长只有几秒钟的循环片段。

音频系统本身（`src/audio/AudioManager.ts`）没有问题：单曲循环、地图切换自动换曲、boss 战自动切战斗曲、静音按钮，这套逻辑都是好的，纯粹是文件内容需要替换。

| 文件 | 场景 | 氛围建议 |
|---|---|---|
| `public/audio/forest.wav` | 森林（第1章，起始地图） | 轻快、田园、木管/弦乐为主 |
| `public/audio/desert.wav` | 沙漠 | 干燥、悠远，可加一点民族打击乐 |
| `public/audio/ocean.wav` | 海洋 | 神秘、流动感，水波音效/竖琴 |
| `public/audio/snow-mountain.wav` | 雪山 | 寒冷、孤寂，弦乐长音+风声 |
| `public/audio/poison-swamp.wav` | 毒沼 | 阴森、粘稠感，低音贝斯+不和谐音 |
| `public/audio/dark-cave.wav` | 暗洞 | 压抑、幽闭，稀疏音效+回响 |
| `public/audio/ancient-ruins.wav` | 遗迹 | 古老、庄严，合唱/管风琴质感 |
| `public/audio/volcano.wav` | 火山 | 炽热、紧张，强节奏打击乐 |
| `public/audio/sky-realm.wav` | 天空领域 | 空灵、开阔，高音色+空气感 |
| `public/audio/demon-abyss.wav` | 深渊（最终章） | 邪恶、压迫感，最强战斗张力 |
| `public/audio/miniboss.wav` | 精英怪战斗 | 比地图曲更紧张，中等强度战斗节奏 |
| `public/audio/boss.wav` | Boss 战 | 全曲最高强度，鼓点/管弦齐上 |

**技术要求**：
- 需要能**无缝循环**（`<audio loop>` 直接首尾相接播放，没有淡入淡出处理），首尾拼接处的音量/节拍要能对上，否则每次循环都会有明显的"咔哒"声
- 单曲时长参考：30–90 秒的循环段落即可，不需要做成完整的3分钟乐曲
- 格式：`.wav` 或 `.mp3` 均可（代码用 `<audio src>` 直接播放，两种格式浏览器都原生支持）；这是本地 Electron 桌面应用，不需要为流媒体做特别优化，单曲 1–3MB 都是合理体积

---

## 接入方式

以上所有文件，只要放进标注的路径，**不需要改任何代码**——`assetLoader.ts` 的 `getImage()` 是"尝试加载，加载成功就用，失败就返回 undefined 走占位形状"的容错设计，`AudioManager` 同理。放文件、刷新页面即可看到效果。
