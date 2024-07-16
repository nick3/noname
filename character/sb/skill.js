import { lib, game, ui, get, ai, _status } from "../../noname.js";

/** @type { importCharacterConfig['skill'] } */
const skills = {
	//韩当
	sbgongqi: {
		audio: 2,
		trigger: {
			player: "phaseUseBegin",
		},
		async cost(event, trigger, player) {
			event.result = await player
				.chooseToDiscard(get.prompt("sbgongqi"), "你可以弃置一张牌，令你本阶段使用牌时，其他角色不能使用或打出与你弃置的牌颜色不同的手牌进行响应。", "he", "chooseonly")
				.set("ai", card => {
					const ind = get.event("colors").indexOf(get.color(card)) + 1;
					if (ind <= 0) return 0;
					return 1.5 + 2 * ind - get.value(card);
				})
				.set(
					"colors",
					(() => {
						if (!player.countCards("hs", card => player.hasValueTarget(card))) return [];
						const colors = Object.keys(lib.color);
						const infos = colors.map(color => {
							return [
								color,
								game.filterPlayer().map(current => {
									const att = get.attitude(player, current);
									return current
										.getCards("hes", card => {
											if (get.color(card) !== color) return false;
											if (current.hasUseTarget(card, false, false)) return false;
											if (!lib.filter.cardEnabled(card, current, "forceEnable")) return false;
											return true;
										})
										.map(card => {
											return get.value(card) * (att > 0 ? -0.2 : 1);
										})
										.reduce((p, c) => p + c, 0);
								}),
							];
						});
						infos.sort((a, b) => {
							return a[1] - b[1];
						});
						return infos.map(info => info[0]);
					})()
				)
				.forResult();
		},
		locked: false,
		async content(event, trigger, player) {
			const { cards } = event;
			await player.discard(cards);
			await game.asyncDelayx();
			player.addTempSkill("sbgongqi_effect", "phaseChange");
			player.markAuto("sbgongqi_effect", [get.color(cards[0], player)]);
			player.line(game.filterPlayer());
			await game.asyncDelayx();
		},
		updateBlocker(player) {
			const list = [],
				storage = player.storage.sbgongqi_block;
			if (storage && storage.length) {
				list.addArray(...storage.map(i => i[1]));
			}
			player.storage.sbgongqi_blocker = list;
		},
		mod: {
			attackRange(player, num) {
				return num + 4;
			},
		},
		subSkill: {
			effect: {
				trigger: {
					player: "useCard",
				},
				onremove: true,
				charlotte: true,
				forced: true,
				async content(event, trigger, player) {
					game.countPlayer(current => {
						if (current === player) return;
						current.addTempSkill("sbgongqi_block", "phaseChange");
						if (!current.storage.sbgongqi_block) current.storage.sbgongqi_block = [];
						current.storage.sbgongqi_block.push([trigger.card, player.getStorage("sbgongqi_effect")]);
						lib.skill.sbgongqi.updateBlocker(current);
					});
				},
			},
			block: {
				trigger: {
					player: ["damageBefore", "damageCancelled", "damageZero"],
					target: ["shaMiss", "useCardToExcluded", "useCardToEnd"],
					global: ["useCardEnd"],
				},
				forced: true,
				firstDo: true,
				popup: false,
				charlotte: true,
				onremove: ["sbgongqi_block", "sbgongqi_blocker"],
				filter(event, player) {
					if (!event.card || !player.storage.sbgongqi_block) return false;
					return player.getStorage("sbgongqi_block").some(info => {
						return info[0] === event.card;
					});
				},
				async content(event, trigger, player) {
					const storage = player.storage.sbgongqi_block;
					for (let i = 0; i < storage.length; i++) {
						if (storage[i][0] === trigger.card) {
							storage.splice(i--, 1);
						}
					}
					if (!storage.length) player.removeSkill("sbgongqi_block");
					else lib.skill.sbgongqi.updateBlocker(trigger.target);
				},
				mod: {
					cardEnabled(card, player) {
						if (!player.storage.sbgongqi_blocker) return;
						const color = get.color(card);
						if (color == "none") return;
						const hs = player.getCards("h"),
							cards = [card];
						if (Array.isArray(card.cards)) cards.addArray(card.cards);
						if (cards.containsSome(...hs) && player.storage.sbgongqi_blocker.includes(color)) return false;
					},
				},
			},
		},
	},
	sbjiefan: {
		audio: 2,
		enable: "phaseUse",
		usable: 1,
		filterTarget: true,
		async content(event, trigger, player) {
			const { target } = event;
			const targets = game.filterPlayer(current => {
				return current.inRange(target);
			});
			const count = Math.min(2, targets.length);
			if (!count) {
				target.chat("没人打得到我喔！");
				return;
			}
			const controls = ["选项一", "选项二", "背水！"];
			const control = await target
				.chooseControl(controls)
				.set("choiceList", [`令所有攻击范围内含有你的角色依次弃置一张牌（${get.translation(targets)}）`, `你摸等同于攻击范围内含有你的角色数的牌（${get.cnNumber(count)}张牌）`, `背水！令${get.translation(player)}的〖解烦〗失效直到其杀死一名角色，然后你依次执行上述所有选项`])
				.set("ai", () => {
					return get.event("choice");
				})
				.set(
					"choice",
					(() => {
						const eff1 = targets
							.map(current => {
								let position = "h";
								if (!current.countCards("h")) position += "e";
								return get.effect(current, { name: "guohe", position }, target, target);
							})
							.reduce((p, c) => p + c, 0);
						const eff2 = (get.effect(target, { name: "wuzhong" }, target) * count) / 2;
						if (
							game.hasPlayer(current => {
								const att1 = get.attitude(player, current),
									att2 = get.attitude(target, current);
								if (att1 < 0 && att2 < 0) {
									return current.getHp() <= 1;
								}
								return false;
							}) &&
							eff1 > 15 &&
							eff2 > 0
						)
							return "背水！";
						if (eff1 > 3 * eff2) return "选项一";
						return "选项二";
					})()
				)
				.forResultControl();
			game.log(target, "选择了", "#g" + control);
			if (control === "背水！") {
				player.tempBanSkill("sbjiefan", { source: "die" });
			}
			if (control !== "选项二") {
				for (const current of targets) {
					target.line(current, "thunder");
					await current.chooseToDiscard("解烦：请弃置一张牌", "he", true);
				}
			}
			if (control !== "选项一") {
				target.draw(count);
			}
		},
		ai: {
			order: 8,
			result: {
				target(player, target) {
					const targets = game.filterPlayer(current => {
						return current.inRange(target);
					});
					return Math.min(2, targets.length) / 2;
				},
			}
		}
	},
	//公孙瓒
	sbyicong: {
		audio: 2,
		trigger: {
			global: "roundStart",
		},
		filter(event, player) {
			return player.hasMark("charge");
		},
		chargeSkill: true,
		group: "sbyicong_init",
		async cost(event, trigger, player) {
			const len = player.countMark("charge");
			const numbers = Array.from({ length: len }, (_, i) => get.cnNumber(i + 1, true));
			if (_status.connectMode) {
				game.broadcastAll(() => {
					_status.noclearcountdown = true;
				});
			}
			let result, result2;
			while (true) {
				result = await player
					.chooseControl(numbers, "cancel2")
					.set("prompt", get.prompt("sbyicong"))
					.set("prompt2", "你可以消耗任意点蓄力值并选择一项：⒈你于本轮内至其他角色的距离-X，令系统选择牌堆中的一张【杀】；⒉其他角色于本轮内至你的距离+X，令系统选择牌堆中的一张【闪】（X为你消耗的蓄力值）。然后若你的“扈”数小于4，你将系统选择的牌置于武将牌上，称为“扈”。")
					.set("ai", () => {
						return get.event("choice");
					})
					.set(
						"choice",
						(() => {
							if (
								!game.hasPlayer(current => {
									return (
										get.distance(player, current) >= 2 &&
										player.countCards("hs", card => {
											const list = ["shunshou", "bingliang", "zhujinqiyuan"];
											if (!player.inRange(current)) list.add("sha");
											return list.includes(get.name(card)) && get.effect(current, card, player, player) > 0;
										}) > 0
									);
								})
							)
								return 0;
							return Math.ceil(len / 2) - 1;
						})()
					)
					.forResult();
				if (result.control === "cancel2") return;
				const num = result.index + 1;
				result2 = await player
					.chooseControl(["选项一", "选项二", "返回"])
					.set("prompt", "义从：请选择一项")
					.set("choiceList", [
						`你于本轮内至其他角色的距离-${num}${
							player.countCards("s", card => {
								return card.hasGaintag("sbyicong");
							}) >= 4
								? ""
								: "，将牌堆中的一张【杀】置于你的武将牌上，称为“扈”"
						}`,
						`其他角色于本轮内至你的距离+${num}${
							player.countCards("s", card => {
								return card.hasGaintag("sbyicong");
							}) >= 4
								? ""
								: "，将牌堆中的一张【闪】置于你的武将牌上，称为“扈”"
						}`,
					])
					.set("ai", () => {
						const player = get.player();
						if (player.getHp() > 2 || player.countCards("hsx", ["shan", "caochuan"]) >= 3) return 0;
						return 1;
					})
					.forResult();
				if (result2.control !== "返回") break;
			}
			if (_status.connectMode) {
				game.broadcastAll(() => {
					delete _status.noclearcountdown;
					game.stopCountChoose();
				});
			}
			event.result = {
				bool: true,
				cost_data: {
					num: result.index + 1,
					choice: result2.index,
				},
			};
		},
		async content(event, trigger, player) {
			const { num, choice } = event.cost_data;
			const skill = choice === 0 ? "sbyicong_to" : "sbyicong_from";
			player.removeMark("charge", num);
			player.addTempSkill(skill, "roundStart");
			player.addMark(skill, num, false);
			if (player.countCards("s", card => card.hasGaintag("sbyicong")) < 4) {
				const name = choice === 0 ? "sha" : "shan";
				const card = get.cardPile2(name);
				if (card) {
					game.log(player, "将", card, "置于了武将牌上");
					await player.loseToSpecial([card], "sbyicong");
					player.markSkill("sbyicong");
				}
			}
		},
		marktext: "扈",
		intro: {
			name: "扈(义从)",
			mark(dialog, storage, player) {
				const cards = player.getCards("s", card => {
					return card.hasGaintag("sbyicong");
				});
				if (cards.length) dialog.addAuto(cards);
				else dialog.addText("暂无卡牌");
			},
			markcount(storage, player) {
				return player.countCards("s", card => {
					return card.hasGaintag("sbyicong");
				});
			},
			onunmark(storage, player) {
				const cards = player.getCards("s", card => {
					return card.hasGaintag("sbyicong");
				});
				if (cards.length) {
					player.loseToDiscardpile(cards);
				}
			},
		},
		subSkill: {
			init: {
				audio: "sbyicong",
				trigger: {
					player: "enterGame",
					global: "phaseBefore",
				},
				filter(event, player) {
					return event.name != "phase" || game.phaseNumber == 0;
				},
				forced: true,
				locked: false,
				async content(event, trigger, player) {
					player.addMark("charge", 2);
				},
			},
			to: {
				charlotte: true,
				mod: {
					globalFrom(from, to, distance) {
						return distance - from.countMark("sbyicong_to");
					},
				},
				marktext: "从",
				intro: {
					content: "本轮你至其他角色的距离-#",
				},
			},
			from: {
				charlotte: true,
				mod: {
					globalTo(from, to, distance) {
						return distance + to.countMark("sbyicong_to");
					},
				},
				marktext: "从",
				intro: {
					content: "本轮其他角色至你的距离+#",
				},
			},
		},
		ai: {
			combo: "sbqiaomeng"
		},
	},
	sbqiaomeng: {
		audio: 2,
		trigger: {
			source: "damageSource",
		},
		filter(event, player) {
			if (!event.card || event.card.name !== "sha") return false;
			return player.hasSkill("sbyicong", null, false, false);
		},
		async cost(event, trigger, player) {
			const list = ["蓄力", "cancel2"];
			const choiceList = [`弃置${get.translation(trigger.player)}区域里的一张牌，你摸一张牌`, `获得2点蓄力值`];
			if (trigger.player.isIn() && trigger.player.countDiscardableCards(player, "hej")) {
				list.unshift("弃牌");
			} else {
				choiceList[0] = `<span style="opacity:0.5">${choiceList[0]}</span>`;
			}
			const result = await player
				.chooseControl(list)
				.set("prompt", get.prompt("sbqiaomeng"))
				.set("choiceList", choiceList)
				.set("ai", () => {
					return get.event("choice");
				})
				.set(
					"choice",
					(() => {
						if (!list.includes("弃牌")) return "蓄力";
						const eff = get.effect(trigger.player, { name: "guohe" }, player, player);
						if (player.countMark("charge") >= 2 && eff >= 0) return "弃牌";
						return "蓄力";
					})()
				)
				.forResult();
			if (result.control !== "cancel2") {
				event.result = {
					bool: true,
					cost_data: {
						control: result.control,
					},
				};
			}
		},
		async content(event, trigger, player) {
			const { control } = event.cost_data;
			if (control === "弃牌") {
				player.line(trigger.player);
				await player.discardPlayerCard(trigger.player, "hej", true);
				await player.draw();
			} else {
				const num = Math.min(2, 4 - player.countMark("charge"));
				if (num > 0) player.addMark("charge", num);
			}
		},
		ai: {
			combo: "sbyicong"
		},
	},
	//高顺
	sbxianzhen: {
		audio: 2,
		enable: "phaseUse",
		usable: 1,
		filterTarget(card, player, target) {
			if (get.mode() === "identity" && target.getHp() >= player.getHp()) return false;
			return target !== player;
		},
		async content(event, trigger, player) {
			const target = event.targets[0];
			player.addTempSkill("sbxianzhen_attack", "phaseUseAfter");
			player.markAuto("sbxianzhen_attack", target);
		},
		ai: {
			expose: 0.2,
			order(item, player) {
				return get.order({ name: "sha" }) + 1;
			},
			result: {
				target(player, target) {
					if (
						!player.countCards("hs", card => {
							return get.name(card) === "sha" && player.canUse(card, target, false);
						})
					)
						return -0.1;
					if (target.countCards("h") === 1 && player.canCompare(target)) return -2;
					return -1.5;
				},
			},
		},
		subSkill: {
			attack: {
				audio: "sbxianzhen",
				trigger: { player: "useCardToPlayered" },
				filter(event, player) {
					if (event.card.name !== "sha") return false;
					return player.getStorage("sbxianzhen_attack").includes(event.target) && event.target.isIn() && player.canCompare(event.target);
				},
				charlotte: true,
				onremove: true,
				logTarget: "target",
				check(event, player) {
					return get.attitude(player, event.target) < 0;
				},
				prompt(event, player) {
					return `陷阵：是否与${get.translation(event.target)}拼点？`;
				},
				prompt2(event, player) {
					const target = event.target,
						card = event.card;
					return `若你赢，${get.translation(card)}无视防具且不计入次数，且若你本回合未以此法造成过伤害，你对其造成1点伤害；<br>若其拼点牌为【杀】，则你获得之；<br>若其拼点牌为其最后的手牌，则${get.translation(card)}对其造成伤害时，此伤害+1。`;
				},
				group: "sbxianzhen_record",
				async content(event, trigger, player) {
					const target = trigger.target,
						card = trigger.card;
					const next = player.chooseToCompare(target);
					let result = await next.forResult();
					if (result.bool) {
						target.addTempSkill("qinggang2");
						target.storage.qinggang2.add(card);
						if (trigger.addCount !== false) {
							trigger.addCount = false;
							const stat = player.getStat("card");
							if (stat[card.name] && stat[card.name] > 0) stat[card.name]--;
						}
						game.log(card, "无视防具且不计入次数限制");
						if (!player.storage.sbxianzhen_damaged) {
							player.storage.sbxianzhen_damaged = (player.storage.sbxianzhen_damaged || 0) + 1;
							player.when("phaseAfter").then(() => {
								delete player.storage.sbxianzhen_damaged;
							});
						}
						if (player.storage.sbxianzhen_damaged <= 2) {
							await target.damage();
							await game.asyncDelayx();
						}
					}
					const toGain = [];
					for (const lose_list of next.lose_list) {
						let [comparer, cards] = lose_list;
						if (!Array.isArray(cards)) cards = [cards];
						if (comparer === player) continue;
						for (const card of cards) {
							if (get.name(card, comparer) == "sha" && get.position(card, true) == "d") {
								toGain.push(card);
							}
						}
					}
					if (toGain.length) await player.gain(toGain, "gain2");
					if (player.getStorage("sbxianzhen_recorded").includes(target)) {
						const id = target.playerid;
						const map = trigger.getParent().customArgs;
						if (!map[id]) map[id] = {};
						if (typeof map[id].extraDamage != "number") {
							map[id].extraDamage = 0;
						}
						map[id].extraDamage++;
						game.log(card, "对", target, "造成的伤害+1");
					}
				},
				intro: {
					content: "本阶段对$使用牌无距离限制，且使用杀指定其为目标后可以与其拼点",
				},
				mod: {
					targetInRange(card, player, target) {
						if (player.getStorage("sbxianzhen_attack").includes(target)) return true;
					},
				},
			},
			record: {
				trigger: {
					global: "loseAsyncEnd",
				},
				charlotte: true,
				silent: true,
				filter(event, player) {
					if (event.getParent(2).name !== "sbxianzhen_attack") return false;
					return game.hasPlayer(current => {
						if (current.countCards("h")) return false;
						const evt = event.getl(current);
						return evt && evt.hs && evt.hs.length;
					});
				},
				async content(event, trigger, player) {
					const targets = [];
					game.countPlayer(current => {
						if (current.countCards("h")) return false;
						const evt = trigger.getl(current);
						if (evt && evt.hs && evt.hs.length) targets.add(current);
					});
					if (!player.storage.sbxianzhen_recorded) {
						player.when("sbxianzhen_attackAfter").then(() => {
							delete player.storage.sbxianzhen_recorded;
						});
					}
					player.markAuto("sbxianzhen_recorded", targets);
				},
			},
		},
	},
	sbjinjiu: {
		audio: 2,
		inherit: "rejinjiu",
		group: ["sbjinjiu_decrease", "sbjinjiu_compare"],
		global: "sbjinjiu_global",
		subSkill: {
			decrease: {
				audio: "sbjinjiu",
				forced: true,
				trigger: { player: "damageBegin4" },
				filter(event, player) {
					return event.getParent(2).jiu;
				},
				async content(event, trigger) {
					trigger.num = 1;
				},
				ai: {
					filterDamage: true,
					skillTagFilter(player, tag, arg) {
						return arg && arg.jiu;
					},
				},
			},
			global: {
				mod: {
					cardEnabled(card, player) {
						if (card.name == "jiu" && _status.currentPhase && _status.currentPhase != player && _status.currentPhase.hasSkill("sbjinjiu")) return false;
					},
					cardSavable(card, player) {
						if (card.name == "jiu" && _status.currentPhase && _status.currentPhase != player && _status.currentPhase.hasSkill("sbjinjiu")) return false;
					},
				},
			},
			compare: {
				trigger: {
					global: "compare",
				},
				filter(event, player) {
					const participant = [event.player];
					if (event.targets) participant.addArray(event.targets);
					else participant.add(event.target);
					if (!participant.includes(player)) return false;
					if (event.player !== player && event.card1 && event.card1.name === "jiu") return true;
					if (event.target !== player && event.card2 && event.card2.name === "jiu") return true;
					return false;
				},
				forced: true,
				direct: true,
				async content(event, trigger, player) {
					for (const [role, ind] of [
						["player", 1],
						["target", 2],
					]) {
						const current = trigger[role],
							card = trigger[`card${ind}`];
						if (current !== player && card && card.name === "jiu") {
							await player.logSkill("sbjinjiu_compare", current);
							game.log(current, "拼点牌点数视为", "#yA");
							trigger[`num${ind}`] = 1;
						}
					}
				},
			},
		},
	},
	//夏侯惇
	sbganglie: {
		audio: 2,
		enable: "phaseUse",
		usable: 1,
		filter(event, player) {
			if (!event.sbganglie_enabledTargets) return false;
			return game.hasPlayer(current => {
				return lib.skill.sbganglie.filterTarget(null, player, current);
			});
		},
		onChooseToUse(event) {
			if (game.online || event.type !== "phase") return;
			const player = event.player;
			const chosen = player
				.getAllHistory("useSkill", evt => evt.skill === "sbganglie")
				.map(evt => {
					return evt.targets;
				});
			let targets = player
				.getAllHistory("damage", evt => evt.source && evt.source.isIn())
				.map(evt => evt.source)
				.unique();
			targets = [...targets, ...targets];
			targets.removeArray(chosen);
			event.set("sbganglie_enabledTargets", targets);
		},
		filterTarget(card, player, target) {
			return get.event("sbganglie_enabledTargets").includes(target);
		},
		async content(event, trigger, player) {
			event.targets[0].damage(2);
		},
		ai: {
			order: 6,
			result: {
				target: -2,
			},
		},
	},
	sbqingjian: {
		audio: 2,
		trigger: {
			global: ["loseAfter", "cardsDiscardAfter", "loseAsyncAfter", "equipAfter"],
		},
		forced: true,
		locked: false,
		filter(event, player) {
			if (player.getExpansions("sbqingjian").length >= Math.max(1, player.getHp() - 1)) return false;
			if (event.name !== "cardsDiscard") {
				if (event.position !== ui.discardPile) return false;
				if (
					!game.hasPlayer(current => {
						const evt = event.getl(current);
						return evt.cards && evt.cards.length > 0;
					})
				)
					return false;
			} else {
				const evt = event.getParent();
				if (evt.relatedEvent && evt.relatedEvent.name === "useCard") return false;
			}
			return true;
		},
		group: "sbqingjian_give",
		async content(event, trigger, player) {
			let cards = trigger.cards.slice();
			const maxNum = Math.max(1, player.getHp() - 1);
			const myLen = player.getExpansions("sbqingjian").length,
				cardsLen = trigger.cards.length;
			const overflow = myLen + cardsLen - maxNum;
			if (overflow > 0) cards.randomRemove(overflow);
			const next = player.addToExpansion(cards, "gain2");
			next.gaintag.add("sbqingjian");
			await next;
		},
		marktext: "俭",
		intro: {
			content: "expansion",
			markcount: "expansion",
		},
		subSkill: {
			give: {
				audio: "sbqingjian",
				trigger: { player: "phaseUseEnd" },
				filter(event, player) {
					return player.getExpansions("sbqingjian").length > 0;
				},
				forced: true,
				locked: false,
				async content(event, trigger, player) {
					if (_status.connectMode)
						game.broadcastAll(() => {
							_status.noclearcountdown = true;
						});
					const given_map = {};
					event.given_map = given_map;
					const expansions = player.getExpansions("sbqingjian");
					let result;
					while (true) {
						if (expansions.length > 1) {
							result = await player
								.chooseCardButton("清俭：请选择要分配的牌", true, expansions, [1, expansions.length])
								.set("ai", button => {
									if (ui.selected.buttons.length) return 0;
									return get.value(button.link, get.player());
								})
								.forResult();
						} else if (expansions.length === 1) result = { bool: true, links: expansions.slice(0) };
						else return;
						if (!result.bool) return;
						const toGive = result.links;
						result = await player
							.chooseTarget(`选择一名角色获得${get.translation(toGive)}`, expansions.length === 1)
							.set("ai", target => {
								const att = get.attitude(get.player(), target);
								if (get.event("toEnemy")) return Math.max(0.01, 100 - att);
								else if (att > 0) return Math.max(0.1, att / Math.sqrt(1 + target.countCards("h") + (get.event().getParent().given_map[target.playerid] || 0)));
								else return Math.max(0.01, (100 + att) / 200);
							})
							.set("toEnemy", get.value(toGive[0], player, "raw") < 0)
							.forResult();
						if (result.bool) {
							expansions.removeArray(toGive);
							if (result.targets.length) {
								const id = result.targets[0].playerid;
								if (!given_map[id]) given_map[id] = [];
								given_map[id].addArray(toGive);
							}
							if (!expansions.length) break;
						}
					}
					if (_status.connectMode)
						game.broadcastAll(() => {
							delete _status.noclearcountdown;
							game.stopCountChoose();
						});
					const gain_list = [];
					for (const i in given_map) {
						const source = (_status.connectMode ? lib.playerOL : game.playerMap)[i];
						player.line(source, "green");
						gain_list.push([source, given_map[i]]);
						game.log(source, "获得了", given_map[i]);
					}
					await game
						.loseAsync({
							gain_list,
							giver: player,
							animate: "gain2",
						})
						.setContent("gaincardMultiple");
				},
			},
		},
	},
	//荀彧
	sbquhu: {
		audio: 2,
		enable: "phaseUse",
		usable: 1,
		filter(event, player) {
			return game.countPlayer(current => lib.skill.sbquhu.filterTarget(null, player, current)) > 1;
		},
		filterTarget(card, player, target) {
			return player != target && target.countCards("he") > 0;
		},
		selectTarget: 2,
		multitarget: true,
		multiline: true,
		async content(event, trigger, player) {
			const targets = [player].addArray(event.targets);
			targets.sortBySeat();
			const { result } = await player.chooseCardOL(targets, "he", [1, Infinity], true, "驱虎：请将任意张牌扣置于武将牌上").set("ai", card => {
				const player = get.event().getParent(2).player;
				let value = 5;
				if (get.player() == player) value -= 0.5;
				return value - get.useful(card);
			});
			const lose_list = [];
			const map = new Map();
			let myCards;
			let minLength = Infinity;
			for (let i = 0; i < result.length; i++) {
				const current = targets[i],
					cards = result[i].cards;
				if (current == player) myCards = cards;
				else if (cards.length < minLength) minLength = cards.length;
				lose_list.push([current, cards]);
				map.set(current.playerid, cards);
			}
			await game
				.loseAsync({
					lose_list,
					log: true,
					animate: "giveAuto",
					gaintag: ["sbquhu"],
				})
				.setContent(lib.skill.sbquhu.addToExpansionMultiple);
			await game.asyncDelay(1.5);
			const isMin = minLength > myCards.length;
			const sortedList = lose_list
				.filter(list => list[0] != player)
				.sort((a, b) => {
					return 1000 * (b[1].length - a[1].length) + (get.distance(player, a[0], "absolute") - get.distance(player, b[0], "absolute"));
				});
			const mostPlayer = sortedList[0][0],
				secondPlayer = sortedList[1][0];
			await new Promise(resolve => {
				game.broadcastAll(lose_list => {
					lose_list.forEach(list => list[0].prompt(`${get.cnNumber(list[1].length)}张`, "wood"));
				}, lose_list);
				setTimeout(
					() => {
						game.broadcastAll(lose_list => {
							lose_list.forEach(list => list[0].unprompt());
						}, lose_list);
						resolve();
					},
					2000 / (lib.config.speed == "vvfast" ? 3 : 1)
				);
			});
			if (isMin) {
				await mostPlayer.gain(myCards, "give", player);
				await game.asyncDelay();
				const gain_list = lose_list.filter(list => list[0] != player);
				game.loseAsync({
					gain_list,
					animate: "draw",
				}).setContent("gaincardMultiple");
			} else {
				mostPlayer.line(secondPlayer, "thunder");
				await secondPlayer.damage(mostPlayer);
				await game.asyncDelay();
				await mostPlayer.gain(myCards, "give", player);
				await game.asyncDelay();
				await game
					.loseAsync({
						lose_list: sortedList,
					})
					.setContent(() => {
						for (var i = 0; i < event.lose_list.length; i++) {
							var current = event.lose_list[i][0],
								cards = event.lose_list[i][1];
							var next = current.lose(cards, ui.discardPile);
							current.$throw(cards);
							game.log(current, "将", cards, "置入了弃牌堆");
							next.set("relatedEvent", event.getParent());
							next.set("getlx", false);
						}
					});
				await game.asyncDelayx();
			}
		},
		addToExpansionMultiple() {
			"step 0";
			if (event.animate == "give") event.visible = true;
			event.type = "addToExpansion";
			if (!event.gaintag) event.gaintag = [];
			if (event.lose_list) {
				var map = {},
					map2 = {};
				for (var list of event.lose_list) {
					var player = list[0],
						cards = list[1];
					var myId = player.playerid;
					if (!map2[myId]) map2[myId] = [];
					for (var i of cards) {
						var owner = get.owner(i, "judge");
						if (owner && (owner != player || get.position(i) != "x")) {
							var id = owner.playerid;
							if (!map[id]) map[id] = [[], [], []];
							map[id][0].push(i);
							map2[myId].push(i);
							var position = get.position(i);
							if (position == "h") map[id][1].push(i);
							else map[id][2].push(i);
						} else if (!event.updatePile && get.position(i) == "c") event.updatePile = true;
					}
				}
				event.losing_map = map;
				event.gaining_map = map2;
				for (var i in map) {
					var owner = (_status.connectMode ? lib.playerOL : game.playerMap)[i];
					var next = owner.lose(map[i][0], ui.special).set("forceDie", true).set("getlx", false);
					next.set("relatedEvent", event.getParent());
					next.set("forceDie", true);
					next.set("getlx", false);
					if (event.visible == true) next.set("visible", true);
				}
			} else {
				event.finish();
			}
			"step 1";
			if (event.lose_list) {
				var map = {};
				for (var list of event.lose_list) {
					var player = list[0],
						cards = list[1];
					for (var i = 0; i < cards.length; i++) {
						if (cards[i].willBeDestroyed("expansion", player, event)) {
							cards[i].selfDestroy(event);
							cards.splice(i--, 1);
						} else if (event.losing_map) {
							for (var id in event.losing_map) {
								if (event.losing_map[id][0].includes(cards[i])) {
									var source = (_status.connectMode ? lib.playerOL : game.playerMap)[id];
									var hs = source.getCards("hejsx");
									if (hs.includes(cards[i])) {
										cards.splice(i--, 1);
									}
								}
							}
						}
					}
				}
			}
			if (cards.length == 0) {
				event.finish();
				return;
			}
			"step 2";
			var loopedCount = 0,
				mapLength = Object.keys(event.gaining_map).length;
			for (var j in event.gaining_map) {
				loopedCount++;
				var map = {};
				var player = (_status.connectMode ? lib.playerOL : game.playerMap)[j],
					cards = event.gaining_map[j];
				var hs = player.getCards("x");
				for (var i = 0; i < cards.length; i++) {
					if (hs.includes(cards[i])) {
						cards.splice(i--, 1);
					}
				}
				for (var num = 0; num < cards.length; num++) {
					if (_status.discarded) {
						_status.discarded.remove(cards[num]);
					}
					for (var num2 = 0; num2 < cards[num].vanishtag.length; num2++) {
						if (cards[num].vanishtag[num2][0] != "_") {
							cards[num].vanishtag.splice(num2--, 1);
						}
					}
				}
				if (event.animate == "draw") {
					player.$draw(cards.length);
					if (event.log) game.log(player, "将", get.cnNumber(cards.length), "张牌置于了武将牌上");
					game.pause();
					setTimeout(
						(player, cards, resume) => {
							player.$addToExpansion(cards, null, event.gaintag);
							for (var i of event.gaintag) player.markSkill(i);
							if (resume) game.resume();
						},
						get.delayx(500, 500),
						player,
						cards,
						loopedCount === mapLength
					);
				} else if (event.animate == "gain") {
					player.$gain(cards, false);
					game.pause();
					setTimeout(
						(player, cards, resume) => {
							player.$addToExpansion(cards, null, event.gaintag);
							for (var i of event.gaintag) player.markSkill(i);
							if (resume) game.resume();
						},
						get.delayx(700, 700),
						player,
						cards,
						loopedCount === mapLength
					);
				} else if (event.animate == "gain2" || event.animate == "draw2") {
					var gain2t = 300;
					if (player.$gain2(cards) && player == game.me) {
						gain2t = 500;
					}
					game.pause();
					setTimeout(
						(player, cards, resume) => {
							player.$addToExpansion(cards, null, event.gaintag);
							for (var i of event.gaintag) player.markSkill(i);
							if (resume) game.resume();
						},
						get.delayx(gain2t, gain2t),
						player,
						cards,
						loopedCount === mapLength
					);
				} else if (event.animate == "give" || event.animate == "giveAuto") {
					var evtmap = event.losing_map;
					var entries = Object.entries(evtmap).map(entry => [entry[0], entry[1][0]]);
					var getOwner = card => {
						var entry = entries.find(entry => entry[1].includes(card));
						if (entry) return (_status.connectMode ? lib.playerOL : game.playerMap)[entry[0]];
						return null;
					};
					var gainmap = {};
					for (var cardx of cards) {
						var owner = getOwner(cardx);
						if (owner) {
							var id = owner.playerid;
							if (!gainmap[id]) gainmap[id] = [];
							gainmap[id].push(cardx);
						}
					}
					if (event.animate == "give") {
						for (var i in gainmap) {
							var source = (_status.connectMode ? lib.playerOL : game.playerMap)[i];
							source.$give(evtmap[i][0], player, false);
							if (event.log) game.log(player, "将", evtmap[i][0], "置于了武将牌上");
						}
					} else {
						for (var i in gainmap) {
							var source = (_status.connectMode ? lib.playerOL : game.playerMap)[i];
							if (evtmap[i][1].length) {
								source.$giveAuto(evtmap[i][1], player, false);
								if (event.log) game.log(player, "将", get.cnNumber(evtmap[i][1].length), "张牌置于了武将牌上");
							}
							if (evtmap[i][2].length) {
								source.$give(evtmap[i][2], player, false);
								if (event.log) game.log(player, "将", evtmap[i][2], "置于了武将牌上");
							}
						}
					}
					game.pause();
					setTimeout(
						(player, cards, resume) => {
							player.$addToExpansion(cards, null, event.gaintag);
							for (var i of event.gaintag) player.markSkill(i);
							if (resume) game.resume();
						},
						get.delayx(500, 500),
						player,
						cards,
						loopedCount === mapLength
					);
				} else if (typeof event.animate == "function") {
					var time = event.animate(event);
					game.pause();
					setTimeout(
						(player, cards, resume) => {
							player.$addToExpansion(cards, null, event.gaintag);
							for (var i of event.gaintag) player.markSkill(i);
							if (resume) game.resume();
						},
						get.delayx(time, time),
						player,
						cards,
						loopedCount === mapLength
					);
				} else {
					player.$addToExpansion(cards, null, event.gaintag);
					for (var i of event.gaintag) player.markSkill(i);
					event.finish();
				}
			}
			"step 3";
			game.delayx();
			if (event.updatePile) game.updateRoundNumber();
		},
		intro: {
			markcount: "expansion",
			mark(dialog, storage, player) {
				const cards = player.getExpansions("sbquhu");
				if (player.isUnderControl(true)) dialog.addAuto(cards);
				else return "共有" + get.cnNumber(cards.length) + "张牌";
			},
		},
		ai: {
			order: 3.5,
			result: {
				target(player, target) {
					let sgn = 1,
						preAtt = 0;
					if (ui.selected.targets.length) {
						const selected = ui.selected.targets[0];
						preAtt = get.attitude(player, selected);
						if (preAtt > 0) sgn = -1;
					}
					let eff =
						0.4 *
							target.countCards("h", card => {
								return 5 - get.useful(card);
							}) -
						1;
					if ((get.attitude(player, target) > 0 && sgn < 0) || (get.attitude(player, target) < 0 && preAtt < 0)) eff = -Math.abs(eff);
					return eff;
				},
			},
		},
	},
	sbjieming: {
		audio: 2,
		trigger: {
			player: "damageEnd",
		},
		async cost(event, trigger, player) {
			const num = Math.max(1, player.getDamagedHp());
			event.result = await player
				.chooseTarget(get.prompt("sbjieming"), `令一名角色摸四张牌，然后其可以弃置任意张牌。若其弃置的牌数小于${get.cnNumber(num)}张，你失去1点体力。`)
				.set("ai", target => {
					if (get.event("nope")) return 0;
					const player = get.player(),
						att = get.attitude(player, target);
					if (att > 2) {
						const num = Math.sqrt(
							Math.min(
								5,
								Math.max(
									1,
									target.countCards("he", card => get.value(card) < 5.5)
								)
							)
						);
						return num * att;
					}
					return att / 3;
				})
				.set("nope", player.getHp() + player.countCards("hs", card => player.canSaveCard(card, player)) <= 1 && num > 2)
				.forResult();
		},
		async content(event, trigger, player) {
			const target = event.targets[0];
			await target.draw(4);
			const num = Math.max(1, player.getDamagedHp());
			const {
				result: { bool: bool, cards },
			} = await target
				.chooseToDiscard("节命：是否弃置任意张牌？", `若你本次弃置的牌数小于${get.cnNumber(num)}张，${get.translation(player)}失去1点体力。`, [1, Infinity], "he")
				.set("ai", card => {
					if (get.event("nope")) return 0;
					if (ui.selected.cards.length >= get.event("num")) return 0;
					return 6 - get.value(card);
				})
				.set("nope", get.attitude(target, player) * get.effect(player, { name: "losehp" }, player, target) >= 0)
				.set("num", num);
			if (!bool || cards.length < num) player.loseHp();
		},
		ai: {
			maixie: true,
			maixie_hp: true,
			effect: {
				target(card, player, target, current) {
					if (get.tag(card, "damage") && target.hp > 1) {
						if (player.hasSkillTag("jueqing", false, target)) return [1, -2];
						if (!target.hasFriend()) return;
						let max = 0;
						const num = Math.max(1, player.getDamagedHp());
						if (num > 2) return [1, -2];
						const players = game.filterPlayer();
						for (const current of players) {
							if (get.attitude(target, current) > 0) {
								max = Math.max(current.countCards("he"), max);
							}
						}
						return [1, Math.max(1, 1 + Math.min(2, max / 3))];
					}
					if ((card.name == "tao" || card.name == "caoyao") && target.hp > 1 && target.countCards("h") <= target.hp) return [0, 0];
				},
			},
		},
	},
	//曹丕
	sbxingshang: {
		audio: 2,
		trigger: { global: ["die", "damageEnd"] },
		filter(event, player) {
			if (player.countMark("sbxingshang") >= get.info("sbxingshang").getLimit) return false;
			return event.name == "die" || !player.getHistory("custom", evt => evt.sbxingshang).length;
		},
		forced: true,
		locked: false,
		async content(event, trigger, player) {
			player.addMark("sbxingshang", Math.min(2, get.info("sbxingshang").getLimit - player.countMark("sbxingshang")));
			if (trigger.name == "damage") player.getHistory("custom").push({ sbxingshang: true });
		},
		marktext: "颂",
		intro: {
			name: "颂",
			content: "mark",
		},
		ai: { threaten: 2.5 },
		getLimit: 9,
		getNum(num) {
			const list = [2, 2, 5, 5, 1, 2, 2, 3, 3, 2];
			if (
				typeof num != "number" ||
				!Array.from({ length: list.length })
					.map((_, i) => i + 1)
					.includes(num)
			)
				return 0;
			return list[num - 1];
		},
		getEffect(player, num) {
			if (!player || typeof num != "number") return 0;
			switch (num) {
				//行殇选项
				case 1: //-2，重置武将牌
					if (
						game.hasPlayer(target => {
							return get.attitude(player, target) > 0 && target.isTurnedOver();
						})
					)
						return 10;
					return 0;
				case 2: //-2，摸min(5,max(2,阵亡角色数))的牌
					return Math.min(5, Math.max(2, game.dead.length));
				case 3: //-5，加上限加血+复原装备栏
					if (
						!game.hasPlayer(target => {
							return get.attitude(player, target) > 0 && target.maxHp < 10;
						})
					)
						return 0;
					return (
						5 +
						(game.hasPlayer(target => {
							return get.attitude(player, target) > 0 && target.hasDisabledSlot();
						})
							? 1
							: 0)
					);
				case 4: //-5，劝封/化萍
					return 0;
				//放逐选项
				case 5: //-1，封印基本牌外的手牌
					if (
						game.hasPlayer(target => {
							return get.attitude(player, target) < 0;
						})
					)
						return 1;
					return 0;
				case 6: //-2，白板到结束
					if (
						game.hasPlayer(target => {
							if (target.hasSkill("sbfangzhu_ban") || target.hasSkill("fengyin") || target.hasSkill("baiban")) return false;
							return (
								get.attitude(player, target) < 0 &&
								["name", "name1", "name2"].reduce((sum, name) => {
									if (target[name] && (name != "name1" || target.name != target.name1)) {
										if (get.character(target[name])) sum + get.rank(target[name], true);
									}
									return sum;
								}, 0) > 5
							);
						})
					)
						return 6;
					return 0;
				case 7: //-2，强命到结束
					return 0;
				case 8: //-3，翻面
					if (
						game.hasPlayer(target => {
							return get.attitude(player, target) < 0 && !target.isTurnedOver();
						})
					)
						return 8;
					return 0;
				case 9: //-3，封印装备牌外的手牌
					if (
						game.hasPlayer(target => {
							return get.attitude(player, target) < 0;
						})
					)
						return 2.5;
					return 0;
				case 10: //-2，封印锦囊牌外的手牌
					if (
						game.hasPlayer(target => {
							return get.attitude(player, target) < 0;
						})
					)
						return 1.5;
					return 0;
				default: //其他
					return 0;
			}
		},
		group: "sbxingshang_use",
		subSkill: {
			use: {
				audio: "sbxingshang",
				enable: "phaseUse",
				filter(event, player) {
					return game.hasPlayer(target => {
						if (player.countMark("sbxingshang") > 1) return true;
						return player.countMark("sbxingshang") && (target.isLinked() || target.isTurnedOver());
					});
				},
				usable: 2,
				chooseButton: {
					dialog() {
						var dialog = ui.create.dialog("行殇：请选择你要执行的一项", "hidden");
						dialog.add([
							[
								[1, "移去2个“颂”标记，复原一名角色的武将牌"],
								[2, "移去2个“颂”标记，令一名角色摸" + get.cnNumber(Math.min(5, Math.max(2, game.dead.length))) + "张牌"],
								[3, "移去5个“颂”标记，令一名体力上限小于10的角色加1点体力上限并回复1点体力，然后随机恢复一个被废除的装备栏"],
								[4, "移去5个“颂”标记，获得一名已阵亡角色的所有技能，然后失去〖行殇〗〖放逐〗〖颂威〗"],
							],
							"textbutton",
						]);
						return dialog;
					},
					filter(button, player) {
						if (player.countMark("sbxingshang") < get.info("sbxingshang").getNum(button.link)) return false;
						switch (button.link) {
							case 1:
								return game.hasPlayer(target => target.isLinked() || target.isTurnedOver());
							case 2:
								return true;
							case 3:
								return game.hasPlayer(target => target.maxHp < 10);
							case 4:
								return game.dead.length;
						}
					},
					check(button) {
						const player = get.event("player"),
							info = get.info("sbxingshang");
						let list = Array.from({ length: 4 }).map((_, i) => i + 1);
						list = list.filter(num => player.countMark("sbxingshang") >= info.getNum(num));
						const num = list.sort((a, b) => info.getEffect(player, b) - info.getEffect(player, a))[0];
						return button.link == num ? 10 : 0;
					},
					backup(links, player) {
						return {
							num: links[0],
							audio: "sbxingshang",
							filterCard: () => false,
							selectCard: -1,
							filterTarget(card, player, target) {
								switch (lib.skill.sbxingshang_use_backup.num) {
									case 1:
										return target => target.isLinked() || target.isTurnedOver();
									case 2:
										return true;
									case 3:
										return target.maxHp < 10;
									case 4:
										return target == player;
								}
							},
							selectTarget: () => (lib.skill.sbxingshang_use_backup.num == 4 ? -1 : 1),
							async content(event, trigger, player) {
								const target = event.targets[0];
								const num = lib.skill.sbxingshang_use_backup.num;
								player.removeMark("sbxingshang", get.info("sbxingshang").getNum(num));
								switch (num) {
									case 1: {
										if (target.isLinked()) target.link(false);
										if (target.isTurnedOver()) target.turnOver();
										break;
									}
									case 2: {
										target.draw(Math.min(5, Math.max(2, game.dead.length)));
										break;
									}
									case 3: {
										target.gainMaxHp();
										target.recover();
										let list = [];
										for (let i = 1; i <= 5; i++) {
											if (target.hasDisabledSlot(i)) list.push("equip" + i);
										}
										if (list.length) target.enableEquip(list.randomGet());
										break;
									}
									case 4: {
										const result = await player
											.chooseTarget(
												"行殇：请选择一名已阵亡角色",
												(card, player, target) => {
													return target.isDead();
												},
												true,
												"获得一名已阵亡角色的所有技能，然后失去〖行殇〗〖放逐〗〖颂威〗"
											)
											.set("ai", target => {
												return ["name", "name1", "name2"].reduce((sum, name) => {
													if (!target[name] || !lib.character[target[name]] || (name == "name1" && target.name1 == target.name)) return sum;
													return sum + get.rank(target[name], true);
												}, 0);
											})
											.set("deadTarget", true)
											.forResult();
										if (result.bool) {
											const target2 = result.targets[0];
											player.line(target2);
											game.log(player, "选择了", target2);
											await player.changeSkills(target2.getStockSkills(true, true), ["sbxingshang", "sbfangzhu", "sbsongwei"]);
										}
									}
								}
							},
							ai: {
								result: {
									target(player, target) {
										switch (lib.skill.sbxingshang_use_backup.num) {
											case 1: {
												let num = 0;
												if (target.isLinked() && !target.hasSkill("nzry_jieying")) num += 0.5;
												if (target.isTurnedOver()) num += 10;
												return num;
											}
											case 2: {
												return get.effect(target, { name: "draw" }, player, player);
											}
											case 3: {
												return Math.max(0, get.recoverEffect(target, player, player)) + get.attitude(player, target);
											}
											case 4: {
												return 1;
											}
										}
									},
								},
							},
						};
					},
					prompt(links, player) {
						const str = "###行殇###";
						switch (links[0]) {
							case 1:
								return str + "移去2个“颂”标记，复原一名角色的武将牌";
							case 2:
								return str + "移去2个“颂”标记，令一名角色摸" + get.cnNumber(Math.min(5, Math.max(2, game.dead.length))) + "张牌";
							case 3:
								return str + "移去5个“颂”标记，令一名体力上限小于10的角色加1点体力上限并回复1点体力，然后随机恢复一个被废除的装备栏";
							case 4:
								return str + "移去5个“颂”标记，获得一名已阵亡角色的所有技能，然后失去〖行殇〗〖放逐〗〖颂威〗";
						}
					},
				},
				ai: {
					order(_, player) {
						const info = get.info("sbxingshang");
						const goon = player.hasSkill("sbfangzhu") && (player.getStat("skill").sbfangzhu || 0) < (get.info("sbfangzhu").usable || Infinity);
						let list = Array.from({ length: goon ? 10 : 4 }).map((_, i) => i + 1);
						list = list.filter(num => player.countMark("sbxingshang") >= info.getNum(num));
						list.sort((a, b) => info.getEffect(player, b) - info.getEffect(player, a));
						return Array.from({ length: 4 })
							.map((_, i) => i + 1)
							.includes(list[0]) && info.getEffect(player, list[0]) > 0
							? 1
							: 0;
					},
					result: { player: 1 },
				},
			},
			use_backup: {},
		},
	},
	sbfangzhu: {
		audio: 2,
		audioname: ["mb_caomao"],
		enable: "phaseUse",
		filter(event, player) {
			return player.hasMark("sbxingshang");
		},
		usable: 1,
		chooseButton: {
			dialog() {
				var dialog = ui.create.dialog("放逐：请选择你要执行的一项", "hidden");
				dialog.add([
					[
						[1, "移去1个“颂”标记，令一名其他角色于手牌中只能使用基本牌直到其回合结束"],
						[2, "移去2个“颂”标记，令一名其他角色的非Charlotte技能失效直到其回合结束"],
						[3, "移去2个“颂”标记，令一名其他角色不能响应除其外的角色使用的牌直到其回合结束"],
						[4, "移去3个“颂”标记，令一名其他角色将武将牌翻面"],
						[5, "移去3个“颂”标记，令一名其他角色于手牌中只能使用装备牌直到其回合结束"],
						[6, "移去2个“颂”标记，令一名其他角色于手牌中只能使用锦囊牌直到其回合结束"],
					],
					"textbutton",
				]);
				return dialog;
			},
			filter(button, player) {
				if (player.countMark("sbxingshang") < get.info("sbxingshang").getNum(button.link + 4)) return false;
				return game.hasPlayer(target => {
					if (target == player) return false;
					const num = button.link,
						storage = target.getStorage("sbfangzhu_ban");
					return !((num == 1 && storage.includes("basic")) || (num == 5 && storage.includes("equip")) || (num == 6 && storage.includes("trick")));
				});
			},
			check(button) {
				const player = get.event("player"),
					info = get.info("sbxingshang");
				let list = Array.from({ length: 6 }).map((_, i) => i + 1);
				list = list.filter(num => player.countMark("sbxingshang") >= info.getNum(num + 4));
				const num = list.sort((a, b) => info.getEffect(player, b + 4) - info.getEffect(player, a + 4))[0] - 4;
				return button.link == num ? 10 : 0;
			},
			backup(links, player) {
				return {
					num: links[0],
					audio: "sbfangzhu",
					audioname: ["mb_caomao"],
					filterCard: () => false,
					selectCard: -1,
					filterTarget(card, player, target) {
						if (target == player) return false;
						const num = lib.skill.sbfangzhu_backup.num,
							storage = target.getStorage("sbfangzhu_ban");
						return !((num == 1 && storage.includes("basic")) || (num == 5 && storage.includes("equip")) || (num == 6 && storage.includes("trick")));
					},
					async content(event, trigger, player) {
						const target = event.target;
						const num = lib.skill.sbfangzhu_backup.num;
						player.removeMark("sbxingshang", get.info("sbxingshang").getNum(num + 4));
						switch (num) {
							case 1:
							case 5:
							case 6: {
								const type = ["basic", "equip", "trick"][[1, 5, 6].indexOf(num)];
								target.addTempSkill("sbfangzhu_ban", { player: "phaseEnd" });
								target.markAuto("sbfangzhu_ban", [type]);
								break;
							}
							case 2: {
								target.addTempSkill("baiban", { player: "phaseEnd" });
								break;
							}
							case 3: {
								target.addTempSkill("sbfangzhu_kill", { player: "phaseEnd" });
								break;
							}
							case 4: {
								target.turnOver();
								break;
							}
						}
					},
					ai: {
						result: {
							target(player, target) {
								switch (lib.skill.sbfangzhu_backup.num) {
									case 1:
										return -target.countCards("h", card => get.type(card) != "basic") - 1;
									case 2:
										return -target.getSkills(null, null, false).reduce((sum, skill) => {
											return sum + Math.max(get.skillRank(skill, "out"), get.skillRank(skill, "in"));
										}, 0);
									case 3:
										return 0;
									case 4:
										if (get.attitude(player, target) > 0 && target.isTurnedOver()) return 10 * target.countCards("hs") + 1;
										if (get.attitude(player, target) < 0 && !target.isTurnedOver()) return -5 * target.countCards("hs") + 1;
										return 0;
									case 5:
										return -target.countCards("h", card => get.type(card) != "equip") - 3;
									case 6:
										return -target.countCards("h", card => get.type2(card) != "trick") - 2;
								}
							},
						},
					},
				};
			},
			prompt(links, player) {
				const str = "###放逐###";
				switch (links[0]) {
					case 1:
						return str + "移去1个“颂”标记，令一名其他角色于手牌中只能使用基本牌直到其回合结束";
					case 2:
						return str + "移去2个“颂”标记，令一名其他角色的非Charlotte技能失效直到其回合结束";
					case 3:
						return str + "移去2个“颂”标记，令一名其他角色不能响应除其外的角色使用的牌直到其回合结束";
					case 4:
						return str + "移去3个“颂”标记，令一名其他角色将武将牌翻面";
					case 5:
						return str + "移去3个“颂”标记，令一名其他角色于手牌中只能使用装备牌直到其回合结束";
					case 6:
						return str + "移去2个“颂”标记，令一名其他角色于手牌中只能使用锦囊牌直到其回合结束";
				}
			},
		},
		ai: {
			order(_, player) {
				const info = get.info("sbxingshang");
				const goon = player.hasSkill("sbxingshang") && (player.getStat("skill").sbxingshang_use || 0) < (info.subSkill.use.usable || Infinity);
				let list = Array.from({ length: goon ? 10 : 6 }).map((_, i) => i + (goon ? 1 : 5));
				list = list.filter(num => player.countMark("sbxingshang") >= info.getNum(num));
				list.sort((a, b) => info.getEffect(player, b) - info.getEffect(player, a));
				return Array.from({ length: 6 })
					.map((_, i) => i + 5)
					.includes(list[0]) && info.getEffect(player, list[0]) > 0
					? 1
					: 0;
			},
			result: { player: 1 },
			combo: "sbxingshang",
		},
		subSkill: {
			backup: {},
			kill: {
				charlotte: true,
				mark: true,
				marktext: "禁",
				intro: { content: "不能响应其他角色使用的牌" },
				trigger: { global: "useCard1" },
				filter(event, player) {
					return event.player != player;
				},
				forced: true,
				popup: false,
				async content(event, trigger, player) {
					trigger.directHit.add(player);
				},
			},
			ban: {
				charlotte: true,
				onremove: true,
				mark: true,
				marktext: "禁",
				intro: {
					markcount: () => 0,
					content(storage) {
						if (storage.length > 1) return "不能使用手牌";
						return "于手牌中只能使用" + get.translation(storage[0]) + "牌";
					},
				},
				mod: {
					cardEnabled(card, player) {
						const storage = player.getStorage("sbfangzhu_ban");
						if (get.itemtype(card) == "card" && get.position(card) != "h") return;
						if (storage.length > 1 || !storage.includes(get.type2(card))) return false;
					},
					cardSavable(card, player) {
						const storage = player.getStorage("sbfangzhu_ban");
						if (get.itemtype(card) == "card" && get.position(card) != "h") return;
						if (storage.length > 1 || !storage.includes(get.type2(card))) return false;
					},
				},
			},
		},
	},
	sbsongwei: {
		audio: 2,
		trigger: { player: "phaseUseBegin" },
		filter(event, player) {
			if (player.countMark("sbxingshang") >= get.info("sbxingshang").getLimit) return false;
			return game.hasPlayer(target => target.group == "wei" && target != player);
		},
		zhuSkill: true,
		forced: true,
		locked: false,
		async content(event, trigger, player) {
			player.addMark("sbxingshang", Math.min(get.info("sbxingshang").getLimit - player.countMark("sbxingshang"), 2 * game.countPlayer(target => target.group == "wei" && target != player)));
		},
		group: "sbsongwei_delete",
		subSkill: {
			delete: {
				audio: "sbsongwei",
				enable: "phaseUse",
				filter(event, player) {
					if (player.storage.sbsongwei_delete) return false;
					return game.hasPlayer(target => lib.skill.sbsongwei.subSkill.delete.filterTarget(null, player, target));
				},
				filterTarget(card, player, target) {
					return target != player && target.group == "wei" && target.getStockSkills(false, true).length;
				},
				skillAnimation: true,
				animationColor: "thunder",
				async content(event, trigger, player) {
					player.storage.sbsongwei_delete = true;
					player.awakenSkill("sbsongwei_delete");
					event.target.removeSkills(event.target.getStockSkills(false, true));
				},
				ai: {
					order: 13,
					result: {
						target(player, target) {
							return -target.getStockSkills(false, true).length;
						},
					},
				},
			},
		},
	},
	//关羽
	//矢
	sbwusheng: {
		audio: 3,
		trigger: { player: "phaseUseBegin" },
		filter: function (event, player) {
			return game.hasPlayer(target => target != player && !target.isZhu2());
		},
		direct: true,
		content: function* (event, map) {
			var player = map.player;
			var result = yield player
				.chooseTarget(get.prompt("sbwusheng"), "选择一名非主公的其他角色，本阶段对其使用【杀】无距离和次数限制，使用【杀】指定其为目标后摸" + (get.mode() === "identity" ? "两" : "一") + "张牌，对其使用三张【杀】后不能对其使用【杀】", (card, player, target) => {
					return target != player && !target.isZhu2();
				})
				.set("ai", target => {
					var player = _status.event.player;
					return get.effect(target, { name: "sha" }, player, player);
				});
			if (result.bool) {
				var target = result.targets[0];
				player.logSkill("sbwusheng", target);
				if (get.mode() !== "identity" || player.identity !== "nei") player.addExpose(0.25);
				player.addTempSkill("sbwusheng_effect", { player: "phaseUseAfter" });
				player.storage.sbwusheng_effect[target.playerid] = 0;
			}
		},
		group: "sbwusheng_wusheng",
		subSkill: {
			wusheng: {
				audio: "sbwusheng",
				enable: ["chooseToUse", "chooseToRespond"],
				hiddenCard: function (player, name) {
					return name == "sha" && player.countCards("hs");
				},
				filter: function (event, player) {
					return event.filterCard(get.autoViewAs({ name: "sha" }, "unsure"), player, event) || lib.inpile_nature.some(nature => event.filterCard(get.autoViewAs({ name: "sha", nature }, "unsure"), player, event));
				},
				chooseButton: {
					dialog: function (event, player) {
						var list = [];
						if (event.filterCard({ name: "sha" }, player, event)) list.push(["基本", "", "sha"]);
						for (var j of lib.inpile_nature) {
							if (event.filterCard({ name: "sha", nature: j }, player, event)) list.push(["基本", "", "sha", j]);
						}
						var dialog = ui.create.dialog("武圣", [list, "vcard"], "hidden");
						dialog.direct = true;
						return dialog;
					},
					check: function (button) {
						var player = _status.event.player;
						var card = { name: button.link[2], nature: button.link[3] };
						if (
							_status.event.getParent().type == "phase" &&
							game.hasPlayer(function (current) {
								return player.canUse(card, current) && get.effect(current, card, player, player) > 0;
							})
						) {
							switch (button.link[2]) {
								case "sha":
									if (button.link[3] == "fire") return 2.95;
									else if (button.link[3] == "thunder" || button.link[3] == "ice") return 2.92;
									else return 2.9;
							}
						}
						return 1 + Math.random();
					},
					backup: function (links, player) {
						return {
							audio: "sbwusheng",
							filterCard: true,
							check: function (card) {
								return 6 - get.value(card);
							},
							viewAs: { name: links[0][2], nature: links[0][3] },
							position: "hs",
							popname: true,
						};
					},
					prompt: function (links, player) {
						return "将一张手牌当作" + get.translation(links[0][3] || "") + "【" + get.translation(links[0][2]) + "】" + (_status.event.name == "chooseToUse" ? "使用" : "打出");
					},
				},
				ai: {
					respondSha: true,
					fireAttack: true,
					skillTagFilter: function (player, tag) {
						if (!player.countCards("hs")) return false;
					},
					order: function (item, player) {
						if (player && _status.event.type == "phase") {
							var max = 0;
							if (lib.inpile_nature.some(i => player.getUseValue({ name: "sha", nature: i }) > 0)) {
								var temp = get.order({ name: "sha" });
								if (temp > max) max = temp;
							}
							if (max > 0) max += 0.3;
							return max;
						}
						return 4;
					},
					result: { player: 1 },
				},
			},
			effect: {
				charlotte: true,
				onremove: true,
				init: function (player) {
					if (!player.storage.sbwusheng_effect) player.storage.sbwusheng_effect = {};
				},
				mod: {
					targetInRange: function (card, player, target) {
						if (card.name == "sha" && typeof player.storage.sbwusheng_effect[target.playerid] == "number") return true;
					},
					cardUsableTarget: function (card, player, target) {
						if (card.name !== "sha" || typeof player.storage.sbwusheng_effect[target.playerid] !== "number") return;
						return player.storage.sbwusheng_effect[target.playerid] < 3;
					},
					playerEnabled: function (card, player, target) {
						if (card.name != "sha" || typeof player.storage.sbwusheng_effect[target.playerid] != "number") return;
						if (player.storage.sbwusheng_effect[target.playerid] >= 3) return false;
					},
				},
				audio: "sbwusheng",
				trigger: { player: ["useCardToPlayered", "useCardAfter"] },
				filter: function (event, player) {
					if (event.card.name != "sha") return false;
					if (event.name == "useCard") return event.targets.some(target => typeof player.storage.sbwusheng_effect[target.playerid] == "number");
					return typeof player.storage.sbwusheng_effect[event.target.playerid] == "number";
				},
				direct: true,
				content: function () {
					if (trigger.name == "useCard") {
						var targets = trigger.targets.filter(target => typeof player.storage.sbwusheng_effect[target.playerid] == "number");
						targets.forEach(target => player.storage.sbwusheng_effect[target.playerid]++);
					} else {
						player.logSkill("sbwusheng_effect", trigger.target);
						player.draw(get.mode() === "identity" ? 2 : 1);
					}
				},
			},
		},
		ai: { threaten: 114514 },
	},
	sbyijue: {
		audio: 2,
		trigger: { global: "damageBegin4" },
		filter: function (event, player) {
			if (!event.source || event.source != player || event.player == player) return false;
			return event.num >= event.player.hp && !player.getStorage("sbyijue").includes(event.player);
		},
		forced: true,
		logTarget: "player",
		content: function () {
			trigger.cancel();
			player.addTempSkill("sbyijue_effect");
			player.markAuto("sbyijue", [trigger.player]);
			player.markAuto("sbyijue_effect", [trigger.player]);
		},
		ai: {
			neg: true,
		},
		marktext: "绝",
		intro: { content: "已放$一马" },
		subSkill: {
			effect: {
				charlotte: true,
				onremove: true,
				audio: "sbyijue",
				trigger: { player: "useCardToPlayer" },
				filter: function (event, player) {
					return player.getStorage("sbyijue_effect").includes(event.target);
				},
				forced: true,
				logTarget: "target",
				content: function () {
					trigger.getParent().excluded.add(trigger.target);
				},
				ai: {
					effect: {
						player_use(card, player, target) {
							if (player.getStorage("sbyijue_effect").includes(target)) return "zeroplayertarget";
						},
					},
				},
				marktext: "义",
				intro: { content: "本回合放$一马" },
			},
		},
	},
	//黄月英
	sbqicai: {
		mod: {
			targetInRange: function (card, player, target) {
				if (get.type2(card) == "trick") return true;
			},
		},
		locked: false,
		getLimit: 3,
		audio: 2,
		enable: "phaseUse",
		onChooseToUse: function (event) {
			if (!event.sbqicai && !game.online) {
				const player = get.player();
				const cards = Array.from(ui.discardPile.childNodes).filter(card => lib.skill.sbqicai.filterCardx(card, player));
				event.set("sbqicai", cards);
			}
		},
		filter: function (event, player) {
			return player.countCards("h", card => lib.skill.sbqicai.filterCardx(card, player)) || (event.sbqicai && event.sbqicai.length);
		},
		filterCardx: function (card, player) {
			if (player.getStorage("sbqicai").includes(card.name)) return false;
			return get.type(card) == "equip" && game.hasPlayer(target => target != player && target.hasEmptySlot(get.subtype(card)));
		},
		usable: 1,
		chooseButton: {
			dialog: function (event, player) {
				const list1 = player.getCards("h", card => lib.skill.sbqicai.filterCardx(card, player));
				const list2 = event.sbqicai;
				var dialog = ui.create.dialog('###奇才###<div class="text center">请选择一张装备牌置入一名其他角色的装备区</div>');
				if (list1.length) {
					dialog.add('<div class="text center">手牌区</div>');
					dialog.add(list1);
				}
				if (list2.length) {
					dialog.add('<div class="text center">弃牌堆</div>');
					dialog.add(list2);
					if (list1.length) dialog.classList.add("fullheight");
				}
				return dialog;
			},
			check: function (button) {
				var player = _status.event.player;
				var num = get.value(button.link);
				if (!game.hasPlayer(target => target != player && target.hasEmptySlot(get.subtype(button.link)) && get.attitude(player, target) > 0)) num = 1 / (get.value(button.link) || 0.5);
				if (get.owner(button.link)) return num;
				return num * 5;
			},
			backup: function (links, player) {
				return {
					audio: "sbqicai",
					card: links[0],
					filterCard: function (card, player) {
						var cardx = lib.skill.sbqicai_backup.card;
						if (get.owner(cardx)) return card == cardx;
						return false;
					},
					selectCard: -1,
					filterTarget: function (card, player, target) {
						return target != player && target.canEquip(lib.skill.sbqicai_backup.card);
					},
					check: () => 1,
					discard: false,
					lose: false,
					prepare: function (cards, player, targets) {
						if (cards && cards.length) player.$give(cards, targets[0], false);
					},
					content: function () {
						if (!cards || !cards.length) {
							cards = [lib.skill.sbqicai_backup.card];
							target.$gain2(cards);
							game.delayx();
						}
						if (get.mode() == "doudizhu") player.markAuto("sbqicai", [cards[0].name]);
						target.equip(cards[0]);
						player.addSkill("sbqicai_gain");
						lib.skill.sbqicai.updateCounter(player, target, 0);
					},
					ai: {
						result: {
							target: function (player, target) {
								var att = get.attitude(player, target);
								if (att > 0) return 3;
								if (att < 0) return -1;
								return 0;
							},
						},
					},
				};
			},
			prompt: function (links, player) {
				return "请选择置入" + get.translation(links) + "的角色";
			},
		},
		updateCounter: function (player, target, num) {
			const skill = `sbqicai_${player.playerid}`;
			game.broadcastAll(lib.skill.sbqicai.initSkill, skill);
			if (!target.hasSkill(skill)) target.addSkill(skill);
			if (num == 0) target.clearMark(skill, false);
			else if (num > 0) target.addMark(skill, num, false);
			if (target.countMark(skill) >= lib.skill.sbqicai.getLimit) target.removeSkill(skill);
			if (!_status.postReconnect.sbqicai) {
				_status.postReconnect.sbqicai = [lib.skill.sbqicai.initSkill, []];
			}
			_status.postReconnect.sbqicai[1].add(skill);
		},
		initSkill: skill => {
			if (!lib.skill[skill]) {
				lib.skill[skill] = {
					onremove: true,
					mark: true,
					marktext: "奇",
					intro: {
						markcount: function (storage) {
							return (storage || 0).toString();
						},
						content: function (storage) {
							return "已被掠夺" + get.cnNumber(storage || 0) + "张普通锦囊牌";
						},
					},
				};
				lib.translate[skill] = "奇才";
				lib.translate[skill + "_bg"] = "奇";
			}
		},
		ai: {
			order: 7,
			result: {
				player: function (player) {
					if (!game.hasPlayer(target => target != player && target.hasEmptySlot(2) && get.attitude(player, target) != 0)) return 0;
					return 1;
				},
			},
		},
		marktext: "才",
		intro: { content: "已使用$发动过此技能" },
		subSkill: {
			gain: {
				audio: "sbqicai",
				trigger: { global: ["gainAfter", "loseAsyncAfter"] },
				filter: function (event, player) {
					return game.hasPlayer(function (current) {
						if (!event.getg(current).length || !current.hasSkill("sbqicai_" + player.playerid)) return false;
						if (current.countMark("sbqicai_" + player.playerid) >= lib.skill.sbqicai.getLimit) return false;
						return event.getg(current).some(card => get.type(card) == "trick" && lib.filter.canBeGained(card, current, player));
					});
				},
				forced: true,
				direct: true,
				charlotte: true,
				content: function () {
					"step 0";
					if (!event.checkedTargets) event.checkedTargets = [];
					var target = game.findPlayer(function (current) {
						if (!trigger.getg(current).length || !current.hasSkill("sbqicai_" + player.playerid)) return false;
						if (event.checkedTargets.includes(current)) return false;
						if (current.countMark("sbqicai_" + player.playerid) >= lib.skill.sbqicai.getLimit) return false;
						return trigger.getg(current).some(card => get.type(card) == "trick" && lib.filter.canBeGained(card, current, player));
					});
					if (!target) {
						event.finish();
						return;
					}
					event.target = target;
					player.logSkill("sbqicai_gain", target);
					event.checkedTargets.add(target);
					var cards = trigger.getg(target).filter(card => get.type(card) == "trick" && lib.filter.canBeGained(card, target, player));
					if (cards.length <= lib.skill.sbqicai.getLimit - target.countMark("sbqicai_" + player.playerid)) event._result = { bool: true, links: cards };
					else {
						var num = lib.skill.sbqicai.getLimit - target.countMark("sbqicai_" + player.playerid);
						target
							.chooseButton(["奇才：将其中" + get.cnNumber(num) + "张牌交给" + get.translation(player), cards], num, true)
							.set("ai", function (button) {
								return get.value(button.link) * get.sgn(_status.event.att);
							})
							.set("att", get.attitude(target, player));
					}
					"step 1";
					if (result.bool) {
						game.delaye(0.5);
						target.give(result.links, player);
						lib.skill.sbqicai.updateCounter(player, target, result.links.length);
					}
					event.goto(0);
				},
			},
		},
	},
	sbjizhi: {
		audio: 2,
		trigger: { player: "useCard" },
		filter: function (event, player) {
			return get.type(event.card) == "trick";
		},
		forced: true,
		content: function () {
			player.draw().gaintag = ["sbjizhi"];
			player.addTempSkill("sbjizhi_mark");
		},
		subSkill: {
			mark: {
				charlotte: true,
				onremove: function (player) {
					player.removeGaintag("sbjizhi");
				},
				mod: {
					ignoredHandcard: function (card, player) {
						if (card.hasGaintag("sbjizhi")) return true;
					},
					cardDiscardable: function (card, player, name) {
						if (name == "phaseDiscard" && card.hasGaintag("sbjizhi")) return false;
					},
				},
			},
		},
	},
	//诸葛亮
	sbhuoji: {
		audio: 3,
		dutySkill: true,
		derivation: ["sbguanxing", "sbkongcheng"],
		group: ["sbhuoji_fire", "sbhuoji_achieve", "sbhuoji_fail", "sbhuoji_mark"],
		subSkill: {
			fire: {
				audio: "sbhuoji1.mp3",
				enable: "phaseUse",
				filterTarget: lib.filter.notMe,
				prompt: "选择一名其他角色，对其与其势力相同的所有其他角色各造成1点火属性伤害",
				usable: 1,
				line: "fire",
				content: function () {
					"step 0";
					target.damage("fire");
					"step 1";
					var targets = game.filterPlayer(current => {
						if (current == player || current == target) return false;
						return current.group == target.group;
					});
					if (targets.length) {
						game.delayx();
						player.line(targets, "fire");
						targets.forEach(i => i.damage("fire"));
					}
				},
				ai: {
					order: 7,
					fireAttack: true,
					result: {
						target: function (player, target) {
							var att = get.attitude(player, target);
							return (
								get.sgn(att) *
								game
									.filterPlayer(current => {
										if (current == player) return false;
										return current.group == target.group;
									})
									.reduce((num, current) => num + get.damageEffect(current, player, player, "fire"), 0)
							);
						},
					},
				},
			},
			achieve: {
				audio: "sbhuoji2.mp3",
				trigger: { player: "phaseZhunbeiBegin" },
				filter: function (event, player) {
					return player.getAllHistory("sourceDamage", evt => evt.hasNature("fire")).reduce((num, evt) => num + evt.num, 0) >= game.players.length + game.dead.length;
				},
				forced: true,
				locked: false,
				skillAnimation: true,
				animationColor: "fire",
				async content(event, trigger, player) {
					player.awakenSkill("sbhuoji");
					game.log(player, "成功完成使命");
					player.changeSkin("sbhuoji", "sb_zhugeliang");
					player.changeSkills(["sbguanxing", "sbkongcheng"], ["sbhuoji", "sbkanpo"]);
				},
			},
			fail: {
				audio: "sbhuoji3.mp3",
				trigger: { player: "dying" },
				forced: true,
				locked: false,
				content: function () {
					player.awakenSkill("sbhuoji");
					game.log(player, "使命失败");
				},
			},
			mark: {
				charlotte: true,
				trigger: { source: "damage" },
				filter: function (event, player) {
					return event.hasNature("fire");
				},
				firstDo: true,
				forced: true,
				popup: false,
				content: function () {
					player.addTempSkill("sbhuoji_count", {
						player: ["sbhuoji_achieveBegin", "sbhuoji_failBegin"],
					});
					player.storage.sbhuoji_count = player.getAllHistory("sourceDamage", evt => evt.hasNature("fire")).reduce((num, evt) => num + evt.num, 0);
					player.markSkill("sbhuoji_count");
				},
			},
			count: {
				charlotte: true,
				intro: { content: "本局游戏已造成过#点火属性伤害" },
			},
		},
	},
	sbkanpo: {
		init: function (player) {
			if (!player.storage.sbkanpo) {
				player.storage.sbkanpo = [get.mode() == "doudizhu" || (get.mode() == "versus" && _status.mode == "two") ? 2 : 4, [], []];
				player.markSkill("sbkanpo");
			}
		},
		audio: 2,
		trigger: { global: "roundStart" },
		filter: function (event, player) {
			var storage = player.storage.sbkanpo;
			return storage[0] || storage[1].length;
		},
		forced: true,
		locked: false,
		content: function* (event, map) {
			var player = map.player,
				storage = player.storage.sbkanpo;
			var sum = storage[0];
			storage[1] = [];
			player.markSkill("sbkanpo");
			if (!sum) return;
			const list = get.inpileVCardList(info => {
				if (info[2] == "sha" && info[3]) return false;
				return info[0] != "equip";
			});
			const func = () => {
				const event = get.event();
				const controls = [
					link => {
						const evt = get.event();
						if (evt.dialog && evt.dialog.buttons) {
							for (let i = 0; i < evt.dialog.buttons.length; i++) {
								const button = evt.dialog.buttons[i];
								button.classList.remove("selectable");
								button.classList.remove("selected");
								const counterNode = button.querySelector(".caption");
								if (counterNode) {
									counterNode.childNodes[0].innerHTML = ``;
								}
							}
							ui.selected.buttons.length = 0;
							game.check();
						}
						return;
					},
				];
				event.controls = [ui.create.control(controls.concat(["清除选择", "stayleft"]))];
			};
			if (event.isMine()) func();
			else if (event.isOnline()) event.player.send(func);
			var result = yield player
				.chooseButton(["看破：是否记录至多" + get.cnNumber(sum) + "个牌名？", [list, "vcard"]], [1, sum], false)
				.set("ai", function (button) {
					if (ui.selected.buttons.length >= Math.max(3, game.countPlayer() / 2)) return 0;
					switch (button.link[2]) {
						case "wuxie":
							return 5 + Math.random();
						case "sha":
							return 5 + Math.random();
						case "tao":
							return 4 + Math.random();
						case "jiu":
							return 3 + Math.random();
						case "lebu":
							return 3 + Math.random();
						case "shan":
							return 4.5 + Math.random();
						case "wuzhong":
							return 4 + Math.random();
						case "shunshou":
							return 2.7 + Math.random();
						case "nanman":
							return 2 + Math.random();
						case "wanjian":
							return 1.6 + Math.random();
						default:
							return 1.5 + Math.random();
					}
				})
				.set("filterButton", button => {
					return !_status.event.names.includes(button.link[2]);
				})
				.set("names", storage[2])
				.set("custom", {
					add: {
						confirm: function (bool) {
							if (bool != true) return;
							const event = get.event().parent;
							if (event.controls) event.controls.forEach(i => i.close());
							if (ui.confirm) ui.confirm.close();
							game.uncheck();
						},
						button: function () {
							if (ui.selected.buttons.length) return;
							const event = get.event();
							if (event.dialog && event.dialog.buttons) {
								for (let i = 0; i < event.dialog.buttons.length; i++) {
									const button = event.dialog.buttons[i];
									const counterNode = button.querySelector(".caption");
									if (counterNode) {
										counterNode.childNodes[0].innerHTML = ``;
									}
								}
							}
							if (!ui.selected.buttons.length) {
								const evt = event.parent;
								if (evt.controls) evt.controls[0].classList.add("disabled");
							}
						},
					},
					replace: {
						button: function (button) {
							const event = get.event(),
								sum = event.sum;
							if (!event.isMine()) return;
							if (button.classList.contains("selectable") == false) return;
							if (ui.selected.buttons.length >= sum) return false;
							button.classList.add("selected");
							ui.selected.buttons.push(button);
							let counterNode = button.querySelector(".caption");
							const count = ui.selected.buttons.filter(i => i == button).length;
							if (counterNode) {
								counterNode = counterNode.childNodes[0];
								counterNode.innerHTML = `×${count}`;
							} else {
								counterNode = ui.create.caption(`<span style="font-size:24px; font-family:xinwei; text-shadow:#FFF 0 0 4px, #FFF 0 0 4px, rgba(74,29,1,1) 0 0 3px;">×${count}</span>`, button);
								counterNode.style.right = "5px";
								counterNode.style.bottom = "2px";
							}
							const evt = event.parent;
							if (evt.controls) evt.controls[0].classList.remove("disabled");
							game.check();
						},
					},
				})
				.set("sum", sum);
			if (result.bool) {
				var names = result.links.map(link => link[2]);
				storage[0] -= names.length;
				storage[1] = names;
				storage[2] = names;
			} else storage[2] = [];
			player.markSkill("sbkanpo");
		},
		marktext: "破",
		intro: {
			markcount: function (storage) {
				return storage[1].length;
			},
			mark: function (dialog, content, player) {
				const storage = player.getStorage("sbkanpo");
				const sum = storage[0];
				const names = storage[1];
				dialog.addText("剩余可记录" + sum + "次牌名");
				if (player.isUnderControl(true) && names.length) {
					dialog.addText("当前记录牌名：");
					dialog.addSmall([names, "vcard"]);
				}
			},
		},
		group: "sbkanpo_kanpo",
		subSkill: {
			kanpo: {
				audio: "sbkanpo",
				trigger: { global: "useCard" },
				filter: function (event, player) {
					return event.player != player && player.storage.sbkanpo[1].includes(event.card.name);
				},
				prompt2: function (event, player) {
					return "移除" + get.translation(event.card.name) + "的记录，令" + get.translation(event.card) + "无效";
				},
				check: function (event, player) {
					var effect = 0;
					if (event.card.name == "wuxie" || event.card.name == "shan") {
						if (get.attitude(player, event.player) < -1) effect = -1;
					} else if (event.targets && event.targets.length) {
						for (var i = 0; i < event.targets.length; i++) {
							effect += get.effect(event.targets[i], event.card, event.player, player);
						}
					}
					if (effect < 0) {
						if (event.card.name == "sha") {
							var target = event.targets[0];
							if (target == player) return !player.countCards("h", "shan");
							else return target.hp == 1 || (target.countCards("h") <= 2 && target.hp <= 2);
						} else return true;
					}
					return false;
				},
				logTarget: "player",
				content: function () {
					player.storage.sbkanpo[1].remove(trigger.card.name);
					player.markSkill("sbkanpo");
					trigger.targets.length = 0;
					trigger.all_excluded = true;
					player.draw();
				},
			},
		},
	},
	sbguanxing: {
		audio: 2,
		trigger: { player: ["phaseZhunbeiBegin", "phaseJieshuBegin"] },
		filter: function (event, player) {
			var bool = player.hasCard(card => card.hasGaintag("sbguanxing"), "s");
			if (event.name == "phaseZhunbei") {
				return bool || 7 - lib.skill.sbguanxing.getNum * player.countMark("sbguanxingx") > 0;
			}
			return bool && player.hasSkill("sbguanxing_on");
		},
		forced: true,
		locked: false,
		content: function () {
			"step 0";
			if (trigger.name == "phaseJieshu") {
				event.goto(2);
				return;
			}
			player.addMark("sbguanxingx", 1, false);
			var cards = player.getCards("s", card => card.hasGaintag("sbguanxing"));
			if (cards.length) player.loseToDiscardpile(cards);
			var num = player.countMark("sbguanxingx") - 1;
			event.num = Math.max(0, 7 - lib.skill.sbguanxing.getNum * num);
			"step 1";
			if (num) {
				var cards2 = get.cards(num);
				player.$gain2(cards2, false);
				game.log(player, "将", cards2, "置于了武将牌上");
				player.loseToSpecial(cards2, "sbguanxing").visible = true;
				player.markSkill("sbguanxing");
			}
			"step 2";
			var cards = player.getCards("s", card => card.hasGaintag("sbguanxing"));
			if (cards.length) {
				player
					.chooseToMove()
					.set("list", [["你的“星”", cards], ["牌堆顶"]])
					.set("prompt", "观星：点击将牌移动到牌堆顶")
					.set("processAI", function (list) {
						var cards = list[0][1].slice(),
							player = _status.event.player;
						var name = _status.event.getTrigger().name;
						var target = name == "phaseZhunbei" ? player : player.getNext();
						var judges = target.getCards("j");
						var top = [],
							att = get.sgn(get.attitude(player, target));
						if (judges.length && att != 0 && (target != player || !player.hasWuxie())) {
							for (var i = 0; i < judges.length; i++) {
								var judge = (card, num) => get.judge(card) * num;
								cards.sort((a, b) => judge(b, att) - judge(a, att));
								if (judge(cards[0], att) < 0) break;
								else top.unshift(cards.shift());
							}
						}
						return [cards, top];
					})
					.set("filterOk", function (moved) {
						return moved[1].length;
					});
			} else event._result = { bool: false };
			"step 3";
			if (result.bool) {
				var cards = result.moved[1];
				player.loseToDiscardpile(cards, ui.cardPile, "insert").log = false;
				game.log(player, "将", cards, "置于了牌堆顶");
			} else if (trigger.name == "phaseZhunbei") player.addTempSkill("sbguanxing_on");
		},
		getNum: 3,
		group: "sbguanxing_unmark",
		subSkill: {
			on: { charlotte: true },
			unmark: {
				trigger: { player: "loseAfter" },
				filter: function (event, player) {
					if (!event.ss || !event.ss.length) return false;
					return !player.countCards("s", card => card.hasGaintag("sbguanxing"));
				},
				charlotte: true,
				forced: true,
				silent: true,
				content: function () {
					player.unmarkSkill("sbguanxing");
				},
			},
		},
		marktext: "星",
		intro: {
			mark: function (dialog, storage, player) {
				var cards = player.getCards("s", card => card.hasGaintag("sbguanxing"));
				if (!cards || !cards.length) return;
				dialog.addAuto(cards);
			},
			markcount: function (storage, player) {
				return player.countCards("s", card => card.hasGaintag("sbguanxing"));
			},
			onunmark: function (storage, player) {
				var cards = player.getCards("s", card => card.hasGaintag("sbguanxing"));
				if (cards.length) player.loseToDiscardpile(cards);
			},
		},
		mod: {
			aiOrder: function (player, card, num) {
				var cards = player.getCards("s", card => card.hasGaintag("sbguanxing"));
				if (get.itemtype(card) == "card" && card.hasGaintag("sbguanxing")) return num + (cards.length > 1 ? 0.5 : -0.0001);
			},
		},
	},
	sbkongcheng: {
		audio: 2,
		trigger: { player: ["damageBegin3", "damageBegin4"] },
		filter: function (event, player, name) {
			if (!player.hasSkill("sbguanxing")) return false;
			const num = player.countCards("s", card => card.hasGaintag("sbguanxing"));
			if (name == "damageBegin3" && !num) return true;
			if (name == "damageBegin4" && num) return true;
			return false;
		},
		forced: true,
		content: function () {
			"step 0";
			var num = player.countCards("s", card => card.hasGaintag("sbguanxing"));
			if (!num && event.triggername == "damageBegin3") {
				trigger.increase("num");
			} else if (num && event.triggername == "damageBegin4") {
				player
					.judge(function (result) {
						if (get.number(result) <= get.player().countCards("s", card => card.hasGaintag("sbguanxing"))) return 2;
						return -1;
					})
					.set("judge2", result => result.bool)
					.set("callback", function () {
						if (event.judgeResult.number <= player.countCards("s", card => card.hasGaintag("sbguanxing"))) {
							event.getParent("sbkongcheng").getTrigger().decrease("num");
						}
					});
			}
		},
		ai: {
			combo: "sbguanxing",
		},
	},
	//卢植
	sbzhenliang: {
		mark: true,
		locked: false,
		zhuanhuanji: true,
		marktext: "☯",
		intro: {
			content: function (storage, player) {
				if (storage) return "你的回合外，一名角色使用或打出牌结算完成后，若此牌与“任”类别相同，则你可以令一名角色摸两张牌。";
				return "出牌阶段限一次，你可以弃置一张与“任”颜色相同的牌并对攻击范围内的一名角色造成1点伤害。";
			},
		},
		audio: 2,
		enable: "phaseUse",
		filter: function (event, player) {
			if (player.storage.sbzhenliang) return false;
			var storage = player.getExpansions("nzry_mingren");
			if (!storage.length) return false;
			var color = get.color(storage[0]);
			return game.hasPlayer(function (current) {
				return (
					player.inRange(current) &&
					player.countCards("he", function (card) {
						return get.color(card) == color;
					}) >= Math.max(1, Math.abs(player.getHp() - current.getHp()))
				);
			});
		},
		filterCard: function (card, player) {
			return get.color(card) == get.color(player.getExpansions("nzry_mingren")[0]);
		},
		selectCard: [1, Infinity],
		complexSelect: true,
		complexCard: true,
		position: "he",
		filterTarget: function (card, player, target) {
			return player.inRange(target) && ui.selected.cards.length == Math.max(1, Math.abs(player.getHp() - target.getHp()));
		},
		check: function (card) {
			return 6.5 - get.value(card);
		},
		prompt: "弃置与攻击范围内的一名角色体力值之差（至少为1）张与“任”颜色相同的牌，对其造成1点伤害",
		content: function () {
			player.changeZhuanhuanji("sbzhenliang");
			target.damage("nocard");
		},
		ai: {
			order: 5,
			result: {
				player: function (player, target) {
					return get.damageEffect(target, player, player);
				},
			},
			combo: "nzry_mingren",
		},
		group: "sbzhenliang_draw",
		subSkill: {
			draw: {
				trigger: { global: ["useCardAfter", "respondAfter"] },
				filter: function (event, player) {
					if (_status.currentPhase == player || !player.storage.sbzhenliang) return false;
					var card = player.getExpansions("nzry_mingren")[0];
					return card && get.type2(event.card) == get.type2(card);
				},
				direct: true,
				content: function () {
					"step 0";
					player.chooseTarget(get.prompt("sbzhenliang"), "令一名角色摸两张牌").set("ai", function (target) {
						if (target.hasSkillTag("nogain")) return 0.1;
						var att = get.attitude(player, target);
						return att * (Math.max(5 - target.countCards("h"), 2) + 3);
					});
					"step 1";
					if (result.bool) {
						var target = result.targets[0];
						player.changeZhuanhuanji("sbzhenliang");
						player.logSkill("sbzhenliang", target);
						target.draw(2);
					}
				},
			},
		},
	},
	//小乔
	sbtianxiang: {
		audio: 2,
		enable: "phaseUse",
		filter: function (event, player) {
			return player.countCards("he", card => lib.skill.sbtianxiang.filterCard(card, player)) && game.hasPlayer(target => lib.skill.sbtianxiang.filterTarget(null, player, target));
		},
		filterCard: function (card, player) {
			return get.color(card, player) == "red";
		},
		filterTarget: function (card, player, target) {
			return target != player && !target.getSkills().some(skill => skill.indexOf("sbtianxiang_") == 0);
		},
		discard: false,
		lose: false,
		delay: 0,
		usable: 3,
		prompt: "将一张红色牌交给一名角色并令其获得此花色的“天香”标记",
		content: function () {
			player.give(cards, target);
			var suit = get.suit(cards[0], player);
			target.addSkill("sbtianxiang_" + suit);
		},
		ai: {
			order: 5,
			result: { target: -1 },
		},
		group: ["sbtianxiang_draw", "sbtianxiang_effect"],
		subSkill: {
			heart: {
				charlotte: true,
				mark: true,
				marktext: "♥︎",
				intro: { content: "伤害转移术" },
			},
			diamond: {
				charlotte: true,
				mark: true,
				marktext: "♦︎",
				intro: { content: "掳掠大法" },
			},
			draw: {
				audio: "sbtianxiang",
				trigger: { player: "phaseZhunbeiBegin" },
				filter: function (event, player) {
					return game.hasPlayer(target => target.getSkills().some(skill => skill.indexOf("sbtianxiang_") == 0));
				},
				forced: true,
				locked: false,
				content: function () {
					var num = 0;
					game.countPlayer(target => {
						var skills = target.getSkills().filter(skill => skill.indexOf("sbtianxiang_") == 0);
						target.removeSkill(skills);
						num += skills.length;
					});
					if (get.mode() != "identity") num += 2;
					player.draw(num);
				},
			},
			effect: {
				trigger: { player: "damageBegin3" },
				filter: function (event, player) {
					return game.hasPlayer(target => target.getSkills().some(skill => skill.indexOf("sbtianxiang_") == 0));
				},
				direct: true,
				content: function () {
					"step 0";
					player
						.chooseTarget(get.prompt("sbtianxiang"), "移去一名角色的“天香”标记并执行相应效果", function (card, player, target) {
							return target.getSkills().some(skill => skill.indexOf("sbtianxiang_") == 0);
						})
						.set("ai", target => {
							var player = _status.event.player;
							return -get.attitude(player, target) * target.getSkills().filter(skill => skill.indexOf("sbtianxiang_") == 0).length;
						});
					"step 1";
					if (result.bool) {
						var target = result.targets[0];
						event.target = target;
						player.logSkill("sbtianxiang", target);
						var skills = target.getSkills().filter(skill => skill.indexOf("sbtianxiang_") == 0);
						target.removeSkill(skills);
						if (skills.includes("sbtianxiang_heart")) {
							target.damage(trigger.source ? trigger.source : "nosource");
							trigger.cancel();
						}
						if (skills.includes("sbtianxiang_diamond")) {
							var cards = target.getCards("he");
							if (!cards.length) event.finish();
							else if (cards.length <= 2) event._result = { bool: true, cards: cards };
							else target.chooseCard("he", 2, "天香：交给" + get.translation(player) + "两张牌", true);
						} else event.finish();
					} else event.finish();
					"step 2";
					if (result.bool) player.gain(result.cards, target, "giveAuto");
				},
			},
		},
	},
	//张郃
	sbqiaobian: {
		audio: 2,
		trigger: { player: ["phaseJudgeBefore", "phaseDrawBefore", "phaseUseBefore"] },
		usable: 1,
		direct: true,
		content: function () {
			"step 0";
			switch (trigger.name) {
				case "phaseJudge":
					player
						.chooseTarget(get.prompt("sbqiaobian"), "失去1点体力并跳过判定阶段，将判定区里的牌移动给一名其他角色", lib.filter.notMe)
						.set("ai", function (target) {
							var player = _status.event.player;
							if (
								player.hp +
									player.countCards("h", function (card) {
										var mod2 = game.checkMod(card, player, "unchanged", "cardEnabled2", player);
										if (mod2 != "unchanged") return mod2;
										var mod = game.checkMod(card, player, player, "unchanged", "cardSavable", player);
										if (mod != "unchanged") return mod;
										var savable = get.info(card).savable;
										if (typeof savable == "function") savable = savable(card, player, player);
										return savable;
									}) <=
								1
							)
								return 0;
							var eff = 0;
							for (var card of player.getCards("j")) {
								var cardx;
								if (card.viewAs) cardx = get.autoViewAs({ name: card.viewAs }, [card]);
								else cardx = card;
								if (target.canAddJudge(cardx)) eff += get.effect(target, cardx, player, player);
								else eff -= get.attitude(player, target) / 114514;
							}
							return eff;
						})
						.setHiddenSkill("sbqiaobian");
					break;
				case "phaseDraw":
					player.chooseBool(get.prompt("sbqiaobian"), "跳过摸牌阶段，于下个准备阶段摸五张牌并回复1点体力").setHiddenSkill("sbqiaobian");
					break;
				case "phaseUse":
					var num = player.countCards("h") - 6;
					if (num <= 0) player.chooseBool(get.prompt("sbqiaobian"), "跳过出牌阶段和弃牌阶段，然后移动场上的一张牌").set("choice", player.canMoveCard(true)).setHiddenSkill("sbqiaobian");
					else
						player
							.chooseToDiscard(get.prompt("sbqiaobian"), num, "弃置" + get.cnNumber(num) + "张手牌并跳过出牌阶段和弃牌阶段，然后移动场上的一张牌")
							.set("ai", function (card) {
								var player = _status.event.player;
								if (!player.canMoveCard(true) || player.countCards("hs", card => player.hasValueTarget(card)) >= 9) return 0;
								return 7 - get.value(card);
							})
							.setHiddenSkill("sbqiaobian").logSkill = "sbqiaobian";
					break;
			}
			"step 1";
			if (result.bool) {
				trigger.cancel();
				switch (trigger.name) {
					case "phaseJudge":
						var target = result.targets[0];
						player.logSkill("sbqiaobian", target);
						player.loseHp();
						game.log(player, "跳过了判定阶段");
						for (var card of player.getCards("j")) {
							if (target.canAddJudge(card)) {
								player.$give(card, target, false);
								if (card.viewAs) target.addJudge({ name: card.viewAs }, [card]);
								else target.addJudge(card);
							} else player.discard(card);
						}
						break;
					case "phaseDraw":
						player.logSkill("sbqiaobian");
						game.log(player, "跳过了摸牌阶段");
						player.addSkill("sbqiaobian_draw");
						break;
					case "phaseUse":
						if (!result.cards || !result.cards.length) player.logSkill("sbqiaobian", target);
						player.skip("phaseDiscard");
						game.log(player, "跳过了出牌阶段");
						game.log(player, "跳过了弃牌阶段");
						player.moveCard();
						break;
				}
			} else player.storage.counttrigger.sbqiaobian--;
		},
		subSkill: {
			draw: {
				charlotte: true,
				mark: true,
				intro: { content: "准备阶段摸五张牌并回复1点体力" },
				audio: "sbqiaobian",
				trigger: { player: "phaseZhunbeiBegin" },
				forced: true,
				content: function () {
					player.removeSkill("sbqiaobian_draw");
					player.draw(5);
					player.recover();
				},
			},
		},
	},
	//萌货
	sbhuoshou: {
		audio: 2,
		trigger: {
			player: "phaseUseBegin",
		},
		filter: function (event, player) {
			return true;
		},
		forced: true,
		onremove: true,
		group: ["sbhuoshou_cancel", "sbhuoshou_source", "sbhuoshou_nanmaned"],
		content: function () {
			"step 0";
			var card = get.discardPile(card => {
				return card.name == "nanman";
			});
			if (card) {
				player.gain(card, "gain2");
			} else {
				game.log("但是弃牌堆里并没有", "#y南蛮入侵", "！");
				player.addMark("sbhuoshou", 1, false);
				if (player.countMark("sbhuoshou") >= 5 && Math.random() < 0.25) player.chat("我南蛮呢");
			}
		},
		subSkill: {
			cancel: {
				audio: "sbhuoshou",
				trigger: { target: "useCardToBefore" },
				forced: true,
				priority: 15,
				filter: function (event, player) {
					return event.card.name == "nanman";
				},
				content: function () {
					trigger.cancel();
				},
			},
			source: {
				audio: "sbhuoshou",
				trigger: { global: "useCardToPlayered" },
				forced: true,
				filter: function (event, player) {
					return event.isFirstTarget && event.card && event.card.name == "nanman" && event.player != player;
				},
				content: function () {
					trigger.getParent().customArgs.default.customSource = player;
				},
			},
			nanmaned: {
				trigger: {
					player: "useCard1",
				},
				filter: function (event, player) {
					return event.card.name == "nanman";
				},
				forced: true,
				popup: false,
				charlotte: true,
				content: function () {
					"step 0";
					player.addTempSkill("sbhuoshou_ban", "phaseUseAfter");
				},
			},
			ban: {
				charlotte: true,
				intro: {
					content: "此阶段不能再使用【南蛮入侵】",
				},
			},
		},
		mod: {
			cardEnabled: function (card, player) {
				if (player.hasSkill("sbhuoshou_ban") && card.name == "nanman") return false;
			},
		},
		ai: {
			threaten: 1.9,
		},
	},
	sbzaiqi: {
		audio: 2,
		trigger: {
			player: "phaseDiscardEnd",
		},
		chargeSkill: true,
		filter: function (event, player) {
			return player.hasMark("charge");
		},
		group: "sbzaiqi_backflow",
		direct: true,
		content: function () {
			"step 0";
			player.chooseTarget(get.prompt("sbzaiqi"), "选择任意名角色并消耗等量蓄力值，令这些角色选择一项：1.令你摸一张牌；2.弃置一张牌，然后你回复1点体力", [1, player.countMark("charge")]).set("ai", function (target) {
				var player = _status.event.player;
				var att = get.attitude(player, target);
				return 3 - get.sgn(att) + Math.abs(att / 1000);
			});
			"step 1";
			if (result.bool) {
				var targets = result.targets;
				targets.sortBySeat();
				event.targets = targets;
				player.logSkill("sbzaiqi", targets);
				player.removeMark("charge", targets.length);
			} else event.finish();
			"step 2";
			var target = targets.shift();
			event.target = target;
			if (!target.countCards("he")) event._result = { bool: false };
			else
				target
					.chooseToDiscard(get.translation(player) + "对你发动了【再起】", "是否弃置一张牌令其回复1点体力？或者点击“取消”，令该角色摸一张牌。", "he")
					.set("ai", card => {
						var eff = _status.event.eff,
							att = _status.event.att;
						if ((eff > 0 && att > 0) || (eff <= 0 && att < 0)) return 5.5 - get.value(card);
						return 0;
					})
					.set("eff", get.recoverEffect(player, player, target))
					.set("att", get.attitude(target, player));
			"step 3";
			target.line(player);
			if (result.bool) {
				player.recover();
			} else {
				player.draw();
			}
			game.delayex();
			if (targets.length) event.goto(2);
		},
		subSkill: {
			backflow: {
				audio: "sbzaiqi",
				trigger: {
					//player:'enterGame',
					source: "damageSource",
					//global:'phaseBefore',
				},
				usable: 1,
				filter: function (event, player) {
					if (event.name == "damage") return true;
					return event.name != "phase" || game.phaseNumber == 0;
				},
				forced: true,
				locked: false,
				content: function () {
					player.addMark("charge", trigger.name == "damage" ? 1 : 3);
				},
			},
		},
	},
	//祝融
	sblieren: {
		audio: 2,
		trigger: { player: "useCardToPlayered" },
		filter: function (event, player) {
			return event.targets.length == 1 && event.card.name == "sha" && player.canCompare(event.target, true);
		},
		check: function (event, player) {
			return get.attitude(player, event.target) <= 0 || game.hasPlayer(current => get.damageEffect(current, player, player) > 0);
		},
		shaRelated: true,
		logTarget: "target",
		content: function () {
			"step 0";
			player.draw();
			"step 1";
			if (player.canCompare(trigger.target)) player.chooseToCompare(trigger.target);
			else event.finish();
			"step 2";
			if (result.bool) {
				player.addTempSkill("sblieren_damage");
				if (!trigger.card.storage) trigger.card.storage = {};
				trigger.card.storage.sblieren = [player, trigger.target];
			}
		},
		subSkill: {
			damage: {
				audio: "sblieren",
				trigger: { global: "useCardAfter" },
				filter: function (event, player) {
					return (
						event.card.name == "sha" &&
						event.card.storage &&
						event.card.storage.sblieren &&
						event.card.storage.sblieren[0] == player &&
						game.hasPlayer(current => {
							return !event.card.storage.sblieren.includes(current);
						})
					);
				},
				direct: true,
				charlotte: true,
				content: function () {
					"step 0";
					var target = trigger.card.storage.sblieren[1];
					player
						.chooseTarget("烈刃：是否对除" + get.translation(target) + "外的一名其他角色造成1点伤害？", (card, player, target) => {
							return target != _status.event.targeted && target != player;
						})
						.set("targeted", target)
						.set("ai", targetx => get.damageEffect(targetx, _status.event.player, _status.event.player));
					"step 1";
					if (result.bool) {
						var target = result.targets[0];
						player.logSkill("sblieren_damage", target);
						target.damage();
					}
				},
			},
		},
	},
	sbjuxiang: {
		audio: 2,
		trigger: {
			player: "phaseJieshuBegin",
		},
		forced: true,
		direct: true,
		filter: function (event, player) {
			return !player.hasHistory("useCard", evt => evt.card.name == "nanman") && (!_status.sbjuxiang_nanman || _status.sbjuxiang_nanman.length);
		},
		group: ["sbjuxiang_cancel", "sbjuxiang_gain"],
		content: function () {
			"step 0";
			if (!_status.sbjuxiang_nanman) {
				_status.sbjuxiang_nanman = [
					{ name: "nanman", number: 7, suit: "spade" },
					{ name: "nanman", number: 7, suit: "club" },
				];
				game.broadcastAll(function () {
					if (!lib.inpile.includes("nanman")) lib.inpile.add("nanman");
				});
			}
			player.chooseTarget(get.prompt("sbjuxiang"), "将游戏外的随机一张【南蛮入侵】交给一名角色（剩余" + get.cnNumber(_status.sbjuxiang_nanman.length) + "张）").set("ai", target => {
				var player = _status.event.player;
				return Math.max(0, target.getUseValue({ name: "nanman" })) * get.attitude(player, target) * (target == player ? 0.5 : 1);
			});
			"step 1";
			if (result.bool) {
				var target = result.targets[0];
				player.logSkill("sbjuxiang", target);
				if (!_status.sbjuxiang_nanman.length) return;
				var info = _status.sbjuxiang_nanman.randomRemove();
				var card = game.createCard2(info);
				target.gain(card, "gain2").giver = player;
			}
		},
		ai: {
			expose: 0.05,
			effect: {
				target: function (card) {
					if (card.name == "nanman") return [0, 1];
				},
			},
		},
		subSkill: {
			cancel: {
				audio: "sbjuxiang",
				trigger: { target: "useCardToBefore" },
				forced: true,
				priority: 15,
				filter: function (event, player) {
					return event.card.name == "nanman";
				},
				content: function () {
					trigger.cancel();
				},
			},
			gain: {
				audio: "sbjuxiang",
				trigger: { global: "useCardAfter" },
				forced: true,
				filter: function (event, player) {
					return event.card.name == "nanman" && event.player != player && event.cards.filterInD().length;
				},
				content: function () {
					player.gain(trigger.cards.filterInD(), "gain2");
				},
			},
		},
	},
	//阿笨
	sbjiang: {
		audio: 2,
		trigger: {
			player: "useCardToPlayered",
			target: "useCardToTargeted",
		},
		shaRelated: true,
		filter: function (event, player) {
			if (!(event.card.name == "juedou" || (event.card.name == "sha" && get.color(event.card) == "red"))) return false;
			return true;
		},
		frequent: true,
		onremove: true,
		group: ["sbjiang_add", "sbjiang_qiben"],
		content: function () {
			player.draw();
		},
		ai: {
			effect: {
				target_use(card, player, target) {
					if (card.name == "sha" && get.color(card) == "red") return [1, 0.6];
				},
				player_use(card, player, target) {
					if (card.name == "sha" && get.color(card) == "red") return [1, 1];
				},
			},
		},
		subSkill: {
			add: {
				audio: "sbjiang",
				trigger: { player: "useCard2" },
				direct: true,
				filter: function (event, player) {
					if (event.card.name != "juedou") return false;
					var info = get.info(event.card);
					if (info.allowMultiple == false) return false;
					if (event.targets && !info.multitarget) {
						if (
							game.hasPlayer(function (current) {
								return !event.targets.includes(current) && lib.filter.targetEnabled2(event.card, player, current) && lib.filter.targetInRange(event.card, player, current);
							})
						) {
							return true;
						}
					}
					return false;
				},
				content: function () {
					"step 0";
					var prompt2 = "为" + get.translation(trigger.card) + "额外指定一个目标，然后失去1点体力";
					player
						.chooseTarget(get.prompt("sbjiang_add"), function (card, player, target) {
							var player = _status.event.player;
							if (_status.event.targets.includes(target)) return false;
							return lib.filter.targetEnabled2(_status.event.card, player, target);
						})
						.set("prompt2", prompt2)
						.set("ai", function (target) {
							var trigger = _status.event.getTrigger();
							var player = _status.event.player;
							var eff = get.effect(target, trigger.card, player, player);
							if (player.hasZhuSkill("sbzhiba") && !player.hasMark("sbjiang")) return eff;
							if (eff + get.effect(player, { name: "losehp" }, player) / 8 > 0) return eff;
							return 0;
						})
						.set("targets", trigger.targets)
						.set("card", trigger.card);
					"step 1";
					if (result.bool) {
						if (!event.isMine() && !event.isOnline()) game.delayx();
						event.targets = result.targets;
					} else {
						event.finish();
					}
					"step 2";
					if (event.targets) {
						player.logSkill("sbjiang_add", event.targets);
						trigger.targets.addArray(event.targets);
						player.loseHp();
					}
				},
			},
			qiben: {
				audio: "sbjiang",
				enable: "phaseUse",
				viewAs: { name: "juedou" },
				filterCard: true,
				position: "h",
				selectCard: -1,
				prompt: function () {
					var player = _status.event.player;
					var limit = player.hasMark("sbjiang")
						? game.countPlayer(current => {
								return current.group == "wu" && current != player;
							}) + 1
						: 1;
					return "出牌阶段限" + get.cnNumber(limit) + "次。你可以将所有手牌当【决斗】使用";
				},
				filter: function (event, player) {
					var limit = player.hasMark("sbjiang")
						? game.countPlayer(current => {
								return current.group == "wu" && current != player;
							}) + 1
						: 1;
					if ((player.getStat("skill").sbjiang_qiben || 0) >= limit) return false;
					var hs = player.getCards("h");
					if (!hs.length) return false;
					for (var i = 0; i < hs.length; i++) {
						var mod2 = game.checkMod(hs[i], player, "unchanged", "cardEnabled2", player);
						if (mod2 === false) return false;
					}
					return event.filterCard(get.autoViewAs({ name: "juedou" }, hs));
				},
				ai: {
					order: 0.001,
					nokeep: true,
					skillTagFilter: function (player, tag, arg) {
						if (tag === "nokeep") {
							if (arg && (!arg.card || get.name(arg.card) !== "tao")) return false;
							let limit = player.hasMark("sbjiang")
								? game.countPlayer(current => {
										return current.group == "wu" && current != player;
									}) + 1
								: 1;
							return player.isPhaseUsing() && (player.getStat("skill").sbjiang_qiben || 0) < limit && player.hasCard(card => get.name(card) != "tao", "h");
						}
					},
				},
			},
		},
	},
	sbhunzi: {
		audio: 2,
		trigger: { player: "dyingAfter" },
		juexingji: true,
		forced: true,
		skillAnimation: true,
		animationColor: "wood",
		derivation: ["sbyingzi", "gzyinghun"],
		content: function () {
			"step 0";
			player.awakenSkill("sbhunzi");
			player.loseMaxHp();
			"step 1";
			player.changeHujia(1, null, true);
			"step 2";
			player.draw(3);
			"step 3";
			player.addSkills(["sbyingzi", "gzyinghun"]);
		},
		ai: {
			threaten: function (player, target) {
				if (target.hp == 1) return 2;
				return 0.5;
			},
			maixie: true,
			effect: {
				target: function (card, player, target) {
					if (!target.hasFriend() || target.hp > 1) return;
					if (get.tag(card, "damage") == 1 && ((target.hasZhuSkill("sbzhiba") && game.countPlayer(current => current != target && current.group == "wu")) || player.countCards("hs", card => player.canSaveCard(card, target)) + target.countCards("hs", card => target.canSaveCard(card, target)) > 0) && !target.isTurnedOver() && _status.currentPhase != target && get.distance(_status.currentPhase, target, "absolute") <= 3) return [0.5, 1];
				},
			},
		},
	},
	sbzhiba: {
		audio: 2,
		trigger: { player: "dying" },
		filter: function (event, player) {
			if (!player.hasZhuSkill("sbzhiba")) return false;
			return player.hp <= 0;
		},
		zhuSkill: true,
		limited: true,
		mark: true,
		skillAnimation: true,
		animationColor: "wood",
		content: function () {
			"step 0";
			player.awakenSkill("sbzhiba");
			event.targets = game
				.filterPlayer(current => {
					return current.group == "wu" && current != player;
				})
				.sortBySeat(_status.currentPhase);
			var num = event.targets.length;
			if (num > 0) player.recover(num);
			player.addMark("sbjiang", 1, false);
			player.addTempSkill("sbzhiba_draw");
			if (!event.targets.length) event.finish();
			"step 1";
			var target = targets.shift();
			target.damage("nosource");
			if (targets.length) event.redo();
		},
		subSkill: {
			draw: {
				trigger: { global: "dieAfter" },
				filter: function (event, player) {
					return event.getParent(3).name == "sbzhiba";
				},
				forced: true,
				charlotte: true,
				content: function () {
					player.draw(3);
				},
			},
		},
	},
	//大乔
	sbguose: {
		audio: 2,
		enable: "phaseUse",
		get usable() {
			return get.mode() == "identity" ? 4 : 2;
		},
		discard: false,
		lose: false,
		delay: false,
		filter: function (event, player) {
			return player.hasCard(card => get.suit(card) == "diamond", "hes") || game.hasPlayer(current => current.hasJudge("lebu"));
		},
		position: "hes",
		filterCard: function (card, player) {
			if (get.suit(card) != "diamond") return false;
			var mod = game.checkMod(ui.selected.cards[0], player, "unchanged", "cardEnabled2", player);
			if (!mod) return false;
			return true;
		},
		selectCard: [0, 1],
		filterTarget: function (card, player, target) {
			if (!ui.selected.cards.length) {
				if (target.hasJudge("lebu")) return true;
				return false;
			}
			if (player == target) return false;
			return player.canUse(get.autoViewAs({ name: "lebu" }, ui.selected.cards), target);
		},
		complexSelect: true,
		check: function (card) {
			return 7 - get.value(card);
		},
		content: function () {
			"step 0";
			if (target.hasJudge("lebu")) {
				target.discard(target.getJudge("lebu"));
			} else {
				player.useCard({ name: "lebu" }, target, cards).audio = false;
			}
			"step 1";
			player.draw();
		},
		ai: {
			result: {
				target: function (player, target) {
					if (target.hasJudge("lebu")) return -get.effect(target, { name: "lebu" }, player, target);
					return get.effect(target, { name: "lebu" }, player, target);
				},
			},
			order: 9,
		},
	},
	sbliuli: {
		audio: 2,
		inherit: "liuli",
		group: "sbliuli_heart",
		subSkill: {
			heart: {
				trigger: { player: "logSkill" },
				filter: function (event, player) {
					if (event.skill != "sbliuli") return false;
					if (player.hasSkill("sbliuli_used")) return false;
					var evt = event.log_event;
					return player.hasHistory("lose", evtx => {
						return evtx.getParent(2) == evt && get.suit(evtx.cards[0]) == "heart";
					});
				},
				direct: true,
				content: function () {
					"step 0";
					var sourcex = trigger.log_event.getTrigger().player;
					player
						.chooseTarget("流离：是否令一名不为" + get.translation(sourcex) + "的其他角色获得“流离”标记？", (card, player, target) => {
							return target != player && target != _status.event.sourcex;
						})
						.set("ai", target => {
							return get.attitude(_status.event.player, target);
						})
						.set("sourcex", sourcex);
					"step 1";
					if (result.bool) {
						var target = result.targets[0];
						player.line(target, "green");
						game.countPlayer(i => i.removeSkill("sbliuli_dangxian"));
						target.addSkill("sbliuli_dangxian");
						player.addTempSkill("sbliuli_used");
					}
				},
			},
			used: { charlotte: true },
			dangxian: {
				trigger: { player: "phaseBegin" },
				forced: true,
				charlotte: true,
				mark: true,
				marktext: "流",
				intro: { content: "回合开始时，执行一个额外的出牌阶段" },
				content: function () {
					var next = player.phaseUse();
					event.next.remove(next);
					trigger.next.push(next);
					player.removeSkill("sbliuli_dangxian");
				},
			},
		},
	},
	//刘表
	sbzishou: {
		audio: 2,
		trigger: { global: "phaseJieshuBegin" },
		filter: function (event, player) {
			if (player == event.player) return false;
			if (!event.player.countCards("he")) return false;
			return (
				!event.player.hasAllHistory("sourceDamage", evt => {
					return evt.player == player;
				}) &&
				!event.player.hasAllHistory("damage", evt => {
					return evt.source == player;
				})
			);
		},
		forced: true,
		logTarget: "player",
		content: function () {
			"step 0";
			trigger.player.chooseCard(true, get.translation(player) + "对你发动了【自守】", "交给其一张牌", "he");
			"step 1";
			if (result.bool) {
				trigger.player.give(result.cards, player);
			}
		},
		ai: {
			threaten: 3,
		},
	},
	sbzongshi: {
		audio: 2,
		trigger: { player: "damageEnd" },
		filter: function (event, player) {
			if (!event.source || !event.source.isIn()) return false;
			return !player.getStorage("sbzongshi").includes(event.source);
		},
		forced: true,
		onremove: true,
		logTarget: "source",
		content: function () {
			trigger.source.chooseToDiscard(true, trigger.source.countCards("h"));
			player.markAuto("sbzongshi", [trigger.source]);
		},
		intro: {
			content: "已扒过目标：$",
		},
		ai: {
			threaten: 0.5,
			effect: {
				target: function (card, player, target, current) {
					if (player._sbzongshi_aiChecking) return;
					if (!get.tag(card, "damage")) return;
					var cards = player.getCards("h");
					if (!target.hasFriend()) return;
					player._sbzongshi_aiChecking = true;
					var value = cards.reduce((p, c) => {
						return p + get.value(c);
					}, 0);
					delete player._sbzongshi_aiChecking;
					if (cards.length > 5 || value > 5 * cards.length) return [1, 0, 0, -cards.length / 2];
					return [1, 0, 0, -0.5];
				},
			},
		},
	},
	//貂蝉
	sblijian: {
		audio: 2,
		enable: "phaseUse",
		filter: function (event, player) {
			return (
				!player.getStat("skill").sblijian &&
				game.countPlayer(current => {
					return current != player;
				}) > 1
			);
		},
		filterCard: true,
		selectCard: [1, Infinity],
		position: "he",
		filterTarget: lib.filter.notMe,
		selectTarget: function () {
			return ui.selected.cards.length + 1;
		},
		filterOk: function () {
			return ui.selected.targets.length == ui.selected.cards.length + 1;
		},
		check: function (card) {
			let player = get.owner(card),
				targets = lib.skill.sblijian.selectTargetAi(_status.event, player);
			if (ui.selected.cards.length < targets - 1) {
				if (player.hasSkill("sbbiyue")) return 4 * targets - get.value(card);
				return 6 + targets - get.value(card);
			}
			return 0;
		},
		selectTargetAi: (event, player) => {
			let cache = _status.event.getTempCache("sblijian", "targets");
			if (Array.isArray(cache)) return cache.length;
			let targets = [],
				cards = [0],
				sbbiyue = player.hasSkill("sbbiyue")
					? Math.max(
							0,
							3 -
								game.countPlayer2(current => {
									return current.getHistory("damage").length > 0;
								})
						)
					: 0,
				alter = [null, 1, 1],
				temp;
			for (let i of game.players) {
				if (player === i) continue;
				let vplayer = ui.create.player(i);
				temp = get.effect(i, new lib.element.VCard({ name: "juedou", isCard: true }), vplayer, i);
				vplayer.remove();
				if (temp) {
					let att = get.attitude(event.player, i);
					if ((!att && sbbiyue) || att * temp > 0) targets.push([i, temp, att]);
					else if (!alter[2]) continue;
					else if (!att || (att > 0 && temp > -15 && i.hp > 2) || (att < 0 && temp < 15)) alter = [i, temp, att];
				}
			}
			targets.sort((a, b) => {
				if (Boolean(a[2]) !== Boolean(b[2])) return Math.abs(b[2]) - Math.abs(a[2]);
				return Math.abs(b[1]) - Math.abs(a[1]);
			});
			if (targets.length < 2 && alter[0]) targets.push(alter);
			targets = targets.slice(
				0,
				1 +
					player.countCards("he", card => {
						if (lib.filter.cardDiscardable(card, player, "sblijian")) {
							cards.push(get.value(card));
							return true;
						}
						return false;
					})
			);
			cards.sort((a, b) => a - b);
			for (let i = 0; i < targets.length; i++) {
				if (Math.abs(targets[i][1]) < cards[i] / (1 + sbbiyue)) {
					targets.splice(i, targets.length - i);
					break;
				}
			}
			if (targets.length < 2) {
				event.putTempCache("sblijian", "targets", []);
				return 0;
			}
			event.putTempCache("sblijian", "targets", targets);
			return targets.length;
		},
		multiline: true,
		content: function () {
			var targetx = targets.slice().sortBySeat(target)[1];
			var card = { name: "juedou", isCard: true };
			if (target.canUse(card, targetx)) target.useCard(card, targetx);
		},
		ai: {
			threaten: 3,
			order: 7,
			result: {
				player: function (player, target) {
					let targets = _status.event.getTempCache("sblijian", "targets");
					if (Array.isArray(targets))
						for (let arr of targets) {
							if (target === arr[0] && !arr[2]) return 1;
						}
					return 0;
				},
				target: function (player, target) {
					let targets = _status.event.getTempCache("sblijian", "targets");
					if (Array.isArray(targets))
						for (let arr of targets) {
							if (target === arr[0]) {
								if (arr[1] * arr[2] < 0) return get.sgn(arr[2]);
								return arr[1];
							}
						}
					return 0;
				},
			},
		},
	},
	sbbiyue: {
		audio: 2,
		trigger: { player: "phaseJieshuBegin" },
		forced: true,
		content: function () {
			player.draw(
				Math.min(
					4,
					game.countPlayer2(current => {
						return current.getHistory("damage").length > 0;
					}) + 1
				)
			);
		},
	},
	//陈宫
	sbmingce: {
		audio: 2,
		enable: "phaseUse",
		usable: 1,
		position: "he",
		filter: function (event, player) {
			return player.countCards("he") > 0;
		},
		filterCard: true,
		check: function (card) {
			return 8 - get.value(card);
		},
		filterTarget: lib.filter.notMe,
		selectTarget: 1,
		discard: false,
		lose: false,
		delay: false,
		onremove: true,
		group: "sbmingce_hit",
		content: function () {
			"step 0";
			player.give(cards, target);
			"step 1";
			var choices = ["选项二"];
			var choiceList = ["失去1点体力，令" + get.translation(player) + "摸两张牌并获得1枚“策”", "摸一张牌"];
			if (target.hp > 0) choices.unshift("选项一");
			else choiceList[0] = '<span style="opacity:0.5">' + choiceList[0] + "</span>";
			target
				.chooseControl(choices)
				.set("choiceList", choiceList)
				.set("prompt", get.translation(player) + "对你发动了【明策】，请选择一项")
				.set("ai", () => {
					return _status.event.choice;
				})
				.set("choice", target.hp <= 0 || (((target.hp + target.countCards("hs", "tao") > 2 && get.attitude(target, player) > 0) || get.effect(target, { name: "losehp" }, target, target) > 0) && target.hp > 0) ? 0 : 1);
			"step 2";
			if (result.control == "选项一") {
				target.loseHp();
				player.draw(2);
			} else {
				target.draw();
				event.finish();
			}
			"step 3";
			player.addMark("sbmingce", 1);
		},
		marktext: "笨",
		intro: {
			name: "策(明策)",
			name2: "策",
			content: "mark",
		},
		ai: {
			result: {
				player: 0.5,
				target: 1,
			},
			order: 8.5,
			expose: 0.2,
		},
		subSkill: {
			hit: {
				audio: "sbmingce",
				trigger: { player: "phaseUseBegin" },
				filter: function (event, player) {
					return player.hasMark("sbmingce");
				},
				direct: true,
				content: function () {
					"step 0";
					var num = player.countMark("sbmingce");
					event.num = num;
					player.chooseTarget(get.prompt("sbmingce"), "移去所有“策”，对一名其他角色造成" + num + "点伤害", lib.filter.notMe).set("ai", target => {
						var player = _status.event.player;
						var eff = get.damageEffect(target, player, player);
						var num = player.countMark("sbmingce");
						if (target.hasSkillTag("filterDamage", null, { player: player })) num = 1;
						return eff * num;
					});
					"step 1";
					if (result.bool) {
						var target = result.targets[0];
						player.logSkill("sbmingce_hit", target);
						player.removeMark("sbmingce", num);
						target.damage(num);
					}
				},
			},
		},
	},
	sbzhichi: {
		audio: 2,
		trigger: { player: "damageEnd" },
		forced: true,
		content: function () {
			player.addTempSkill("sbzhichi_muteki");
		},
		subSkill: {
			muteki: {
				audio: "sbzhichi",
				trigger: { player: "damageBegin4" },
				charlotte: true,
				forced: true,
				group: "sbzhichi_egg",
				content: function () {
					trigger.cancel();
				},
				mark: true,
				intro: { content: "我无敌啦！" },
				ai: {
					maixie: true,
					maixie_hp: true,
					nofire: true,
					nothunder: true,
					nodamage: true,
					effect: {
						target: function (card, player, target, current) {
							if (get.tag(card, "damage")) return "zeroplayertarget";
						},
					},
				},
			},
			egg: {
				trigger: { player: "die" },
				charlotte: true,
				forced: true,
				silent: true,
				forceDie: true,
				content: function () {
					player.chat("你是真滴牛批");
				},
			},
		},
	},
	//袁绍
	sbluanji: {
		audio: 2,
		enable: "phaseUse",
		trigger: { global: "respond" },
		viewAs: { name: "wanjian" },
		forced: true,
		locked: false,
		filter: function (event, player) {
			if (event.name == "chooseToUse") return player.countCards("hs") > 1 && !player.hasSkill("sbluanji_used");
			var evt = event.getParent(2);
			return (
				evt.name == "wanjian" &&
				evt.getParent().player == player &&
				event.player != player &&
				player.getHistory("gain", function (evt) {
					return evt.getParent(2).name == "sbluanji";
				}).length < 3
			);
		},
		filterCard: true,
		selectCard: 2,
		position: "hs",
		prompt: "将两张手牌当【万箭齐发】使用",
		check: function (card) {
			var player = _status.event.player;
			var targets = game.filterPlayer(function (current) {
				return player.canUse("wanjian", current);
			});
			var num = 0;
			for (var i = 0; i < targets.length; i++) {
				var eff = get.sgn(get.effect(targets[i], { name: "wanjian" }, player, player));
				if (targets[i].hp == 1) {
					eff *= 1.5;
				}
				if (get.attitude(player, targets[i]) == 0 || targets[i].group == "qun") {
					eff += 0.5;
				}
				num += eff;
			}
			if (!player.needsToDiscard(-1)) {
				if (targets.length >= 7) {
					if (num < 1) return 0;
				} else if (targets.length >= 5) {
					if (num < 0.5) return 0;
				}
			}
			return 6 - get.value(card);
		},
		content: function () {
			player.draw();
		},
		precontent: function () {
			player.addTempSkill("sbluanji_used", "phaseUseAfter");
		},
		ai: {
			threaten: 1.6,
		},
		subSkill: { used: { charlotte: true } },
	},
	sbxueyi: {
		audio: 2,
		trigger: { player: "useCardToTargeted" },
		filter: function (event, player) {
			return player.hasZhuSkill("sbxueyi") && event.target != player && event.target.group == "qun";
		},
		zhuSkill: true,
		forced: true,
		usable: 2,
		logTarget: "target",
		content: function () {
			player.draw();
		},
		mod: {
			maxHandcard: function (player, num) {
				if (player.hasZhuSkill("sbxueyi")) {
					return num + 2 * game.countPlayer(current => player != current && current.group == "qun");
				}
			},
		},
		ai: {
			effect: {
				player_use(card, player, target) {
					if (player != target && target && target.group == "qun" && card.name != "tao") return [1, 0.1];
				},
			},
		},
	},
	//庞统
	sblianhuan: {
		audio: 2,
		enable: "phaseUse",
		filter: (event, player) => player.hasCard(card => lib.skill.sblianhuan.filterCard(card, player), lib.skill.sblianhuan.position),
		filterTarget: function (card, player, target) {
			if (player.hasSkill("sblianhuan_blocker")) return false;
			if (!ui.selected.cards.length) return false;
			card = get.autoViewAs({ name: "tiesuo" }, [ui.selected.cards[0]]);
			return player.canUse(card, target);
		},
		filterCard: (card, player) => get.suit(card) == "club" && (!player.hasSkill("sblianhuan_blocker") || player.canRecast(card)),
		selectCard: 1,
		position: "hs",
		derivation: "sblianhuan_lv2",
		selectTarget: function () {
			var card = get.card(),
				player = get.player();
			if (player.hasSkill("sblianhuan_blocker")) return 0;
			if (card == undefined) return;
			var range = [0, 2];
			game.checkMod(card, player, range, "selectTarget", player);
			return range;
		},
		filterOk: function () {
			var card = ui.selected.cards[0];
			if (!card) return false;
			if (get.position(card) == "s" && !ui.selected.targets.length) return false;
			return true;
		},
		check: function (card) {
			return 6 - get.value(card);
		},
		prompt: function () {
			var player = _status.event.player,
				use = !player.hasSkill("sblianhuan_blocker");
			return "重铸一张♣手牌" + (use ? "；或将一张♣手牌当【铁索连环】使用" : "");
		},
		group: ["sblianhuan_use", "sblianhuan_add", "sblianhuan_discard2"],
		multitarget: true,
		multiline: true,
		discard: false,
		lose: false,
		delay: false,
		content: function () {
			"step 0";
			if (targets.length) {
				player.addTempSkill("sblianhuan_blocker", "phaseUseAfter");
				var card = get.autoViewAs({ name: "tiesuo" }, cards);
				player.useCard(card, cards, targets);
			} else {
				player.loseToDiscardpile(cards);
				player.draw(cards.length);
			}
		},
		subSkill: {
			blocker: { charlotte: true },
			use: {
				audio: "sblianhuan",
				trigger: { player: "useCard" },
				filter: function (event, player) {
					return event.card.name == "tiesuo" && !player.storage.sblianhuan;
				},
				check: function (event, player) {
					var eff = 0,
						targets = event.targets.filter(i => !i.isLinked());
					for (var target of targets) {
						eff += get.attitude(player, target);
					}
					return eff < -1;
				},
				prompt2: "失去1点体力，然后当此牌指定第一个目标后，你随机弃置所有不处于连环状态的目标角色各一张手牌",
				content: function () {
					"step 0";
					player.loseHp();
					"step 1";
					if (!trigger.card.storage) trigger.card.storage = {};
					trigger.card.storage.sblianhuan = true;
					trigger._sblianhuan = true;
					player.addTempSkill("sblianhuan_discard", "phaseUseAfter");
				},
			},
			discard: {
				trigger: { global: "useCardToPlayered" },
				forced: true,
				locked: false,
				popup: false,
				charlotte: true,
				filter: function (event, player) {
					return event.isFirstTarget && event.card.storage && event.card.storage.sblianhuan;
				},
				content: function () {
					"step 0";
					event.targets = trigger.targets.filter(i => !i.isLinked());
					if (!event.targets.length) event.finish();
					else player.logSkill("sblianhuan_discard", event.targets);
					"step 1";
					var target = targets.shift();
					var cards = target.getCards("h", card => {
						return lib.filter.cardDiscardable(card, player, "sblianhuan");
					});
					if (cards.length > 0) {
						player.line(target);
						target.discard(cards.randomGet());
					}
					if (targets.length) event.redo();
				},
			},
			add: {
				trigger: { player: "useCard2" },
				filter: function (event, player) {
					return (
						event.card.name == "tiesuo" &&
						player.storage.sblianhuan &&
						game.hasPlayer(current => {
							return !event.targets.includes(current) && player.canUse(event.card, current);
						})
					);
				},
				direct: true,
				content: function () {
					"step 0";
					player
						.chooseTarget(get.prompt("sblianhuan_add"), "为" + get.translation(trigger.card) + "额外指定任意个目标", [1, Infinity], function (card, player, target) {
							return !_status.event.sourcex.includes(target) && player.canUse(_status.event.card, target);
						})
						.set("sourcex", trigger.targets)
						.set("ai", function (target) {
							var player = _status.event.player;
							return get.effect(target, _status.event.card, player, player);
						})
						.set("card", trigger.card);
					"step 1";
					if (result.bool) {
						if (!event.isMine() && !event.isOnline()) game.delayx();
						event.targets = result.targets;
					} else {
						event.finish();
					}
					"step 2";
					player.logSkill("sblianhuan_add", event.targets);
					trigger.targets.addArray(event.targets);
				},
			},
			discard2: {
				trigger: { player: "useCardToPlayered" },
				forced: true,
				locked: false,
				popup: false,
				filter: function (event, player) {
					return event.isFirstTarget && event.card.name == "tiesuo" && player.storage.sblianhuan && !event.getParent()._sblianhuan;
				},
				content: function () {
					"step 0";
					event.targets = trigger.targets.filter(i => !i.isLinked());
					if (!event.targets.length) event.finish();
					else player.logSkill("sblianhuan_discard2", event.targets);
					"step 1";
					var target = targets.shift();
					var cards = target.getCards("h", card => {
						return lib.filter.cardDiscardable(card, player, "sblianhuan");
					});
					if (cards.length > 0) {
						player.line(target);
						target.discard(cards.randomGet());
					}
					if (targets.length) event.redo();
				},
			},
		},
	},
	sbniepan: {
		audio: 2,
		enable: "chooseToUse",
		mark: true,
		skillAnimation: true,
		limited: true,
		animationColor: "orange",
		filter: function (event, player) {
			return event.type == "dying" && player == event.dying;
		},
		content: function () {
			"step 0";
			player.awakenSkill("sbniepan");
			player.discard(player.getCards("hej"));
			"step 1";
			player.draw(2);
			"step 2";
			if (player.hp < 2) player.recover(2 - player.hp);
			"step 3";
			player.turnOver(false);
			"step 4";
			player.link(false);
			"step 5";
			player.storage.sblianhuan = true;
			game.log(player, "修改了", "#g【连环】");
		},
		ai: {
			order: 1,
			skillTagFilter: function (player, arg, target) {
				if (player != target || player.storage.sbniepan) return false;
			},
			save: true,
			result: {
				player: function (player) {
					if (player.hp <= 0) return 10;
					return 0;
				},
			},
			threaten: function (player, target) {
				if (!target.storage.sbniepan) return 0.6;
			},
		},
	},
	//法正
	sbxuanhuo: {
		audio: 2,
		enable: "phaseUse",
		usable: 1,
		group: "sbxuanhuo_rob",
		filterTarget: function (card, player, target) {
			return !target.hasMark("sbxuanhuo_mark") && player != target;
		},
		filterCard: true,
		position: "he",
		discard: false,
		lose: false,
		delay: false,
		onremove: function (player) {
			delete player.storage.sbxuanhuo;
			player.unmarkSkill("sbxuanhuo");
		},
		check: function (card) {
			return 6.5 - get.value(card);
		},
		content: function () {
			"step 0";
			player.give(cards, target);
			if (player.storage.sbxuanhuo && player.storage.sbxuanhuo[target.playerid]) delete player.storage.sbxuanhuo[target.playerid];
			"step 1";
			target.addMark("sbxuanhuo_mark");
			var history = target.getAllHistory("lose");
			if (history.length) {
				history[history.length - 1].sbxuanhuo_mark = true;
			}
		},
		getNum: function (current, skill) {
			var num = 0;
			var history = current.getAllHistory("lose");
			if (history.length) {
				for (var i = history.length - 1; i >= 0; i--) {
					var evt = history[i];
					if (evt.sbxuanhuo_mark) break;
					if (typeof skill == "string") {
						if (evt.getParent(2).name == skill) num += evt.cards2.length;
					} else {
						var evtx = evt.getParent(),
							player = skill;
						if (evtx.name == "gain") {
							var cards = evtx.cards;
							if (evtx.player == player && cards.length > 0) num += cards.length;
						} else if (evtx.name == "loseAsync") {
							if (evtx.type != "gain" || evtx.giver) return false;
							var cards = evtx.getl(current).cards2;
							var cardsx = evtx.getg(player);
							if (cardsx.length > 0) num += cardsx.length;
						}
					}
				}
			}
			return num;
		},
		ai: {
			order: 9,
			result: {
				target: function (player, target) {
					return -Math.sqrt(Math.max(target.hp, 1));
				},
			},
		},
		marktext: "惑",
		intro: {
			content: function (storage, player) {
				if (!storage || get.is.empty(storage)) return "未得到过牌";
				var map = _status.connectMode ? lib.playerOL : game.playerMap;
				var str = "已得到";
				for (var i in storage) {
					str += get.translation(map[i]) + "的" + get.cnNumber(storage[i]) + "张牌、";
				}
				return str.slice(0, -1);
			},
		},
		subSkill: {
			mark: {
				marktext: "眩",
				intro: {
					name: "眩惑",
					name2: "眩",
					markcount: () => 0,
					content: "已获得“眩”标记",
				},
			},
			rob: {
				audio: "sbxuanhuo",
				trigger: {
					global: ["gainAfter", "loseAsyncAfter"],
				},
				forced: true,
				locked: false,
				direct: true,
				filter: function (event, player) {
					var evt = event.getParent("phaseDraw");
					if (evt && evt.name == "phaseDraw") return false;
					return game.hasPlayer(current => {
						if (!event.getg(current).length || !current.hasMark("sbxuanhuo_mark")) return false;
						if (evt && evt.player == current) return false;
						if (lib.skill.sbxuanhuo.getNum(current, "sbxuanhuo_rob") >= 5) return false;
						return current.hasCard(card => lib.filter.canBeGained(card, current, player), "he");
					});
				},
				content: function () {
					"step 0";
					var evt = trigger.getParent("phaseDraw");
					var targets = game.filterPlayer(current => {
						if (!trigger.getg(current).length || !current.hasMark("sbxuanhuo_mark")) return false;
						if (evt && evt.player == current) return false;
						if (lib.skill.sbxuanhuo.getNum(current, "sbxuanhuo_rob") >= 5) return false;
						return current.hasCard(card => lib.filter.canBeGained(card, current, player), "he");
					});
					event.targets = targets;
					"step 1";
					var target = targets.shift();
					player.logSkill("sbxuanhuo", target);
					var hs = target.getCards("h", card => lib.filter.canBeGained(card, target, player));
					if (hs.length) {
						player.gain(hs.randomGet(), target, "giveAuto");
						if (!player.storage.sbxuanhuo) player.storage.sbxuanhuo = {};
						player.storage.sbxuanhuo[target.playerid] = lib.skill.sbxuanhuo.getNum(target, "sbxuanhuo_rob") + 1;
						player.markSkill("sbxuanhuo");
					}
					if (targets.length > 0) event.redo();
				},
			},
		},
	},
	sbenyuan: {
		audio: 2,
		forced: true,
		direct: true,
		trigger: { player: "phaseZhunbeiBegin" },
		filter: function (event, player) {
			return game.hasPlayer(current => current.hasMark("sbxuanhuo_mark"));
		},
		content: function () {
			"step 0";
			var targets = game.filterPlayer(current => current.hasMark("sbxuanhuo_mark"));
			event.targets = targets;
			"step 1";
			var target = targets.shift();
			event.target = target;
			player.logSkill("sbenyuan", target);
			target.removeMark("sbxuanhuo_mark", target.countMark("sbxuanhuo_mark"));
			game.players.forEach(current => {
				var storage = current.storage.sbxuanhuo;
				if (storage && storage[target.playerid]) delete storage[target.playerid];
				if (storage && get.is.empty(storage)) {
					delete current.storage.sbxuanhuo;
					current.unmarkSkill("sbxuanhuo");
				}
			});
			var num = lib.skill.sbxuanhuo.getNum(target, player);
			if (num >= 3) {
				var cards = player.getCards("he");
				if (!cards.length) event._result = { bool: false };
				else if (cards.length <= 3) event._result = { bool: true, cards: cards };
				else player.chooseCard("恩怨：交给" + get.translation(target) + "三张牌", true, 3, "he");
			} else {
				target.loseHp();
				player.recover();
				event.goto(3);
			}
			"step 2";
			if (result.bool) player.give(result.cards, target);
			"step 3";
			if (targets.length) event.goto(1);
		},
		ai: {
			combo: "sbxuanhuo",
		},
	},
	//姜维
	sbtiaoxin: {
		audio: 2,
		enable: "phaseUse",
		usable: 1,
		chargeSkill: true,
		filter: function (event, player) {
			return player.hasMark("charge");
		},
		filterTarget: lib.filter.notMe,
		selectTarget: function () {
			return [1, _status.event.player.countMark("charge")];
		},
		multiline: true,
		group: "sbtiaoxin_backflow",
		content: function () {
			"step 0";
			target
				.chooseToUse(
					function (card, player, event) {
						if (get.name(card) != "sha") return false;
						return lib.filter.filterCard.apply(this, arguments);
					},
					"挑衅：对" + get.translation(player) + "使用一张杀，或交给其一张牌"
				)
				.set("targetRequired", true)
				.set("complexSelect", true)
				.set("filterTarget", function (card, player, target) {
					if (target != _status.event.sourcex && !ui.selected.targets.includes(_status.event.sourcex)) return false;
					return lib.filter.targetEnabled.apply(this, arguments);
				})
				.set("sourcex", player);
			"step 1";
			if (!result.bool && target.countCards("he") > 0) {
				target.chooseCard("he", "交给" + get.translation(player) + "一张牌", true);
			} else event.finish();
			"step 2";
			if (result.bool) {
				target.give(result.cards, player);
			}
		},
		contentAfter: function () {
			player.removeMark("charge", targets.length);
		},
		ai: {
			threaten: 1.2,
			order: 4,
			expose: 0.2,
			result: {
				target: function (player, target) {
					if (target.countGainableCards(player, "he") == 0) return 0;
					return -1;
				},
				player: function (player, target) {
					if (!target.canUse("sha", player)) return 0;
					if (target.countCards("h") == 0) return 0;
					if (target.countCards("h") == 1) return -0.1;
					if (player.hp <= 2) return -2;
					if (player.countCards("h", "shan") == 0) return -1;
					return -0.5;
				},
			},
		},
		subSkill: {
			backflow: {
				audio: "sbtiaoxin",
				trigger: {
					player: ["loseAfter", "enterGame"],
					global: ["loseAsyncAfter", "phaseBefore"],
				},
				forced: true,
				filter: function (event, player) {
					if (player.countMark("charge") >= 4) return false;
					if (event.name.indexOf("lose") == 0) {
						if (event.type != "discard") return false;
						var evt = event.getParent("phaseDiscard");
						return evt && evt.player == player && event.getl(player).cards2.length > 0;
					} else {
						return event.name != "phase" || game.phaseNumber == 0;
					}
				},
				content: function () {
					var num = Math.min(4 - player.countMark("charge"), trigger.name.indexOf("lose") == 0 ? trigger.getl(player).cards2.length : 4);
					if (num > 0) player.addMark("charge", num);
				},
			},
		},
	},
	sbzhiji: {
		audio: 2,
		trigger: { player: "phaseZhunbeiBegin" },
		juexingji: true,
		forced: true,
		skillAnimation: true,
		animationColor: "fire",
		filter: function (event, player) {
			var len = 0;
			player.getAllHistory("useSkill", evt => {
				if (evt.skill != "sbtiaoxin") return false;
				len += evt.targets.length;
			});
			return len >= 4;
		},
		content: function () {
			"step 0";
			player.awakenSkill("sbzhiji");
			player.loseMaxHp();
			"step 1";
			player.chooseTarget("志继：令至少一名角色获得“北伐”标记", true, [1, Infinity]).set("ai", target => -get.attitude(player, target));
			"step 2";
			if (result.bool) {
				player.line(result.targets, "fire");
				result.targets.forEach(target => {
					target.addAdditionalSkill("sbzhiji_" + player.playerid, "sbzhiji_beifa");
					target.markAuto("sbzhiji_beifa", [player]);
				});
				player.addTempSkill("sbzhiji_clear", { player: "phaseBegin" });
				if (!event.isMine() && !event.isOnline()) game.delayx();
			}
		},
		subSkill: {
			beifa: {
				charlotte: true,
				mark: true,
				marktext: "伐",
				intro: {
					name: "北伐",
					name2: "北伐",
					content: "使用牌只能指定$和自己为目标",
				},
				mod: {
					playerEnabled: function (card, player, target) {
						if (player != target && !player.getStorage("sbzhiji_beifa").includes(target)) return false;
					},
				},
			},
			clear: {
				charlotte: true,
				onremove: function (player) {
					game.countPlayer(function (current) {
						current.removeAdditionalSkill("sbzhiji_" + player.playerid);
					});
				},
			},
		},
		ai: {
			combo: "sbtiaoxin",
		},
	},
	//刘备
	sbrende: {
		audio: 3,
		enable: ["chooseToUse", "chooseToRespond"],
		maxNum: 8,
		filter: function (event, player) {
			if (event.type == "wuxie" || player.hasSkill("sbrende_used")) return false;
			if (player.countMark("sbrende") < 2) return false;
			for (var name of lib.inpile) {
				if (get.type(name) != "basic") continue;
				var card = { name: name, isCard: true };
				if (event.filterCard(card, player, event)) return true;
				if (name == "sha") {
					for (var nature of lib.inpile_nature) {
						card.nature = nature;
						if (event.filterCard(card, player, event)) return true;
					}
				}
			}
			return false;
		},
		group: ["sbrende_give", "sbrende_gain"],
		chooseButton: {
			dialog: function (event, player) {
				var dialog = ui.create.dialog("仁德");
				if (event.type == "phase") {
					dialog._chosenOpt = [];
					var table = document.createElement("div");
					table.classList.add("add-setting");
					table.style.margin = "0";
					table.style.width = "100%";
					table.style.position = "relative";
					var list = ["视为使用基本牌", "交给其他角色牌"];
					for (var i of list) {
						var td = ui.create.div(".shadowed.reduce_radius.pointerdiv.tdnode");
						td.innerHTML = "<span>" + i + "</span>";
						td.link = i;
						if (i == list[0]) {
							td.classList.add("bluebg");
							dialog._chosenOpt.add(td);
						}
						td.addEventListener(lib.config.touchscreen ? "touchend" : "click", function () {
							if (_status.dragged) return;
							if (_status.clicked) return;
							if (_status.justdragged) return;
							_status.tempNoButton = true;
							_status.clicked = true;
							setTimeout(function () {
								_status.tempNoButton = false;
							}, 500);
							var link = this.link;
							if (link == "交给其他角色牌") game.uncheck();
							var current = this.parentNode.querySelector(".bluebg");
							if (current) {
								current.classList.remove("bluebg");
								dialog._chosenOpt.remove(current);
							}
							dialog._chosenOpt.add(this);
							this.classList.add("bluebg");
							game.check();
						});
						table.appendChild(td);
						dialog.buttons.add(td);
					}
					dialog.content.appendChild(table);
				}
				var cards = [];
				for (var name of lib.inpile) {
					if (get.type(name) != "basic") continue;
					var card = { name: name, isCard: true };
					if (event.filterCard(card, player, event)) cards.push(["基本", "", name]);
					if (name == "sha") {
						for (var nature of lib.inpile_nature) {
							card.nature = nature;
							if (event.filterCard(card, player, event)) cards.push(["基本", "", name, nature]);
						}
					}
				}
				dialog.add([cards, "vcard"]);
				return dialog;
			},
			check: function (button, player) {
				if (typeof button.link == "string") return -1;
				if (_status.event.getParent().type != "phase") return 1;
				return _status.event.player.getUseValue({
					name: button.link[2],
					nature: button.link[3],
				});
			},
			select: function () {
				var opts = _status.event.dialog._chosenOpt;
				return opts && opts.length && opts[0].link == "交给其他角色牌" ? 0 : 1;
			},
			backup: function (links, player) {
				var isUse = links.length == 1;
				var backup = get.copy(lib.skill["sbrende_" + (isUse ? "use" : "give")]);
				if (isUse) backup.viewAs = { name: links[0][2], nature: links[0][3], isCard: true };
				return backup;
			},
			prompt: function (links, player) {
				var isUse = links.length == 1;
				return isUse ? "移去2枚“仁望”，视为使用或打出" + (get.translation(links[0][3]) || "") + get.translation(links[0][2]) : "###仁德###出牌阶段每名角色限一次。你可以将任意张牌交给一名其他角色，然后你获得等量“仁望”标记（至多为" + lib.skill.sbrende.maxNum + "）";
			},
		},
		hiddenCard: function (player, name) {
			return get.type(name) == "basic" && player.countMark("sbrende") > 1 && player.hasSkill("sbrende_used");
		},
		marktext: "仁",
		intro: {
			name: "仁望",
			name2: "仁望",
			content: "mark",
		},
		ai: {
			respondSha: true,
			respondShan: true,
			save: true,
			skillTagFilter: function (player) {
				return player.countMark("sbrende") > 1 && !player.hasSkill("sbrende_used");
			},
			order: function (item, player) {
				if (_status.event.type == "phase" && lib.skill.sbzhangwu.ai.result.player(player) > 0) return 9.1;
				return 0.5;
			},
			result: {
				player: function (player) {
					if (_status.event.dying) {
						return get.attitude(player, _status.event.dying);
					}
					return _status.event.type == "phase" && player.countMark("sbrende") <= 2 ? 0 : 1;
				},
			},
		},
		subSkill: {
			backup: {},
			used: { charlotte: true },
			given: { onremove: true },
			use: {
				audio: "sbrende",
				filterCard: () => false,
				selectCard: -1,
				popname: true,
				precontent: function () {
					player.logSkill("sbrende_use");
					delete event.result.skill;
					player.removeMark("sbrende", 2);
					player.addTempSkill("sbrende_used");
				},
			},
			give: {
				audio: "sbrende",
				enable: "phaseUse",
				filterCard: true,
				selectCard: [1, Infinity],
				position: "he",
				discard: false,
				lose: false,
				delay: false,
				filter: function (event, player) {
					if (player.countMark("sbrende") < 2 || player.hasSkill("sbrende_used")) return true;
					for (var name of lib.inpile) {
						if (get.type(name) != "basic") continue;
						var card = { name: name, isCard: true };
						if (event.filterCard(card, player, event)) return false;
						if (name == "sha") {
							for (var nature of lib.inpile_nature) {
								card.nature = nature;
								if (event.filterCard(card, player, event)) return false;
							}
						}
					}
					return true;
				},
				filterTarget: function (card, player, target) {
					if (player.getStorage("sbrende_given").includes(target)) return false;
					return player != target;
				},
				prompt: function (event) {
					return "出牌阶段每名角色限一次。你可以将任意张牌交给一名其他角色，然后你获得等量“仁望”标记（至多为" + lib.skill.sbrende.maxNum + "）";
				},
				check: function (card) {
					var player = get.owner(card);
					if (ui.selected.cards.length && ui.selected.cards[0].name == "du") return 0;
					if (ui.selected.cards.length + player.countMark("sbrende") > lib.skill.sbrende.maxNum) return 0;
					if (!ui.selected.cards.length && card.name == "du") return 20;
					if (ui.selected.cards.length >= Math.max(2, player.countCards("he") - player.hp)) return 0;
					if (player.countCards("he") <= 1) {
						var players = game.filterPlayer();
						for (var i = 0; i < players.length; i++) {
							if (players[i].hasSkill("haoshi") && !players[i].isTurnedOver() && !players[i].hasJudge("lebu") && get.attitude(player, players[i]) >= 3 && get.attitude(players[i], player) >= 3) {
								return 11 - get.value(card);
							}
						}
						if (player.countCards("he") > player.hp) return 10 - get.value(card);
						if (player.countCards("he") > 2) return 6 - get.value(card);
						return -1;
					}
					return 18 - (ui.selected.cards.length + player.countMark("sbrende")) - get.value(card);
				},
				content: function () {
					player.addTempSkill("sbrende_given", "phaseUseAfter");
					player.markAuto("sbrende_given", [target]);
					player.markAuto("sbrende_givenx", [target]);
					player.give(cards, target);
					var num = Math.min(lib.skill.sbrende.maxNum - player.countMark("sbrende"), cards.length);
					if (num > 0) player.addMark("sbrende", num);
				},
				ai: {
					order: function (skill, player) {
						return player.countMark("sbrende") < 2 ? 6.8 : 5.8;
					},
					result: {
						target: function (player, target) {
							if (!player.hasFriend() && player.hasSkill("sbzhangwu") && ui.selected.cards.length && get.value(ui.selected.cards[0]) > (lib.skill.sbzhangwu.filterTarget(null, player, target) ? 3 : 5)) return -0.1;
							if (target.hasSkillTag("nogain")) return 0;
							if (ui.selected.cards.length && ui.selected.cards[0].name == "du") {
								if (target.hasSkillTag("nodu")) return 0;
								return -10;
							}
							if (target.hasJudge("lebu")) return 0;
							var nh = target.countCards("h");
							return Math.max(1, 5 - nh);
						},
					},
					threaten: 1.1,
				},
			},
			gain: {
				audio: "sbrende",
				trigger: { player: "phaseUseBegin" },
				forced: true,
				locked: false,
				filter: function (event, player) {
					return player.countMark("sbrende") < lib.skill.sbrende.maxNum;
				},
				content: function () {
					var num = Math.min(lib.skill.sbrende.maxNum - player.countMark("sbrende"), 2);
					if (num > 0) player.addMark("sbrende", num);
				},
			},
		},
	},
	sbzhangwu: {
		audio: 2,
		enable: "phaseUse",
		skillAnimation: "epic",
		animationColor: "orange",
		limited: true,
		filter: function (event, player) {
			if (game.roundNumber <= 1) return false;
			if (!game.hasPlayer(current => lib.skill.sbzhangwu.filterTarget(null, player, current))) return false;
			return true;
		},
		filterTarget: function (card, player, target) {
			if (target == player) return false;
			return player.getStorage("sbrende_givenx").includes(target);
		},
		selectTarget: [-1, -2],
		multiline: true,
		content: function () {
			"step 0";
			player.awakenSkill("sbzhangwu");
			var num = Math.min(game.roundNumber - 1, 3);
			var cards = target.getCards("he"),
				count = cards.length;
			if (count == 0) event.finish();
			else if (count <= num) event._result = { bool: true, cards: cards };
			else target.chooseCard("章武：交给" + get.translation(player) + get.cnNumber(num) + "张牌", true, "he", num);
			"step 1";
			if (result.bool) {
				target.give(result.cards, player);
			}
		},
		contentAfter: function () {
			"step 0";
			player.recover(3);
			"step 1";
			player.removeSkills("sbrende");
			game.delayx();
		},
		ai: {
			order: 9,
			combo: "sbrende",
			result: {
				player: function (player, target) {
					var targets = game.filterPlayer(current => lib.skill.sbzhangwu.filterTarget(null, player, current));
					if (!targets.length) return 0;
					var eff = 0;
					for (var target of targets) {
						eff += get.effect(target, { name: "shunshou_copy2" }, player, player);
					}
					eff += 15 - 5 * Math.max(0, 3 - player.getDamagedHp());
					return eff > 15 ? 1 : 0;
				},
			},
		},
	},
	sbjijiang: {
		audio: 2,
		trigger: { player: "phaseUseEnd" },
		zhuSkill: true,
		unique: true,
		popup: false,
		filter: function (event, player) {
			if (!player.hasZhuSkill("sbjijiang")) return false;
			return game.hasPlayer(current => {
				if (current.group != "shu" || player == current || current.hp < player.hp) return false;
				return game.hasPlayer(currentx => current.inRange(currentx));
			});
		},
		async cost(event, trigger, player) {
			event.result = await player
				.chooseTarget(get.prompt2("sbjijiang"), 2)
				.set("filterTarget", (card, player, target) => {
					if (!ui.selected.targets.length) return target.group == "shu" && target.hp >= player.hp && target != player;
					var current = ui.selected.targets[0];
					return current.inRange(target);
				})
				.set("targetprompt", ["进行选择", "出杀对象"])
				.set("multitarget", true)
				.set("ai", target => {
					var player = _status.event.player;
					if (ui.selected.targets.length) {
						var current = ui.selected.targets[0];
						return get.effect(target, new lib.element.VCard({ name: "sha" }), current, player);
					}
					let curs = game.filterPlayer(current => {
						return target !== current && target.inRange(current) && target.canUse({ name: "sha", isCard: true }, current, false);
					});
					if (!curs.length) {
						let att = get.attitude(player, target);
						if (att >= 0) return 0;
						return -att * get.threaten(target, player);
					}
					return curs.reduce((max, i) => Math.max(max, get.effect(i, new lib.element.VCard({ name: "sha" }), target, player)), -1);
				})
				.forResult();
		},
		async content(event, trigger, player) {
			let targets = event.targets;
			player.logSkill("sbjijiang", targets, false);
			player.line2(targets);
			var choiceList = ["视为对" + get.translation(targets[1]) + "使用一张【杀】", "你的下一个出牌阶段开始前，跳过此阶段"],
				result;
			if (!targets[0].canUse({ name: "sha", isCard: true }, targets[1], false)) result = { index: 1 };
			else
				result = await targets[0]
					.chooseControl()
					.set("choiceList", choiceList)
					.set("ai", () => {
						return _status.event.choice;
					})
					.set("choice", get.effect(targets[1], { name: "sha" }, targets[0], targets[0]) > get.effect(targets[0], { name: "lebu" }, targets[0], targets[0]) ? 0 : 1)
					.forResult();
			if (result.index == 0) {
				targets[0].useCard({ name: "sha", isCard: true }, targets[1], false);
			} else {
				targets[0].addSkill("sbjijiang_skip");
			}
		},
		subSkill: {
			skip: {
				trigger: { player: "phaseUseBefore" },
				charlotte: true,
				forced: true,
				content: function () {
					trigger.cancel();
					player.removeSkill("sbjijiang_skip");
				},
			},
		},
	},
	//赵云
	sblongdan: {
		audio: 2,
		enable: ["chooseToUse", "chooseToRespond"],
		chargeSkill: true,
		filter: function (event, player) {
			if (event.type == "wuxie" || !player.hasMark("charge")) return false;
			var marked = player.hasSkill("sblongdan_mark", null, null, false);
			for (var name of lib.inpile) {
				if (!marked && name != "sha" && name != "shan") continue;
				if (get.type(name) != "basic") continue;
				if (player.hasCard(lib.skill.sblongdan.getFilter(name, player), "hs")) {
					if (event.filterCard(get.autoViewAs({ name }, "unsure"), player, event)) return true;
					if (marked && name == "sha") {
						for (var nature of lib.inpile_nature) {
							if (event.filterCard(get.autoViewAs({ name, nature }, "unsure"), player, event)) return true;
						}
					}
				}
			}
			return false;
		},
		chooseButton: {
			dialog: function (event, player) {
				var list = [];
				var marked = player.hasSkill("sblongdan_mark", null, null, false);
				for (var name of lib.inpile) {
					if (!marked && name != "sha" && name != "shan") continue;
					if (get.type(name) != "basic") continue;
					if (player.hasCard(lib.skill.sblongdan.getFilter(name, player), "hs")) {
						if (event.filterCard(get.autoViewAs({ name }, "unsure"), player, event)) list.push(["基本", "", name]);
						if (marked && name == "sha") {
							for (var nature of lib.inpile_nature) {
								if (event.filterCard(get.autoViewAs({ name, nature }, "unsure"), player, event)) list.push(["基本", "", name, nature]);
							}
						}
					}
				}
				return ui.create.dialog("龙胆", [list, "vcard"], "hidden");
			},
			check: function (button) {
				if (_status.event.getParent().type != "phase") return 1;
				var player = _status.event.player,
					card = { name: button.link[2], nature: button.link[3] };
				if (card.name == "jiu" && Math.min(player.countMark("charge"), player.countCards("h", { type: "basic" })) < 2) return 0;
				return player.getUseValue(card, null, true);
			},
			backup: function (links, player) {
				return {
					viewAs: {
						name: links[0][2],
						nature: links[0][3],
					},
					filterCard: lib.skill.sblongdan.getFilter(links[0][2], player),
					position: "he",
					popname: true,
					check: function (card) {
						return 6 / Math.max(1, get.value(card));
					},
					precontent: function () {
						player.removeMark("charge", 1);
						player.addTempSkill("sblongdan_draw");
					},
				};
			},
			prompt: function (links, player) {
				var marked = player.hasSkill("sblongdan_mark", null, null, false);
				var card = {
					name: links[0][2],
					nature: links[0][3],
					isCard: true,
				};
				if (marked) return "将一张基本牌当做" + get.translation(card) + "使用";
				return "将一张" + (card.name == "sha" ? "闪" : "杀") + "当做" + get.translation(card) + "使用";
			},
		},
		hiddenCard: function (player, name) {
			if (get.type(name) != "basic" || !player.hasMark("charge")) return false;
			var marked = player.hasSkill("sblongdan_mark", null, null, false);
			if (!marked && name != "sha" && name != "shan") return false;
			return player.hasCard(lib.skill.sblongdan.getFilter(name, player), "hs");
		},
		ai: {
			respondSha: true,
			respondShan: true,
			skillTagFilter: function (player, tag) {
				return lib.skill.sblongdan.hiddenCard(player, tag == "respondSha" ? "sha" : "shan");
			},
			order: 9,
			result: {
				player: function (player) {
					if (_status.event.dying) return get.attitude(player, _status.event.dying);
					return 1;
				},
			},
		},
		getFilter: function (name, player) {
			if (!player.hasSkill("sblongdan_mark", null, null, false)) {
				if (name == "sha") return { name: "shan" };
				if (name == "shan") return { name: "sha" };
				return () => false;
			}
			return { type: "basic" };
		},
		group: "sblongdan_charge",
		onremove: function (player) {
			player.removeSkill("sblongdan_mark");
		},
		subSkill: {
			backup: { audio: "sblongdan" },
			mark: { charlotte: true },
			draw: {
				charlotte: true,
				trigger: { player: ["useCardAfter"] },
				forced: true,
				popup: false,
				filter: function (event, player) {
					return event.skill == "sblongdan_backup";
				},
				content: function () {
					player.draw();
				},
			},
			charge: {
				audio: "sblongdan",
				trigger: {
					global: ["phaseBefore", "phaseEnd"],
					player: "enterGame",
				},
				forced: true,
				filter: function (event, player, name) {
					if (player.countMark("charge") > 2) return false;
					return name != "phaseBefore" || game.phaseNumber == 0;
				},
				content: function () {
					player.addMark("charge", 1);
				},
			},
		},
	},
	sbjizhu: {
		audio: 3,
		trigger: { player: "phaseZhunbeiBegin" },
		direct: true,
		content: function () {
			"step 0";
			player.chooseTarget(lib.filter.notMe, get.prompt("sbjizhu"), "和一名其他角色进行“协力”").set("ai", function (target) {
				return get.threaten(target) * Math.sqrt(1 + target.countCards("h")) * (target.isTurnedOver() || target.hasJudge("lebu") ? 0.1 : 1);
			});
			"step 1";
			if (result.bool) {
				var target = result.targets[0];
				player.logSkill("sbjizhu", target);
				player.chooseCooperationFor(target, "sbjizhu").set("ai", function (button) {
					var base = 0;
					switch (button.link) {
						case "cooperation_damage":
							base = 0.1;
							break;
						case "cooperation_draw":
							base = 0.6;
							break;
						case "cooperation_discard":
							base = 0.1;
							break;
						case "cooperation_use":
							base = 0.6;
							break;
					}
					return base + Math.random();
				});
				player.addAdditionalSkill("cooperation", "sbjizhu_effect");
			} else event.finish();
			"step 2";
			game.delayx();
		},
		subSkill: {
			effect: {
				audio: "sbjizhu",
				charlotte: true,
				trigger: { global: "phaseJieshuBegin" },
				forced: true,
				logTarget: "player",
				filter: function (event, player) {
					return player.checkCooperationStatus(event.player, "sbjizhu") && player.hasSkill("sblongdan", null, null, false);
				},
				content: function () {
					game.log(player, "和", trigger.player, "的协力成功");
					player.addTempSkill("sblongdan_mark", { player: "phaseJieshuBegin" });
					game.delayx();
				},
			},
		},
		derivation: "sblongdan_shabi",
		ai: {
			combo: "sblongdan",
		},
	},
	//张飞
	sbpaoxiao: {
		audio: 2,
		mod: {
			cardUsable: function (card) {
				if (card.name == "sha") return Infinity;
			},
			targetInRange: function (card, player, target) {
				if (card.name == "sha" && player.getEquips(1).length > 0) return true;
			},
		},
		trigger: { player: "useCard" },
		forced: true,
		filter: function (event, player) {
			if (event.card.name != "sha") return false;
			var evt = event.getParent("phaseUse");
			if (!evt || evt.player != player) return false;
			return player.hasHistory(
				"useCard",
				function (evtx) {
					return evtx != event && evtx.card.name == "sha" && evtx.getParent("phaseUse") == evt;
				},
				event
			);
		},
		content: function () {
			if (!trigger.card.storage) trigger.card.storage = {};
			trigger.card.storage.sbpaoxiao = true;
			trigger.baseDamage++;
			trigger.directHit.addArray(game.players);
			player.addTempSkill("sbpaoxiao_effect", "phaseUseAfter");
		},
		subSkill: {
			effect: {
				charlotte: true,
				trigger: { player: "useCardToPlayered" },
				forced: true,
				popup: false,
				filter: function (event, player) {
					return event.card.storage && event.card.storage.sbpaoxiao && event.target.isIn();
				},
				content: function () {
					trigger.target.addTempSkill("fengyin");
				},
				group: "sbpaoxiao_recoil",
			},
			recoil: {
				charlotte: true,
				trigger: { source: "damageSource" },
				forced: true,
				filter: function (event, player) {
					return event.card && event.card.storage && event.card.storage.sbpaoxiao && event.player.isIn();
				},
				content: function () {
					"step 0";
					player.loseHp();
					"step 1";
					var hs = player.getCards("h", function (card) {
						return lib.filter.cardDiscardable(card, player, "sbpaoxiao_recoil");
					});
					if (hs.length > 0) player.discard(hs.randomGet());
				},
			},
		},
	},
	sbxieji: {
		audio: 3,
		trigger: { player: "phaseZhunbeiBegin" },
		direct: true,
		content: function () {
			"step 0";
			player.chooseTarget(lib.filter.notMe, get.prompt("sbxieji"), "和一名其他角色进行“协力”").set("ai", function (target) {
				return get.threaten(target) * Math.sqrt(1 + target.countCards("h")) * (target.isTurnedOver() || target.hasJudge("lebu") ? 0.1 : 1);
			});
			"step 1";
			if (result.bool) {
				var target = result.targets[0];
				player.logSkill("sbxieji", target);
				//选择对方的协击条件
				player.chooseCooperationFor(target, "sbxieji").set("ai", function (button) {
					var base = 0;
					switch (button.link) {
						case "cooperation_damage":
							base = 0.8;
							break;
						case "cooperation_draw":
							base = 0.1;
							break;
						case "cooperation_discard":
							base = 0.1;
							break;
						case "cooperation_use":
							base = 0.1;
							break;
					}
					return base + Math.random();
				});
				//保证技能cooperation被移除之后 失去该技能
				player.addAdditionalSkill("cooperation", "sbxieji_effect");
			} else event.finish();
			"step 2";
			game.delayx();
		},
		subSkill: {
			effect: {
				audio: "sbxieji",
				charlotte: true,
				trigger: { global: "phaseJieshuBegin" },
				direct: true,
				filter: function (event, player) {
					//判断自己是否有目标为该角色 且已经完成的协力记录
					return player.checkCooperationStatus(event.player, "sbxieji");
				},
				content: function () {
					"step 0";
					game.log(player, "和", trigger.player, "的协力成功");
					player
						.chooseTarget("协击：请选择【杀】的目标", "你和" + get.translation(trigger.player) + "协力成功，可以视为对至多三名其他角色使用一张【杀】，且此【杀】造成伤害时，你摸等同于伤害值的牌", [1, 3], true, function (card, player, target) {
							return player.canUse("sha", target, false);
						})
						.set("ai", function (target) {
							var player = _status.event.player;
							return get.effect(target, { name: "sha" }, player, player);
						});
					"step 1";
					if (result.bool) {
						player.addTempSkill("sbxieji_reward", "sbxieji_effectAfter");
						player.useCard(
							{
								name: "sha",
								isCard: true,
								storage: { sbxieji: true },
							},
							"sbxieji_effect",
							result.targets
						);
					}
				},
			},
			reward: {
				charlotte: true,
				trigger: { source: "damageSource" },
				forced: true,
				popup: false,
				filter: function (event, player) {
					return event.card && event.card.storage && event.card.storage.sbxieji && event.getParent().type == "card";
				},
				content: function () {
					player.draw(trigger.num);
				},
			},
		},
	},
	//徐晃
	sbduanliang: {
		audio: 1,
		enable: "phaseUse",
		usable: 1,
		filterTarget: lib.filter.notMe,
		content: function () {
			"step 0";
			player
				.chooseToDuiben(target)
				.set("title", "谋弈")
				.set("namelist", ["固守城池", "突出重围", "围城断粮", "擂鼓进军"])
				.set("translationList", [`以防止${get.translation(player)}通过此技能对你使用【决斗】`, `以防止${get.translation(player)}通过此技能对你使用【兵粮寸断】`, `若成功，将牌堆顶的牌当做【兵粮寸断】对${get.translation(target)}使用`, `若成功，视为对${get.translation(target)}使用【决斗】`])
				.set("ai", button => {
					var source = _status.event.getParent().player,
						target = _status.event.getParent().target;
					if (get.effect(target, { name: "juedou" }, source, source) >= 10 && button.link[2] == "db_def2" && Math.random() < 0.5) return 10;
					return 1 + Math.random();
				});
			"step 1";
			if (result.bool) {
				if (result.player == "db_def1") {
					if (target.hasJudge("bingliang")) player.gainPlayerCard(target, "he", true);
					else {
						if (ui.cardPile.childNodes.length > 0) {
							if (player.canUse(get.autoViewAs({ name: "bingliang" }, [ui.cardPile.firstChild]), target, false)) {
								player.useCard({ name: "bingliang" }, target, get.cards());
							}
						}
					}
				} else {
					var card = { name: "juedou", isCard: true };
					if (player.canUse(card, target)) player.useCard(card, target);
				}
			}
		},
		ai: {
			threaten: 1.2,
			order: 5.5,
			result: {
				player: 1,
				target: -1,
			},
		},
		subSkill: {
			true1: { audio: true },
			true2: { audio: true },
			false: { audio: true },
		},
	},
	sbshipo: {
		audio: 2,
		trigger: { player: "phaseJieshuBegin" },
		direct: true,
		filter: function (event, player) {
			return game.hasPlayer(current => {
				return current.hp < player.hp || current.hasJudge("bingliang");
			});
		},
		content: function () {
			"step 0";
			var list = [];
			var choiceList = ["选择一名体力少于你的角色", "选择所有判定区有兵粮寸断的其他角色"];
			var bool = false,
				bool2 = false;
			game.filterPlayer(current => {
				if (current.hp < player.hp) bool = true;
				if (current.hasJudge("bingliang")) bool2 = true;
			});
			if (bool) list.push("选项一");
			else choiceList[0] = '<span style="opacity:0.5">' + choiceList[0] + "</span>";
			if (bool2) list.push("选项二");
			else choiceList[1] = '<span style="opacity:0.5">' + choiceList[1] + "</span>";
			if (_status.connectMode)
				game.broadcastAll(function () {
					_status.noclearcountdown = true;
				});
			player
				.chooseControl(list, "cancel2")
				.set("prompt", get.prompt2("sbshipo"))
				.set("choiceList", choiceList)
				.set("ai", () => {
					return _status.event.choice;
				})
				.set(
					"choice",
					(function () {
						var eff = 0,
							eff2 = 0;
						if (!list.includes("选项一")) eff = Infinity;
						if (!list.includes("选项二")) eff2 = Infinity;
						game.countPlayer(current => {
							if (current.hp < player.hp) {
								var effx = get.attitude(player, current) / Math.sqrt(Math.max(0.1, 2 * current.hp + current.countCards("h")));
								if (effx < eff) eff = effx;
							}
							if (current.hasJudge("bingliang")) eff2 += get.attitude(player, current) / Math.sqrt(Math.max(0.1, 2 * current.hp + current.countCards("h")));
						});
						if (eff > 0 && eff2 > 0) return "cancel2";
						return eff < eff2 ? "选项一" : "选项二";
					})()
				);
			"step 1";
			if (result.control == "cancel2") {
				game.broadcastAll(function () {
					delete _status.noclearcountdown;
					game.stopCountChoose();
				});
				event.finish();
				return;
			}
			if (result.control == "选项一") {
				player.chooseTarget("选择一名体力少于你的角色", (card, player, target) => target.hp < player.hp, true).set("ai", target => -get.attitude(player, target) / Math.sqrt(Math.max(0.1, 2 * target.hp + target.countCards("h"))));
			} else {
				event._result = {
					bool: true,
					targets: game.filterPlayer(current => current.hasJudge("bingliang")),
				};
			}
			"step 2";
			game.broadcastAll(function () {
				delete _status.noclearcountdown;
				game.stopCountChoose();
			});
			if (result.bool) {
				var targets = result.targets;
				player.logSkill("sbshipo", targets);
				event.targets = targets.sortBySeat();
				event.cards = [];
			} else event.finish();
			"step 3";
			var target = event.targets.shift();
			event.target = target;
			target.chooseCard("交给" + get.translation(player) + "一张手牌，或受到1点伤害").set("ai", card => {
				var player = _status.event.player,
					source = _status.event.getParent().player;
				if (get.damageEffect(player, source, player) > 0) return 0;
				if (get.attitude(player, source) > 0) return 1;
				if (get.tag(card, "recover") > 0) return 0;
				return (player.hp < 2 ? 7 : 5.5) - get.value(card);
			});
			"step 4";
			if (result.bool) {
				event.cards.addArray(result.cards);
				target.give(result.cards, player);
			} else {
				target.damage();
			}
			"step 5";
			if (event.targets.length) event.goto(3);
			else {
				var cards = event.cards.filter(card => get.owner(card) == player && get.position(card) == "h");
				if (!cards.length) event.finish();
				else event.cards = cards;
			}
			"step 6";
			player.chooseCardTarget({
				filterCard: function (card, player, target) {
					return _status.event.getParent().cards.includes(card);
				},
				filterTarget: lib.filter.notMe,
				selectCard: [1, event.cards.length],
				prompt: "是否将任意张得到的牌交给一名其他角色？",
				ai1: function (card) {
					var player = _status.event.player;
					var val = player.getUseValue(card);
					if (val > 0) return 2;
					if (player.hp <= 2 && val == 0 && get.value(card) > 5) return 0;
					return Math.random() > 0.5 ? 1 : 0;
				},
				ai2: function (target) {
					var player = _status.event.player,
						cards = ui.selected.cards;
					var val = 0;
					for (var card of cards) {
						val += target.getUseValue(card);
					}
					if (val > 0) return val * get.attitude(player, target) * 2;
					return get.value(card, target) * get.attitude(player, target);
				},
			});
			"step 7";
			if (result.bool) {
				var cards = result.cards,
					target = result.targets[0];
				player.give(cards, target);
			}
		},
	},
	//马超
	sbtieji: {
		audio: 1,
		trigger: { player: "useCardToPlayered" },
		logTarget: "target",
		filter: function (event, player) {
			return player != event.target && event.card.name == "sha" && event.target.isIn();
		},
		check: function (event, player) {
			return get.attitude(player, event.target) < 0;
		},
		content: function () {
			"step 0";
			var target = trigger.target;
			event.target = target;
			target.addTempSkill("fengyin");
			trigger.directHit.add(target);
			player
				.chooseToDuiben(target)
				.set("title", "谋弈")
				.set("namelist", ["出阵迎战", "拱卫中军", "直取敌营", "扰阵疲敌"])
				.set("translationList", [`以防止${get.translation(player)}摸2张牌`, `以防止${get.translation(player)}获得你1张牌`, `若成功，你获得${get.translation(target)}1张牌`, `若成功，你摸2张牌`])
				.set("ai", button => {
					var source = get.event().getParent().player,
						target = get.event().getParent().target;
					if (!target.countCards("he") && button.link[2] == "db_def2") return 10;
					if (!target.countCards("he") && get.attitude(target, source) <= 0 && button.link[2] == "db_atk1") return 10;
					return 1 + Math.random();
				});
			"step 1";
			if (result.bool) {
				if (result.player == "db_def1") player.gainPlayerCard(target, "he", true);
				else player.draw(2);
			}
		},
		shaRelated: true,
		ai: {
			ignoreSkill: true,
			skillTagFilter: function (player, tag, arg) {
				if (tag == "directHit_ai") {
					return get.attitude(player, arg.target) <= 0;
				}
				if (!arg || arg.isLink || !arg.card || arg.card.name != "sha") return false;
				if (!arg.target || get.attitude(player, arg.target) >= 0) return false;
				if (!arg.skill || !lib.skill[arg.skill] || lib.skill[arg.skill].charlotte || lib.skill[arg.skill].persevereSkill || get.is.locked(arg.skill) || !arg.target.getSkills(true, false).includes(arg.skill)) return false;
			},
			directHit_ai: true,
		},
		subSkill: {
			true1: { audio: true },
			true2: { audio: true },
			false: { audio: true },
		},
	},
	//甘宁
	sbqixi: {
		audio: 2,
		enable: "phaseUse",
		usable: 1,
		filter: function (event, player) {
			return player.countCards("h") > 0;
		},
		filterTarget: lib.filter.notMe,
		content: function () {
			"step 0";
			event.list = lib.suit.slice();
			event.suits = [];
			event.num = 0;
			var cards = player.getCards("h"),
				map = {},
				max = -Infinity;
			for (var card of cards) {
				var suit = get.suit(card, player);
				if (!map[suit]) map[suit] = 0;
				map[suit]++;
				if (map[suit] > max) max = map[suit];
			}
			for (var i in map) {
				if (map[i] == max) event.suits.push(i);
			}
			"step 1";
			target
				.chooseControl(event.list)
				.set("prompt", "奇袭：猜测" + get.translation(player) + "手牌中最多的花色")
				.set("ai", () => {
					var player = _status.event.getParent().player,
						controls = _status.event.controls;
					if (player.countCards("h") <= 3 && controls.includes("diamond") && Math.random() < 0.3) return "diamond";
					return controls.randomGet();
				});
			"step 2";
			var control = result.control;
			target.chat("我猜是" + get.translation(control) + "！");
			game.log(target, "猜测为", "#y" + control);
			if (!event.isMine() && !event.isOnline()) game.delayx();
			"step 3";
			var control = result.control;
			if (!event.suits.includes(control)) {
				player.chat("猜错了！");
				game.log(target, "猜测", "#y错误");
				event.num++;
				event.list.remove(control);
				player.chooseBool("是否令其重新选择一个花色继续猜测？").set("ai", () => 1);
			} else {
				player.chat(event.num == 0 ? "这么准？" : "猜对了！");
				game.log(target, "猜测", "#g正确");
				player.showHandcards();
				event.goto(4);
			}
			"step 4";
			if (result.bool) {
				event.goto(1);
			}
			"step 5";
			if (event.num > 0 && target.countDiscardableCards(player, "hej")) {
				player.line(target);
				player.discardPlayerCard(target, event.num, true, "hej");
			}
		},
		ai: {
			order: 10,
			result: {
				player: 1,
				target: function (player, target) {
					return get.effect(target, { name: "guohe" }, player, target) * (5 - get.attitude(player, target) / 2);
				},
			},
		},
	},
	sbfenwei: {
		audio: 2,
		enable: "phaseUse",
		filter: function (event, player) {
			return player.countCards("he") > 0;
		},
		skillAnimation: true,
		animationColor: "wood",
		limited: true,
		position: "he",
		filterCard: true,
		selectCard: [1, 3],
		filterTarget: true,
		selectTarget: function () {
			return ui.selected.cards.length;
		},
		delay: false,
		discard: false,
		lose: false,
		complexSelect: true,
		filterOk: function () {
			return ui.selected.targets.length == ui.selected.cards.length;
		},
		multitarget: true,
		multiline: true,
		check: function (card) {
			return 7 - get.value(card);
		},
		content: function () {
			"step 0";
			player.awakenSkill("sbfenwei");
			for (var i = 0; i < cards.length; i++) {
				targets[i].addToExpansion(cards[i], player, "give").gaintag.add("sbfenwei_effect");
			}
			"step 1";
			player.addSkill("sbfenwei_effect");
			player.draw(cards.length);
		},
		intro: {
			content: "limited",
		},
		ai: {
			order: 6.9,
			result: {
				target: function (player, target) {
					if (
						game.hasPlayer(current => {
							return get.rawAttitude(player, current) > 0 && current != player && get.attitude(player, current) <= 0;
						}) &&
						game.countPlayer(current => {
							return get.attitude(player, current) > 0;
						}) <= 2
					)
						return 0;
					return 1;
				},
			},
		},
		subSkill: {
			effect: {
				audio: "sbfenwei",
				trigger: {
					global: "useCardToTarget",
				},
				charlotte: true,
				forced: true,
				filter: function (event, player) {
					return event.target.getExpansions("sbfenwei_effect").length > 0 && get.type2(event.card) == "trick";
				},
				content: function () {
					"step 0";
					var choiceList = ["令" + get.translation(trigger.target) + "获得其“威”", "移去" + get.translation(trigger.target) + "的“威”，取消" + get.translation(trigger.card) + "对其的目标"];
					player
						.chooseControl()
						.set("choiceList", choiceList)
						.set("prompt", "奋威：请选择一项")
						.set("ai", () => {
							var player = _status.event.player,
								evt = _status.event.getTrigger();
							if (get.effect(evt.target, evt.card, evt.player, player) < -10) return 1;
							return 0;
						});
					"step 1";
					var cards = trigger.target.getExpansions("sbfenwei_effect");
					if (result.index == 0) {
						trigger.target.gain(cards, "gain2", "fromStorage");
					} else {
						trigger.target.loseToDiscardpile(cards);
						trigger.targets.remove(trigger.target);
						trigger.getParent().triggeredTargets2.remove(trigger.target);
						trigger.untrigger();
					}
				},
				marktext: "威",
				intro: {
					name: "威",
					markcount: "expansion",
					content: "expansion",
				},
			},
		},
	},
	//甄宓
	sbluoshen: {
		audio: 2,
		trigger: { player: "phaseZhunbeiBegin" },
		direct: true,
		content: function () {
			"step 0";
			player.chooseTarget(get.prompt2("sbluoshen")).set("ai", target => {
				var eff = 0;
				var num = Math.ceil(game.countPlayer() / 2),
					players = game
						.filterPlayer(current => current != player)
						.sortBySeat(target)
						.slice(0, num);
				for (var targetx of players) {
					eff += get.attitude(player, targetx) * Math.sqrt(targetx.countCards("h"));
				}
				return 1 - eff;
			});
			"step 1";
			if (result.bool) {
				var target = result.targets[0];
				player.logSkill("sbluoshen", target);
				player.addTempSkill("sbluoshen_add");
				event.targets = game
					.filterPlayer(current => current != player)
					.sortBySeat(target)
					.slice(0, Math.ceil(game.countPlayer() / 2));
			} else event.finish();
			"step 2";
			var target = event.targets.shift();
			event.target = target;
			player.line(target);
			if (!target.countCards("h")) event._result = { bool: false };
			else
				target
					.chooseCard("展示一张手牌", true)
					.set("ai", card => {
						var val = _status.event.goon ? 15 : 5;
						if (get.color(card) == "black") return val - get.value(card);
						return 7 - get.value(card);
					})
					.set("goon", get.attitude(target, player) > 0);
			"step 3";
			if (result.bool) {
				var card = result.cards[0];
				target.showCards(card, get.translation(target) + "【洛神】展示");
				if (get.color(card) == "black") {
					player.gain(card, target, "give", "bySelf").gaintag.add("sbluoshen");
				} else if (get.color(card) == "red") {
					target.discard(card);
				}
			}
			"step 4";
			if (targets.length) event.goto(2);
		},
		subSkill: {
			add: {
				mod: {
					ignoredHandcard: function (card, player) {
						if (card.hasGaintag("sbluoshen")) {
							return true;
						}
					},
					cardDiscardable: function (card, player, name) {
						if (name == "phaseDiscard" && card.hasGaintag("sbluoshen")) {
							return false;
						}
					},
				},
				onremove: function (player) {
					player.removeGaintag("sbluoshen");
				},
			},
		},
	},
	//曹操
	sbjianxiong: {
		audio: 2,
		trigger: { player: "damageEnd" },
		group: "sbjianxiong_mark",
		filter: function (event, player) {
			return (get.itemtype(event.cards) == "cards" && event.cards.some(i => get.position(i, true) == "o")) || 1 - player.countMark("sbjianxiong") > 0;
		},
		prompt2: function (event, player) {
			var gain = get.itemtype(event.cards) == "cards" && event.cards.some(i => get.position(i, true) == "o"),
				draw = 1 - player.countMark("sbjianxiong");
			var str = "";
			if (gain) str += "获得" + get.translation(event.cards);
			if (gain && draw > 0) str += "并";
			if (draw > 0) str += "摸" + get.cnNumber(1 - player.countMark("sbjianxiong")) + "张牌";
			if (player.countMark("sbjianxiong")) str += "，然后可以弃1枚“治世”";
			return str;
		},
		content: function () {
			"step 0";
			if (get.itemtype(trigger.cards) == "cards" && trigger.cards.some(i => get.position(i, true) == "o")) {
				player.gain(trigger.cards, "gain2");
			}
			var num = player.countMark("sbjianxiong");
			if (1 - num > 0) {
				player.draw(1 - num, "nodelay");
			}
			if (!num) event.finish();
			"step 1";
			player.chooseBool("是否弃1枚“治世”？").set("ai", () => {
				var player = _status.event.player,
					current = _status.currentPhase;
				if (get.distance(current, player, "absolute") > 3 && player.hp <= 2) return true;
				return false;
			});
			"step 2";
			if (result.bool) {
				player.removeMark("sbjianxiong", 1);
			}
		},
		ai: {
			maixie: true,
			maixie_hp: true,
			effect: {
				target: function (card, player, target) {
					if (player.hasSkillTag("jueqing", false, target)) return [1, -1];
					if (get.tag(card, "damage") && player != target) {
						var cards = card.cards,
							evt = _status.event;
						if (evt.player == target && card.name == "damage" && evt.getParent().type == "card") cards = evt.getParent().cards.filterInD();
						if (target.hp <= 1) return;
						if (get.itemtype(cards) != "cards") return;
						for (var i of cards) {
							if (get.name(i, target) == "tao") return [1, 5];
						}
						if (get.value(cards, target) >= 7 + target.getDamagedHp()) return [1, 3];
						return [1, 0.55 + 0.05 * Math.max(0, 1 - target.countMark("sbjianxiong"))];
					}
				},
			},
		},
		marktext: "治",
		intro: {
			name: "治世",
			name2: "治世",
			content: "mark",
		},
		subSkill: {
			mark: {
				audio: "sbjianxiong",
				trigger: { global: "phaseBefore", player: "enterGame" },
				forced: true,
				filter: function (event, player) {
					return event.name != "phase" || game.phaseNumber == 0;
				},
				content: function () {
					"step 0";
					var map = {};
					var list = [];
					for (var i = 1; i <= 2; i++) {
						var cn = get.cnNumber(i, true);
						map[cn] = i;
						list.push(cn);
					}
					event.map = map;
					list.push("cancel2");
					player
						.chooseControl(list, function () {
							return get.cnNumber(2, true);
						})
						.set("prompt", "奸雄：获得任意枚“治世”标记");
					"step 1";
					if (result.control != "cancel2") player.addMark("sbjianxiong", event.map[result.control]);
				},
			},
		},
	},
	sbqingzheng: {
		audio: 2,
		audioname: ["mb_caomao"],
		trigger: { player: "phaseUseBegin" },
		filter: function (event, player) {
			return player.countCards("h") > 0;
		},
		direct: true,
		content: function () {
			"step 0";
			var num = 3 - player.countMark("sbjianxiong");
			var prompt = "###" + get.prompt("sbqingzheng") + "###弃置" + get.cnNumber(num) + "种花色的所有牌";
			var next = player.chooseButton([prompt, [lib.suit.map(i => ["", "", "lukai_" + i]), "vcard"]], num);
			next.set("filterButton", button => {
				var player = _status.event.player;
				var cards = player.getCards("h", { suit: button.link[2].slice(6) });
				return cards.length > 0 && cards.filter(card => lib.filter.cardDiscardable(card, player, "sbqingzheng")).length == cards.length;
			});
			next.set("ai", button => {
				var player = _status.event.player;
				return (
					player.countMark("sbjianxiong") * 15 -
					player
						.getCards("h", { suit: button.link[2].slice(6) })
						.map(i => get.value(i))
						.reduce((p, c) => p + c, 0)
				);
			});
			next.set("custom", {
				replace: {
					button: function (button) {
						if (!_status.event.isMine()) return;
						if (button.classList.contains("selectable") == false) return;
						var cards = _status.event.player.getCards("h", {
							suit: button.link[2].slice(6),
						});
						if (cards.length) {
							var chosen = cards.filter(i => ui.selected.cards.includes(i)).length == cards.length;
							if (chosen) {
								ui.selected.cards.removeArray(cards);
								cards.forEach(card => {
									card.classList.remove("selected");
									card.updateTransform(false);
								});
							} else {
								ui.selected.cards.addArray(cards);
								cards.forEach(card => {
									card.classList.add("selected");
									card.updateTransform(true);
								});
							}
						}
						if (button.classList.contains("selected")) {
							ui.selected.buttons.remove(button);
							button.classList.remove("selected");
							if (_status.multitarget || _status.event.complexSelect) {
								game.uncheck();
								game.check();
							}
						} else {
							button.classList.add("selected");
							ui.selected.buttons.add(button);
						}
						var custom = _status.event.custom;
						if (custom && custom.add && custom.add.button) {
							custom.add.button();
						}
						game.check();
					},
				},
				add: next.custom.add,
			});
			"step 1";
			if (result.bool) {
				var cards = result.cards;
				if (!cards.length) {
					var suits = result.links.map(i => i[2].slice(6));
					cards = player.getCards("h", card => suits.includes(get.suit(card, player)));
				}
				event.cards = cards;
				if (!cards.length) event.finish();
				else
					player
						.chooseTarget("清正：观看一名其他角色的手牌并弃置其中一种花色的所有牌", (card, player, target) => {
							return target != player && target.countCards("h");
						})
						.set("ai", target => {
							var player = _status.event.player,
								att = get.attitude(player, target);
							if (att >= 0) return 0;
							return 1 - att / 2 + Math.sqrt(target.countCards("h"));
						});
			} else event.finish();
			"step 2";
			if (result.bool) {
				var target = result.targets[0];
				event.target = target;
				player.logSkill("sbqingzheng", target);
				player.discard(cards);
				var list = [];
				var dialog = ["清正：弃置" + get.translation(target) + "一种花色的所有牌"];
				for (var suit of lib.suit.concat("none")) {
					if (target.countCards("h", { suit: suit })) {
						dialog.push('<div class="text center">' + get.translation(suit + "2") + "牌</div>");
						dialog.push(target.getCards("h", { suit: suit }));
						list.push(suit);
					}
				}
				if (list.length) {
					player
						.chooseControl(list)
						.set("dialog", dialog)
						.set("ai", () => {
							return _status.event.control;
						})
						.set(
							"control",
							(() => {
								var getv = cards => cards.map(i => get.value(i)).reduce((p, c) => p + c, 0);
								return list.sort((a, b) => {
									return getv(target.getCards("h", { suit: b })) - getv(target.getCards("h", { suit: a }));
								})[0];
							})()
						);
				}
			} else event.finish();
			"step 3";
			var cards2 = target.getCards("h", { suit: result.control });
			event.cards2 = cards2;
			target.discard(cards2, "notBySelf").set("discarder", player);
			"step 4";
			if (event.cards2.length < cards.length) target.damage();
			"step 5";
			if (player.countMark("sbjianxiong") < 2 && player.hasSkill("sbjianxiong")) {
				player.chooseBool("是否获得1枚“治世”？").set("ai", () => (Math.random() < 0.5 ? 0 : 1));
			} else event.finish();
			"step 6";
			if (result.bool) {
				player.addMark("sbjianxiong", 1);
			}
		},
		ai: { combo: "sbjianxiong" },
	},
	sbhujia: {
		audio: 2,
		trigger: { player: "damageBegin4" },
		zhuSkill: true,
		direct: true,
		filter: function (event, player) {
			return (
				!player.hasSkill("sbhujia_used") &&
				game.hasPlayer(current => {
					return current != player && current.group == "wei" && player.hasZhuSkill("sbhujia", current);
				})
			);
		},
		content: function () {
			"step 0";
			player
				.chooseTarget(get.prompt("sbhujia"), "将" + get.translation(trigger.source) + "即将对你造成的" + trigger.num + "点伤害转移给一名其他魏势力角色", (card, player, target) => {
					return target != player && target.group == "wei" && player.hasZhuSkill("sbhujia", target);
				})
				.set("ai", target => {
					var player = _status.event.player,
						evt = _status.event.getTrigger();
					return get.damageEffect(target, evt.source, player, evt.nature) - _status.event.eff;
				})
				.set("eff", get.damageEffect(player, trigger.source, player, trigger.nature));
			"step 1";
			if (result.bool) {
				var target = result.targets[0];
				player.logSkill("sbhujia", target);
				player.addTempSkill("sbhujia_used", "roundStart");
				trigger.cancel();
				if (trigger.source) target.damage(trigger.source, trigger.nature, trigger.num).set("card", trigger.card).set("cards", trigger.cards);
				else target.damage("nosource", trigger.nature, trigger.num).set("card", trigger.card).set("cards", trigger.cards);
			}
		},
		ai: {
			maixie_defend: true,
			effect: {
				target: function (card, player, target) {
					if (player.hasSkillTag("jueqing", false, target)) return;
					if (
						get.tag(card, "damage") &&
						!target.hasSkill("sbhujia_used") &&
						game.hasPlayer(current => {
							return current != target && current.group == "wei" && target.hasZhuSkill("sbhujia", current);
						})
					)
						return 0.8;
				},
			},
			threaten: function (player, target) {
				if (target.countCards("h") == 0) return 2;
			},
		},
		subSkill: {
			used: { charlotte: true },
		},
	},
	//张角
	sbleiji: {
		audio: 2,
		enable: "phaseUse",
		filter: function (event, player) {
			return player.countMark("sbguidao") >= 4;
		},
		filterTarget: lib.filter.notMe,
		content: function () {
			player.removeMark("sbguidao", 4);
			target.damage("thunder");
		},
		ai: {
			combo: "sbguidao",
			order: 9,
			result: {
				target: function (player, target) {
					return get.damageEffect(target, player, target, "thunder");
				},
			},
		},
	},
	sbguidao: {
		audio: 2,
		trigger: {
			global: ["phaseBefore", "damageEnd"],
			player: "enterGame",
		},
		forced: true,
		locked: false,
		group: "sbguidao_defend",
		filter: function (event, player) {
			if (player.countMark("sbguidao") >= 8) return false;
			if (event.name == "damage") return event.hasNature() && !player.hasSkill("sbguidao_forbid");
			return event.name != "phase" || game.phaseNumber == 0;
		},
		content: function () {
			var num = 2;
			if (trigger.name == "damage" && get.mode() == "identity") num --;
			num = Math.min(8 - player.countMark("sbguidao"), num);
			player.addMark("sbguidao", num);
		},
		marktext: "兵",
		intro: {
			name: "道兵",
			name2: "道兵",
			content: "共有$枚“道兵”",
		},
		subSkill: {
			defend: {
				audio: "sbguidao",
				trigger: { player: "damageBegin4" },
				filter: function (event, player) {
					return player.countMark("sbguidao") >= 2;
				},
				prompt2: "弃2枚“道兵”，防止伤害",
				check: function (event, player) {
					return event.num >= 2 || player.hp <= event.num;
				},
				content: function () {
					trigger.cancel();
					player.removeMark("sbguidao", 2);
					if (player != _status.currentPhase) {
						player.addTempSkill("sbguidao_forbid", { player: "phaseBegin" });
					}
				},
			},
			forbid: { charlotte: true },
		},
	},
	sbhuangtian: {
		audio: 2,
		trigger: {
			player: "phaseBegin",
		},
		forced: true,
		zhuSkill: true,
		group: "sbhuangtian_mark",
		filter: function (event, player) {
			if (player.phaseNumber > 1 || game.phaseNumber > 1) return false;
			if (!player.hasZhuSkill("sbhuangtian")) return false;
			return (
				!game.hasPlayer(function (current) {
					return current.countCards("hej", "taipingyaoshu");
				}) &&
				!Array.from(ui.cardPile.childNodes)
					.concat(Array.from(ui.discardPile.childNodes))
					.concat(Array.from(ui.ordering.childNodes))
					.map(i => i.name)
					.includes("taipingyaoshu")
			);
		},
		content: function () {
			"step 0";
			if (!lib.inpile.includes("taipingyaoshu")) {
				lib.inpile.push("taipingyaoshu");
			}
			event.card = game.createCard2("taipingyaoshu", "heart", 3);
			"step 1";
			if (card) player.equip(card);
		},
		subSkill: {
			mark: {
				audio: "sbhuangtiang",
				trigger: { global: "damageSource" },
				forced: true,
				zhuSkill: true,
				filter: function (event, player) {
					if (!player.hasZhuSkill("sbhuangtian") || !player.hasSkill("sbguidao", null, false, false)) return false;
					if (!event.source || player == event.source || event.source.group != "qun") return false;
					if (player.hasSkill("sbguidao") && player.countMark("sbguidao") >= 8) return false;
					if (player.countMark("sbhuangtian_count") >= 4) return false;
					return true;
				},
				content: function () {
					var num = Math.min(8 - player.countMark("sbhuangtian_count"), 2);
					player.addMark("sbguidao", num);
					player.addTempSkill("sbhuangtian_count", "roundStart");
					player.addMark("sbhuangtian_count", num, false);
				},
			},
			count: { onremove: true },
		},
	},
	//夏侯氏
	sbqiaoshi: {
		audio: 2,
		trigger: { player: "damageEnd" },
		usable: 1,
		direct: true,
		filter: function (event, player) {
			return event.source && event.source != player && event.source.isIn();
		},
		content: function () {
			"step 0";
			trigger.source
				.chooseBool("樵拾：是否令" + get.translation(player) + "回复" + trigger.num + "点体力，然后你摸两张牌？")
				.set("ai", () => {
					return _status.event.bool;
				})
				.set("bool", get.recoverEffect(player, trigger.source, trigger.source) + 2 * get.effect(trigger.source, { name: "draw" }, trigger.source) > 5);
			"step 1";
			if (result.bool) {
				player.logSkill("sbqiaoshi");
				trigger.source.line(player, "green");
				player.recover(trigger.num);
				trigger.source.draw(2);
			} else player.storage.counttrigger.sbqiaoshi--;
		},
		ai: {
			effect: {
				target: function (card, player, target) {
					if (get.tag(card, "damage")) {
						if (get.attitude(target, player) <= 0 || target == player) return;
						if (target.storage.counttrigger && target.storage.counttrigger.sbqiaoshi) return;
						if (target.hp <= 1 && !player.canSave(target)) return;
						return [0, 0.5, 0, 0.5];
					}
				},
			},
		},
	},
	sbyanyu: {
		enable: "phaseUse",
		usable: 2,
		filterCard: { name: "sha" },
		selectCard: 1,
		group: "sbyanyu_draw",
		check: () => 1,
		content: function () {
			player.draw();
		},
		subSkill: {
			draw: {
				trigger: { player: "phaseUseEnd" },
				filter: function (event, player) {
					return player.getHistory("useSkill", evt => {
						if (evt.skill != "sbyanyu") return false;
						var evtx = evt.event.getParent("phaseUse");
						if (!evtx || evtx != _status.event.getParent("phaseUse")) return;
						return true;
					}).length;
				},
				direct: true,
				content: function () {
					"step 0";
					event.num =
						3 *
						player.getHistory("useSkill", evt => {
							if (evt.skill != "sbyanyu") return false;
							var evtx = evt.event.getParent("phaseUse");
							if (!evtx || evtx != _status.event.getParent("phaseUse")) return;
							return true;
						}).length;
					player.chooseTarget(get.prompt("sbyanyu"), "令一名其他角色摸" + get.cnNumber(event.num) + "张牌", lib.filter.notMe).set("ai", target => {
						var player = _status.event.player;
						return get.effect(target, { name: "draw" }, player, player);
					});
					"step 1";
					if (result.bool) {
						var target = result.targets[0];
						player.logSkill("sbyanyu_draw", target);
						target.draw(num);
					}
				},
			},
		},
		ai: {
			order: function (obj, player) {
				if (
					game.hasPlayer(current => current != player && get.attitude(player, current) > 0) &&
					player.getHistory("useSkill", evt => {
						if (evt.skill != "sbyanyu") return false;
						var evtx = evt.event.getParent("phaseUse");
						if (!evtx || evtx != _status.event.getParent("phaseUse")) return;
						return true;
					}).length < 2
				)
					return 9;
				return 2;
			},
			result: {
				player: 1,
			},
		},
	},
	//曹仁
	sbjushou: {
		audio: 3,
		enable: "phaseUse",
		usable: 1,
		filter: function (event, player) {
			return !player.isTurnedOver();
		},
		filterCard: true,
		selectCard: [1, 2],
		check: function (card) {
			if (ui.selected.cards.length + _status.event.player.hujia >= 5) return 0;
			return 6.5 - get.value(card);
		},
		position: "he",
		group: ["sbjushou_damage", "sbjushou_draw"],
		content: function () {
			player.turnOver();
			player.changeHujia(cards.length, null, true);
		},
		ai: {
			order: 5,
			result: {
				player: 1,
			},
		},
		subSkill: {
			damage: {
				audio: "sbjushou",
				trigger: {
					player: "damageEnd",
				},
				filter: function (event, player) {
					return player.isTurnedOver();
				},
				direct: true,
				content: function () {
					"step 0";
					player
						.chooseControl("翻面", "获得1点护甲", "cancel2")
						.set("ai", () => {
							if (_status.event.player.hujia >= 3) return 0;
							return 1;
						})
						.set("prompt", get.prompt("sbjushou"))
						.set("prompt2", "选择一项");
					"step 1";
					if (result.control == "cancel2") {
						event.finish();
						return;
					}
					player.logSkill("sbjushou");
					if (result.control == "翻面") {
						player.turnOver();
					} else {
						player.changeHujia(1, null, true);
					}
				},
				ai: {
					effect: {
						target: function (card, player, target) {
							if (!target.isTurnedOver()) return;
							if (get.tag(card, "damage")) {
								if (player.hasSkillTag("jueqing", false, target)) return [1, -2];
								if (
									(card.name == "sha" && !player.hasSkill("jiu")) ||
									target.hasSkillTag("filterDamage", null, {
										player: player,
										card: card,
									})
								)
									return "zerotarget";
							}
						},
					},
				},
			},
			draw: {
				audio: "sbjushou",
				trigger: { player: "turnOverAfter" },
				forced: true,
				locked: false,
				filter: function (event, player) {
					return !player.isTurnedOver() && player.hujia > 0;
				},
				content: function () {
					player.draw(player.hujia);
				},
			},
		},
	},
	sbjiewei: {
		audio: 2,
		enable: "phaseUse",
		usable: 1,
		filter: function (event, player) {
			return player.hujia > 0;
		},
		filterTarget: function (card, player, target) {
			return target != player && target.countCards("h");
		},
		content: function () {
			player.changeHujia(-1);
			player.gainPlayerCard(target, "visible", true, "h").set("ai", function (button) {
				return get.value(button.link, _status.event.target);
			});
		},
		ai: {
			combo: "sbjushou",
			order: 8,
			result: {
				target: -1,
			},
		},
	},
	//周瑜
	sbyingzi: {
		audio: 2,
		audioname: ["sb_sunce"],
		trigger: { player: "phaseDrawBegin2" },
		forced: true,
		getNum: function (player) {
			return (player.countCards("h") >= 2) + (player.hp >= 2) + (player.countCards("e") >= 1);
		},
		filter: function (event, player) {
			return !event.numFixed && lib.skill.sbyingzi.getNum(player) > 0;
		},
		content: function () {
			var num = lib.skill.sbyingzi.getNum(player);
			trigger.num += num;
			player.addTempSkill("sbyingzi_limit");
			player.addMark("sbyingzi_limit", num, false);
		},
		ai: {
			threaten: 2,
		},
		subSkill: {
			limit: {
				charlotte: true,
				forced: true,
				onremove: true,
				marktext: "英",
				intro: {
					content: "本回合手牌上限+#",
				},
				mod: {
					maxHandcard: function (player, num) {
						return num + player.countMark("sbyingzi_limit");
					},
				},
			},
		},
	},
	sbfanjian: {
		audio: 2,
		enable: "phaseUse",
		usable: 5,
		filter: function (event, player) {
			return !player.hasSkill("sbfanjian_ban");
		},
		chooseButton: {
			dialog: function () {
				return ui.create.dialog("###反间###" + get.translation("sbfanjian_info"));
			},
			chooseControl: function (event, player) {
				var suits = lib.suit.slice();
				suits.push("cancel2");
				return suits;
			},
			check: function (event, player) {
				var suits = lib.suit.slice();
				suits = suits.filter(suit => !player.getStorage("sbfanjian_guessed").includes(suit));
				return suits.randomGet();
			},
			backup: function (result, player) {
				return {
					audio: "sbfanjian",
					filterCard: function (card, player) {
						return !player.getStorage("sbfanjian_guessed").includes(get.suit(card, player));
					},
					suit: result.control,
					position: "h",
					filterTarget: lib.filter.notMe,
					check: function (card) {
						return 6 - get.value(card);
					},
					discard: false,
					lose: false,
					delay: false,
					content: function () {
						"step 0";
						var suit = get.suit(cards, player);
						event.claimSuit = lib.skill.sbfanjian_backup.suit;
						event.cardSuit = suit;
						player.addTempSkill("sbfanjian_guessed");
						var claim = get.translation(event.claimSuit + "2");
						player.chat("我声明" + claim);
						game.log(player, "声明了", "#y" + claim);
						var choiceList = ["猜测此牌花色为" + claim, "猜测此牌花色不为" + claim, "不猜测，你翻面并令其〖反间〗失效"];
						target
							.chooseControl()
							.set("choiceList", choiceList)
							.set("prompt", get.translation(player) + "对你发动了【反间】并选择了一张牌，请选择一项")
							.set("ai", () => {
								var player = _status.event.player,
									user = _status.event.getParent().player,
									claim = _status.event.getParent().claimSuit,
									suit = _status.event.getParent().cardSuit;
								if (player.isTurnedOver()) return 2;
								var lose = get.effect(player, { name: "losehp" }, user, player);
								if (user.getStorage("sbfanjian_guessed").includes(claim) && claim == suit) return lose <= 0 ? 0 : 1;
								if (get.attitude(player, user) > 0) return 0;
								var list = [0, 1];
								if (player.hp <= 1 && player.getFriends().length > 0) list.push(2);
								return list.randomGet();
							});
						"step 1";
						player.markAuto("sbfanjian_guessed", [event.cardSuit]);
						if (result.index == 2) {
							game.log(target, "选择", "#y不猜测");
							target.chat("不猜！");
							target.turnOver();
						} else {
							var claim = get.translation(event.claimSuit + "2");
							target.chat("我猜花色" + (result.index == 1 ? "不" : "") + "为" + claim);
							game.log(target, "猜测花色", "#g" + (result.index == 1 ? "不" : "") + "为" + claim);
						}
						if (event.isMine() && !event.isOnline()) game.delayx();
						"step 2";
						target.gain(cards, player, "giveAuto", "bySelf");
						"step 3";
						if ((result.index == 0 && event.claimSuit != event.cardSuit) || (result.index == 1 && event.claimSuit == event.cardSuit)) {
							game.log(target, "猜测", "#y错误");
							target.loseHp();
						} else {
							if (result.index != 2) game.log(target, "猜测", "#g正确");
							player.addTempSkill("sbfanjian_ban");
						}
					},
					ai: {
						result: {
							target: function (player, target) {
								if (!ui.selected.cards.length) return 0;
								var val = get.value(ui.selected.cards, target);
								if (val < 0) return val + get.effect(target, { name: "losehp" }, player, target);
								if (val > 5 || get.value(ui.selected.cards, player) > 5) return target.isTurnedOver() ? 5 : 0;
								if (target.isTurnedOver()) return 1;
								return get.effect(target, { name: "losehp" }, player, target);
							},
						},
					},
				};
			},
			prompt: function (result) {
				return "你选择了" + get.translation(result.control) + "，请选择一张手牌和【反间】的目标";
			},
		},
		subSkill: {
			guessed: { onremove: true, charlotte: true },
			ban: { charlotte: true },
			backup: {},
		},
		ai: {
			order: 4,
			result: { player: 1 },
		},
	},
	//黄盖
	sbkurou: {
		audio: 2,
		trigger: { player: "phaseUseBegin" },
		direct: true,
		group: "sbkurou_gain",
		content: function () {
			"step 0";
			player.chooseCardTarget({
				prompt: get.prompt("sbkurou"),
				prompt2: "交给其他角色一张牌，若此牌为【桃】或【酒】，你失去2点体力，否则你失去1点体力",
				filterCard: true,
				position: "he",
				filterTarget: lib.filter.notMe,
				ai1: function (card) {
					if ((player.hp <= 1 && !player.canSave(player)) || player.hujia >= 5) return 0;
					if (
						get.value(card, player) > 6 &&
						!game.hasPlayer(current => {
							return current != player && get.attitude(current, player) > 0 && !current.hasSkillTag("nogain");
						})
					)
						return 0;
					if (
						player.hp >= 2 &&
						(card.name == "tao" ||
							(card.name == "jiu" &&
								player.countCards("hs", cardx => {
									return cardx != card && get.tag(cardx, "save");
								}))) &&
						player.hujia <= 1
					)
						return 10;
					if (player.hp <= 1 && !player.canSave(player)) return 0;
					return 1 / Math.max(0.1, get.value(card));
				},
				ai2: function (target) {
					var player = _status.event.player,
						att = get.attitude(player, target);
					if (ui.selected.cards.length) {
						var val = get.value(ui.selected.cards[0]);
						att *= val >= 0 ? 1 : -1;
					}
					if (target.hasSkillTag("nogain")) att /= 9;
					return 15 + att;
				},
			});
			"step 1";
			if (result.bool) {
				var target = result.targets[0],
					card = result.cards[0];
				player.logSkill("sbkurou", target);
				if (get.mode() !== "identity" || player.identity !== "nei") player.addExpose(0.15);
				player.give(card, target);
				player.loseHp(["tao", "jiu"].includes(get.name(card, target)) ? 2 : 1);
			}
		},
		ai: {
			nokeep: true,
			skillTagFilter: function (player, tag, arg) {
				if (tag === "nokeep") return (!arg || (arg.card && get.name(arg.card) === "tao")) && player.hp <= 0 && player.isPhaseUsing();
			},
		},
		subSkill: {
			gain: {
				audio: "sbkurou",
				trigger: { player: "loseHpEnd" },
				forced: true,
				locked: false,
				filter: function (event, player) {
					return player.isIn() && player.hujia < 5;
				},
				content: function () {
					"step 0";
					event.count = trigger.num;
					"step 1";
					player.changeHujia(2, null, true);
					"step 2";
					if (--event.count > 0) {
						player.logSkill("sbkurou_gain");
						event.goto(1);
					}
				},
				ai: {
					maihp: true,
					effect: {
						target(card, player, target) {
							if (get.tag(card, "damage")) {
								if (player.hasSkillTag("jueqing", false, target)) return [1, 1];
								return 1.2;
							}
							if (get.tag(card, "loseHp")) {
								if (target.hp <= 1 || target.hujia >= 5) return;
								return [1, 1];
							}
						},
					},
				},
			},
		},
	},
	sbzhaxiang: {
		audio: 2,
		trigger: { player: "useCard" },
		forced: true,
		group: "sbzhaxiang_draw",
		filter: function (event, player) {
			return player.getHistory("useCard").length <= player.getDamagedHp();
		},
		content: function () {
			trigger.directHit.addArray(game.filterPlayer());
		},
		ai: {
			threaten: 1.5,
			directHit_ai: true,
			skillTagFilter: function (player, tag, arg) {
				return player.countUsed() < player.getDamagedHp();
			},
		},
		mod: {
			targetInRange: function (card, player) {
				if (player.countUsed() < player.getDamagedHp()) return true;
			},
			cardUsable: function (card, player) {
				if (player.countUsed() < player.getDamagedHp()) return Infinity;
			},
			aiOrder: function (player, card, num) {
				if (player.countUsed() >= player.getDamagedHp()) return;
				var numx = get.info(card).usable;
				if (typeof numx == "function") numx = num(card, player);
				if (typeof numx == "number") return num + 10;
			},
		},
		subSkill: {
			draw: {
				audio: "sbzhaxiang",
				mod: {
					aiOrder: function (player, card, num) {
						if (num > 0 && _status.event && _status.event.type == "phase" && get.tag(card, "recover")) return num / 5;
					},
				},
				trigger: { player: "phaseDrawBegin2" },
				forced: true,
				filter: function (event, player) {
					return !event.numFixed && player.getDamagedHp() > 0;
				},
				content: function () {
					trigger.num += player.getDamagedHp();
				},
				ai: {
					effect: {
						target: function (card, player, target) {
							if (get.tag(card, "recover") && target.hp > 0 && target.needsToDiscard() < 1) return [0, 0];
						},
					},
				},
			},
		},
	},
	//孙权
	sbzhiheng: {
		audio: 2,
		audioname: ["shen_caopi"],
		locked: false,
		mod: {
			aiOrder: function (player, card, num) {
				if (num <= 0 || get.itemtype(card) !== "card" || get.type(card) !== "equip") return num;
				let eq = player.getEquip(get.subtype(card));
				if (eq && get.equipValue(card) - get.equipValue(eq) < Math.max(1.2, 6 - player.hp)) return 0;
			},
		},
		enable: "phaseUse",
		usable: 1,
		position: "he",
		filterCard: lib.filter.cardDiscardable,
		discard: false,
		lose: false,
		delay: false,
		selectCard: [1, Infinity],
		prompt: function (event) {
			var count = _status.event.player.countMark("sbtongye");
			var str = "出牌阶段限一次。你可以弃置任意张牌并摸等量的牌，若你以此法弃置的牌包括你所有手牌，则你多摸" + get.cnNumber(count + 1) + "张牌";
			if (count > 0) str += "，并弃1枚“业”";
			str += "。";
			return str;
		},
		check: function (card) {
			var player = _status.event.player;
			if (
				get.position(card) == "h" &&
				!player.countCards("h", "du") &&
				(player.hp > 2 ||
					!player.countCards("h", function (card) {
						return get.value(card) >= 8;
					}))
			) {
				return 1;
			}
			return 6 - get.value(card);
		},
		content: function () {
			"step 0";
			player.discard(cards);
			event.num = 1;
			var hs = player.getCards("h");
			if (!hs.length) event.num = 0;
			for (var i = 0; i < hs.length; i++) {
				if (!cards.includes(hs[i])) {
					event.num = 0;
					break;
				}
			}
			"step 1";
			var all = event.num;
			player.draw((all ? 1 + player.countMark("sbtongye") : 0) + cards.length);
			if (all) player.removeMark("sbtongye", 1);
		},
		ai: {
			order: function (item, player) {
				if (player.hasCard(i => get.value(i) > Math.max(6, 9 - player.hp), "he")) return 1;
				return 10;
			},
			result: {
				player: 1,
			},
			nokeep: true,
			skillTagFilter: function (player, tag, arg) {
				if (tag === "nokeep") return (!arg || (arg && arg.card && get.name(arg.card) === "tao")) && player.isPhaseUsing() && !player.getStat().skill.sbzhiheng && player.hasCard(card => get.name(card) !== "tao", "h");
			},
			threaten: 1.56,
		},
	},
	sbtongye: {
		audio: 2,
		trigger: { player: "phaseJieshuBegin" },
		forced: true,
		onremove: true,
		content: function () {
			"step 0";
			player
				.chooseControl("变化", "不变")
				.set("prompt", "统业：猜测场上装备数是否于你下回合准备阶段前发生变化")
				.set("ai", () => {
					let player = _status.event.player;
					if (game.countPlayer() > 3) return "变化";
					if (
						game.countPlayer(function (current) {
							return current.hasCard({ type: "equip" }, "e");
						}) < game.countPlayer()
					)
						return "变化";
					if (
						game.countPlayer() == 2 &&
						game.countPlayer(function (current) {
							if (current != player) return current.countCards("e", { type: "equip" }) + current.countDisabledSlot();
						}) >= 5
					)
						return "不变";
					if (Math.random() < 0.3) return "变化";
					return "不变";
				});
			"step 1";
			if (result.control == "变化") {
				player.addSkill("sbtongye_change", 1);
				player.chat("变！");
			} else {
				player.addSkill("sbtongye_nochange", 1);
				player.chat("不变！");
			}
			var num = game
				.filterPlayer()
				.map(i => i.countCards("e"))
				.reduce((p, c) => p + c, 0);
			player.removeMark("sbtongye_count", player.countMark("sbtongye_count"), false);
			if (num > 0) player.addMark("sbtongye_count", num, false);
			player.addSkill("sbtongye_settle");
		},
		marktext: "业",
		intro: {
			name: "统业",
			name2: "业",
			content: "mark",
		},
		ai: {
			combo: "sbzhiheng",
		},
		subSkill: {
			broadcast: {
				trigger: {
					global: ["loseAfter", "equipAfter", "addJudgeAfter", "gainAfter", "loseAsyncAfter", "addToExpansionAfter"],
				},
				charlotte: true,
				silent: true,
				filter: function (event, player) {
					var num = 0;
					game.countPlayer(function (current) {
						var evt = event.getl(current);
						if (evt && evt.es) num += evt.es.length;
					});
					if (event.name == "equip") num--;
					return num != 0;
				},
				content: function () {
					if (player.hasSkill("sbtongye_change")) player.markSkill("sbtongye_change");
					if (player.hasSkill("sbtongye_nochange")) player.markSkill("sbtongye_nochange");
				},
			},
			settle: {
				audio: "sbtongye",
				init: function (player) {
					player.addSkill("sbtongye_broadcast");
				},
				trigger: { player: "phaseZhunbeiBegin" },
				forced: true,
				charlotte: true,
				filter: function (event, player) {
					return player.hasSkill("sbtongye_change") || player.hasSkill("sbtongye_nochange");
				},
				content: function () {
					var delta =
						game
							.filterPlayer()
							.map(i => i.countCards("e"))
							.reduce((p, c) => p + c, 0) - player.countMark("sbtongye_count");
					if ((player.hasSkill("sbtongye_change") && delta != 0) || (player.hasSkill("sbtongye_nochange") && delta == 0)) {
						game.log(player, "猜测", "#g正确");
						if (player.countMark("sbtongye") < 2) player.addMark("sbtongye", 1);
					} else {
						game.log(player, "猜测", "#y错误");
						player.removeMark("sbtongye", 1);
					}
					player.removeSkill("sbtongye_change");
					player.removeSkill("sbtongye_nochange");
					player.removeSkill("sbtongye_settle");
					player.removeSkill("sbtongye_broadcast");
				},
			},
			change: {
				charlotte: true,
				mark: true,
				marktext: "变",
				intro: {
					markcount: function (storage, player) {
						return (
							game
								.filterPlayer()
								.map(i => i.countCards("e"))
								.reduce((p, c) => p + c, 0) - player.countMark("sbtongye_count")
						);
					},
					mark: function (dialog, storage, player) {
						dialog.addText(get.translation(player) + "猜测场上装备数发生变化");
						var delta =
							game
								.filterPlayer()
								.map(i => i.countCards("e"))
								.reduce((p, c) => p + c, 0) - player.countMark("sbtongye_count");
						if (delta == 0) dialog.addText("(当前未发生变化)");
						else dialog.addText("(当前已" + (delta > 0 ? "增加" : "减少") + get.cnNumber(Math.abs(delta)) + "张装备牌)");
					},
				},
			},
			nochange: {
				charlotte: true,
				mark: true,
				marktext: '<span style="text-decoration:line-through;">变</span>',
				intro: {
					markcount: function (storage, player) {
						return (
							game
								.filterPlayer()
								.map(i => i.countCards("e"))
								.reduce((p, c) => p + c, 0) - player.countMark("sbtongye_count")
						);
					},
					mark: function (dialog, storage, player) {
						dialog.addText(get.translation(player) + "猜测场上装备数不发生变化");
						var delta =
							game
								.filterPlayer()
								.map(i => i.countCards("e"))
								.reduce((p, c) => p + c, 0) - player.countMark("sbtongye_count");
						if (delta == 0) dialog.addText("(当前未发生变化)");
						else dialog.addText("(当前已" + (delta > 0 ? "增加" : "减少") + get.cnNumber(Math.abs(delta)) + "张装备牌)");
					},
				},
			},
		},
	},
	sbjiuyuan: {
		audio: 2,
		trigger: { global: "useCard" },
		forced: true,
		zhuSkill: true,
		group: "sbjiuyuan_recover",
		filter: function (event, player) {
			return event.card.name == "tao" && player != event.player && event.player.group == "wu" && event.player.isIn() && player.hasZhuSkill("sbjiuyuan", event.player);
		},
		content: function () {
			player.draw();
		},
		subSkill: {
			recover: {
				audio: "sbjiuyuan",
				trigger: { target: "taoBegin" },
				zhuSkill: true,
				forced: true,
				filter: function (event, player) {
					if (event.player == player) return false;
					if (!player.hasZhuSkill("sbjiuyuan", event.player)) return false;
					if (event.player.group != "wu") return false;
					return true;
				},
				content: function () {
					trigger.baseDamage++;
				},
			},
		},
	},
	//孙尚香
	sbjieyin: {
		trigger: { player: "phaseUseBegin" },
		forced: true,
		locked: false,
		dutySkill: true,
		group: ["sbjieyin_init", "sbjieyin_fail"],
		filter: function (event, player) {
			return game.hasPlayer(current => current.hasMark("sbjieyin_mark"));
		},
		content: function () {
			"step 0";
			var targets = game.filterPlayer(current => current.hasMark("sbjieyin_mark"));
			event.targets = targets;
			"step 1";
			var target = targets.shift();
			event.target = target;
			var str = target.hasSkill("sbjieyin_marked") ? "移去" : "移动或移去";
			var num = Math.min(2, Math.max(1, target.countCards("h")));
			target
				.chooseCard("交给" + get.translation(player) + get.cnNumber(num) + "张手牌，然后获得1点护甲；或令其" + str + "你的所有“助”标记", num)
				.set("ai", card => {
					if (_status.event.goon) return 100 - get.value(card);
					return 0;
				})
				.set("goon", get.attitude(target, player) > 1);
			"step 2";
			if (result.bool) {
				target.give(result.cards, player);
				target.changeHujia(1, null, true);
				event.goto(4);
			} else {
				if (!game.hasPlayer(current => current != player && current != target) || target.hasSkill("sbjieyin_marked")) event._result = { bool: false };
				else
					player
						.chooseTarget("结姻：是否移动" + get.translation(target) + "的“助”？", (card, player, target) => {
							return target != player && target != _status.event.getParent().target;
						})
						.set("ai", target => get.attitude(_status.event.player, target) - 1);
				target.addSkill("sbjieyin_marked");
			}
			"step 3";
			if (result.bool) {
				var targetx = result.targets[0];
				var num = target.countMark("sbjieyin_mark");
				target.removeSkill("sbjieyin_mark");
				targetx.addSkill("sbjieyin_mark");
				targetx.addMark("sbjieyin_mark", num, false);
				player.line2([target, targetx], "green");
				game.log(player, "将", target, "的" + get.cnNumber(num) + "枚“助”移动至", targetx);
			} else {
				target.removeSkill("sbjieyin_mark");
				game.log(player, "移去了", target, "的" + get.cnNumber(num) + "枚“助”");
				game.createEvent("sbjieyin_fail").setContent(lib.skill.sbjieyin_fail.content).player = player;
			}
			"step 4";
			if (targets.length) event.goto(1);
		},
		subSkill: {
			fail: {
				audio: "sbjieyin",
				trigger: { global: "dieAfter" },
				dutySkill: true,
				forced: true,
				locked: false,
				direct: true,
				filter: function (event, player) {
					return event.player.hasMark("sbjieyin_mark");
				},
				content: function () {
					player.logSkill("sbjieyin_fail");
					player.awakenSkill("sbjieyin");
					game.log(player, "使命失败");
					player.changeGroup("wu");
					player.recover();
					player.gain(player.getExpansions("sbliangzhu"), "gain2");
					player.loseMaxHp();
				},
			},
			mark: {
				charlotte: true,
				mark: true,
				marktext: "助",
				onremove: true,
				intro: {
					name: "结姻(助)",
					name2: "助",
					content: "mark",
				},
			},
			marked: { charlotte: true },
			init: {
				audio: "sbjieyin",
				trigger: {
					global: "phaseBefore",
					player: "enterGame",
				},
				forced: true,
				locked: false,
				direct: true,
				dutySkill: true,
				filter: function (event, player) {
					return game.hasPlayer(current => current != player) && (event.name != "phase" || game.phaseNumber == 0);
				},
				content: function () {
					"step 0";
					player.chooseTarget("结姻：令一名其他角色获得1枚“助”", lib.filter.notMe, true).set("ai", target => get.attitude(_status.event.player, target));
					"step 1";
					if (result.bool) {
						var target = result.targets[0];
						player.logSkill("sbjieyin_init", target);
						target.addSkill("sbjieyin_mark");
						target.addMark("sbjieyin_mark", 1);
					}
					"step 2";
					game.delayx();
				},
			},
		},
		ai: {
			combo: "sbliangzhu"
		},
	},
	sbliangzhu: {
		audio: 2,
		enable: "phaseUse",
		usable: 1,
		filter: function (event, player) {
			return player.group == "shu" && game.hasPlayer(current => current != player && current.countCards("e"));
		},
		groupSkill: true,
		filterTarget: function (card, player, target) {
			return target.countCards("e") && target != player;
		},
		content: function () {
			"step 0";
			player.choosePlayerCard(target, "e", true);
			"step 1";
			if (result.bool) {
				player.addToExpansion(result.cards, target, "give").gaintag.add("sbliangzhu");
			} else event.finish();
			"step 2";
			for (var target of game.filterPlayer(current => current.hasMark("sbjieyin_mark"))) {
				target.chooseDrawRecover(2, true);
			}
		},
		marktext: "妆",
		intro: {
			name: "良助(妆)",
			name2: "妆",
			content: "expansion",
			markcount: "expansion",
		},
		onremove: function (player, skill) {
			var cards = player.getExpansions(skill);
			if (cards.length) player.loseToDiscardpile(cards);
		},
		ai: {
			order: 9,
			result: {
				player: function (player) {
					var num = 0,
						targets = game.filterPlayer(current => current.hasMark("sbjieyin_mark"));
					for (var current of targets) {
						num += 2 * get.effect(current, { name: "draw" }, player, player);
					}
					if (num > 0) return 3;
					return 1;
				},
				target: -1,
			},
		},
	},
	sbxiaoji: {
		audio: 2,
		audioname: ["sp_sunshangxiang", "re_sunshangxiang", "db_sunshangxiang"],
		trigger: {
			player: "loseAfter",
			global: ["equipAfter", "addJudgeAfter", "gainAfter", "loseAsyncAfter", "addToExpansionAfter"],
		},
		forced: true,
		locked: false,
		groupSkill: true,
		filter: function (event, player) {
			if (player.group != "wu") return false;
			var evt = event.getl(player);
			return evt && evt.player == player && evt.es && evt.es.length > 0;
		},
		content: function () {
			"step 0";
			event.count = trigger.getl(player).es.length;
			"step 1";
			event.count--;
			player.draw(2);
			player
				.chooseTarget("是否弃置场上的一张牌？", (card, player, target) => {
					return target.countDiscardableCards(player, "ej");
				})
				.set("ai", target => {
					var player = _status.event.player;
					var att = get.attitude(player, target);
					if (
						att > 0 &&
						(target.countCards("j") > 0 ||
							target.countCards("e", function (card) {
								return get.value(card, target) < 0;
							}))
					)
						return 2;
					if (att < 0 && target.countCards("e") > 0 && !target.hasSkillTag("noe")) return -1;
					return 0;
				});
			"step 2";
			if (result.bool) {
				player.discardPlayerCard(result.targets[0], "ej", true);
			}
			"step 3";
			if (event.count > 0) {
				player.logSkill("sbxiaoji");
				event.goto(1);
			}
		},
		ai: {
			noe: true,
			reverseEquip: true,
			effect: {
				target: function (card, player, target, current) {
					if (get.type(card) == "equip" && !get.cardtag(card, "gifts")) return [1, 3];
				},
			},
		},
	},
	//吕蒙
	sbkeji: {
		audio: 2,
		enable: "phaseUse",
		filterCard: true,
		selectCard: function () {
			var player = _status.event.player;
			if (player.hasSkill("sbkeji_discard")) return [0, 0];
			if (player.hasSkill("sbkeji_losehp")) return [1, 1];
			return [0, 1];
		},
		locked: false,
		usable: 2,
		prompt: function (event) {
			var player = _status.event.player,
				str = "出牌阶段" + (player.storage.sbkeji ? "" : "各") + "限一次。你可以";
			var discard = player.hasSkill("sbkeji_discard"),
				losehp = player.hasSkill("sbkeji_losehp");
			if (!discard) str += "弃置一张手牌并获得1点护甲";
			if (!losehp) str += (!discard ? "，或" : "") + "点击“确定”失去1点体力并获得2点护甲";
			return str;
		},
		filter: function (event, player) {
			return (player.getStat("skill").sbkeji || 0) < (player.storage.sbkeji ? 1 : 2);
		},
		check: function (card) {
			var player = _status.event.player;
			if (_status.event.player.hp == 1 && player.canSave(player) && player.hujia <= 3) return 0;
			return 6 - get.value(card);
		},
		content: function () {
			"step 0";
			if (cards.length) {
				player.changeHujia(1, null, true);
				player.addTempSkill("sbkeji_discard", "phaseUseAfter");
				event.finish();
			} else {
				player.loseHp();
			}
			"step 1";
			player.changeHujia(2, null, true);
			player.addTempSkill("sbkeji_losehp", "phaseUseAfter");
		},
		mod: {
			maxHandcard: function (player, num) {
				return num + player.hujia;
			},
			cardEnabled: function (card, player) {
				if (player != _status.event.dying && card.name == "tao") return false;
			},
			cardSavable: function (card, player) {
				if (player != _status.event.dying && card.name == "tao") return false;
			},
		},
		ai: {
			order: 1,
			result: {
				player: function (player, target) {
					if (player.hujia >= 5) return 0;
					if (
						player.hp == 1 &&
						!player.canSave(player) &&
						!player.hasCard(card => {
							return lib.filter.cardDiscardable(card, player, "sbkeji") && get.value(card) < 6;
						}, "h")
					) {
						return 0;
					}
					return 1;
				},
			},
		},
		subSkill: {
			discard: { charlotte: true },
			losehp: { charlotte: true },
		},
	},
	sbdujiang: {
		audio: 2,
		trigger: { player: "phaseZhunbeiBegin" },
		derivation: "sbduojing",
		juexingji: true,
		forced: true,
		skillAnimation: true,
		animationColor: "wood",
		filter: function (event, player) {
			return player.hujia >= 3;
		},
		content: function () {
			player.awakenSkill("sbdujiang");
			player.addSkills("sbduojing");
			player.storage.sbkeji = true;
		},
		ai: {
			combo: "sbkeji"
		},
	},
	sbduojing: {
		audio: 2,
		trigger: { player: "useCardToPlayer" },
		filter: function (event, player) {
			return player.hujia > 0 && event.card.name == "sha";
		},
		check: function (event, player) {
			return event.target.countGainableCards(player, "he") > 0 || player.countCards("hs", { name: "sha" }) > 0;
		},
		logTarget: "target",
		content: function () {
			"step 0";
			player.changeHujia(-1);
			if (!trigger.card.storage) trigger.card.storage = {};
			trigger.card.storage.sbduojing = true;
			"step 1";
			var target = trigger.target;
			if (target.countGainableCards(player, "he") > 0) player.gainPlayerCard(target, "he", true);
			player.addTempSkill("sbduojing_add", "phaseUseAfter");
			player.addMark("sbduojing_add", 1, false);
			player.markSkill("sbduojing_add");
		},
		subSkill: {
			add: {
				charlotte: true,
				marktext: "夺",
				onremove: true,
				intro: {
					content: "本阶段使用杀次数上限+$",
				},
				mod: {
					cardUsable: function (card, player, num) {
						if (card.name == "sha") return num + player.countMark("sbduojing_add");
					},
				},
			},
		},
		ai: {
			unequip: true,
			unequip_ai: true,
			skillTagFilter: function (player, tag, arg) {
				if (player.hujia <= 0) return;
				if (tag == "unequip" && (!arg || !arg.card || !arg.card.storage || !arg.card.storage.sbduojing)) return false;
				if (tag == "unequip_ai" && (!arg || arg.name != "sha")) return false;
			},
		},
	},
	//于禁
	sbxiayuan: {
		audio: 2,
		trigger: { global: "damageEnd" },
		direct: true,
		filter: function (event, player) {
			return event.hujia && !event.player.hujia && event.player.isIn() && player.countCards("h") > 1 && !player.hasSkill("sbxiayuan_round", null, false, false);
		},
		content: function () {
			"step 0";
			player.addTempSkill("sbxiayuan_round", "roundStart");
			player
				.chooseToDiscard(2, "h", get.prompt("sbxiayuan", trigger.player), "弃置两张手牌，令其获得" + get.cnNumber(trigger.hujia) + "点护甲")
				.set("goon", get.attitude(player, trigger.player) > 0)
				.set("ai", function (card) {
					if (!_status.event.goon) return 0;
					return 5 - get.value(card);
				}).logSkill = ["sbxiayuan", trigger.player];
			"step 1";
			if (result.bool) {
				var target = trigger.player;
				target.changeHujia(trigger.hujia, null, true);
				game.delayx();
			} else player.removeSkill("sbxiayuan_round");
		},
		subSkill: { round: { charlotte: true } },
		ai: {
			combo: "sbjieyue",
			expose: 0.2
		},
	},
	sbjieyue: {
		audio: 4,
		trigger: { player: "phaseJieshuBegin" },
		direct: true,
		content: function () {
			"step 0";
			player.chooseTarget(lib.filter.notMe, get.prompt("sbjieyue"), "令一名其他角色获得1点护甲，然后该角色可以交给你一张牌。").set("ai", function (target) {
				return get.attitude(_status.event.player, target) / Math.sqrt(Math.min(1, target.hp + target.hujia));
			});
			"step 1";
			if (result.bool) {
				var target = result.targets[0];
				event.target = target;
				player.logSkill("sbjieyue", target);
				target.changeHujia(1, null, true);
				target.chooseCard("he", "是否交给" + get.translation(player) + "一张牌？").set("ai", card => 0.1 - get.value(card));
			} else event.finish();
			"step 2";
			if (result.bool) {
				target.give(result.cards, player);
			}
		},
		ai: {
			threaten: 2.7,
			expose: 0.2,
		},
	},
	//华雄
	sbyangwei: {
		audio: 3,
		enable: "phaseUse",
		filter: function (event, player) {
			return !player.hasSkill("sbyangwei_counter", null, null, false);
		},
		content: function () {
			player.draw(2);
			player.addTempSkill("sbyangwei_effect");
			player.addSkill("sbyangwei_counter");
		},
		ai: {
			order: 9,
			result: { player: 1 },
		},
		subSkill: {
			effect: {
				audio: "sbyangwei",
				equipSkill: false,
				inherit: "qinggang_skill",
				charlotte: true,
				nopop: true,
				mod: {
					targetInRange: function (card) {
						if (card.name == "sha") return true;
					},
					cardUsable: function (card, player, num) {
						if (card.name == "sha") return num + 1;
					},
				},
				mark: true,
				marktext: "威",
				intro: { content: "使用【杀】的次数上限+1且无距离限制且无视防具" },
			},
			counter: {
				trigger: { player: "phaseJieshu" },
				silent: true,
				popup: false,
				forced: true,
				charlotte: true,
				onremove: true,
				content: function () {
					if (!player.storage.sbyangwei_counter) player.storage.sbyangwei_counter = true;
					else player.removeSkill("sbyangwei_counter");
				},
			},
		},
	},
	//黄忠
	sbliegong: {
		audio: 2,
		mod: {
			cardnature: function (card, player) {
				if (player.hasEmptySlot(1) && get.name(card, player) == "sha") return false;
			},
		},
		trigger: { player: "useCardToPlayered" },
		filter: function (event, player) {
			return !event.getParent()._sbliegong_player && event.targets.length == 1 && event.card.name == "sha" && player.getStorage("sbliegong").length > 0;
		},
		prompt2: function (event, player) {
			var str = "",
				storage = player.getStorage("sbliegong");
			if (storage.length > 1) {
				str += "亮出牌堆顶的" + get.cnNumber(storage.length - 1) + "张牌并增加伤害；且";
			}
			str += "令" + get.translation(event.target) + "不能使用花色为";
			for (var i = 0; i < storage.length; i++) {
				str += get.translation(storage[i]);
			}
			str += "的牌响应" + get.translation(event.card);
			return str;
		},
		logTarget: "target",
		locked: false,
		check: function (event, player) {
			var target = event.target;
			if (get.attitude(player, target) > 0) return false;
			if (
				target.hasSkillTag("filterDamage", null, {
					player: player,
					card: event.card,
				})
			)
				return false;
			var storage = player.getStorage("sbliegong");
			if (storage.length >= 4) return true;
			if (storage.length < 3) return false;
			if (target.hasShan()) return storage.includes("heart") && storage.includes("diamond");
			return true;
		},
		content: function () {
			var storage = player.getStorage("sbliegong").slice(0);
			var num = storage.length - 1;
			var evt = trigger.getParent();
			if (num > 0) {
				if (typeof evt.baseDamage != "number") evt.baseDamage = 1;
				var cards = get.cards(num);
				player.showCards(cards.slice(0), get.translation(player) + "发动了【烈弓】");
				while (cards.length > 0) {
					var card = cards.pop();
					if (storage.includes(get.suit(card, false))) evt.baseDamage++;
					//ui.cardPile.insertBefore(card,ui.cardPile.firstChild);
				}
				//game.updateRoundNumber();
			}
			evt._sbliegong_player = player;
			player.addTempSkill("sbliegong_clear");
			var target = trigger.target;
			target.addTempSkill("sbliegong_block");
			if (!target.storage.sbliegong_block) target.storage.sbliegong_block = [];
			target.storage.sbliegong_block.push([evt.card, storage]);
			lib.skill.sbliegong.updateBlocker(target);
		},
		updateBlocker: function (player) {
			var list = [],
				storage = player.storage.sbliegong_block;
			if (storage && storage.length) {
				for (var i of storage) list.addArray(i[1]);
			}
			player.storage.sbliegong_blocker = list;
		},
		ai: {
			threaten: 3.5,
			directHit_ai: true,
			skillTagFilter: function (player, tag, arg) {
				if (arg && arg.card && arg.card.name == "sha") {
					var storage = player.getStorage("sbliegong");
					if (storage.length < 3 || !storage.includes("heart") || !storage.includes("diamond")) return false;
					var target = arg.target;
					if (target.hasSkill("bagua_skill") || target.hasSkill("bazhen") || target.hasSkill("rw_bagua_skill")) return false;
					return true;
				}
				return false;
			},
		},
		intro: {
			content: "已记录花色：$",
			onunmark: true,
		},
		group: "sbliegong_count",
		subSkill: {
			clear: {
				trigger: { player: "useCardAfter" },
				forced: true,
				charlotte: true,
				popup: false,
				filter: function (event, player) {
					return event._sbliegong_player == player;
				},
				content: function () {
					player.unmarkSkill("sbliegong");
				},
			},
			block: {
				mod: {
					cardEnabled: function (card, player) {
						if (!player.storage.sbliegong_blocker) return;
						var suit = get.suit(card);
						if (suit == "none") return;
						var evt = _status.event;
						if (evt.name != "chooseToUse") evt = evt.getParent("chooseToUse");
						if (!evt || !evt.respondTo || evt.respondTo[1].name != "sha") return;
						if (player.storage.sbliegong_blocker.includes(suit)) return false;
					},
				},
				trigger: {
					player: ["damageBefore", "damageCancelled", "damageZero"],
					target: ["shaMiss", "useCardToExcluded", "useCardToEnd"],
					global: ["useCardEnd"],
				},
				forced: true,
				firstDo: true,
				charlotte: true,
				onremove: function (player) {
					delete player.storage.sbliegong_block;
					delete player.storage.sbliegong_blocker;
				},
				filter: function (event, player) {
					if (!event.card || !player.storage.sbliegong_block) return false;
					for (var i of player.storage.sbliegong_block) {
						if (i[0] == event.card) return true;
					}
					return false;
				},
				content: function () {
					var storage = player.storage.sbliegong_block;
					for (var i = 0; i < storage.length; i++) {
						if (storage[i][0] == trigger.card) {
							storage.splice(i--, 1);
						}
					}
					if (!storage.length) player.removeSkill("sbliegong_block");
					else lib.skill.sbliegong.updateBlocker(target);
				},
			},
			count: {
				trigger: {
					player: "useCard",
					target: "useCardToTargeted",
				},
				forced: true,
				filter: function (event, player, name) {
					if (name != "useCard" && player == event.player) return false;
					var suit = get.suit(event.card);
					if (!lib.suit.includes(suit)) return false;
					if (player.storage.sbliegong && player.storage.sbliegong.includes(suit)) return false;
					return true;
				},
				content: function () {
					player.markAuto("sbliegong", [get.suit(trigger.card)]);
				},
			},
		},
	},
	//刘赪
	splveying: {
		audio: 2,
		trigger: { player: "useCardAfter" },
		forced: true,
		filter: function (event, player) {
			return event.card.name == "sha" && player.countMark("splveying") > 1;
		},
		content: function () {
			"step 0";
			player.removeMark("splveying", 2);
			player.draw();
			"step 1";
			player.chooseUseTarget("guohe");
		},
		marktext: "椎",
		intro: {
			name: "椎(掠影/莺舞)",
			name2: "椎",
			content: "mark",
		},
		group: "splveying_add",
		subSkill: {
			add: {
				trigger: { player: "useCardToPlayered" },
				forced: true,
				usable: 2,
				filter: function (event, player) {
					return event.card.name == "sha" && player.isPhaseUsing();
				},
				content: function () {
					player.addMark("splveying", 1);
				},
			},
		},
	},
	spyingwu: {
		group: "spyingwu_add",
		audio: 2,
		trigger: { player: "useCardAfter" },
		forced: true,
		locked: false,
		filter: function (event, player) {
			return player.hasSkill("splveying", null, null, false) && get.type(event.card) == "trick" && !get.tag(event.card, "damage") && player.countMark("splveying") > 1;
		},
		content: function () {
			player.removeMark("splveying", 2);
			player.draw();
			player.chooseUseTarget("sha", false);
		},
		ai: { combo: "splveying" },
		subSkill: {
			add: {
				trigger: { player: "useCardToPlayered" },
				forced: true,
				locked: false,
				usable: 2,
				filter: function (event, player) {
					return player.hasSkill("splveying") && get.type(event.card) == "trick" && !get.tag(event.card, "damage") && player.isPhaseUsing();
				},
				content: function () {
					player.addMark("splveying", 1);
				},
			},
		},
	},
	//手杀杨婉
	spmingxuan: {
		audio: 2,
		trigger: { player: "phaseUseBegin" },
		forced: true,
		filter: function (event, player) {
			var list = player.getStorage("spmingxuan");
			return (
				player.countCards("h") > 0 &&
				game.hasPlayer(function (current) {
					return current != player && !list.includes(current);
				})
			);
		},
		content: function () {
			"step 0";
			var suits = [],
				hs = player.getCards("h");
			for (var i of hs) suits.add(get.suit(i, player));
			var list = player.getStorage("spmingxuan"),
				num = Math.min(
					suits.length,
					game.countPlayer(function (current) {
						return current != player && !list.includes(current);
					})
				);
			player
				.chooseCard("h", true, [1, num], "瞑昡：请选择至多" + get.cnNumber(num) + "张花色各不相同的手牌", function (card, player) {
					if (!ui.selected.cards.length) return true;
					var suit = get.suit(card);
					for (var i of ui.selected.cards) {
						if (get.suit(i, player) == suit) return false;
					}
					return true;
				})
				.set("complexCard", true)
				.set("ai", card => 6 - get.value(card));
			"step 1";
			if (result.bool) {
				var list = player.getStorage("spmingxuan"),
					cards = result.cards.randomSort();
				var targets = game
					.filterPlayer(current => current != player && !list.includes(current))
					.randomGets(cards.length)
					.sortBySeat();
				player.line(targets, "green");
				var map = [];
				for (var i = 0; i < targets.length; i++) {
					map.push([targets[i], cards[i]]);
				}
				game.loseAsync({
					gain_list: map,
					player: player,
					cards: cards,
					giver: player,
					animate: "giveAuto",
				}).setContent("gaincardMultiple");
				event.targets = targets;
				event.num = 0;
			} else event.finish();
			"step 2";
			game.delayx();
			"step 3";
			if (num < targets.length) {
				var target = targets[num];
				event.num++;
				if (target.isIn()) {
					event.target = target;
					target
						.chooseToUse(
							function (card, player, event) {
								if (get.name(card) != "sha") return false;
								return lib.filter.filterCard.apply(this, arguments);
							},
							"对" + get.translation(player) + "使用一张杀，否则交给其一张牌，且其摸一张牌"
						)
						.set("targetRequired", true)
						.set("complexSelect", true)
						.set("filterTarget", function (card, player, target) {
							if (target != _status.event.sourcex && !ui.selected.targets.includes(_status.event.sourcex)) return false;
							return lib.filter.targetEnabled.apply(this, arguments);
						})
						.set("sourcex", player)
						.set("addCount", false);
				} else {
					if (event.num < targets.length) event.redo();
					else event.finish();
				}
			}
			"step 4";
			if (result.bool) {
				player.markAuto("spmingxuan", [target]);
				if (event.num < targets.length) event.goto(3);
				else event.finish();
			} else {
				var he = target.getCards("he");
				if (he.length) {
					if (he.length == 1) event._result = { bool: true, cards: he };
					else target.chooseCard("he", true, "交给" + get.translation(player) + "一张牌");
				} else {
					if (event.num < targets.length) event.goto(3);
					else event.finish();
				}
			}
			"step 5";
			if (result.bool) {
				target.give(result.cards, player);
				player.draw();
			}
			if (event.num < targets.length) event.goto(3);
		},
		intro: { content: "已被$使用过杀" },
	},
	spxianchou: {
		audio: 2,
		trigger: { player: "damageEnd" },
		direct: true,
		filter: function (event, player) {
			return (
				event.source &&
				event.source.isIn() &&
				game.hasPlayer(function (current) {
					return current != player && current != event.source;
				})
			);
		},
		content: function () {
			"step 0";
			player
				.chooseTarget(get.prompt2("spxianchou"), function (card, player, target) {
					return target != player && target != _status.event.getTrigger().source;
				})
				.set("ai", function (target) {
					return get.attitude(target, _status.event.player) * Math.sqrt(target.countCards("he"));
				});
			"step 1";
			if (result.bool) {
				var target = result.targets[0];
				event.target = target;
				player.logSkill("spxianchou", target);
				player.line2([target, trigger.source]);
				target
					.chooseToDiscard("he", "是否弃置一张牌，视为对" + get.translation(trigger.source) + "使用一张【杀】？")
					.set("ai", function (card) {
						if (_status.event.goon) return 8 - get.value(card);
						return 0;
					})
					.set("goon", (target.canUse("sha", trigger.source, false) ? get.effect(trigger.source, { name: "sha", isCard: true }, target, target) : 0) + get.recoverEffect(player, target, target) > 0);
			} else event.finish();
			"step 2";
			if (result.bool) {
				if (target.canUse("sha", trigger.source, false)) target.useCard({ name: "sha", isCard: true }, trigger.source, false);
				else event.finish();
			} else event.finish();
			"step 3";
			if (
				target.hasHistory("sourceDamage", function (evt) {
					var card = evt.card;
					if (!card || card.name != "sha") return false;
					var evtx = evt.getParent("useCard");
					return evtx.card == card && evtx.getParent() == event;
				})
			) {
				target.draw();
				player.recover();
			}
		},
	},
};

export default skills;
