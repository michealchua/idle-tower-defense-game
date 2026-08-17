# tataKAI 美术/音乐资源总清单

这是游戏里**所有**视觉/听觉素材的完整盘点。状态标记：✅ 已完成可用 ・ ⚠️ 存在但有问题/不完整 ・ ❌ 完全缺失。

**2026-08-11 更新**：角色/敌人/宠物/城堡/地图背景素材已经**全部补齐并统一成像素风格**——用 Python（`scripts/pixel_sprites.py` 画角色，`scripts/pixel_backgrounds.py` 画背景，都是 Pillow 库）程序化生成，71 张图，运行对应脚本可以重新生成或调整配色/造型。

**2026-08-14 更新**：新增英雄"受击（hurt）"+"倒地（down）"姿势、敌人"受击（hurt）"姿势（见第1/2节），战斗中命中/倒下瞬间会真的切换贴图，不再只是代码层面的滤镜；背景音乐也补上了（见第6节，程序化芯片音乐）。素材层面已经没有实质性缺口——唯一还留着的差距是"程序化生成"本身的质感天花板（角色立绘是统一模板换色，音乐是算法作曲），不是文件缺失，这块想再进一步质变需要真人画师/作曲。

**2026-08-18 更新（画质升级 v2）**：`scripts/pixel_sprites.py` 重写为分层渲染管线——同一套姿势骨架/锚点不变（轮廓和动作没变），但每个部位从纯色矩形块换成了渐变阴影+轮廓光+金属高光/布料褶皱纹理+柔和抗锯齿描边，并新增了发型层和五官细节（眉毛/眼神光/腮红/嘴）。每张图先在 ~2048px 长边的"母版"分辨率下渲染完所有细节，再用 Lanczos 重采样降到实际尺寸，而不是直接画小图——细节和抗锯齿质量在高分辨率下生成，缩小后自然平滑。

三级产物：
- `public/sprites/...`（游戏实际加载的那份，~320px 长边，仍在 `CanvasRenderer.ts` 的 isFrameSheet 判定安全区外，无需改判定逻辑）
- `art/sprite_master/...`（2048px-class 母版源文件，未提交进 git，本地跑一次脚本即可重新生成）
- `art/sprite_variants/{256,128,64}/...`（可选的降分辨率版本，**目前渲染引擎没有多分辨率/mipmap 选择机制，这几档没有接入实际加载路径**，只是留着备用；其中 128/64 这两档长边正好落在 isFrameSheet 的动画帧表判定区间内，不要直接丢进 public/sprites/ 使用，否则会被误判成 32x32 逐帧动图）

`CanvasRenderer.ts` 的 hero/enemy/pet 三处绘制调用从 `smooth=false`（最近邻，适配旧的纯色像素块风格）改成了 `smooth=true`（双线性/双三次，适配现在的渐变/抗锯齿细节）。

---

## 1. 英雄角色立绘（已完成 ✅ 8个职业 × 3个分支 × 7种姿势 = 168张）

8 个职业 × (基础立绘 + 2条分支进化立绘) × (走路+攻击+受击+倒地+呼吸帧+施法+胜利) = 168 张，**全部完成**，风格化2D角色美术（渐变阴影+轮廓光+材质区分，见上方 2026-08-18 更新），统一模板生成（头部+躯干+职业专属武器/头饰），透明背景，~245×320px（尺寸经过特意设计，不会被引擎误判成逐帧动图，走的是静态单图渲染路径；同一份姿势还有 2048px-class 母版和可选小尺寸版本，见上方更新说明）。

