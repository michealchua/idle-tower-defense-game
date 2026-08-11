# tataKAI 美术/音乐资源总清单

这是游戏里**所有**视觉/听觉素材的完整盘点。状态标记：✅ 已完成可用 ・ ⚠️ 存在但有问题/不完整 ・ ❌ 完全缺失。

**2026-08-11 更新**：角色/敌人/宠物/城堡/地图背景素材已经**全部补齐并统一成像素风格**——用 Python（`scripts/pixel_sprites.py` 画角色，`scripts/pixel_backgrounds.py` 画背景，都是 Pillow 库）程序化生成，71 张图，运行对应脚本可以重新生成或调整配色/造型。现在唯一还有实质性缺口的是**背景音乐**（见第6节，按你的要求暂缓不做）。

---

## 1. 英雄角色立绘（已完成 ✅ 61张中的50张）

8 个职业 × (基础立绘 + 2条分支进化立绘) × (走路+攻击) = 50 张，**全部完成**，像素风格，统一模板生成（头部+躯干+职业专属武器/头饰），透明背景，260×340px（尺寸经过特意设计，不会被引擎误判成逐帧动图，走的是静态单图渲染路径）。

| 职业 | 中文名 | 基础立绘 | 进化分支1 | 进化分支2 |
|---|---|---|---|---|
| warrior | 战士 | ✅ | ✅ 狂战士 | ✅ 守护战士 |
| mage | 法师 | ✅ | ✅ 爆炎法师 | ✅ 极寒法师 |
| paladin | 圣骑士 | ✅ | ✅ 圣光使者 | ✅ 审判官 |
| summoner | 召唤师 | ✅ | ✅ 灵魂召唤师 | ✅ 元素召唤师 |
| archer | 弓箭手 | ✅ | ✅ 疾风游侠 | ✅ 神射手 |
| assassin | 刺客 | ✅ | ✅ 暗影毒牙 | ✅ 处刑者 |
| priest | 牧师 | ✅ | ✅ 光明使徒 | ✅ 先知 |
| special | 特殊职业 | ✅ | ✅ 奥秘守卫 | ✅ 裁决者 |

每项都有走路+攻击两张姿势图（走路=待机循环，攻击=挥武器/施法瞬间）。

**如果想调整**：改 `scripts/pixel_sprites.py` 里 `HERO_CLASSES`/`EVOLUTION_BRANCHES` 两个字典的配色（body/trim/weapon 等 RGB 值）或武器/头饰类型（`weapon_kind`: sword/dagger/staff/bow/holy_symbol/orb；`headwear`: helmet/hood/wizard_hat/halo/horns/cap），重新跑一遍脚本就行，不用逐张画。

---

## 2. 敌人角色立绘（已完成 ✅ 5/5）

| 素材文件 | 覆盖的敌人类型 | 状态 |
|---|---|---|
| `enemies/goblin.png` | normal・fast・tank・elite・brute・giant・berserker・shield（8种共用） | ✅ |
| `enemies/slime.png` | swarm | ✅ |
| `enemies/zombie.png` | zombie | ✅ |
| `enemies/witch.png` | healer・witch | ✅ |
| `enemies/demon_boss.png` | miniboss・boss | ✅（这次也换成了像素风，配色更凶悍：深红/黑/橙角） |

---

## 3. 宠物角色立绘（已完成 ✅ 7/7）

| 文件 | 稀有度 | 主题 |
|---|---|---|
| `pets/baby_dragon.png` | 白 | 幼龙（金色，翼耳） |
| `pets/vine_sprite.png` | 绿 | 藤蔓精灵（圆耳） |
| `pets/frost_kit.png` | 蓝 | 冰霜狐仔（尖耳） |
| `pets/sun_phoenix_chick.png` | 金 | 幼凤凰（翼耳） |
| `pets/shadow_wisp.png` | 紫 | 暗影灵体（无耳，飘浮感） |
| `pets/ember_hound.png` | 红 | 烈焰猎犬（尖耳） |
| `pets/star_wyrmling.png` | 彩虹 | 星辰幼龙（翼耳） |

