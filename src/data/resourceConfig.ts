// Resource-isolation ledger - each of the game's four currencies has
// exactly one source and one sink, deliberately kept from overlapping so no
// two systems compete for the same pool. This file is documentation-of-
// record for that contract; each currency's actual production/consumption
// code lives with the system that owns it (linked below), not here.
//
// | Currency         | Produced by                              | Spent on                                    |
// |------------------|-------------------------------------------|----------------------------------------------|
// | gold             | DamageSystem enemy-kill rewards            | Hero progression: heroUpgradeConfig per-stat  |
// |                  |                                             | upgrades, hero/pet star-ups (StarUpSystem),   |
// |                  |                                             | equipment star-ups (EquipmentSystem)          |
// | diamonds         | Ascension (ascensionConfig/AscensionSystem)| Gacha only - GachaSystem's premium pool pulls |
// |                  | + chapter-clear rewards (diamondConfig)    | (diamondConfig.diamondExchangeConfig is the   |
// |                  |                                             | one deliberate bridge back to gold)           |
// | buildMaterials   | Castle passive income, economic type only  | Castle level-ups only                         |
// |                  | (castleTypeConfig.getCastleBuildMaterials  | (castleConfig.getCastleUpgradeCost via        |
// |                  | PerSecond, ticked by CastleSystem)         | CastleSystem.upgradeCastle)                   |
// | ascensionPoints  | Ascending (ascensionConfig.pointsPerAscend)| Ascension shop only (ascensionShopConfig)     |
//
// Gold's gacha pool (GachaSystem.pullHero/pullPet, priced in
// gachaConfig.pullCostGold) predates this isolation pass and is left as-is
// for now - the gacha rate/pity rework is explicitly a separate, later step
// (see the conversation this file was scoped from), not touched here.
export type ResourceId = 'gold' | 'diamonds' | 'buildMaterials' | 'ascensionPoints';