姿势清单（见 `scripts/pixel_sprites.py` 的 `draw_humanoid` 函数注释）：
- **walk**：基础站姿，也是待机循环
- **attack**：普攻挥武器瞬间
- **hurt**（2026-08-14）：被打中后~0.18s 的短暂后仰+防御举臂+皱眉姿势，配合 `CanvasRenderer.ts` 的白闪+挤压效果一起触发
- **down**（2026-08-14）：`HeroState.isDowned` 期间的跪地/垂头姿势，替换掉原来纯代码灰度滤镜
- **idle2**（2026-08-14 二次更新）：和 walk 每隔约1.6秒交替一次的"呼吸"帧（头部微微抬高1像素），解决角色长时间一动不动显得死板的问题
- **cast**（2026-08-14 二次更新）：技能施法成功那一刻（`SkillSystem` 三条施法路径都会触发），空手举起+发光符文
- **victory**（2026-08-14 二次更新）：过关瞬间全队英雄一起摆出的庆祝姿势（双臂/武器高举），持续约1.8秒（`GameState.victoryPoseRemaining`）

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

## 2. 敌人角色立绘（已完成 ✅ 5/5，含受击姿势 5/5）

| 素材文件 | 覆盖的敌人类型 | 状态 |
|---|---|---|
| `enemies/goblin.png` / `goblin_hurt.png` | normal・fast・tank・elite・brute・giant・berserker・shield（8种共用） | ✅ |
| `enemies/slime.png` / `slime_hurt.png` | swarm | ✅ |
| `enemies/zombie.png` / `zombie_hurt.png` | zombie | ✅ |
| `enemies/witch.png` / `witch_hurt.png` | healer・witch | ✅ |
| `enemies/demon_boss.png` / `demon_boss_hurt.png` | miniboss・boss | ✅（这次也换成了像素风，配色更凶悍：深红/黑/橙角） |

没有"死亡（death）"姿势——敌人死亡瞬间就从 `state.enemies` 里移除了（`DamageSystem.handleDeath`），要让死亡姿势有时间显示需要给敌人加一个"临死但还在场上"的存活窗口，这是引擎行为改动，不只是美术，所以这次没做，只做了受击。

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

## 4. 城堡贴图（已移除）

城堡/基地生命值机制已从游戏中整体移除（改为"全队英雄阵亡"判负），`towers/castle.png` 不再被引用，可以删除。

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

## 6. 背景音乐（已完成 ✅，程序化芯片音乐）

2026-08-14 更新：`public/audio/` 里 12 个 `.wav` 文件已经用 `scripts/pixel_music.py`（纯 Python 标准库 `wave`/`struct`/`math`，不需要额外依赖）重新生成——每首都是独立的调式/节奏/音色/时长（13.7s~21.8s），经 MD5 校验**互不相同**，`AudioManager.ts` 的 `BGM_ENABLED` 已经打开。**明确说明**：这是芯片音乐级别的程序化作曲，不是商业配乐质量——旋律走的是"在给定调式里做带种子的随机漫步"，谈不上刻意的乐句设计。如果之后想要真正商业级的音乐质感，仍然建议真人作曲或专业 AI 作曲工具替换这批文件（直接覆盖同名 `.wav` 即可，代码不用改）。

音频播放系统本身（`src/audio/AudioManager.ts`）没有问题：单曲循环、地图切换自动换曲、boss战自动切战斗曲都正常；设置面板（`SettingsPanel.tsx`）新增了背景音乐/音效各自独立的静音开关。

**如果想调整**：改 `scripts/pixel_music.py` 里 `TRACKS` 列表每条的 `scale`/`root`/`bpm`/`lead`/`bass`/`bars`/`seed` 字段（调式/根音/速度/主旋律和贝斯音色/小节数/随机种子），重新跑一遍脚本即可，不用重新设计整个合成器。

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
| 英雄立绘（含分支进化，7种姿势，168张） | ✅ 168/168 |
| 敌人立绘（5套 + 5套受击） | ✅ 10/10 |
| 宠物立绘（7个） | ✅ 7/7 |
| 城堡贴图 | ✅ 1/1 |
| 地图背景（10张，像素风） | ✅ 10/10 |
| UI图标 | ✅ 30/30 |
| 字体/应用图标 | ✅ |
| **背景音乐（程序化芯片音乐）** | ✅ 12/12 |

游戏里所有视觉素材（角色/敌人/宠物/城堡/背景/UI图标）现在风格统一，全是像素风。背景音乐按你的要求先不做——现在测试时静音应该更清净了。之后想启动音乐制作，或者想精修任何一张像素图，随时告诉我。