---

## 4. 城堡贴图（已完成 ✅ 1/1）

`towers/castle.png` —— 石墙+双塔+城门+旗帜，像素风格，320×300px。

（进阶可选项：想让城堡随 `castleLevel` 升级有视觉成长感，可以在 `pixel_sprites.py` 的 `draw_castle()` 里加几个等级变体，但需要额外代码接入分级显示逻辑——现在先用这1张，之后想做再告诉我。）

---

## 5. 地图背景（已完成 ✅ 10/10，像素风格）

10 张地图背景全部换成像素风格（分层剪影：天空渐变+地平线+散布的场景元素），和角色贴图统一了。全部是 `.png`（原来7张是 `.jpg`，改成 `.png` 是为了避免 JPEG 有损压缩把像素边缘压糊——像素画最怕这个）：

| 文件 | 地图 | 场景元素 |
|---|---|---|
| `backgrounds/forest.png` | 森林（第1章） | 远山、散布树木 |
| `backgrounds/desert.png` | 沙漠 | 太阳、沙丘、仙人掌 |
| `backgrounds/ocean.png` | 海洋 | 太阳、小岛剪影、波浪纹理 |
| `backgrounds/snow-mountain.png` | 雪山 | 雪峰剪影、飘雪 |
| `backgrounds/poison-swamp.png` | 毒沼 | 枯树、雾气斑块 |
| `backgrounds/dark-cave.png` | 暗洞 | 上下钟乳石、发光晶体 |
| `backgrounds/ancient-ruins.png` | 遗迹 | 残破石柱、倒地石块 |
| `backgrounds/volcano.png` | 火山 | 火山剪影+发光火山口、地面熔岩裂缝 |
| `backgrounds/sky-realm.png` | 天空领域 | 漂浮岛屿、云朵 |
| `backgrounds/demon-abyss.png` | 深渊（最终章） | 尖锐山脊剪影、地面红色裂纹 |

**如果想调整**：改 `scripts/pixel_backgrounds.py` 里对应biome函数的颜色/元素位置，重新运行脚本即可。

---

## 6. 背景音乐（唯一剩下的缺口，按你的要求暂缓 ⏸️）

`public/audio/` 里 12 个 `.wav` 文件**全部存在**，但经 MD5 校验**逐字节完全相同**——本质上只有"一个占位音效"复制了12次改名，且时长只有几秒。这是目前唯一还需要真正补素材的地方（Python 画像素图可行，但合成过关的音乐不现实，需要真人作曲或专门的 AI 作曲工具）。

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

---

## 7. UI 图标系统（已完成 ✅）

界面上所有系统 emoji 已替换成自绘 SVG 图标（`src/components/icons.tsx`，30个，扁平剪影风格）。细节见上一版清单或直接看源码，这里不重复。

---

## 8. 字体（已完成 ✅）

标题Logo用自托管 Cinzel 衬线字体，其余中文界面用系统字体。

---

## 9. 应用图标（已完成 ✅，未审查画质）

`public/icon.svg` / `public/icon.png` / `build/icon.png` 都存在，没有评估过好不好看。

---

## 总览统计

| 类别 | 完成 |
|---|---|
| 英雄立绘（含分支进化，50张） | ✅ 50/50 |
| 敌人立绘（5套） | ✅ 5/5 |
| 宠物立绘（7个） | ✅ 7/7 |
| 城堡贴图 | ✅ 1/1 |
| 地图背景（10张，像素风） | ✅ 10/10 |
| UI图标 | ✅ 30/30 |
| 字体/应用图标 | ✅ |
| **背景音乐** | ⏸️ **0/12（暂缓，等你之后再提）** |

游戏里所有视觉素材（角色/敌人/宠物/城堡/背景/UI图标）现在风格统一，全是像素风。背景音乐按你的要求先不做——现在测试时静音应该更清净了。之后想启动音乐制作，或者想精修任何一张像素图，随时告诉我。
