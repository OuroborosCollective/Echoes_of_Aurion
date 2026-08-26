# Wasd Gameplay-/Weltmodul-Ledger

> Quellrevision: `a4d99432e47b82ce98105eadb30360cd8040ad13`. Das Ledger ist read-only und zählt keine Tests.

| Kennzahl | Wert |
| --- | ---: |
| Kartierte gameplay-/weltbezogene Servermodule | 457 |

## Domänenhäufigkeit

| Domäne | Module |
| --- | ---: |
| combat | 20 |
| economy | 58 |
| language_lore | 38 |
| loot_items | 51 |
| npc | 130 |
| politics_war | 33 |
| progression | 18 |
| quest | 56 |
| world | 145 |

## Einzelmodule

| Wasd-Pfad | SHA-256 | Domänen | Migrationsstatus |
| --- | --- | --- | --- |
| `server/src/api/loreRoute.ts` | `37c209134f60a97d9ec070da44d84d1bc8fc266d40e26106e10a386121aae6db` | language_lore | unmapped |
| `server/src/api/questPersistenceHealth.ts` | `13420a498e7f191e0869a24e09b17aa083b1c332d3b2b1a121c080d5dcdac762` | quest | unmapped |
| `server/src/api/questlineRoute.ts` | `9075605aac1425055a6cb6b29d38127df93a074324da6b1f8023420e7035343a` | quest | unmapped |
| `server/src/api/rest/worldRoutes.ts` | `0140ddb8d0a1dc5b18ea0b425aaad08372cdb63175007322cfaae8bca47c266a` | world | unmapped |
| `server/src/api/skillPersistenceHealth.ts` | `6a852cb82cac215492dd8a8e33ce1c35f938823311f9cc1e68c5cf2e88785ea1` | progression | unmapped |
| `server/src/api/warfrontRoute.ts` | `8f01010caddfeee40687b819a70beb06093806678461860301446ff0d7435127` | politics_war | unmapped |
| `server/src/api/worldHeartRoute.ts` | `952b3e1823cf092273bee3f98638ab0621dffc870962e2029aa32e17b1ac838f` | world | unmapped |
| `server/src/api/worldRoutes.ts` | `a01642181f437123cfdb5e2cecd7daf521c84e08b34507c8a0b16ab888aeaacb` | world | unmapped |
| `server/src/are/WorldHashSnapshot.ts` | `88bbc3236d3af4f6fcd8eb7aad065277bd50042cc6bcefba5c9598e103f562e6` | world | unmapped |
| `server/src/are/__tests__/WorldHashSnapshot.test.ts` | `3cef16ae65ce9700c918d4cb07dcbb9baa4c04af662937fa122e37ef1afb4882` | world | unmapped |
| `server/src/config/FactionToolMapping.ts` | `fc71830d3a5146a357f4f2ce3b1c1f8745ef1aa6fa7123245e2593c2b4672589` | politics_war | unmapped |
| `server/src/core/WorldBossDungeonSystem.ts` | `2135fd0bf5baf85dc2dcdf38926bd3f067961b6a50f4acf0648c12ab8691cd4f` | combat, world | unmapped |
| `server/src/core/WorldEventBus.ts` | `e960f75a0805385607a88f94163a4e27cf9d56234f31d9679a884875667bcb60` | world | unmapped |
| `server/src/core/WorldResonanceAdapter.ts` | `0c829ba9f484e930fc6acc071a93cafacc5d0fa02c2b92e089a0beb5f9468ae1` | world | unmapped |
| `server/src/core/WorldTickPolicy.guard.ts` | `ffc79617fa15440d4b11bd83b235247b5fc4bda6747591df52b29233d2fe23e3` | world | unmapped |
| `server/src/core/WorldTickPolicy.ts` | `e82c56011a9107821706886e1601ce808a8393cdf7233a018b6f279d524a87c6` | world | unmapped |
| `server/src/core/WorldTickTimeAdapter.ts` | `d5b9c1278d3f02234d34978f797e738a91d3520b91cc8fa9fbe20cc5d2cb94eb` | world | unmapped |
| `server/src/core/are/CombatTickSystem.ts` | `0cd66017719a23a8970916c80f8c91ed642169cf095bfa831c8522058bbdf896` | combat, world | unmapped |
| `server/src/core/are/EconomyTickSystem.ts` | `dbdb4ae66f28a3c20f379f771b27db6734fd6d6e019c6d0d96358770ca8b85e1` | economy, world | unmapped |
| `server/src/core/are/NPCTickSystem.ts` | `42cfe120c252e070697f7597cc48976327bd425b66a134557f582b5e876e6fe1` | npc, world | unmapped |
| `server/src/core/are/QuestTickSystem.ts` | `1d72c59fe1a913632cb0eff111ad7d0de32c7f38ad1caf0ffe40a7e3e3610097` | quest, world | unmapped |
| `server/src/core/are/WarfrontTickSystem.ts` | `8e74ee8cf20ac58823c5468216581c1920aacef1f8bf9a6cd83d38dfe2a35283` | politics_war, world | unmapped |
| `server/src/core/are/WorldBrainRuntimePort.ts` | `8cf9f7cca4eefbec396ca2e71b18c6f0fff11d8ecefcaaa0e3f59f9fb7551262` | npc, world | unmapped |
| `server/src/core/are/WorldBrainScheduler.ts` | `1ae87dfd7f2ea1c4531a31dbbc46de462f68a0c8749fafd8bcf3f4b1e20b266d` | npc, world | unmapped |
| `server/src/core/are/WorldBrainTickSystem.ts` | `d7c25d4b8e844d9b578433760af204a71b028acbcb1d7edf004d6881c9e6a5e6` | npc, world | unmapped |
| `server/src/core/are/WorldTickRegistryAdapter.ts` | `64e0bad0c856e97f044b0f18caca7dfa1b2814ab8bdd1d45e3740fe34eddd86a` | world | unmapped |
| `server/src/core/are/WorldTickScheduler.ts` | `d3d536819df64979a8a1868d3b70b112974a6b9de15483b3a3036cf479354a8c` | world | unmapped |
| `server/src/core/are/WorldTickThinShell.ts` | `33c4600a781336f48ee5d8403f7ff9eec24ef107918fedb65cf64a9f3127501b` | world | unmapped |
| `server/src/core/are/WorldTickThinShellAdapter.ts` | `5c83e6f4c02b512ced8af0fba9e189efa2f8021bbfdc04f4e134a5719889e5d5` | world | unmapped |
| `server/src/core/are/__tests__/CombatTickSystem.test.ts` | `c2b1e717e3bf6953bbbed5880f22c981ea9a3cca5e7ada12f6416826e2e04b24` | combat, world | unmapped |
| `server/src/core/are/__tests__/EconomyTickSystem.test.ts` | `80a5a2fca66ab7dd5b4a25581a30c154132aeca9cf462c13003e0e7913a81ed9` | economy, world | unmapped |
| `server/src/core/are/__tests__/NPCTickSystem.test.ts` | `e111c6f084e89067f67af430392dc81391de89f11b9dc5fd1cdf747b077f1eff` | npc, world | unmapped |
| `server/src/core/are/__tests__/QuestTickSystem.test.ts` | `7fc2b27961148933a6a5775f704eede490ddfdcf387e90d49cea4e845fb4a025` | quest, world | unmapped |
| `server/src/core/are/__tests__/WarfrontTickSystem.test.ts` | `556578877d52aa90466dc7692ccfe8fb82fb4a581619869e016e378161e973b5` | politics_war, world | unmapped |
| `server/src/core/are/__tests__/WorldBrainRehydrate.test.ts` | `3d0f3565841d77d3fc08eef67c3d4813a71685562c809478960619e6718e306c` | npc, world | unmapped |
| `server/src/core/are/__tests__/WorldBrainRuntimeTruth.test.ts` | `6baa824abb0bb1ec277ccac39afb5361d69de2f3667046fdf379b109fd9eee93` | npc, world | unmapped |
| `server/src/core/are/__tests__/WorldBrainScheduler.test.ts` | `2148f1d11b71fe7754580465327c9a3725fa2751c202cc2c0e32c28806f2a558` | npc, world | unmapped |
| `server/src/core/are/__tests__/WorldBrainTickSystem.test.ts` | `7ddf432882379c657bcd2b9833a73550a1b670a3b0770b0e18da23a15a7b41c9` | npc, world | unmapped |
| `server/src/core/are/__tests__/WorldHashActorState.test.ts` | `e23f9a34041b50de97a24c51acfdbad52209ec983e50400137901536ce36d7aa` | world | unmapped |
| `server/src/core/are/__tests__/WorldTickFailureBoundary.test.ts` | `33c2c93d46c318e3bef6138431edccabf571e81a7953236b4655e64a88fd5faf` | world | unmapped |
| `server/src/core/are/__tests__/WorldTickRegistryAdapter.test.ts` | `c7524afd02b3ec1c50f2996ac8f49188fa099e65c6bee387b24bebf68751ea29` | world | unmapped |
| `server/src/core/are/__tests__/WorldTickThinShell.test.ts` | `116d75558ee52e001f9da68cbf0ff38ba0e500ea0bbe8353f4251755ba9895b4` | world | unmapped |
| `server/src/core/language/ArelorianConlangEngine.ts` | `c7bd2c5679f442445a317d469d0e52968a47ceca7b580b5066f70fff1ce046c1` | language_lore, world | unmapped |
| `server/src/core/language/ArelorianLinguisticKernel.ts` | `be220f5b2479b01c2853b69b368ba4a501468ac86fd4b80324a9fcd4537d93e8` | language_lore, world | unmapped |
| `server/src/core/language/DialectStores.ts` | `94674b261226e018e566cd83d89c8345d5aa094b94ab57a3f6a21a42cd67c481` | language_lore | unmapped |
| `server/src/core/language/DialogueBridge.ts` | `eb3466ef5c56ca200a7a55725f87001a73355b869c37a437aab17a328b0b35a2` | language_lore, quest | unmapped |
| `server/src/core/language/DialogueDecisionKernel.test.ts` | `25cd2baa39b860c96dba6eaf78c73b7ae10c9187f1b9c4e414905e0b2fccb970` | language_lore, quest | unmapped |
| `server/src/core/language/DialogueDecisionKernel.ts` | `c965fb3cdd46a790e522bb84b0870d257695cc9175ad621718b37d82df0473d7` | language_lore, quest | unmapped |
| `server/src/core/language/DialogueSafetyQuarantine.test.ts` | `723c2c2487f66615d6acdd93c0c5a8f66910baf4e3497c64c5af762648fe8a14` | language_lore, quest | unmapped |
| `server/src/core/language/DialogueSafetyQuarantine.ts` | `3527a1b7f1d9975e983b35eaa46695b941d147a4ed2917c022879c417ad5c980` | language_lore, quest | unmapped |
| `server/src/core/language/LanguageGameDataStore.ts` | `2388d345506d12de6394d5646d3907f92565110527e4c6aee0bba250b818dd1b` | language_lore | unmapped |
| `server/src/core/language/LanguageOutcomeLearner.ts` | `929eb5df95ca75009a3a1660022760206bbe94006f8457a6367f2ace98843041` | language_lore | unmapped |
| `server/src/core/language/LanguageShadowTelemetry.ts` | `f293652189cad10565a897f02427171bce6fae8604df2a50ff917dce837b7cce` | language_lore | unmapped |
| `server/src/core/language/LanguageTypes.ts` | `83a504b4074279d8e082861dbbf41131b0d09e9c09c6215f3bf578676fa15eda` | language_lore | unmapped |
| `server/src/core/language/LivingDudenArchive.test.ts` | `580d84bcacbab2e6591f1573ab6e284cbc2a02f5319ff97f29e5fabe9665ee8d` | language_lore | unmapped |
| `server/src/core/language/LivingDudenArchive.ts` | `cb3257c4df532afb5ef2020401795b8586509f96206ab315db0ecb52bd51a645` | language_lore | unmapped |
| `server/src/core/language/LivingLanguageInitializer.ts` | `7d456cf175be3eae90a79d087219a8b255df73f9f327bff314d3142f7274e324` | language_lore | unmapped |
| `server/src/core/language/LivingLanguageSystem.integration.test.ts` | `10b36b4791dae4212f3d95e62b8244e12b9a9ade39ff12148612e8ded4e272f1` | language_lore | unmapped |
| `server/src/core/language/MorphemeMutationEngine.ts` | `5ed1bd79066966520ad50f4e597a5c81817f7c2ec157c5ba7f6b3c65adae41e4` | language_lore | unmapped |
| `server/src/core/language/PhraseGenomeGameDataStore.ts` | `7bf7a801645f9bfa538011f959900305b208d9b5da3f7787432d5ff066c533ac` | language_lore | unmapped |
| `server/src/core/language/PhraseGenomeRegistry.ts` | `11c99c95c085efa91dcc8510228b2561a321d72acb71c0373ad504c3588c1456` | language_lore | unmapped |
| `server/src/core/language/ProceduralGrammarEngine.ts` | `36f2350024396cadcfa6fc22f55496bdf4a5232bbcecd4aef17fd0f301d880f7` | language_lore, world | unmapped |
| `server/src/core/language/RumorSpeechBridge.ts` | `0871c7d243d4244a0e675f0b7101eb4825db37905793546a04dc3f17afee50a2` | language_lore | unmapped |
| `server/src/core/language/index.ts` | `ad8388a70ad777a50700b5d9c8f656d0a770ec8296b83444ea116b3b34b38f80` | language_lore | unmapped |
| `server/src/core/manifest/WorldTickManifestManager.ts` | `b3986bd1d43cec993ef2963fd32dfc2c9bb0bcfc21848f3daa099f0c49c7c824` | world | unmapped |
| `server/src/core/ouroboros/NPCSemanticsEngine.ts` | `716fac8f77f18e4e69464143abe766589e9b4f64bddc8714b7da6e5bf37a8524` | npc | unmapped |
| `server/src/core/state/RegionState.ts` | `870ca1d28a94b7260861d5c5501bd55113399a648fa60a3b19ce112bf292fad5` | world | unmapped |
| `server/src/core/state/WorldStateRegistry.ts` | `10c41c5c88c2164c4825c67e426f6bbf8d73d34b344417f33fc264a2042964b7` | world | unmapped |
| `server/src/core/systems/CombatSystem.ts` | `c5f1a1c912544a511b7bc37199745189e6a2748beecd4438c2deffbd991a1f78` | combat | unmapped |
| `server/src/core/systems/EconomySimulation.ts` | `ecd7080726516d23edbf38eff949c267a122ea0f03a790d69313b751a68cc331` | economy | unmapped |
| `server/src/core/systems/NPCSimulation.ts` | `34fe664d17767a3917fb05dea050711e47c1fc793ca812b3279e7c70c1406cc3` | npc | unmapped |
| `server/src/core/systems/QuestDerivationEngine.ts` | `582629e8a5c58f6d231e41ce9bd1b82b387edd4a339f77f45a8b0dae8549a29f` | quest | unmapped |
| `server/src/data/skillCombos.ts` | `7d710879807f774fdb53afbe62119b653110336181dbfc49dbe522dc1ca5f82d` | progression | unmapped |
| `server/src/devtools/genkit/combatOperator.ts` | `df1161e130bdcdd801c24d4963c6abd5d55892645dc3326d00ff53e5d4987edf` | combat | unmapped |
| `server/src/economy/CampStockPrices.ts` | `744f17e54c37e0ef65dc8b7f5b4a8be977ec5acb9e2a705d6b18ab43ee759dd9` | economy | unmapped |
| `server/src/economy/DemandPricing.ts` | `70db581275726e7dca26fce829a929b29fa7166e8f9f0001a95406a8f29f4235` | economy | unmapped |
| `server/src/economy/EconomyGameData.ts` | `d12f55496d2c075bc1cf89c79b9fefa373c94243a85a00eca8d43fb02c23f518` | economy | unmapped |
| `server/src/economy/EconomyService.ts` | `f8fe40f0463b0d9a4f4a3a4f7668b5785526c9f2397a53a7191e69a2a05be153` | economy | unmapped |
| `server/src/economy/EconomySnapshotAdapter.ts` | `2bae25ddf1ec4bc7a0074bba5851bcae89b0fae31ca5350b70ba4ee283b4fcd7` | economy | unmapped |
| `server/src/economy/JsonVendorStockPersistenceAdapter.ts` | `117542810a52a06bdf19b9cc7e9d1a2dc3d50e456cec0d9fc5475e67258384ab` | economy | unmapped |
| `server/src/economy/JsonWalletPersistenceAdapter.ts` | `5fb11652ec67bf6936106f2c8936f0f945d37bbacdfb370f380db68bb8425e8d` | economy | unmapped |
| `server/src/economy/LocalMarketTypes.ts` | `e8a3d1f4e9e9d000d1c4fc87a757c9bb64c47e2e37bb0fd19e9364486ff982a2` | economy | unmapped |
| `server/src/economy/LocalPriceResolver.ts` | `39527e22f1a2143c23f5be252c4a07f12477220e6f025a93846498b34675fc4f` | economy | unmapped |
| `server/src/economy/MarketOrderBookService.ts` | `929e9f037217c025b1f438b209daa9f5d91a7dae7b06073982aa26f063f68e74` | economy | unmapped |
| `server/src/economy/ResourceSellPrices.ts` | `c00b53031b726071e6ab0e3ba9998dfad37e269cedd9b39234bd0c15b4b5b249` | economy | unmapped |
| `server/src/economy/TradeRouteGraph.ts` | `989d756b6c098d03995857458b29ed075bec154ee41849b3174542acaf8345ad` | economy | unmapped |
| `server/src/economy/VendorStockPersistence.ts` | `0b7c0c0e0a01b9df99cede7b86730fde6687af6ee9a202c547e664f2153ce87b` | economy | unmapped |
| `server/src/economy/VendorStockService.ts` | `0023498e81b56f68a5727cad44c86af9ccf8621dfc2102ddd56108d30341c780` | economy | unmapped |
| `server/src/economy/VendorStockStore.ts` | `bcb07c9a82880893505ccdc26faf736d1583692e0edfd5927b64f7f329fc88d6` | economy | unmapped |
| `server/src/economy/VendorStockTypes.ts` | `68fa4630064add02df90b7b9734df44d64ec913141114b510814c045ca55ebfb` | economy | unmapped |
| `server/src/economy/VillageVendors.ts` | `c4a614cdcc84f034f5a6bf99ea0b40906084ad78971d900cbaa014c0b9275d59` | economy | unmapped |
| `server/src/economy/WalletPersistence.ts` | `fcce8c4c670a8e4e4a10f4060e06990a5676fa350fcdc7a02f73bf1e73ce2813` | economy | unmapped |
| `server/src/economy/WalletService.ts` | `bbe30ce3469428bb2def58ba7cb30efdaba40696a81136c4b43a412feb734505` | economy | unmapped |
| `server/src/economy/WalletStore.ts` | `c5b34e39cdb3bf5d1478f3248d679d60ed5c83024c7ac87cc20498872d9c26c8` | economy | unmapped |
| `server/src/economy/WalletTypes.ts` | `7002ed81710e90533d6513b318041c1870bba856db9e024c5758551e84fcc620` | economy | unmapped |
| `server/src/economy/WorkOrderGameData.ts` | `663c83ed7eb5b611b0475ebadb3ed8196d71ed8abf908e292c4fc648a3e58429` | economy | unmapped |
| `server/src/economy/WorkOrderService.ts` | `98b3cbc1a125a49ca5d11db48b053c1c352a4f151d4df0208a7285d23f0fcf87` | economy | unmapped |
| `server/src/economy/WorkOrderStore.ts` | `d5685bedaea4685c58b8c33c0981ff52cb9053f0fc280b82a8a8082cff01e99d` | economy | unmapped |
| `server/src/economy/WorkOrderTypes.ts` | `f1030fccac49aaa3126291c4aa9dd80a77ecf7747004e0ca643b8425ce43b4ae` | economy | unmapped |
| `server/src/economy/economyRoute.ts` | `bb6afb79313a8b7d980eb385edb8dcfa53495b5d44941b0be341d782c234e7ef` | economy | unmapped |
| `server/src/economy/economyRuntime.ts` | `743e29bbb856f9f83e9b1282314eef10ac7eb9e0537c5bf3b140e18216ba9c37` | economy | unmapped |
| `server/src/economy/index.ts` | `2956aa46d1f74e431cc71e6c77695a8249780ce188baae2ab8e86baf2262e8d5` | economy | unmapped |
| `server/src/engine/npc/HeuristicGoalPruner.ts` | `caa6b7683abe426e3f47943d0a8ffe1d31d6deb2fb9ff8c59f2c28638b66ba23` | npc | unmapped |
| `server/src/engine/npc/NPCEngine.ts` | `d40d2f48eaa104c90289969511c8b80f17627ff8143c6884783bf2ec74e3eaa4` | npc | unmapped |
| `server/src/engine/npc/NPCMemoryCache.ts` | `4e588c3b16837a55311c98489582893da8716a75bca58dd121b7857783db6b40` | npc | unmapped |
| `server/src/engines/FactionEvolutionEngine.ts` | `1cc9a50d726d2d480533f2dce9cc032f38d0f26fabdb1c381059e099545ea217` | politics_war | unmapped |
| `server/src/equipment/CombatEquipmentHook.ts` | `194f43e93cedf40d555e635d250084db0754e60024a84b1225f6d4ecf69ca561` | combat, loot_items | unmapped |
| `server/src/equipment/LootEquipmentHook.ts` | `748c23cf619652a04f7dbc8e7acf7bbd580b50e9e407fcfd27c3f23df2349d9d` | loot_items | unmapped |
| `server/src/equipment/LootEquipmentSlots.ts` | `33e04da0d0dee6fd7c7dbbdbde47af757041b7e50bb5fdb43b2bd8cca75de356` | loot_items | unmapped |
| `server/src/events/WorldEventBus.ts` | `cf2d5a510e9375c1ef381f430947c1443329a8b9602ffe8170c1f0f0d42a5eca` | world | unmapped |
| `server/src/gameplay/NPCActivitySnapshot.ts` | `82293bfd7c39151ecdf1f6426e7f89abd207dbec4392544451f657e175a34135` | npc | unmapped |
| `server/src/gameplay/NPCActivitySnapshotGenerator.ts` | `811f7b9a82f25de3581f8c007a82c6d0e7f07016b9b821df07c44fe729d16c19` | npc | unmapped |
| `server/src/gameplay/NPCManager.ts` | `05625f24cbf060178ab70cf4b5d984501b28c3c1a73bd245dafecf3712a744f7` | npc | unmapped |
| `server/src/gameplay/WarfrontHeraldController.ts` | `5ecab7d1c4999654b9641fdc20c829d4cf1f32b453153ffc636775d9cbb025e1` | politics_war | unmapped |
| `server/src/gameplay/persistence/questRepository.ts` | `358e89682ad11f06254dc5317d26d6631be1193896005c7478b590e5b3b0bc10` | quest | unmapped |
| `server/src/gameplay/persistence/worldEntityRepository.ts` | `35e03f920fcb811d7487dce445c3ec9b0cdfe8bf334f109cbbf11f243f91e365` | world | unmapped |
| `server/src/legends/WorldEventSignificance.ts` | `276b0f281835b21e664c58af55a69d9be3f4c40c48e6f7537a5953050c13a6e0` | language_lore, world | unmapped |
| `server/src/loot/AffixEngine.ts` | `eb56c7fcd2a6d235694d56ab408f50db151630f891add53f10f6366162a3dbc9` | loot_items | unmapped |
| `server/src/loot/DeterministicRng.ts` | `aaf25b2d26098418ff2c4145906d7aa3a8f83795062aea7f2cfd037f9beb6da6` | loot_items | unmapped |
| `server/src/loot/LootAxioms.ts` | `0e43fbfb0033e512e9da201035f4acf29e30d4a295ee5e455481e72f0465bab8` | loot_items | unmapped |
| `server/src/loot/LootDelta.ts` | `03e17b637f2947ce98d3f11e1d6bc6380ea1f20a74bb66135973ab1744606357` | loot_items | unmapped |
| `server/src/loot/LootDirector.ts` | `1a5a8f189116148a5bf5c5d034c0aa24fdf2ea2c51b5707a25be1767bc385937` | loot_items | unmapped |
| `server/src/loot/LootGovernor.ts` | `2d0dda5718aad4ee101a4ecad77aac56b4c60e23f33ee2ddafc87f50abdbb0cf` | loot_items | unmapped |
| `server/src/loot/ProceduralLootMachine.ts` | `8d344b9778cc2d22fce560416e778e0dd9c7177fbd0a50627b1c2e9ec68b61c1` | loot_items | unmapped |
| `server/src/loot/RarityResolver.ts` | `7ba6ea0a724a877095354a66d9e6a25f78b36effd13f2d652e53079fdad4f1cf` | loot_items | unmapped |
| `server/src/loot/SocialStringMutationEngine.ts` | `e967a6e67361162954681eccd3f90f7b09117f375dd1d4abad749920165b0e0a` | loot_items | unmapped |
| `server/src/loot/TreasureClassRegistry.ts` | `6d7fc03ead8262ab577becd4bebb81e23faf785198445f08cddaf40dbd1eee6c` | loot_items | unmapped |
| `server/src/loot/index.ts` | `e197224be1b645add05edcc3238d74e828fbcc4e8dbdc3e16fb2dc2540fca311` | loot_items | unmapped |
| `server/src/managers/FactionManager.ts` | `81638ad566b869cc74004292a9949149d0af1d4a00944759431b686bc69c6595` | politics_war | unmapped |
| `server/src/managers/NPCManager.ts` | `3dbed8320639d8f696028157b5e03f2d7c84980f75b62309a61d1bc23c40e85e` | npc | unmapped |
| `server/src/models/NPC.ts` | `6f36611e6f935aecf7ba356ef9d3f3956f7b3cd9ece439d00378f49783771b11` | npc | unmapped |
| `server/src/modules/ai/NPCBrain.ts` | `d5bc904a3b24457fa789962c05d492852565fb26e7a1511948a1cf37269c37fc` | npc | unmapped |
| `server/src/modules/ai/NPCSchedules.ts` | `d30a2d6f860dd8697fe8e680696890f7fe0ea14fadf0721bd6265797d6151335` | npc | unmapped |
| `server/src/modules/ai/WorldGenerationFlow.ts` | `bbabe1f2a57e73492559f2df428fadcd88721521ee8ae4bf12764c4a3504a9ba` | world | unmapped |
| `server/src/modules/api/worldRoutes.ts` | `8d8ebe503c7b754048f93bd4936873b86a4f315df7a3275293edd83d41866417` | world | unmapped |
| `server/src/modules/asset-registry/NPCAssets.ts` | `9fee8630faa06e070243e91051410a85e35ee533b2ffa365843f5c67fd6d7d01` | loot_items, npc | unmapped |
| `server/src/modules/brain/WorldBrainCacheService.ts` | `50d77df0fc7f869e7dcbd49e044278befc651ea9bf887f87a130febe963e177b` | npc, world | unmapped |
| `server/src/modules/civilization/KingdomLedger.ts` | `f2cce443adf136a4d0dbdfa611369879b209acb6f9deb4ebd377332f6f6ff5a3` | politics_war | unmapped |
| `server/src/modules/civilization/SettlementSystem.ts` | `98a1f06d3692b4a01e244cc5258c3684d645e5fbe51e1f983295c0a920b0f91b` | loot_items | unmapped |
| `server/src/modules/combat/CombatDeltaResolver.ts` | `2739e5214f5ae37e9ad5acc59c8a761a5f96a1346fb4d90691eeec87dac2ce98` | combat, world | unmapped |
| `server/src/modules/combat/CombatDeltaStore.ts` | `24f65bd24fc31bd335deee67516c34c33820bfa5f86d335a1412bc5678fa34d0` | combat | unmapped |
| `server/src/modules/combat/CombatDirector.ts` | `f55c65e67f15f6c9eaa30780013cd1806dd49f2c65e9a3b2e18907a4573907ca` | combat | unmapped |
| `server/src/modules/combat/CombatService.ts` | `55a848f8e9bc5672853da61aa3ebe835449dc09c13f3471a029bdb6b10584d4c` | combat | unmapped |
| `server/src/modules/combat/CombatSystem.ts` | `a4a3f9f4d0257fbb4625b02fadeefb8bfa20e837927a0a0e0e9a5bd31710e39c` | combat | unmapped |
| `server/src/modules/combat/ComboValidator.ts` | `9cf68f7b735188f61ec9ca5afb578b177d2e4760af515a27d8f95ce494a60161` | combat | unmapped |
| `server/src/modules/combat/deathRespawnSystem.ts` | `994f64d5937f5bf3af6ada09d39c1fb77212b5261069e5e3ddf765f27ff64053` | combat | unmapped |
| `server/src/modules/combat/hookTypes.ts` | `f4a7f34b04edc922ca693cc83f6f9b880cc792c9e4b71778791fc315db6c04b7` | combat | unmapped |
| `server/src/modules/combat/respawnPoints.ts` | `86aa9f528eb37578910b5beafadde04b5e8970beb275d49a0c2e253a1e19e707` | combat | unmapped |
| `server/src/modules/combat/selectAttackTarget.ts` | `8b788f27bfd4fcff5d706875a462ecfba4995e7ae63afac804e069599a755f27` | combat | unmapped |
| `server/src/modules/combat/types.ts` | `50b63ec7f3e443e0da107f07ee593ef6ff907e7b0bdfa7c5c5a4abeeadfd3369` | combat | unmapped |
| `server/src/modules/dialogue/DialogueContext.ts` | `1d39c63f37b2aaf698490f1a31072f21d835c535898d74fa27027d4c7c42c9f9` | language_lore, quest | unmapped |
| `server/src/modules/dialogue/DialogueDirector.ts` | `d98f7d14ea51cfa7eb4db94642a9ff2e40def93192c85eb38a3686573a034379` | language_lore, quest | unmapped |
| `server/src/modules/dialogue/DialogueEngine.ts` | `a49a587bd0406c62fe170e2ba94c4fc4e27556044adfac044a011d2d52efa50f` | language_lore, quest | unmapped |
| `server/src/modules/dialogue/DialogueGenerator.ts` | `3d1418881ea30c0d1c4486e8525811ebee7a7386ef77998dc46a9b744cd21c1d` | language_lore, quest | unmapped |
| `server/src/modules/dialogue/DialogueMemoryBridge.ts` | `8a27e89759c2fd17fb472c224ca0b84ccb4cf18c31091f983fdda54e7fef6988` | language_lore, npc, quest | unmapped |
| `server/src/modules/dialogue/DialogueTagRules.ts` | `cc08ef4c22b20767ce08b9f7332b93987eaebb9447708d3972e051d58e12308a` | language_lore, quest | unmapped |
| `server/src/modules/dialogue/DialogueTemplates.ts` | `d6e016e86dd8e93ef8efcc9ff470baca79f4f51766bfdd4cbd6af6fe96521b5d` | language_lore, quest | unmapped |
| `server/src/modules/economy/BuyOrders.ts` | `c2b11195f92d00b28ca780c2c9f20209905efa6f93f8eab48288ce8ffae76923` | economy | unmapped |
| `server/src/modules/economy/CaravanLogic.ts` | `55bf377bf294f652ed8444a7c7fa8af01b8c8b92b720be9d5953e302fea7fc5d` | economy | unmapped |
| `server/src/modules/economy/EconomyEngine.ts` | `2b1408846e4bdba0cec19d76e10815b936f4b233cb19af36f6793bb8ffd841b9` | economy | unmapped |
| `server/src/modules/economy/EconomySystem.ts` | `316a72c2dbb50a1629edc0f655a958270cc71305b2bf366180bb3d25418db506` | economy | unmapped |
| `server/src/modules/economy/EmergentMarket.ts` | `b0e2ae8f65f97fc509e273ec59c989f902c31c2a29ec439bb262572c0fc79c92` | economy | unmapped |
| `server/src/modules/economy/MarketExpansion.ts` | `93563a4c8be08dac09660f72fa13a1a6effc96f9ff7c0ac8bdc5f2b2b0a056c2` | economy | unmapped |
| `server/src/modules/economy/MarketLedger.ts` | `6df4475aa03decf6ffacc96f6a249422e3084a3adfca4d058fce298f12dd44d0` | economy | unmapped |
| `server/src/modules/economy/MarketMonitor.ts` | `42c3cc5c80e3f969effe74174a35b5d479696c041891d68d2017e20fb5fbacc6` | economy | unmapped |
| `server/src/modules/economy/MarketOrders.ts` | `7e5e9ccca97cc5fec097656a11176e95469c1fc20b8296b51ebaf9ea7408ec2d` | economy | unmapped |
| `server/src/modules/economy/MatrixEnergySystem.ts` | `69965d4ef9b55ba36869bca5b8caa7333f728b83abecd1fcc393bba2b42b2ac7` | economy | unmapped |
| `server/src/modules/economy/NPCTradeAI.ts` | `55d165a63152baec7fad01d6362533d0520bad4ce859f81e7c75b406f2a6293a` | economy, npc | unmapped |
| `server/src/modules/economy/PlayerMarket.ts` | `6457aa75853f9ef93c80299b8a1938915eacdd6622849a4b696bcbc60547b0b3` | economy | unmapped |
| `server/src/modules/economy/PriceBalancer.ts` | `3311da6229e882947124dddf0a83e6274d88e45e975d9ea239d28d259401f03e` | economy | unmapped |
| `server/src/modules/economy/ScarcityPredictor.ts` | `d8d0acb6443c4480f0332cc0d44099491de44b6b1f5325b0c2e5fefe0fbbee48` | economy | unmapped |
| `server/src/modules/economy/SellOrders.ts` | `9009fd6edcc7854e9f7cd3a98f24c58041a04d62311277d1832a28880eb4c13e` | economy | unmapped |
| `server/src/modules/economy/TaxLedger.ts` | `dd19879ddf5f3d155fcd636222437013495b425cc507ff07abf09f45ff63df72` | economy | unmapped |
| `server/src/modules/economy/TradeRoutes.ts` | `350ba2ca3e1befa575d7fb884d1b83c30fc5df3465549d5e508525451d0ab383` | economy | unmapped |
| `server/src/modules/economy/WeatherEconomyBridge.ts` | `23f3017782bc7ab136f3ff89a4eb621fb16398e0d65762737f46d1ff17117181` | economy, world | unmapped |
| `server/src/modules/economy/WorldEventBus.ts` | `c444cf19108cbe993964623651936368d7152289e53e24e35151669ba0920e2f` | economy, world | unmapped |
| `server/src/modules/economy/auctionListing.ts` | `38c815e3cd1cba0f9e217bf4ddf9c8a86808ddb0e80c2c605151dee6e6f55b80` | economy | unmapped |
| `server/src/modules/events/WarForecast.ts` | `a2c5671da0d903a991561ff8d9e2edaee0dcd6cc47c40c1db0fc2c25b30002e6` | politics_war | unmapped |
| `server/src/modules/events/WorldEventLayer.ts` | `de6f1e7b8e00538042fc5ac56f10030206893c49e03074f8c878d318e034f7b0` | world | unmapped |
| `server/src/modules/faction/FactionMemory.ts` | `3cec082323230286147d2fc547ae006d3f81838906adcbfebf4099877aca16f3` | npc, politics_war | unmapped |
| `server/src/modules/faction/FactionSystem.ts` | `4cf431ca1e47eefbc961938f29368f1896e1bdd446aca3b63a7dfe504257b3dc` | politics_war | unmapped |
| `server/src/modules/faction/NPCFactionAdapter.ts` | `35050649a3e03ba9896136ccd98da7a3de37b95162eb93873eaec0d16f155a61` | npc, politics_war | unmapped |
| `server/src/modules/gameplay/FactionConstruction.ts` | `4eb9a81e83ac1db0abad63d49d925a24e072f4c5fd63a155d5a2abcbdb9120cc` | politics_war | unmapped |
| `server/src/modules/history/WorldHistory.ts` | `fe8e7f61a1d77897fc2673e4e44e7ca806101421c8c456092feb2b400f80d4d6` | language_lore, world | unmapped |
| `server/src/modules/history/WorldSnapshotSystem.ts` | `4c886f21e963bfbf5f86a5e5577d5a5e618079504b2b34f506bb0f059af9e354` | language_lore, world | unmapped |
| `server/src/modules/inventory/ItemRegistry.ts` | `8f9344d6db861c92864433876d02ecb3967ee2d48203244d0c25ccac7e3f052b` | loot_items | unmapped |
| `server/src/modules/items/AffixSystem.ts` | `3ccd1a68e7d19c6ff8471149e779151f324859e70a7c169d490958510a07682f` | loot_items | unmapped |
| `server/src/modules/items/EquipmentSystem.ts` | `8fb1009c3d9cdc5c0155f4aa8858de0a3aaaabfea8bf5f07a46d4eed583459ea` | loot_items | unmapped |
| `server/src/modules/items/ItemGenerator.ts` | `a79d8a68a35ff1307b58b3632bf5fcb48367aeb300892be0334f705704ee3b4c` | loot_items | unmapped |
| `server/src/modules/items/dualInventoryTypes.ts` | `37f1bd7d0f3f8b787278a606827046278948aa8e5e347cfb104acbdf8a1c1eb6` | loot_items | unmapped |
| `server/src/modules/items/itemBindingPolicy.ts` | `683c395140709fa81bdee193eebeef3fd0e2fc3f2a65c4d5a9767506356b9ee8` | loot_items | unmapped |
| `server/src/modules/items/legendaryPowers.ts` | `2eea5b8a00e8a323d2a0606e766223978a3ba10ed4363c83a8aac42a3e8250b6` | language_lore, loot_items | unmapped |
| `server/src/modules/items/setBonuses.ts` | `1371c1bad8d7f2d467fc71cb696a115cffda546cbaa7bec63d6d8216a13cd4f5` | loot_items | unmapped |
| `server/src/modules/loot/AffixSystem.ts` | `d7ea0874d02ab4d747a34637775d5009252aa58d57940e81a1d277fea3e3bb73` | loot_items | unmapped |
| `server/src/modules/loot/ItemGenerator.ts` | `f19d589f14c63ad94a147da5f80b6f0200e66456a2c8db3ff8b99f9e3d4f3efe` | loot_items | unmapped |
| `server/src/modules/loot/LootSystem.ts` | `737b93b7898e4353967fd89d9b9c317a499ac42e333698ddcb6c281a0b70213d` | loot_items | unmapped |
| `server/src/modules/loot/LootSystemAuthorityGuard.test.ts` | `1d1d43ba6befbdc6594c90b5233a9bb8f13170a77ef77e386a880863bef36be5` | loot_items | unmapped |
| `server/src/modules/loot/LootTables.ts` | `3e8112b73778c9cc2b1b8c930c26397e2bd97fe413a721820f007d3c718cd4e4` | loot_items | unmapped |
| `server/src/modules/loot/WeaponVisualPool.ts` | `1fa8b78dffe82c511e7ac334d1286240fdd354e371fc8bfef94d50b0d90eefdf` | loot_items, progression | unmapped |
| `server/src/modules/loot/diabloItemGen.ts` | `8b7217de1be2ce0bccf69739574572f5a92fa7819d36ce84efce7f75dd44fd95` | loot_items | unmapped |
| `server/src/modules/loot/diabloSampleData.ts` | `b2f734e8a8590692e45bce0e90c6172ca3332ae0574b8da4a52ead3176036092` | loot_items | unmapped |
| `server/src/modules/loot/diabloTreasure.ts` | `51c5ea011dcd3af27f9f09dd038add181bb29b39d0ed0777b2b12d2495030edd` | loot_items | unmapped |
| `server/src/modules/loot/gearConvert.ts` | `e4a4a5a7312e545aa748aba941c961b46e4a8bb57f1bec261ac609786603dc73` | loot_items | unmapped |
| `server/src/modules/loot/installARELootIntegration.ts` | `0553436b45853b085ca4791c61c41487950c2fa8ee4b0cfce4fd4d93280a907b` | loot_items, world | unmapped |
| `server/src/modules/loot/installDecompositionLootRelay.ts` | `00b43622c77e1d301981f0eb67c674567019ef4a96cdbf6d9e1477c9766361c2` | loot_items | unmapped |
| `server/src/modules/loot/installLootBridge.ts` | `b5cb7ae5ef5bf6f01f8630e691c25cb6da990ef121e90219d497def8803588ac` | loot_items | unmapped |
| `server/src/modules/loot/itemEnchant.ts` | `982188f0895c52185fd48edd6d9c0f2049442c5072e5bf3b0837baae29dd753c` | loot_items | unmapped |
| `server/src/modules/loot/itemIdentify.ts` | `8db1e944757da2dbd82e19e5bf4249e6acd75c049a2339e3528fef2bab3dfeea` | loot_items | unmapped |
| `server/src/modules/loot/lootBag.ts` | `30acd6a812ebe1eaa4b1d25c91177d19a1b49627b513f34675d3d2a823d8bea7` | loot_items | unmapped |
| `server/src/modules/loot/pity.ts` | `c0004d1a5e009f9e5635fa4bb86e234034a12744d97db4d372d5e3d8df41308a` | loot_items | unmapped |
| `server/src/modules/loot/rollScale.ts` | `16adef20a71e12155581bb98bd0e587f2dacac289d989c144a7c8777458c960a` | loot_items | unmapped |
| `server/src/modules/loot/smartLoot.ts` | `16af4596d2c77ce41a270956ecb9b8f293832ba4e81fd98d087ad7e16651c7a4` | loot_items | unmapped |
| `server/src/modules/loot/socketedItem.ts` | `31a874ba121f4ca81c202ebc6ecd6ab1be0d5f05297dac973769ef341baa3e00` | loot_items | unmapped |
| `server/src/modules/lore/worldFragments.ts` | `70e88aa9cc71951b41dbbb7fef5e37583e2226216a23be7a141c8671b1945b99` | language_lore, world | unmapped |
| `server/src/modules/market/NPCTradeAI.ts` | `57fef93536d93a927a55863aebb4dfece8e52c1f3441e866d51464efc9932269` | economy, npc | unmapped |
| `server/src/modules/npc/CaravanLogic.ts` | `0288c64225d5c0005fa44c937f310a7a1bda310cf2078a5246e969e1a8f2f98d` | npc | unmapped |
| `server/src/modules/npc/EmergentBrain.ts` | `b850e6399013e061bc084dc887adb85c192af4fb5890b30fe4179101ee571fbe` | npc | unmapped |
| `server/src/modules/npc/EmergentThermalAdapter.ts` | `e048ff41a70259fc582f8abe2bcd2ccdf4ef7ae2014d7ff6462ed09f1bafa68b` | npc | unmapped |
| `server/src/modules/npc/FactionLegacyEngine.ts` | `3cc6f14651f9e4e1a30f64c5832e41015567efab9cb8fc140266fe12c5144718` | npc, politics_war | unmapped |
| `server/src/modules/npc/FamilyHouseRegistry.test.ts` | `b518ffa725e413abde97d45a26c3f76ba29e9d22d37aca3c9caca2056afbb739` | npc | unmapped |
| `server/src/modules/npc/FamilyHouseRegistry.ts` | `f827100a4417d5dce4dbeeeb63a3bb27ddcda21b4083dba84e87b2f8a91af075` | npc | unmapped |
| `server/src/modules/npc/HeritageResolver.ts` | `8d396d8c9409809c40df318d1e7dbc6cd6877ba55529e0c3a7a4282eeefef037` | npc | unmapped |
| `server/src/modules/npc/HeuristicGoalPruner.ts` | `d21b6d09770191547dcd468a300a12e087f5450025987eedc2ffd9a53872f0f9` | npc | unmapped |
| `server/src/modules/npc/LineageBirthSnapshotBridge.test.ts` | `b874f8af5c17d960902425beafd0002c699bb822bb79e14db8d89d49de3cfc5c` | npc | unmapped |
| `server/src/modules/npc/LineageBirthSnapshotBridge.ts` | `917c2475339722860fee43c88feb58c420a13c741681ae3459e7e980ee847371` | npc | unmapped |
| `server/src/modules/npc/LineageBirthTickIntegration.test.ts` | `8fcca5c9ce3471055296da573d174815f050d02f6eeeeab21641d685aa796e68` | npc | unmapped |
| `server/src/modules/npc/LineageBirthTickIntegration.ts` | `3d445a1e02f84b481421500050048305b4bef77ca35e016570740d071f3c4b4c` | npc | unmapped |
| `server/src/modules/npc/LineageGameDataWriter.test.ts` | `b737de21b1295d39cb986a268cd7a8278c92e7b6d174f85cc69c854c45f0f969` | npc | unmapped |
| `server/src/modules/npc/LineageGameDataWriter.ts` | `6869a81a188ea1c0f3830d95224e1813b3b8dc76e3bc21cf767547b82d4e13b8` | npc | unmapped |
| `server/src/modules/npc/LineageHotfix.test.ts` | `ea7e578526a012bdf0bd9cbfd01d60a323932b47606b9bab29fc67ce5acd1ff2` | npc | unmapped |
| `server/src/modules/npc/LineagePoiRuntimeStateProvider.test.ts` | `8f86193c4ec6eb3be8af283d6b8e4d4b79675c91e68f7d4d35d143c9cea52a17` | npc | unmapped |
| `server/src/modules/npc/LineagePoiRuntimeStateProvider.ts` | `6c72b65f0b6a39e63cc3a1cd2de334eda3038ea371be282c23d1f2363ad6cb52` | npc | unmapped |
| `server/src/modules/npc/LineageRuntimeReplay.test.ts` | `721c529e21ceca47de3f4f6e0a92aff4746f122f74c74d4e03fdd73ae8a43dbf` | npc | unmapped |
| `server/src/modules/npc/LineageRuntimeSelection.ts` | `b41a451660e474a994ecbf6216488908bba6c7565909f6450b153dfa39b1ad7c` | npc | unmapped |
| `server/src/modules/npc/LineageRuntimeStateProviderRegistry.test.ts` | `0bc48585028414bea3d1abb4e41bab4e5596ce2e49b2527924ba92b057de670a` | npc | unmapped |
| `server/src/modules/npc/LineageRuntimeStateProviderRegistry.ts` | `4a2d7aeabb8d6c3d7da8759b5c15c64289fa8f4c74ff29dd506394ffcf6a2e2e` | npc | unmapped |
| `server/src/modules/npc/LineageRuntimeTickAdapter.ts` | `7efc89ab071575a326e2a26ebbf51374dae390f0e448168d410a9b8536b37543` | npc | unmapped |
| `server/src/modules/npc/LineageSelectionPure.test.ts` | `261d685d85fbc2c5e36b46c86978ec11183ebb79c009987fc9623265b514f127` | npc | unmapped |
| `server/src/modules/npc/LineageSelectionPure.ts` | `0a6c8de2ae8d390adf1a0e4553d41679f7fb685b928592a16d885a285e6885f4` | npc | unmapped |
| `server/src/modules/npc/LineageSurfaceModel.test.ts` | `700f0877b4d3747fd5566fbbddfdc735c715cf817e7aefa3328ddf0ca0a5ea31` | npc | unmapped |
| `server/src/modules/npc/LineageSurfaceModel.ts` | `0352d31328fa6d41ff9d083114d1e9c7a689d1369bb7ea0941b846740dc333b0` | npc | unmapped |
| `server/src/modules/npc/LineageTickRunner.ts` | `7ddfa3b5f593b5b1ac55bf8679fc37fc34b40a73a42a15bb243740cd4278671b` | npc | unmapped |
| `server/src/modules/npc/LineageWorldSurfaceAdapter.test.ts` | `97f5d71e713ec0abb9328436f970411b5e00ee0e60ccf236c7ab71557f3e78f2` | npc, world | unmapped |
| `server/src/modules/npc/LineageWorldSurfaceAdapter.ts` | `43a71d6cf7d083bb6750b0f1f3a7045049f99afbe7687acef2ebf31bd19a654e` | npc, world | unmapped |
| `server/src/modules/npc/NPCChatAgent.ts` | `26f86e16f9665d407f8b8c4542f1f327426450e455489d9a6c6afc8678f9971a` | npc | unmapped |
| `server/src/modules/npc/NPCChatBridge.ts` | `1b8776c9fd27776bb4fcf023d4d72c4413b6689a07e3716dd9b88e042d5505f9` | npc | unmapped |
| `server/src/modules/npc/NPCChatTypes.ts` | `aed134f36a5507be93d71246bcbc19162941181de930db6d829dd6426e2da17b` | npc | unmapped |
| `server/src/modules/npc/NPCCraftingAdapter.ts` | `0b47759f5ee41a572a55dcf0956bebd0fd732553f8be57c4bbf7b46eff4a9321` | economy, npc | unmapped |
| `server/src/modules/npc/NPCDialogueSystem.ts` | `f00def18181656b0dca0e9439677809921ff4138f6f9e591913eef7945db759e` | language_lore, npc, quest | unmapped |
| `server/src/modules/npc/NPCFactionMoodBroadcaster.ts` | `c4e508cf409bffd01cc12c6914fd9676128c7895b7a861791c7013c78e1fc088` | npc, politics_war | unmapped |
| `server/src/modules/npc/NPCGameDataRuntimeProof.test.ts` | `436b6c3fccc19d60255fc606ae8f5eb023c7ccb529ffd1ee0b39a754c4c83cf3` | npc | unmapped |
| `server/src/modules/npc/NPCGameDataStore.ts` | `ade0eb4c56fb865407507d9531cc28022f3b57701dd0f3683b880db91eb77044` | npc | unmapped |
| `server/src/modules/npc/NPCGenealogyEngine.ts` | `00483def22d680b10aee5669f9ed62207b7850ec27e8a78484a55eb05a79b5fc` | npc | unmapped |
| `server/src/modules/npc/NPCGoalPruningRuntime.ts` | `a173d5f3ab098ebd0c43101e1dcf3a11f369203526a9e3f2f2b8271ab43e08cf` | npc | unmapped |
| `server/src/modules/npc/NPCHeuristics.ts` | `b9d33275399ef579f3e217a46d25aca45b0df84ba8236a4b648bdc1233dcd303` | npc | unmapped |
| `server/src/modules/npc/NPCInterfaces.ts` | `5ee240fe7fa95ed3db9e431a48292e5f72c89d33df077acfd6deb3c2ff66300a` | npc | unmapped |
| `server/src/modules/npc/NPCInventoryManager.ts` | `7283bea7ce89f20c737c4ff5e3a7b68e38c8cc094b8392d92463b5c39ac10436` | loot_items, npc | unmapped |
| `server/src/modules/npc/NPCMemoryBridge.ts` | `1e7fea45f546ed03eec2db89fbc33f14d2659d79df9cbf446dde773aa89ad114` | npc | unmapped |
| `server/src/modules/npc/NPCMemoryCache.ts` | `802ed9284eee7c0ebef82cbb56678b2421a1a9ed0c4690e0f02823f16aa9bc48` | npc | unmapped |
| `server/src/modules/npc/NPCMemoryEngine.ts` | `819792ddb222c6b413f319f403d7778452fc0d12af1559c8fa9fa822b6ab325b` | npc | unmapped |
| `server/src/modules/npc/NPCMemoryPersistence.ts` | `82e76c7ad9fab46c49de29c9903194f30cb3785b37f12e8903b2fd781b851769` | npc | unmapped |
| `server/src/modules/npc/NPCMemoryTicker.ts` | `4eb0158f263fa936d9d935dee42f2e8631007feb34b8f2648e21c39b6a51ca81` | npc | unmapped |
| `server/src/modules/npc/NPCPersonalityEngine.ts` | `72f53eebfb258308eab3718ccce72231ebec119d0748d29d1c1be15926cd898f` | npc | unmapped |
| `server/src/modules/npc/NPCProfessions.ts` | `cdc65b034fa171d4e7456627c459b748d897287cdca39789f98eec26224a42e1` | npc | unmapped |
| `server/src/modules/npc/NPCRelationshipSystem.ts` | `955a4cad39c6e44235444ea2a63caee305b45cb9b9ab36904ad318d15d6c57ff` | npc | unmapped |
| `server/src/modules/npc/NPCScheduleRegistry.ts` | `78ff51e57d307d6805f1f77a6a5a1a8bdaf38e5521f64f9a11c75bffc36dee7a` | npc | unmapped |
| `server/src/modules/npc/NPCSpawnTable.ts` | `4c04fc16923b457a30cf65577f6fa4e130360b59f7a9b91fcf96771910e74d38` | npc | unmapped |
| `server/src/modules/npc/NPCSystem.ts` | `b08c5e60151807a3780d220a95af871f8168a2d9bc498137491048bafc6b317c` | npc | unmapped |
| `server/src/modules/npc/NPCThinkingLogService.ts` | `c5e3020c03f74dfab25a1759a9cb862f9d08260689ec58f07cf6ed621736c895` | npc | unmapped |
| `server/src/modules/npc/NPCTraits.ts` | `979839f5d4e858d26cfaa043ea60da3ea5f217226c2a3a499c9212b7bbe892ee` | npc | unmapped |
| `server/src/modules/npc/NpcLineageWorldSurfaceRuntime.test.ts` | `f80318746f7c3409afc91cbdff678fa65f2c543ef87dadacd68ad1f1b94d9ab0` | npc, world | unmapped |
| `server/src/modules/npc/NpcLineageWorldSurfaceRuntime.ts` | `e11cd68d918e57317ed3a535a9fd13249aabcc88d294ac87ace7b21786c6ea94` | npc, world | unmapped |
| `server/src/modules/npc/PerceptionLogic.ts` | `da2879ae4db76b81378eefe6bd10503dd4a6b60f7e936668c2d64b433b7d9e45` | npc | unmapped |
| `server/src/modules/npc/SharedMemoryNetwork.ts` | `d012959b3162cd820cf1ea78ec1007d4bb3f1dd420312e2fcc15585ea070af91` | npc, world | unmapped |
| `server/src/modules/npc/ThermalLogic.ts` | `2e02b9b3c4b1a438a0ba456da62c1da9379e9483cfd7c49c8141c66df9c12a20` | npc | unmapped |
| `server/src/modules/npc/TradeAIBehavior.ts` | `05b6e8155d9b4bb354c1ad949afa1df07e10b10399acde5084a4d04ea6b57e1f` | economy, npc | unmapped |
| `server/src/modules/npc/TraitResonanceEngine.ts` | `d52d7dafd0a878510bdfaa6eb035cada3112281fe6ddd3c1397a54c33c12fb7f` | npc | unmapped |
| `server/src/modules/npc/behavior/GoalEvaluator.ts` | `b9644f3100c17f03dcf4e122732c7e138f9ed1d2a2dc597235cbd70e61f0a34a` | npc | unmapped |
| `server/src/modules/npc/brain/NPCBrainDebugSnapshot.ts` | `83b0a851de931efdc39641d72c588c205e6af2253032f225600a28cbb7d16270` | npc | unmapped |
| `server/src/modules/npc/brain/NPCBrainRunner.ts` | `d5b28c16fae9e75b37f6a2466407a1e55585d4493e86ecc511901b9cb751cf08` | npc | unmapped |
| `server/src/modules/npc/brain/NPCBrainScheduler.ts` | `c2acee28ce1c0f5ff5747982de3a4f697f9e0b2869ec4c1a9bb8320ebdc1b0ba` | npc | unmapped |
| `server/src/modules/npc/brain/NPCDecisionEngine.ts` | `9463b8ad98e68c8cfcaa340a223bc707ce733dcecc8fb5fca2281ed9ce4df7aa` | npc | unmapped |
| `server/src/modules/npc/brain/NPCMemoryCompression.ts` | `522d49f304c0d98fe5edf948601f061294f137e1278fcaea567d15af9ba82a97` | npc | unmapped |
| `server/src/modules/npc/brain/NPCMemoryExchange.ts` | `a26fd88c35a762122286e3c035b0d517a5ebed0e980b7616ba078b927eb5a016` | npc | unmapped |
| `server/src/modules/npc/brain/NPCMemoryScoring.ts` | `acb24271b9f5417167d80027076dabcfaf2e8c29971a3f5b1eac1d97c338cb0b` | npc | unmapped |
| `server/src/modules/npc/brain/NPCMemoryV3.ts` | `ac0d5c02ec76d7b3531e2bb725db7ce70dcaebb3b75ccfb14bf267e3e3ccb245` | npc | unmapped |
| `server/src/modules/npc/brain/NPCObservationBus.ts` | `29589434899e9aa666d736a2adb8bf5001940628bdd100530447e5d192d8373a` | npc | unmapped |
| `server/src/modules/npc/brain/index.ts` | `0c8c5712d5ede8d320492e848fd65b3cfdbcdf60c80d670cac4718bce9a57007` | npc | unmapped |
| `server/src/modules/npc/createNpcLineageRuntime.ts` | `a33b6e5d534bce116ec88ea3fafcce31b44e2cc045ad1e43b7db30e1fe7cf62b` | npc | unmapped |
| `server/src/modules/oracle/WarForecast.ts` | `4facebe32819b03e0f1810494b25b667b9cc9cf6dd6a753d8b5b072fa1f96de5` | politics_war | unmapped |
| `server/src/modules/ouroboros/NPCRelationshipSystem.ts` | `8c3f9f0d5f8ff6929d9a4f5b2ff18b553d4c899b422828e0f2615753417bac2b` | npc | unmapped |
| `server/src/modules/ouroboros/WorldEventBus.ts` | `418bd8a5f98e17ee88e2460f15941cdef90c479a5cb78c86cd2adc66e4b01959` | world | unmapped |
| `server/src/modules/ouroboros/WorldHistory.ts` | `65da4a54aed1cab04f91e039cc24c4166894aa7a76f0b41aab9d2c7a2fe131bb` | language_lore, world | unmapped |
| `server/src/modules/ouroboros/WorldHistoryProcessor.ts` | `16e464fe5dd15d6d4478f03ef7f1b43f90bb1116a49e0c6d6825fa5b9ac028a2` | language_lore, world | unmapped |
| `server/src/modules/persistence/WorldDatabase.ts` | `2342620abf90897821b3b80aebe586395a5676be98b1658af5fdcf1738fdac40` | world | unmapped |
| `server/src/modules/politics/DiplomacyEngine.ts` | `e509087fcd1af9e9e152375b05a9428376e71bfa975c7d248f0d58432d712b9a` | politics_war | unmapped |
| `server/src/modules/politics/DiplomacyTypes.ts` | `dbbedd81ed97c0e8894cb7fcc99417ba9689e1d7005b49ccab9bc5abb1e73c7a` | politics_war | unmapped |
| `server/src/modules/politics/GovernmentTypes.ts` | `dacae8c5afa3b14898225ec574d89a9adb058a544c8380ae4d5df38012a78283` | politics_war | unmapped |
| `server/src/modules/politics/PoliticsDataRegistry.ts` | `630ae29418b897acacde39857970c4db66900993f3e6eb717150d05e0670e982` | politics_war, world | unmapped |
| `server/src/modules/politics/ReputationSystem.ts` | `f828d479866917a3019beda459073bc02e2d46f6334cc4b956521ea0ae713a1e` | politics_war | unmapped |
| `server/src/modules/politics/WarEngine.ts` | `06e1f5205569410f137dff95010eab900dcbab8a7491839dc73883507dff638c` | politics_war, world | unmapped |
| `server/src/modules/prophecy/WarForecast.ts` | `bb36be3e48233ab273205aab5fe6814611162c60ffb6862787f73db98b00ffa3` | politics_war | unmapped |
| `server/src/modules/quest/HeuristicGoalPruner.ts` | `a060e81fe5a5f5c3830ede8ff3766b306c21bac7e140d839011df505ff00c8b1` | quest | unmapped |
| `server/src/modules/quest/QuestEchoSystem.ts` | `c017ecbdbd976f3a37fa054cab6d9bb76c2e1cd3deb6f9163894b2249baa6b46` | quest | unmapped |
| `server/src/modules/quest/QuestEngine.ts` | `f0cb9e81fbc043df51e8a42ea2ba1ac21d5c255a902df8856ff713b13614426b` | quest | unmapped |
| `server/src/modules/quest/QuestRewards.ts` | `4b355404ff825e72882399af40ed2e0dfa5421ff850f8b5a36c979d5ceac468f` | politics_war, quest | unmapped |
| `server/src/modules/quest/QuestService.ts` | `1ab014580075c30f8e9ccb8f85bd94d6758147ae212aecafc392521010006568` | quest | unmapped |
| `server/src/modules/quest/QuestStateStore.ts` | `837822a2709d8bb29bd53869a42e4a2488f19744f3c63b76fa01a6f4628f6c21` | quest | unmapped |
| `server/src/modules/quest/QuestSystem.ts` | `404856c6ebba60334aa00f53a9f05336346e71abc15cb7363d8d1b18cf004e83` | quest | unmapped |
| `server/src/modules/questline/crossroadsResolver.ts` | `4fd21b2d23d7ddaf157c8af616d93834bd797552d9b79c74d9f5e42db0f9ffe5` | quest | unmapped |
| `server/src/modules/questline/factionRegistry.ts` | `58591f7aed34232adbfdc4d4b0cbc14bf4af5e06028f7b29a26a4e04e8d8da8f` | politics_war, quest | unmapped |
| `server/src/modules/questline/featureTrigger.ts` | `8efa6d0c075f86292b7f377e300236b722a2d5f46d92c2a4326a9b324b77dd15` | quest | unmapped |
| `server/src/modules/questline/questlineBridge.ts` | `abb954ec28393270e50e605cf0830f33e35cffb70c130e74ec570e0907dbbcae` | quest | unmapped |
| `server/src/modules/questline/questlineEngine.ts` | `59db89ec283d10422f9a13d982c61e95729af31368dab645e2c02650a1009035` | quest | unmapped |
| `server/src/modules/questline/questlineGenerator.ts` | `3e34009b91f0ef57466307097a2efba8cd151c2233363cfa14dbdbc9aa3eeec0` | quest | unmapped |
| `server/src/modules/questline/questlineRepository.ts` | `8e5ccfd3cfa06e9692d5fd1d0483d4ded35ae01755b145e0b47938a999ca408c` | quest | unmapped |
| `server/src/modules/questline/strandResolver.ts` | `52f298a2162f02d1af012c561a55e7a031e1f2af8b2894b89bb3ed2b9cd07e21` | quest | unmapped |
| `server/src/modules/questline/worldSpawner.ts` | `f3d9ac46778a1aea133c4f775da06dfcdd6291c88ee612ee4d9f7229aed82acf` | quest, world | unmapped |
| `server/src/modules/quests/QuestRewards.ts` | `52740ebd1162f8b6ea76b3743c8aa815fb99c880198cf6376fe83839547cf90d` | politics_war, quest | unmapped |
| `server/src/modules/quests/QuestStateStore.ts` | `93b7550ca9b012eaa3138eaca5f902ab859be1c8cdbd28307ccf1e530a9a3c92` | quest | unmapped |
| `server/src/modules/relationships/NPCRelationshipSystem.ts` | `50f1adeb5741ef8c20d2c263fe76e4269cb9dc26673fcc1b55a75e33ff2bf902` | npc | unmapped |
| `server/src/modules/skill/SkillSystem.ts` | `f1246ce5e9ef7ab4a5ae7a70baf3421efdf0ea62aaf5360aff3820b6593b77b4` | progression | unmapped |
| `server/src/modules/skill/impactBusterConfig.ts` | `3d6e25a3772df1ded7bb74f7d130a97e264abcc334e9c58aa67eb27e9cf62884` | progression | unmapped |
| `server/src/modules/skill/skillDefinitions.ts` | `5139de49b0d445954accc5784ab11f1014953308f8357b6b42e1b3dc54b885d2` | progression | unmapped |
| `server/src/modules/swarm/services/WorldEventBus.ts` | `c444cf19108cbe993964623651936368d7152289e53e24e35151669ba0920e2f` | politics_war, world | unmapped |
| `server/src/modules/warfront/WarfrontCombatOrchestrator.ts` | `1e359dc536d9b9b4765718526598526322dc14dab8354b669a69b1965bede91d` | combat, politics_war | unmapped |
| `server/src/modules/warfront/WarfrontCombatTelemetry.ts` | `af9e95ec4cbb9b5673678d78179f1610aeba9a291181634fcf7837ce560ec81e` | combat, politics_war | unmapped |
| `server/src/modules/warfront/WarfrontSystem.ts` | `ce8ae07b93e1fb847eeb4ca49e36882dc759b81b71eb25e80d03f35b7bcfef72` | politics_war | unmapped |
| `server/src/modules/warfront/playerWarfrontProgress.ts` | `1333419ad317346b73c99d3958e9a522490cc65d89e13f93a8e49b64f8e79c34` | politics_war, progression | unmapped |
| `server/src/modules/warfront/warfrontRng.ts` | `c94f4361e32a11bb8021a95888d7f7d5caf5f180baaf5d2a3dd0d7e5cdad9439` | politics_war | unmapped |
| `server/src/modules/warfront/warfrontTypes.ts` | `9af8d60b1c6704867f708ca9649ef699058175ec2a4deacd2b1da72c55e6118c` | politics_war | unmapped |
| `server/src/modules/world/AREModeAuditTrail.ts` | `9d6a7e80687fc6f507d223248f1f42bd37308be3758f3d6657579a91150d7e13` | world | unmapped |
| `server/src/modules/world/AREStateCompiler.ts` | `b9d4d4914afb87aa4d14bc0134ce4f0d904bb75fc874a6469499cde0528a06ea` | world | unmapped |
| `server/src/modules/world/AssetPoolResolver.ts` | `a691c864b1860c993f9168fbe91ab7b210963ed2eb5a6e79841c7e15ca0c9d1e` | loot_items, world | unmapped |
| `server/src/modules/world/BiomeGenerator.ts` | `43a90381797969ed8f71922e7eb03d544c8daa369b346026bf17e8f7d59dd7e9` | world | unmapped |
| `server/src/modules/world/ChunkActivation.ts` | `c7c2734d9623fd01e2425b0c147a08f271036c84c44d9a2d294f3948734c335e` | world | unmapped |
| `server/src/modules/world/ChunkModificationDirector.ts` | `c2e401c563b00093ed017149b2400feb200096a0fc75ac803fe36f7a954d66ff` | world | unmapped |
| `server/src/modules/world/ChunkSystem.ts` | `6692f60256fc584d3859d3c079e16bf18b7de99d465c81582d175a11310e3a67` | world | unmapped |
| `server/src/modules/world/HazardResonance.ts` | `4c8e99b2c5d71bf291b5145edf19c9c21fcbb78027b511ade520d7800df5177b` | world | unmapped |
| `server/src/modules/world/LootDirector.ts` | `89dc9e9f30807a8521a47de379a3ac4a6b1e6016082c42b84728cfcb1527baef` | loot_items, world | unmapped |
| `server/src/modules/world/NavMeshNodes.ts` | `d785363953f3ef10b4336ae766fd9afa46c2b62cb48e363fe8d75c85edfc026b` | world | unmapped |
| `server/src/modules/world/Pathfinding.ts` | `76e1083a5856d03896dce85b01d00d3cacfcf947cba83e89984e7e59d77ef773` | world | unmapped |
| `server/src/modules/world/ProfileResolver.ts` | `90e716b52cf4c055e3ec1457108af2591ede6bc94949358c9970923a8de8a878` | world | unmapped |
| `server/src/modules/world/ResourcePopulator.ts` | `ab95e11ea42b7dc142232439b0f889624647f56d2e6c13ca45841ec9b138d0d4` | economy, world | unmapped |
| `server/src/modules/world/ResourceScatter.ts` | `6e153fdea820e4b219a5072afd176e79c6ae1f0de81f0e072b07d5a563a624e3` | economy, world | unmapped |
| `server/src/modules/world/ResourceSystem.ts` | `efbc8f5502dae087bc670faa93b5d7a154ea752545ec33d7c8d64ba68270cd6b` | economy, world | unmapped |
| `server/src/modules/world/RuntimeSettingsStore.ts` | `b0eac6be2e25cbf087b13e4e32fab29cbb821f3a0ec981d7cb8ef957a77f75bf` | loot_items, world | unmapped |
| `server/src/modules/world/SeasonSystem.ts` | `87f06bba7e7cfb383b4119d34accaf887e481cd76cae1b212f045343888dff3b` | world | unmapped |
| `server/src/modules/world/SeasonalEventBridge.ts` | `29afb6df83cc0151cd3b066b0723aec22bf14659f1b7abac24ff0fab9502dcb3` | world | unmapped |
| `server/src/modules/world/ShadowRegisterPortal.ts` | `cede76843881f2646227d7f61f6cfb32bd206cc4f7de82466baa88271cb65c98` | world | unmapped |
| `server/src/modules/world/TerrainGenerator.ts` | `d621359a1f40266c312ac5bd4af8f95cbdc89ddd868c84fa141c6854e5680aad` | world | unmapped |
| `server/src/modules/world/TravelHazards.ts` | `46dbe300d2d4c9bd49f4f739599ba0a8e5d89dfcd37be49a9664e91cb4d7b128` | world | unmapped |
| `server/src/modules/world/WeatherResonance.ts` | `a8d2297c9bb54342fbdf2d1ad25bba9c7f4e98ae218262e24ad8beafc8102b59` | world | unmapped |
| `server/src/modules/world/WeatherSystem.ts` | `317a551240135eec99df8f2974a619591172b58e166ab2e593dcc4c9ac49eb5e` | world | unmapped |
| `server/src/modules/world/WorldEmergenceEvent.ts` | `71c4a4b4bc77c87fa8d57cec9d97bcf6fd1eb76669f7f86cb07ebce059b20d8f` | world | unmapped |
| `server/src/modules/world/WorldEventBus.ts` | `cd5ad9ee2bbe96863bc0540a95ceecbdf7081eeda6d598d8514e491efcdee75b` | world | unmapped |
| `server/src/modules/world/WorldObjectSystem.ts` | `2b6f0f6467fb67a47d58d4c0c00f835ddb768a91e77eee78ced83a42616e86fd` | world | unmapped |
| `server/src/modules/world/WorldResonanceAdapter.ts` | `7a0f136058ecbfcdd42d517562b23920dcb992a248ae5ba689e6dcbb61fb8b0d` | world | unmapped |
| `server/src/modules/world/WorldSeed.ts` | `d27e4f8d7035e11e22ea9a7bd668605d8688a51a2381f75e6895b7de14d01256` | world | unmapped |
| `server/src/modules/world/WorldState.ts` | `0917feecd0416c2807f7ccc709698be242127b296fe0767a5820814084cee2eb` | world | unmapped |
| `server/src/modules/world/WorldStateStore.ts` | `bc1338da9e00fcc8fdd50bce7c9edd8654421b455e8409639494c3793846a335` | world | unmapped |
| `server/src/modules/world/WorldSystem.ts` | `2a2c5516e0b114225f208f2ece4584ad7f3f964ad72646d1e08596d35ca390f3` | world | unmapped |
| `server/src/modules/world/WorldWonderRegistry.ts` | `be121880a7c0f4c085077ca90924f19749f950250fe5dc55b5bed67e058138c5` | world | unmapped |
| `server/src/modules/world-editor/AdminAuditLog.ts` | `78886abfda58f711685e60b42f8d947ee6daa3a3bb263af67c12c6e4cb3d68db` | world | unmapped |
| `server/src/modules/world-editor/ObjectPlacement.ts` | `3d0f9c4a243ecd09cbc0ca9cfa226d464b5ce167a699a4b402a5ca72b61e2d99` | world | unmapped |
| `server/src/modules/world-editor/TerrainBrush.ts` | `36cb23800a8f865827d1ec886ed4f897552fbce0c0d790bb754fe235b1aa64c5` | world | unmapped |
| `server/src/modules/world-editor/WorldEditorServer.ts` | `5d86429da48451ee3164d9f0b6a7304d579cc45afbd7552db67eb516eac59b7f` | world | unmapped |
| `server/src/npc/CampNpcRoutes.ts` | `5fc517e37af6171d1f74f208612f411e4f13d26859fce786bbf9698bc9c24a7a` | npc | unmapped |
| `server/src/npc/CampNpcService.ts` | `5474f8ef5e8a9b88cd90192ddb05fad7fb922995146963fca8115de86201731d` | npc | unmapped |
| `server/src/npc/CampNpcTypes.ts` | `c8c3765d166a7ce81a764525a99f791f7ec78b40c4a34782b3eef2a4fe69570a` | npc | unmapped |
| `server/src/npc/CampStockPersistence.ts` | `1ba5f88638fe09ab7a652b6f3ab7e45c270c377a52494c79e15331b85abc45a8` | npc | unmapped |
| `server/src/npc/CampStockRuntime.ts` | `5df765a258f500bda82270062ecab090e2fbccbff0ea48ee52f1158b6bd7430b` | npc | unmapped |
| `server/src/npc/CaravanLogic.ts` | `44fbd7109a7b003151c18a30251d7d4c50efd5597412abc9a6c3986c4a5ce04e` | npc | unmapped |
| `server/src/npc/HeuristicGoalPruner.ts` | `a0bf6c35b902762727a55d053bee67573d534eee5cdef018cb91e00c672b3f27` | npc | unmapped |
| `server/src/npc/JsonCampStockPersistenceAdapter.ts` | `419cfae99a8a830aac01499069fae3400c69d829192fcf62680e7f3618ac3124` | npc | unmapped |
| `server/src/npc/NPC.ts` | `56c7a57a864ec1785a3d91807524c2a160abbaa931887225a92830ff24184308` | npc | unmapped |
| `server/src/npc/NPCInterfaces.ts` | `6174291b3d31e05cf1c402302f1bafe60da45edd0fe9f25b2e7228f304652ecc` | npc | unmapped |
| `server/src/npc/NPCManager.ts` | `05625f24cbf060178ab70cf4b5d984501b28c3c1a73bd245dafecf3712a744f7` | npc | unmapped |
| `server/src/npc/NPCMemoryCache.ts` | `21ec01510e38d00cce17b59a4d85808955a9a7f41ba4a2cb2d8b038e64b0acbd` | npc | unmapped |
| `server/src/npc/NPCTraits.ts` | `4b9291c83c1c9bcfb580ffa23697a5e11de9945d67f66573ca0f9670834f54a4` | npc | unmapped |
| `server/src/npc/NpcMemoryRoute.ts` | `efe170615889c000079d0b67ea37053987f94e929544fdd4abfd7a02653ba43c` | npc | unmapped |
| `server/src/npc/NpcMemoryService.ts` | `f9d741e42d0d6cc2369b55c508373c12bd4a734a63f03e99ee3c6947a7fef292` | npc | unmapped |
| `server/src/npc/NpcMemoryStore.ts` | `1c4b73ba5666863b159a2df354da56a20fa77a9aaf8306c9b8c5dad6303a6982` | npc | unmapped |
| `server/src/npc/NpcRumorService.ts` | `4899d4020c639b4f7e864041cc550b789fa4dbeda4cf26a2a18fdae60261f6fe` | npc | unmapped |
| `server/src/npc/NpcRumorTypes.ts` | `046642eb79f84c8708b6288f455673158a40d654ff949414dec2944d8c01a8bf` | npc | unmapped |
| `server/src/npc/VendorRoutes.ts` | `e0764af40c8abe050970248d05ccb023f5985ce796a250f59535e55fe4566d25` | npc | unmapped |
| `server/src/quest/QuestSystem.ts` | `f4b17f5cf8f5c46907f92d06867c57d24eb973f509e410c0f4c73e35c1161fba` | quest | unmapped |
| `server/src/quests/CampQuestDirector.ts` | `6c21d42535172dd96d8e3c4609d19b43a0e49992be06599c1266e157edd7042e` | quest | unmapped |
| `server/src/quests/CampQuestService.ts` | `a70e942f2bda88e32a8d223c9bf39d453ae01fbdedcfbb73989fd715c122a02c` | quest | unmapped |
| `server/src/quests/EconomyWorkOrderService.ts` | `ab97e21a9f29872f4e8c898ca70d4039cadd918fe6c631d1819cff512ee2afcd` | economy, quest | unmapped |
| `server/src/quests/JsonNpcQuestPersistenceAdapter.ts` | `310d8cad82a86a2a00db75025eef17230583d0b49c7b38e54d93a5fbad013ed6` | npc, quest | unmapped |
| `server/src/quests/JsonQuestPersistenceAdapter.ts` | `bb3aef91e209c0e4b5c091c8babca1c8d2e007bd8fc6dbb8ca6e91ed6d77b9cc` | quest | unmapped |
| `server/src/quests/NpcQuestPersistence.ts` | `027e26de063bfa3435c01bfcec178efc145667cdfdb7d94c47f30a8643127100` | npc, quest | unmapped |
| `server/src/quests/NpcQuestRuntime.ts` | `e7964ff622054631118dca3244d063a8b16fad5e75c260b0660cbfa241f7f3b2` | npc, quest | unmapped |
| `server/src/quests/NpcQuestService.ts` | `8cada3615a8c5243c82b0d40cfddac86fe42ecd7640c9f9406d92c55620d06c3` | npc, quest | unmapped |
| `server/src/quests/NpcQuestTypes.ts` | `d92532956f8c10949220fe936684bbe9138247b1b4c283b99e158f7c0b512116` | npc, quest | unmapped |
| `server/src/quests/PgQuestPersistenceAdapter.ts` | `7773288925bce927568ce928c32a107da53c5f4fafc97cef1b914fd3203cf820` | quest | unmapped |
| `server/src/quests/QuestGameplayEventBridge.ts` | `d1ee57332b67513d33142a36610311073be6e97107b5cbbdf66f715b2e217fdb` | quest | unmapped |
| `server/src/quests/QuestPersistence.ts` | `d19b61046500067d1ccf2a637857b1f6c0244c72dc2f1d46968db8cb41418450` | quest | unmapped |
| `server/src/quests/QuestProgressionStore.ts` | `d91299391285c04199484ea68970e148e0860ef7b7699adf36efd16ad4b30140` | progression, quest | unmapped |
| `server/src/quests/QuestSnapshotTypes.ts` | `82ac7f9f0a601549464f9d544b94cad631c530181d91f6eef1d07760a0635c52` | quest | unmapped |
| `server/src/quests/campQuestRuntime.ts` | `81664d659e1fc67dd6761e5b74e9f6b1ee268dcec6f886ddd535bbfd34b54769` | quest | unmapped |
| `server/src/quests/createQuestPersistenceAdapter.ts` | `df15c6b5e6cd9e634408e99b7208abf0051afd14573f26a2ce59ba3455225d8a` | quest | unmapped |
| `server/src/quests/npcQuestRoute.ts` | `172cdf3bb0177e4f48f40f02ff8ae62f8f3c2303fc8e8e579ab5fa54e07c6e1a` | npc, quest | unmapped |
| `server/src/routes/WorldEventBus.ts` | `e5369a4f4acacca95df6bd36a9574d4c02b26152f7cbd95330cbf091e83f9e22` | world | unmapped |
| `server/src/routes/lootRoutes.ts` | `4d4a7ca534383e663ab969dceb4f01b4a1ae4d987b4525c59f70b885669a16d7` | loot_items | unmapped |
| `server/src/routes/questEventRoute.ts` | `735528a92ee3521c442b8ddf5727c8c7c6359837e56c4b87dcd753826419ee71` | quest | unmapped |
| `server/src/routes/skillEventRoute.ts` | `6dbb7eb96f7faddd33636ab61d3bb6c57be62b5cdab0c787c50cd6305133cfb9` | progression | unmapped |
| `server/src/skills/JsonSkillPersistenceAdapter.ts` | `a1578a4112c3db525e2ebefa1883a62e40bc46f1c9701f08cb0f30d24175d04f` | progression | unmapped |
| `server/src/skills/PgSkillPersistenceAdapter.ts` | `639044ba4bbb9a164c7dc5301678d70e21b7ce20200d7fad4944e3e20eba88b7` | progression | unmapped |
| `server/src/skills/SkillGameplayEventBridge.ts` | `0d9b27bd4e334e1857a3c4ba3efea6e32acffcf7d2b0464c22f4c683b560baff` | progression | unmapped |
| `server/src/skills/SkillPersistence.ts` | `4a8e3be3eee213526c438629167ec08c3d7e5fecb5bc827db64a135e1766d8ef` | progression | unmapped |
| `server/src/skills/SkillProgressionService.ts` | `0b83d6dfc2b7b8a9d11c8521ad17066ff938d6127d5d46c24ed550e2473905e5` | progression | unmapped |
| `server/src/skills/SkillProgressionStore.ts` | `971dff56a323f91842c02f8c33613d45eb3a95a3ced811ae55de0501c30aa053` | progression | unmapped |
| `server/src/skills/SkillTypes.ts` | `b60ee413355f833a59d58a4c84b986f8d537e3952fc9ea0f4b5f4e25588bad9d` | progression | unmapped |
| `server/src/skills/createSkillPersistenceAdapter.ts` | `0b5fdd11b738dc1b698e9dda43a3ec63cad4e2f06f3247f1480616370f69c55d` | progression | unmapped |
| `server/src/skills/skillRuntime.ts` | `b8ef80da684479a84093d67d526aacbe383d8fe76ec7e63ff4722f366a5384b6` | progression | unmapped |
| `server/src/types/npc.types.ts` | `4f43c2810b2d889bbb405dbdaf04481b540f8688556ef0c5ea9602e9aaabff84` | npc | unmapped |
| `server/src/world/Chunk.ts` | `8b0ae16700fca9d92a8df7c4e707778be9a058e11c7b71b62d8ac1766df1f31e` | world | unmapped |
| `server/src/world/JsonWorldDiscoveryPersistenceAdapter.ts` | `5d5e37d342adbf0518d3e8f2cd5fd58d09f102b6926494dc74f7ed55bf3e7786` | world | unmapped |
| `server/src/world/ObservationBounds.ts` | `11f25eb83298287a08e02c908d37f4ed6636b24872d7648279fab1564312e941` | world | unmapped |
| `server/src/world/RegionLodState.ts` | `76d211e7abb94914f25a292ed52663d5b992db48511c49f5b77d34875fccf5d4` | world | unmapped |
| `server/src/world/RegionPressurePlanner.ts` | `24793c4c0dd729f8e8f265962e29262e70614f07b62c0d81cf3ffbf33b76e6e9` | world | unmapped |
| `server/src/world/RegionPressureTypes.ts` | `5cf29232d888de223c7be45c22e035209b2bcd5189da46947829ab2881b1a5ce` | world | unmapped |
| `server/src/world/WorldDiscoveryService.ts` | `a429b43a0163d4a91ffcffa47517b8ba4dca106bb323401c911a5f56aea70314` | world | unmapped |
| `server/src/world/WorldDiscoveryStore.ts` | `e5c85c157d4e02ff57570c5c5209730e0cbdfcf761154c2b997d07bbad9645a7` | world | unmapped |
| `server/src/world/WorldDiscoveryTypes.ts` | `e46a93ae2c84fbebd1359795be3c30151429d1afe1a6aa093aa515ac540f8002` | world | unmapped |
| `server/src/world/WorldPoiGenerator.ts` | `c9f18b7d5009603ae2ecb3dceb9e63a38737412a244130a112134cff98a28474` | world | unmapped |
| `server/src/world/WorldPoiTypes.ts` | `5b2d559c003779e6cff68d3cdb879abf9a3072e1bbf0450e5e43e7a25f3ac2da` | world | unmapped |
| `server/src/world/adapters/ExistingDynamicTerrainAdapter.ts` | `8be195ad70ffbd686d10b7502b5f5d1d87805782936a5e36cd08ebce08d77432` | world | unmapped |
| `server/src/world/adapters/ExistingTreeGeneratorAdapter.ts` | `5d2c52e388cd2689d3174142bb77641dcd75c109db1b5a4da3b86a112db4e11c` | world | unmapped |
| `server/src/world/debug/PlacementDebugStore.ts` | `77057f2db11f636a48930ef5269df893536653b23563611fc97222c9b1d76e25` | world | unmapped |
| `server/src/world/events/worldPlacementEvents.ts` | `19bd04c145ea00c8d9510e60912f9bca6f13a078f06009f58549058dc933432d` | world | unmapped |
| `server/src/world/layout/GLBPlacementValidator.ts` | `5cc51d0e8ef11fa092d3a482595b3545f0bc0e41852575d9b2cdb33e27cc1f6a` | world | unmapped |
| `server/src/world/layout/TreePlacementValidator.ts` | `4cb565016393450fb1502ba59b50ae009996757701db3619b12c9c34025b02b3` | world | unmapped |
| `server/src/world/layout/WorldLayoutBuildingPlacementValidator.ts` | `61700abbfa0553e72058dd508d48f87400f045aa128ec898005ce35c6f585816` | world | unmapped |
| `server/src/world/layout/WorldLayoutConstraintRegistry.ts` | `c2625577d1dcf7987a177cda10220e48c57c087d03465275bbe603a34be8d133` | world | unmapped |
| `server/src/world/layout/WorldLayoutDoorValidator.ts` | `b2d6b86eb6e9f1a047b642918b3dd3a551080985e7e0dbc401b5362230a19cec` | world | unmapped |
| `server/src/world/layout/WorldLayoutDungeonDistanceValidator.ts` | `e2ede4482d62ebf66fb1cdb7e8dd290cb8e327a65db7546ad6ba7fcfd3d61698` | combat, world | unmapped |
| `server/src/world/layout/WorldLayoutFootprintResolver.ts` | `f975f138d8037a26c0ff2e62829cc593ea160d9b032744fc0175b60a63d20d7e` | world | unmapped |
| `server/src/world/layout/WorldLayoutHealIntegration.ts` | `5ec881b3f779b4ad96d62a4b97bcb03efc69d0ab49bd60608e3642a0cb4c639d` | world | unmapped |
| `server/src/world/layout/WorldLayoutLearningStore.ts` | `280f7ebf574d83db8d962d7dc3bac576fe0f1795fb12852675866118eb9c8753` | world | unmapped |
| `server/src/world/layout/WorldLayoutPathValidator.ts` | `aeccbade6a5116147fa803e691f8cc39e8f94008be3406f9030953aeff9cf2e9` | world | unmapped |
| `server/src/world/layout/WorldLayoutRepairService.ts` | `bf7e9b6283fd937f35895c9f351192eb52dfa62ff0f3c69ecd9e959839bef50a` | world | unmapped |
| `server/src/world/layout/WorldLayoutReportLog.ts` | `7f97100c5ab35c83838273a1792c4197ffb624b253eb55189f0b4b5c8c5428ab` | world | unmapped |
| `server/src/world/layout/WorldLayoutRoadConnectivityValidator.ts` | `6502618ccdfed27a19da57e74df4b8db941007f472a01174771f8e38af423efe` | world | unmapped |
| `server/src/world/layout/WorldLayoutRuleEngine.ts` | `2372b36d188b21a4d0fa051567fa6f20150b29e7663a2749c18760cb1b226f88` | world | unmapped |
| `server/src/world/layout/WorldLayoutSpatialIndex.ts` | `ae9e0c50f7b8806b353e037abfab482da081084d7fe1f74fafaebebb3220832d` | world | unmapped |
| `server/src/world/layout/WorldLayoutTypes.ts` | `b1a1232ead5bc3b76214caa317d9e793843818c49e0e0d129374f9f45b4b0fa2` | world | unmapped |
| `server/src/world/layout/WorldLayoutValidator.ts` | `717bccce9d31313a38f85e8dd0532a6a67369413274701b05896ad1d7169374c` | world | unmapped |
| `server/src/world/layout/WorldLayoutWallConnectivityValidator.ts` | `0bac6b2ceb9d1792873b76093f75388b53770a04b1c3514a33e66c0f665dc559` | world | unmapped |
| `server/src/world/layout/index.ts` | `98044e70c09c11738af27859896e6dcdfebb139c20920bde7fcb535096d7d447` | world | unmapped |
| `server/src/world/rules/assetProfiles.ts` | `1662e73952d81d71ed817811057d6d94439ce450405885ae8158398d18c652e7` | loot_items, world | unmapped |
| `server/src/world/rules/placementRules.ts` | `21ef77bcf5dd779691d06dbe53608f47b6f42c42cbdba70561201fd2277cf7e4` | world | unmapped |
| `server/src/world/services/GLBAssetIngestionPipeline.ts` | `0bc82bbb541bd3d78b5fb9d71c0b7488905ce1bfca7ec1185b8afb6473db8225` | loot_items, world | unmapped |
| `server/src/world/services/WorldPlacementRuleEngine.ts` | `903ccbc27f253cf7f926181969e198f95c42a6865cd532ad13145d59af4d71b6` | world | unmapped |
| `server/src/world/services/index.ts` | `d4b226a4fd58113577b9b5ac95140b8d5319bfc86564a7bf80b8e028fcf517cf` | world | unmapped |

Die Zahl beschreibt eine **prüfbare Migrationsobergruppe**, nicht die Zahl bereits integrierter Aurion-Features. Jede Zeile verlangt vor einer Übernahme eine explizite Zielzuordnung, Konfliktprüfung, Test und Readback.
