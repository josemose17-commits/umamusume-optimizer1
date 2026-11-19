// Scenario data for the Uma Musume turn coach.
// Compiled from JP and Global guides as of October 2026 (Global after the July 2026
// rebalance). Turns marked "approx." are best-effort; the in-game goal list wins.
//
// Turn numbering: 1-24 Junior, 25-48 Classic, 49-72 Senior, 73-78 finale.
// Each year has 24 turns (Early/Late for each month, starting in January).
//
// caps:      base stat caps [speed, stamina, power, guts, wit]. Inheritance can raise them.
// opening:   the scenario's opening plan (see applyOpening in engine.js): early Wit/bond focus,
//            an opening rest turn, a scenario card to chase once she joins, early Recreation.
// goalRaceEnergy: energy a goal race costs here (Trackblazer's debut); 0 elsewhere.
// gainScale: how big trainings are compared with URA. The coach replaces this with your
//            own numbers once you have entered real gains on a few turns.
// finale.forced: true only where the finale race turns are certain.
// train:     base training values at facility level 1 per facility:
//            [speed, stamina, power, guts, wit, skill points, energy] (GameTora scenario pages).
//            trainApprox marks scenarios whose values aren't published yet (Island values are used).
// resetChecks: when the coach asks whether to reset (see runCheck in engine.js): an id, and
//            from (shows it's coming), at (asks), to (last turn it asks); or exam turns.
// inputs:    extra fields. scope "facility" shows on each training, "turn" once per turn.
//            type is "number", "check" or "select" (with options).
(function (root) {
  const SCENARIOS = [
    {
      id: "ura",
      akikawa: [[55, 60]],
      name: "URA Finale",
      jpName: "新設！URAファイナルズ",
      status: "global",
      jpRelease: "2021-02-24",
      globalRelease: "2025-06-26 (launch)",
      totalTurns: 78,
      caps: [1400, 1400, 1400, 1400, 1400],
      gainScale: 1.05,
      energyEvents: { 38: 30, 62: 30 },
      moodEvents: { 29: 1 },
      train: { speed: [11, 0, 6, 0, 0, 4, -21], stamina: [0, 10, 0, 6, 0, 4, -19], power: [0, 6, 9, 0, 0, 4, -20], guts: [5, 0, 5, 8, 0, 4, -22], wit: [2, 0, 0, 0, 10, 5, 5] },
      finale: { name: "URA Finals", turns: [74, 76, 78], forced: true, note: "Qualifier, Semifinal and Final, with a training turn before each." },
      summary: "The base scenario. Win your goal races and spend every other turn on the best friendship training. Since the July 2026 update, Happy Meek can appear on trainings for a duel, and every stat caps at 1400.",
      coreLoop: [
        "Junior: train where the most un-bonded cards gather so friendship trainings unlock by early Classic.",
        "From Classic on, take friendship (rainbow) trainings in your main stats and skip weak single-card turns.",
        "Happy Meek duels start when you train with her while she shows the orange Duel mark (a failed training cancels it). A win gives 10-25 of the stat, 30 SP, +4 to that stat's cap, +4 max energy and an Essence of Racing hint. Five wins bring a powered-up Meek to the final; beating her adds 20 to every stat and 150 SP at the end.",
        "Chairman Akikawa's snack event restores 30 energy at the end of Late July in years 2 and 3, so you can push one extra training in mid-camp.",
        "A guaranteed mood-up event happens in Early March of year 2.",
        "Fans: 50,000 by Classic Early November gives Aoi's event (20 SP, 20 Wit, a hint); 100,000 by the end of year 2 and 240,000 by the end of year 3 give 30 SP each.",
        "Save skill points for the finale and buy skills that suit your distance and style."
      ],
      deck: "Speed-heavy deck (3-4 Speed) plus Power or Stamina for your distance, and one Wit card for energy.",
      keyCards: ["Kitasan Black (Speed)", "Fine Motion (Wit)", "Super Creek (Stamina)"],
      inputs: [
        { id: "meek", label: "Meek Duel mark", scope: "facility", type: "check", help: "Happy Meek is here with the orange Duel mark. A failed training cancels the duel." }
      ],
      events: [
        { turn: 4, label: "Akikawa joins trainings", tip: "Director Akikawa shows up on trainings from now on. Tick Akikawa here when she's on one: her bond needs green (60+) by Senior Early April for the unique skill level-up." },
        { turn: 12, label: "Make Debut", tip: "Goal race. Have mood at Good or better." },
        { turn: 29, label: "Mood-up event", tip: "A guaranteed mood-up happens this turn, so an outing now is worth less." },
        { turn: 38, label: "Akikawa's snack", tip: "+30 energy at the end of this turn." },
        { turn: 45, label: "Three-Legged Race", tip: "With 50,000+ fans: 20 SP, 20 Wit and a skill hint (Aoi's event)." },
        { turn: 48, label: "Fan bonus", tip: "100,000 fans by now: +30 SP." },
        { turn: 62, label: "Akikawa's snack", tip: "+30 energy at the end of this turn." },
        { turn: 73, label: "Finale prep", tip: "Training turns sit between the finale races. Use them on the best friendship training." },
        { turn: 51, label: "Unique skill check", tip: "60,000 fans by now levels up your unique skill (40,000 for dirt-only trainees)." },
        { turn: 55, label: "Unique skill check", tip: "70,000 fans by now (60,000 dirt-only) levels it up; also needs a green (3-bar) bond with chairman Akikawa." },
        { turn: 72, label: "Unique skill check", tip: "120,000 fans by now (80,000 dirt-only) levels it up again." },
        { turn: 78, label: "Fan bonus", tip: "240,000 fans by the end: +30 SP." }
      ],
      hook: "ura"
    },
    {
      id: "unity",
      name: "Unity Cup",
      jpName: "アオハル杯 ～輝け、チームの絆～",
      aka: "Aoharu Cup",
      status: "global",
      jpRelease: "2021-08-30",
      globalRelease: "2025-11-06",
      totalTurns: 78,
      caps: [1300, 1300, 1300, 1300, 1800],
      gainScale: 1.15,
      levelRule: "rank",
      formulaBoost: 1.35,
      train: { speed: [8, 0, 4, 0, 0, 4, -19], stamina: [0, 8, 0, 6, 0, 4, -20], power: [0, 4, 9, 0, 0, 4, -20], guts: [3, 0, 3, 6, 0, 4, -20], wit: [2, 0, 0, 0, 6, 5, 5] },
      trainNote: "Values since the July 2026 update (uma.guide), the same as JP's since 2023.",
      // uma.guide's opening: Recreation for mood on turns 1-4 when no training is strong (Karaoke
      // jumps to Great), Wit counts like a card building bond, and Riko joins on turn 5 (her
      // first training together gives +1 mood).
      opening: {
        early: { to: 24, wit: 0.1 },
        recreation: { from: 1, to: 4, note: "Unity Cup opening: Recreation for mood. Karaoke (1 in 3) jumps straight to Great, and once you've trained none of its energy is wasted" },
        chase: { name: "Riko Kashimoto", from: 5, belowGreat: true, event: { mood: 1 }, note: "your first training with her gives +1 mood, so take it while you're below Great" }
      },
      finale: { name: "URA Finals", turns: [74, 76, 78], forced: true, note: "Unity Cup still ends with the three URA Finals races, after the Unity Cup Finals against team Zenith." },
      summary: "You recruit a team. Characters with a white flame on a training join Special Training (2+ flames pay the trainee extra stats), a full spirit gauge fires a Spirit Burst, and after a member's burst one Extreme Spirit Burst (0% failure) follows. Facility levels follow your team rank for each training type.",
      coreLoop: [
        "Opening (uma.guide): on turn 1 train, unless every training is weak; then Recreation is a gamble for Karaoke (straight to Great mood). On turns 2-4, take Recreation for mood when no training has 3+ cards building bond: after a training its 10-30 energy isn't wasted.",
        "Riko Kashimoto (the scenario's Pal card) shows up on trainings from turn 5. Your first training with her gives +1 mood, so take her early while you're below Great. Since February 2026 her Recreation outings don't need a green bond, so she's no longer worth chasing for that.",
        "Early on, Wit training counts like a card building bond: it saves energy and Wit matters here.",
        "Junior: train where the most white flames gather. Every flame you train with grows that teammate, and team rank sets your facility levels (F/G=1, D/E=2, B/C=3, A=4, S=5).",
        "2+ white flames on one training is Special Training: 2 flames give +2 main stat, 3 give +4/+1, 4 give +6/+3, 5 give +10/+5 plus skill points. Scenario-linked cards add +1 to each.",
        "A full spirit gauge fires a Spirit Burst: +15 main stat, +7 second stat, +5 SP (Wit: +2 Speed, +15 Wit, and +5 energy). Hold it for a facility you want: the stats your build needs that are hardest to raise (Speed for sprinters, Stamina and Power for longer races).",
        "After a member's burst, her next Unity training fires an Extreme Spirit Burst: +20/+10 stats, +15 SP, a hint and 0% failure. Use it on a risky but strong training.",
        "Team Zenith Declares War (Senior Late November) rewards total bursts: 4+ white hint, 7+ hint Lv3, 10+ gold hint, 13+ gold Lv3 with stats. Aim for 10+ if you want the gold skill; 7-9 saves skill points if you don't.",
        "Unity Cup matches: win at least 3 of the 5 races to raise your league rank (a loss lowers it), so pick an opponent you can beat, with 3+ circles in Tazuna's preview. Keep each distance's team members viable; losing an early match is survivable but costs its bonuses.",
        "Bursts and Special Training cost a lot of energy: most decks bring a Wit card, and a Friend card helps.",
        "Wit caps at 1800 here, so Wit-heavy builds are strong.",
        "Classic Late December: train or race down to low energy. Senior opens with the New Year Shrine Visit (+30 energy) and a raffle (often +20-30 more)."
      ],
      deck: "Fewer cards of your main type than in URA. Mixed decks make more flames. Speed and Wit work well because of the high Wit cap, and nearly every top deck runs a Wit card for energy.",
      keyCards: ["Riko Kashimoto (Friend, scenario link)", "Kitasan Black (Speed)"],
      inputs: [
        { id: "flames", label: "White flames", scope: "facility", type: "number", max: 5, help: "Characters on this training with a white flame (Special Training at 2+)" },
        { id: "burst", label: "Spirit Bursts", scope: "facility", type: "number", max: 5, help: "Characters here whose spirit gauge is full" },
        { id: "extreme", label: "Extreme burst", scope: "facility", type: "check", help: "An Extreme Spirit Burst fires on this training (failure becomes 0%)" },
        { id: "bursts", label: "Bursts so far", scope: "turn", type: "number", max: 30, help: "Spirit + Extreme bursts this career; Team Zenith's Senior Late Nov event pays more at 4, 7, 10 and 13" }
      ],
      events: [
        { turn: 5, label: "Riko joins trainings", tip: "Riko Kashimoto shows up on trainings from now on. Your first training with her gives +1 mood." },
        { turn: 24, label: "Unity Cup race 1", tip: "approx. Pick an opponent with 3+ circles in Tazuna's preview." },
        { turn: 36, label: "Unity Cup race 2", tip: "approx." },
        { turn: 48, label: "Unity Cup race 3", tip: "approx." },
        { turn: 60, label: "Unity Cup race 4", tip: "approx. League rank 10+, team A+ and an Extreme burst unlock the powerhouse team." },
        { turn: 70, label: "Team Zenith Declares War", tip: "Rewards scale with total Spirit + Extreme bursts (4/7/10/13)." },
        { turn: 72, label: "Unity Cup Finals", tip: "Beat team Zenith." },
        { turn: 51, label: "Unique skill check", tip: "60,000 fans by now levels up your unique skill (40,000 for dirt-only trainees)." },
        { turn: 55, label: "Unique skill check", tip: "70,000 fans by now (60,000 dirt-only) levels it up. No Akikawa bond needed here." },
        { turn: 72, label: "Unique skill check", tip: "120,000 fans by now (80,000 dirt-only) levels it up again." }
      ],
      hook: "unity"
    },
    {
      id: "trackblazer",
      akikawa: [[24, 20], [48, 40], [72, 60]],
      name: "Trackblazer: Start of the Climax",
      jpName: "Make a new track!! ～クライマックス開幕～",
      aka: "Climax, MANT",
      status: "global",
      jpRelease: "2022-02-24",
      globalRelease: "2026-03-12",
      totalTurns: 78,
      caps: [1200, 1900, 1200, 1200, 1500],
      gainScale: 1.0,
      formulaBoost: 1.15,
      train: { speed: [8, 0, 4, 0, 0, 2, -19], stamina: [0, 7, 0, 3, 0, 2, -17], power: [0, 4, 6, 0, 0, 2, -18], guts: [3, 0, 3, 6, 0, 2, -20], wit: [2, 0, 0, 0, 6, 3, 5] },
      // uma.guide: pre-debut turns go to bonds and the Wit facility (Wit is the hardest stat to
      // raise here), and unlike other scenarios the debut race costs energy.
      opening: {
        early: { to: 11, wit: 0.15, note: "Trackblazer pre-debut: build bonds and lean on the Wit facility, the hardest stat to raise here" }
      },
      goalRaceEnergy: 15,
      // Grade Point goals (GameTora), due at the end of Late December each year. Surplus doesn't
      // carry over. Dirt specialists and sprint-only turf trainees have lower targets.
      gradePoints: { due: [24, 48, 72], turf: [60, 300, 300], dirt: [30, 200, 300], sprint: [60, 200, 300] },
      finale: { name: "Twinkle Star Climax", turns: [74, 76, 78], forced: true, note: "Three finale races scored by Victory Points (1st 10, 2nd 8, 3rd 6). Each leg pays +10 to every stat and 30 SP, scaled by race bonus: use your Master Cleat Hammers here." },
      summary: "No fixed race goals: you need Grade Points (60, then +300, then +300) from races. Races also pay shop coins (1st 100, 2nd-3rd 60, 4th-5th 30), and the shop (restocks every 6 turns, max 5 of each item) sells training boosts, energy, mood, stats, facility levels and race bonus.",
      coreLoop: [
        "Pre-debut (uma.guide): build bonds evenly (Grilled Carrots/BBQ later raise every card at once) and lean on the Wit facility: Wit is the hardest stat to raise here. Unlike other scenarios, the debut race costs energy, so don't arrive at it empty.",
        "Race often: guides count 30-40 races a career, about two races for every training outside camp. Take only strong trainings, and skip a race when a training is exceptional. Summer camp is where the stats come from.",
        "A win pays Grade Points by grade: G1 100, G2 80, G3 60, OP 40, Pre-OP 20 (less for lower places), plus 100 coins.",
        "Grade Point goals: 60 by the end of Junior, then 300 more by the end of Classic and 300 more by the end of Senior (each due after Late December, and surplus doesn't carry over). Dirt specialists need 30 and 200, sprint-only turf trainees 200 in Classic. The coach counts them as you race and says when a race can't wait.",
        "Keep race chains to 2 in a row, unless the 3rd ends the year. Back-to-back racing risks bad conditions and mood drops.",
        "Plan races around G1 title bonuses: the Classic Triple Crown or the Autumn Senior Triple for medium and long, the Triple Tiara or the mile titles for milers.",
        "Rivals appear in some G3-and-up races when your distance and surface aptitude are C or better. Beating one gives a skill hint, and the chairman's event adds stats.",
        "Before each summer camp, stock up on Vitas, Megaphones and Ankle Weights (Megaphone plus Ankle Weights together is a big boost).",
        "Megaphones: +20% for 4 turns (40 coins), +40% for 3 (55), +60% for 2 (70). Start one when a run of strong turns begins, such as summer camp.",
        "Ankle Weights (50): +50% to one stat's training for one turn, +20% energy use. Good-Luck Charm (40): 0% failure for one turn.",
        "Vita 20/40/65 (35/55/75 coins) restore energy without using a turn, so drinking one often beats resting. Cupcakes (+1 or +2 mood) replace outings.",
        "Reset Whistle (20) reshuffles where cards stand when every training is weak. Cleat Hammers (Artisan +20% for 25 coins, Master +35% for 40) boost one race's bonus; save them for G1s. Glow Sticks (15) give +50% fans for one race.",
        "Twinkle Star Climax: each of the three legs pays +10 to every stat and 30 SP, scaled by race bonus, and the legs' distance is set by the races you ran. Keep 3 Master Cleat Hammers for them, and about 150 coins for the last shop rotation (the Climax races pay no coins).",
        "Keep at least 100 coins before each shop refresh (every 6 turns) so you can grab what shows up.",
        "Training Applications (150) raise a facility level permanently. Grilled Carrots (40) give every card +5 bond.",
        "Your unique skill levels up via Umamusume of the Year in Late December, which needs Akikawa's bond: 1 blue bar (Junior), 2 blue bars (Classic), green (Senior), plus wins and fans that year. Cat Food (10) gives her +5 bond.",
        "Speed, Power and Guts cap at 1200 here, but Stamina reaches 1900 and Wit 1500."
      ],
      deck: "Race bonus matters: aim for 50%+ in total (four 10% cards and two 5% cards get there). Common decks: 2 Speed, 2 Wit and 2 Power, or 3 Guts and 2 Wit plus a 4th Guts or a Speed card.",
      keyCards: ["Kitasan Black (Speed, race bonus)", "Satono Diamond (Stamina)"],
      inputs: [
        { id: "megaphone", label: "Megaphone", scope: "turn", type: "select", options: [["0", "None"], ["20", "+20% (4 turns)"], ["40", "+40% (3 turns)"], ["60", "+60% (2 turns)"]] },
        { id: "weights", label: "Ankle Weights", scope: "turn", type: "check" },
        { id: "charm", label: "Good-Luck Charm", scope: "turn", type: "check" },
        { id: "vita", label: "Best Vita", scope: "turn", type: "select", options: [["0", "None"], ["20", "Vita 20"], ["40", "Vita 40"], ["65", "Vita 65"]] },
        { id: "cupcake", label: "Cupcake", scope: "turn", type: "select", options: [["0", "None"], ["1", "Plain (+1)"], ["2", "Berry (+2)"]] },
        { id: "whistle", label: "Reset Whistle", scope: "turn", type: "check" },
        { id: "hammer", label: "Cleat Hammer", scope: "turn", type: "select", options: [["0", "None"], ["20", "+20% race"], ["35", "+35% race"]] },
        { id: "gpNeed", label: "Grade Pt still needed", scope: "turn", type: "number", max: 400, help: "The coach counts this down as you race (counting a win) and resets it each Late December. Type your real number if you placed lower." },
        { id: "consec", label: "Races in a row", scope: "turn", type: "number", max: 6, help: "Filled in for you from the career log" }
      ],
      events: [
        { turn: 11, label: "Debut next turn", tip: "In Trackblazer the debut race costs energy, so don't go into it empty." },
        { turn: 12, label: "Make Debut", tip: "Goal race (it costs energy here). The shop unlocks after it." },
        { turn: 24, label: "Grade Point goal", tip: "60 Grade Points by the end of this turn (30 for dirt specialists). Surplus doesn't carry over." },
        { turn: 24, label: "Junior Uma of the Year", tip: "Unique skill level-up if picked: needs 1 blue bar of Akikawa bond plus wins and fans this year." },
        { turn: 36, label: "Stock up for camp", tip: "Stock Vitas, Megaphones and Ankle Weights for camp, your best training window." },
        { turn: 48, label: "Grade Point goal", tip: "300 Grade Points this year by the end of this turn (200 for dirt specialists and sprint-only turf trainees)." },
        { turn: 48, label: "Classic Uma of the Year", tip: "Needs 2 blue bars of Akikawa bond plus wins and fans this year." },
        { turn: 60, label: "Stock up for camp", tip: "Last camp: stock Vitas, Megaphones and Ankle Weights. Start saving Master Cleat Hammers for the Climax too." },
        { turn: 72, label: "Grade Point goal", tip: "300 Grade Points this year by the end of this turn." },
        { turn: 72, label: "Senior Uma of the Year", tip: "Needs a green Akikawa bond plus wins and fans this year." },
        { turn: 73, label: "Climax prep", tip: "Have 3 Master Cleat Hammers for the three legs, and spend your coins: the Climax races pay none." }
      ],
      hook: "trackblazer"
    },
    {
      id: "grandlive",
      akikawa: [[55, 60]],
      name: "Grand Concert",
      jpName: "つなげ、照らせ、ひかれ。私たちのグランドライブ",
      aka: "Grand Live",
      status: "global",
      jpRelease: "2022-08-24",
      globalRelease: "2026-07-22",
      totalTurns: 78,
      caps: [1600, 1300, 1300, 1500, 1300],
      gainScale: 1.15,
      // Grand Concert songs (GameTora; English names as in the Global version, uma.guide, with the
      // Japanese name as jp). cost: tokens [Dance, Passion, Vocal, Visual, Mental].
      // extra: permanent +N to that training's main stat (sp = skill points on every training).
      // once: one-time stat gain. fb: Friendship live bonus %, active after the next live.
      // from: first turn the song can appear (after which Promo Live).
      songs: [
        { id: "kiseki", name: "Believe in Miracles!", jp: "Kiseki wo Shinjite!", from: 5, cost: [0, 21, 0, 0, 21], extra: { wit: 1 }, live: "Specialty Rate Up +5" },
        { id: "tachiichi", name: "Zero Is Where the Center Stands!", jp: "Tachiichi zero-ban! Juni wa Ichiban!", from: 5, cost: [21, 0, 0, 21, 0], extra: { speed: 1 }, live: "Support Event Chance Up +1" },
        { id: "nigekiri", name: "Getaway! Fallin' Love", jp: "Nigekiri! Fallin' Love", from: 5, cost: [21, 0, 0, 21, 0], extra: { guts: 1 }, live: "Support Event Chance Up +1" },
        { id: "gothisway", name: "Go This Way", jp: "Go This Way", from: 5, cost: [0, 0, 21, 0, 21], extra: { power: 1 }, live: "Support Event Chance Up +1" },
        { id: "ringring", name: "Ring Ring Diary", jp: "Ring Ring Diary", from: 5, cost: [0, 21, 0, 21, 0], extra: { stamina: 1 }, live: "Support Event Chance Up +1" },
        { id: "seishun", name: "Here Comes Our Time", jp: "Seishun ga Matteru", from: 5, cost: [0, 0, 32, 0, 12], once: { power: 22 }, fb: 5 },
        { id: "runrun", name: "Run n' Run!", jp: "RUN×RUN!", from: 5, cost: [14, 0, 0, 16, 14], once: { sp: 22 }, fb: 5 },
        { id: "zensoku", name: "Full Speed Ahead! Umadol Power☆", jp: "Zensoku! Zenshin! Umadol Power☆", from: 5, cost: [32, 0, 0, 12, 0], once: { speed: 22 }, fb: 5 },
        { id: "yumewo", name: "Run for Our Dream!", jp: "Yume wo Kakeru!", from: 25, cost: [0, 21, 0, 21, 0], extra: { sp: 2 }, live: "Specialty Rate Up +5" },
        { id: "anone", name: "Hey, Guess What!", jp: "A・NO・NE", from: 25, cost: [42, 0, 0, 21, 0], extra: { guts: 2 }, live: "Specialty Rate Up +5" },
        { id: "bluebird", name: "Our Blue Bird Days", jp: "Bokura no Bluebird Days", from: 25, cost: [21, 0, 0, 42, 0], extra: { speed: 2 }, live: "Specialty Rate Up +5" },
        { id: "growup", name: "Grow Up and Shine!", jp: "Grow Up, Shine!", from: 37, cost: [21, 0, 21, 0, 21], extra: { sp: 3 }, live: "Support Event Chance Up +1" },
        { id: "komorebi", name: "Sunbeam Cheer", jp: "Komorebi no Yell", from: 37, cost: [0, 42, 0, 0, 21], extra: { wit: 2 }, live: "Support Event Chance Up +1" },
        { id: "pyoitto", name: "Hoppity Sunny Days♪", jp: "Pyoitto ♪ Hallelujah!", from: 37, cost: [0, 42, 21, 0, 0], extra: { stamina: 2 }, live: "Specialty Rate Up +5" },
        { id: "nanairo", name: "Seven Colors Scenery", jp: "Nanairo no Keshiki", from: 37, cost: [0, 0, 21, 0, 42], extra: { power: 2 }, live: "Specialty Rate Up +5" },
        { id: "yumezora", name: "Dream Sky", jp: "Yumezora", from: 49, cost: [0, 22, 0, 0, 22], once: { wit: 22 }, fb: 5 },
        { id: "present", name: "Present March♪", jp: "PRESENT MARCH♪", from: 49, cost: [0, 0, 22, 0, 22], once: { power: 22 }, fb: 5 },
        { id: "daisuki", name: "Precious Treasure Box", jp: "Daisuki no Takarabako", from: 49, cost: [42, 0, 0, 26, 0], once: { speed: 26 }, fb: 10 },
        { id: "sekai", name: "The World's at Our Whim", jp: "Sekai wa Bokura no Iinari Sa", from: 49, cost: [0, 32, 12, 0, 0], once: { stamina: 22 }, fb: 5 },
        { id: "harusora", name: "Sky-Blue Spring", jp: "Harusora BLUE", from: 49, cost: [12, 0, 0, 32, 0], once: { guts: 22 }, fb: 5 },
        { id: "fanfare", name: "Fanfare for the Future!", jp: "Fanfare for Future!", from: 49, cost: [26, 0, 0, 42, 0], once: { guts: 26 }, fb: 10 }
      ],
      lives: [24, 36, 48, 60, 72],
      tokens: ["Dance", "Passion", "Vocal", "Visual", "Mental"],
      // Trainings give no tokens until the lessons open with Light Hello on turn 5.
      tokensFrom: 5,
      // Main and second token each training gives (about 60% / 30% of the time).
      tokenOf: { speed: [0, 3], stamina: [1, 2], power: [2, 4], guts: [3, 0], wit: [4, 1] },
      linkChars: ["Light Hello", "Smart Falcon", "Silence Suzuka", "Agnes Tachyon", "Mihono Bourbon"],
      // Turns 1-3 bonds and Wit, rest on turn 4 (9 turns to the debut), then train with Light
      // Hello the first time she shows up (her fixed first-training event).
      opening: {
        early: { to: 4, wit: 0.15, bond: 0.08, note: "opening: raise bonds, take Wit, and keep energy high going into turn 5 (common: Train x3, then Rest)" },
        rest: { turn: 4, below: 85, note: "Light Hello shows up from next turn, and the first time she does you train with her wherever she is, so go in with full energy" },
        chase: { name: "Light Hello", from: 5, event: { mood: 1, stats: { speed: 13, guts: 13 }, bond: 10 }, note: "train with her now, whichever training she's on. Her first-training event gives mood +1, Speed +13, Guts +13 and +10 bond, and her outings can't open until you've trained with her" }
      },
      train: { speed: [8, 0, 4, 0, 0, 4, -19], stamina: [0, 8, 0, 6, 0, 4, -20], power: [0, 4, 9, 0, 0, 4, -20], guts: [2, 0, 2, 7, 0, 4, -20], wit: [2, 0, 0, 0, 6, 5, 5] },
      finale: { name: "URA Finals", turns: [74, 76, 78], forced: true, note: "After the Grand Live: train on turns 73, 75 and 77; race the URA Qualifier, Semifinal and Final on 74, 76 and 78." },
      summary: "Training earns performance points (Dance, Passion, Vocal, Visual, Mental; 200 each at first). You spend them on song lessons, which take no turn. Promo concerts run every six months from Late December of Junior year.",
      coreLoop: [
        "Lessons don't use a turn. Mastery rewards apply immediately, while friendship and specialty bonuses wait for the next concert. Buy valuable bonuses early; carrying a song saves one technique but delays its concert bonus.",
        "Each training gives a main token 60% of the time and a second one 30%: Speed gives Dance/Visual, Stamina Passion/Vocal, Power Vocal/Mental, Guts Visual/Dance, Wit Mental/Passion. Friendship trainings add a second type, very likely the one you have least of.",
        "How many tokens (uma.guide): (9 + facility level) x 1.15 per support card on it, +2 per scenario-link card (Light Hello, Smart Falcon, Silence Suzuka, Agnes Tachyon, Mihono Bourbon). Wit starts from 5 instead of 9, so it gives the fewest.",
        "Songs only show up after technique lessons, and those cost tokens too: Stat +5 or SP +5 for 10 before the 1st live, +8 for 16 after, +12 for 24 before the Grand Live (plus 5 SP each at the next live). Year one's plan (16 techniques and 5 songs) takes about 375 tokens, often more than training brings, which is why so many runs reset.",
        "Energy techniques (+20/30/40 energy for 25/30/35 tokens) are techniques too, so they count toward the next song: buy them instead of resting when your shop offers one.",
        "Songs first: buy the most important song your shop shows; techniques are how songs show up, so buy ones that keep your next song's tokens. Once a half's songs are bought, spare tokens go to stat techniques. Tick what your shop shows in the Grand Concert section and the coach says which to get; tap Bought when you buy it.",
        "Opening: train on turns 1-3 (bonds, Wit), then rest on turn 4, when the game shows 9 turns to your debut, unless your energy is already 85+. Go into turn 5 as full as you can.",
        "Light Hello shows up from turn 5. The first time she's on a training, take it, whichever training it is: her fixed event gives mood +1, Speed +13, Guts +13 (a little less at lower LB) and +10 bond, and you need it before her outings can open. After that she's a normal card (her Training Together event can add 20 points of your scarcest type).",
        "Turn 5 to the debut: favour the cards closest to friendship. Focus one or two cards so they rainbow as soon as possible instead of spreading bond around. If no card is rainbowing and Light Hello hasn't given her +20 event by the debut, reset.",
        "Song plan, year one: buy 5 songs, then do 2 more technique lessons so the 6th song shows up, and carry it over (buy it right after the 1st Promo Live). Avoid the +Stamina and +Guts songs (Ring Ring Diary, Getaway! Fallin' Love) if you can. If you can't manage this by the end of year one, reset.",
        "Intermediate periods target 3 songs. If a song was actually carried, it credits one technique in the next period; without a carry, start with 2 techniques. The final period catches up to 18 songs by the end of turn 71, including Make Debut! (17 paid songs). The 5/3 period targets and carry tradeoff are guide heuristics, not guaranteed optimal choices.",
        "Songs to aim for: the two skill point songs in year two (Run for Our Dream!, Grow Up and Shine!) and the two +10% friendship songs in year three (Precious Treasure Box, Fanfare for the Future!).",
        "For CM aces this scenario has a very high reset rate (around 85%), so it's unfriendly for building aces with borrowed cards. Resets are normal here.",
        "Friendship trainings give the most performance points, so they stay your priority.",
        "Lives also pay 5 SP per technique lesson and 25 SP per song learned since the last live, and raise the token cap by 50.",
        "Chairman Akikawa is here: the April unique skill check needs a green (3-bar) bond with her.",
        "Past 1200 a stat gains half from training and counts about half in races, but Speed (1600) and Guts (1500) can go past it here. Blue sparks raise the caps a little more."
      ],
      deck: "A normal stat deck works. The scenario friend card Light Hello is a strong pick: her outings are better than normal ones, and her unique effect cuts energy cost on friendship trainings.",
      keyCards: ["Light Hello [From the Ground Up] (SSR Friend)", "Smart Falcon, Silence Suzuka, Agnes Tachyon, Mihono Bourbon (scenario links)"],
      inputs: [
        { id: "lh20", label: "Light Hello +20 event", scope: "turn", type: "check", help: "Her Training Together event gave you 20 points of a token type. Tick it once it happens: the debut reset check counts it." }
      ],
      resetChecks: [{ id: "debut", from: 10, at: 12, to: 14 }, { id: "songs1", from: 20, at: 23, to: 25 }],
      events: [
        { turn: 4, label: "Rest before Light Hello", tip: "The game shows 9 turns to your debut. Rest unless energy is 85+: Light Hello shows up from turn 5, and you train with her the first time she does." },
        { turn: 5, label: "Lessons unlock", tip: "You get the song Make Debut! for free: +10 of every token, and it counts as a song for the 1st live's Hype gauge and toward the 18. Train with Light Hello the first time she shows up (Speed +13, Guts +13, mood +1), then favour the cards closest to friendship until the debut. Song plan for year one: 5 songs, then carry the 6th over." },
        { turn: 12, label: "Reset check", tip: "By the debut you want one card rainbowing or Light Hello's +20 event. If neither, reset (normal for CM aces here)." },
        { turn: 23, label: "Reset check", tip: "Year one plan: 5 songs bought and the 6th song showing, held for after the live. If you're short, reset." },
        { turn: 24, label: "1st Promo Live", tip: "3 songs since the start (Make Debut! counts) guarantee a Great Success: all stats +10 (+3 with fewer). Also 5 SP per technique and 25 SP per song since the start, and the token cap goes to 250." },
        { turn: 36, label: "2nd Promo Live", tip: "3 songs since the last live: all stats +10 (+3 with fewer), 5 SP per technique and 25 SP per song since the last live, token cap to 300." },
        { turn: 48, label: "3rd Promo Live", tip: "3 songs since the last live: all stats +10 (+3 with fewer), 5 SP per technique and 25 SP per song since the last live, token cap to 350." },
        { turn: 60, label: "4th Promo Live", tip: "3 songs since the last live: all stats +10 (+3 with fewer), 5 SP per technique and 25 SP per song since the last live, token cap to 400." },
        { turn: 69, label: "Lyrics event", tip: "With 16+ songs learned, pick the line for a scenario-link character you're using for a gold skill hint." },
        { turn: 71, label: "Special-concert deadline", tip: "Learn 18 songs by the end of this command to guarantee the special GIRLS' LEGEND U. Make Debut! counts; GIRLS' LEGEND U itself does not. Its one-time all-stats +10 arrives after this turn; its friendship bonus waits for the concert." },
        { turn: 72, label: "Grand Live", tip: "The special version was decided after turn 71; today's purchases cannot change that count. The concert gives all stats +10 with full Hype, +3 otherwise, plus lesson SP. GIRLS' LEGEND U activates Friendship +10% after this concert." },
        { turn: 51, label: "Unique skill check", tip: "60,000 fans by now levels up your unique skill (40,000 for dirt-only trainees)." },
        { turn: 55, label: "Unique skill check", tip: "70,000 fans by now (60,000 dirt-only) levels it up; also needs a green (3-bar) bond with chairman Akikawa." },
        { turn: 72, label: "Unique skill check", tip: "120,000 fans by now (80,000 dirt-only) levels it up again." }
      ],
      hook: "grandlive"
    },
    {
      id: "grandmasters",
      akikawa: [[55, 60]],
      name: "Grand Masters",
      jpName: "グランドマスターズ -継ぐ者達へ-",
      status: "global-soon",
      jpRelease: "2023-02-24",
      globalRelease: "Est. late Nov to early Dec 2026",
      totalTurns: 78,
      caps: [1500, 1400, 1500, 1300, 1300],
      gainScale: 1.3,
      train: { speed: [10, 0, 3, 0, 0, 5, -19], stamina: [0, 8, 0, 6, 0, 5, -20], power: [0, 4, 9, 0, 0, 5, -20], guts: [2, 0, 3, 9, 0, 5, -20], wit: [2, 0, 0, 0, 8, 5, 5] },
      opening: {
        early: { to: 24, note: "Grand Masters Junior: bonds first. Don't rest or go out just for 2 fragments unless failure is getting high" }
      },
      finale: { name: "Grand Masters race", turns: [78], forced: true, note: "No URA Finals here. After the SWBC in Senior Late December you get 5 more training turns, then the Grand Masters race against the three goddesses." },
      summary: "From turn 3, trainings, rests, outings and races drop Knowledge Fragments (rainbow trainings drop two). Every fragment you hold adds +1 to that stat in training, and 8 fragments fuse into a Goddess Wisdom you trigger by hand (no turn used). Each Wisdom levels up its goddess for the rest of the run and gives a one-turn effect.",
      coreLoop: [
        "Opening (game8): in Junior, training for bonds beats resting or going out just for 2 fragments; rest only when failure gets high. Friendship trainings then drop fragments faster anyway.",
        "Count back from goal races: a goal race always gives 2 fragments, so collect so that your Wisdom is ready 1-4 turns before a goal race or right after it, not on the race turn while you hold 8.",
        "Rainbow trainings drop two matching fragments (Wit rarely does). Goal races give two. With 7 held, no doubles; with 8, nothing until you obtain the Wisdom.",
        "Obtain a Wisdom from the Knowledge Table at the start of a turn; it doesn't use a turn. Its one-turn effect applies to what you do that turn.",
        "Obtain a Wisdom as soon as you hold 8 fragments: while you hold 8, no new fragments drop. The exceptions: save it for summer camp, and don't spend it on a turn where few cards are training.",
        "Red (Darley Arabian): +50 energy, mood to max, every facility trains past level 5 this turn, and +35% stats from races. Use it when energy is low and a good training is up, on your best camp turn, or on a Late December turn so the year-end race pays more (it can't be used on the race screen).",
        "Blue (Godolphin Barb): every card on the training you pick gives a skill hint plus a few stats. Use it on the training with the most cards.",
        "Yellow (Byerley Turk): every card on the training you pick counts as friendship, whatever its type or bond. Use it on the training with the most non-rainbow cards.",
        "Goddess levels (up to 5) add permanent training bonus (+5% to +15% each): Blue also hint rate, Red energy discount, Yellow support event effects. Year-end races pay extra when a goddess's level is at least the year number.",
        "You control the Wisdom color with the 1st and 5th fragments of each table (the left side of each crystal decides the color).",
        "Level Red (Darley Arabian) first in Junior, to about level 2-3: level 1 already cuts training energy use 10%. Then bring every goddess to at least level 1.",
        "Before the goddess skill event (turn 77), have the goddess whose skill you want at level 4+. Darley Arabian's (mid-race speed) is the best all-round pick, Byerley Turk's (late-race speed, no condition) the steady one; Godolphin Barb's (early acceleration) costs too much for what it does. You get about 9-11 goddess levels a run."
      ],
      deck: "Speed and Power core, plus cards that bring the goddess colors you want.",
      keyCards: [],
      inputs: [
        { id: "frag", label: "Fragments", scope: "facility", type: "number", max: 2, help: "Fragments this training would drop (2 for x2)" },
        { id: "fragColor", label: "Color", scope: "facility", type: "select", options: [["", "?"], ["red", "Red"], ["blue", "Blue"], ["yellow", "Yellow"]], help: "The fragment's goddess color (the icon on the training's button). With it, Done puts the fragments on your Knowledge Table and the coach steers your next Wisdom's color." },
        { id: "wisdom", label: "Wisdom ready", scope: "turn", type: "select", help: "Set it when you have a Wisdom to obtain. With 8 fragments logged on the Knowledge Table, the coach uses the table's color by itself.", options: [["", "None"], ["red", "Red: +50 energy, past Lv5"], ["blue", "Blue: hint per card"], ["yellow", "Yellow: all cards friendship"]] }
      ],
      events: [
        { turn: 3, label: "Fragments start", tip: "Every action can drop fragments from now on." },
        { turn: 24, label: "GUR (Junior)", tip: "Year-end race after this turn (no turn used): all stats +10, 50 SP, more from goddesses at level 1+. A Red Wisdom used this turn adds 35% to the race's stats." },
        { turn: 48, label: "WBC (Classic)", tip: "Year-end race after this turn: all stats +15, 60 SP, more from goddesses at level 2+. A Red Wisdom used this turn adds 35% to the race's stats." },
        { turn: 72, label: "SWBC (Senior)", tip: "Year-end race after this turn: all stats +20, 70 SP, more from goddesses at level 3+. A Red Wisdom used this turn adds 35% to the race's stats." },
        { turn: 51, label: "Unique skill check", tip: "60,000 fans by now levels up your unique skill (40,000 for dirt-only trainees)." },
        { turn: 55, label: "Unique skill check", tip: "70,000 fans by now (60,000 dirt-only) levels it up; also needs a green (3-bar) bond with chairman Akikawa." },
        { turn: 71, label: "Unique skill check", tip: "120,000 fans by Late December (80,000 dirt-only) levels it up again." },
        { turn: 77, label: "Goddess skill event", tip: "Pick a goddess: level 4+ gives the rare skill hint, level 5 both. Total level 12+ makes it Lv 3." }
      ],
      hook: "grandmasters"
    },
    {
      id: "larc",
      name: "Project L'Arc",
      jpName: "Reach for the stars プロジェクトL'Arc",
      status: "jp",
      jpRelease: "2023-08-24",
      globalRelease: "TBA",
      totalTurns: 67,
      caps: [1600, 1600, 1500, 1500, 1300],
      gainScale: 1.35,
      goalTurns: [34, 41, 43, 60, 65],
      levelBonus: (state) => { const g = +((state.extras && state.extras.expect) || 0); return (g >= 20) + (g >= 60) + (g >= 100); },
      train: { speed: [10, 0, 3, 0, 0, 6, -21], stamina: [0, 9, 0, 4, 0, 6, -19], power: [0, 5, 11, 0, 0, 6, -20], guts: [3, 0, 2, 10, 0, 6, -21], wit: [2, 0, 0, 0, 9, 6, 5] },
      finale: { name: "Prix de l'Arc de Triomphe (Senior)", turns: [67], forced: true, note: "The career ends with the Senior-year Arc." },
      summary: "An overseas campaign aimed at the Arc, ending in Senior Early October (67 turns). Training with members fills their Star gauge (3 blocks, +1 per rainbow); full gauges open the SS Match facility. Supporter Points from SS Matches and races fill the Expectation gauge, which boosts training and raises every facility level at 20%, 60% and 100%.",
      coreLoop: [
        "Every trainee has the same goals: Make Debut, 7,000 Supporter Pt by Junior Late Dec, 3rd+ in the Japan Derby, Prix Niel, the Classic Arc, 42,000 Supporter Pt by Senior Late Mar, 3rd+ in the Takarazuka Kinen, Prix Foy, and the Senior Arc.",
        "A training fills each member's Star gauge by one block, plus one more for each rainbow character. A double rainbow fills it at once. Friend cards have no gauge.",
        "An SS Match (from turn 3) uses a turn but no energy and trains every stat. With 5 members it can become an SSS Match (much bigger), more likely the more members have done SS Matches since the last SSS.",
        "Supporter Points: G1 win 1300, G2 900, G3 700; the exhibition races pay 1500, Prix Niel and Foy 2000, the Arc 3000. The Expectation gauge raises all facility levels at 20%, 60% and 100%.",
        "France expeditions (the summer camps) allow no Japanese races, no Star gauge and no SS Matches, but pay lots of Overseas Aptitude points.",
        "Raise each Overseas Aptitude to Lv2 before the French races to clear its challenge, or you take stat penalties there. Mental Strength Lv3 gives +20% Friendship.",
        "The career is short (67 turns), so every turn weighs more: rests and outings cost more than in other scenarios.",
        "Junior: train with your support cards and Gold Ship first (her Charm brings friendship sooner), and each turn take the training that fills the most Star gauge.",
        "Run an SS Match as soon as 5 members are full. Holding it only leaves more members stuck at a full gauge, so skip a ready match only for a very strong training. One of your first 3 SS Matches is always an SSS Match, and waiting doesn't turn an SS into an SSS.",
        "Your energy sets the SS Match win chance: below about 20% it can be lost, below about 10% more likely, and a loss halves the stats. Keep energy above 30% before one.",
        "Gauges carry over through the France expeditions, so fill them before July and run the matches when you're back."
      ],
      deck: "Speed and Stamina for 2400m turf, plus Power for the heavy French ground. Keep to 4 card types or fewer, with two types at 2+ cards for double friendship trainings. Don't build around Sakegaku Mei: her after-training event fires only about a third of the time.",
      keyCards: [],
      inputs: [
        { id: "star", label: "Star gauge members", scope: "facility", type: "number", max: 5, help: "Members here whose Star gauge isn't full yet" },
        { id: "ss", label: "SS Match members", scope: "turn", type: "number", max: 5 },
        { id: "expect", label: "Expectation gauge %", scope: "turn", type: "number", max: 100 }
      ],
      events: [
        { turn: 3, label: "SS Match opens", tip: "The SS Match facility appears from this turn." },
        { turn: 24, label: "Exhibition race + goal", tip: "Exhibition race after this turn (no turn used). Goal: 7,000 Supporter Pt by now." },
        { turn: 34, label: "Japan Derby", tip: "Goal: 3rd or better." },
        { turn: 36, label: "Exhibition race", tip: "After this turn, no turn used." },
        { turn: 37, label: "France expedition", tip: "No Japanese races, Star gauges or SS Matches until September." },
        { turn: 41, label: "Prix Niel", tip: "Goal race." },
        { turn: 43, label: "Arc (Classic)", tip: "Goal race against Venus Park and Rigantona." },
        { turn: 54, label: "Exhibition race + goal", tip: "Goal: 42,000 Supporter Pt by now." },
        { turn: 60, label: "Takarazuka Kinen", tip: "Goal: 3rd or better. Exhibition race after it." },
        { turn: 61, label: "France expedition", tip: "Last expedition." },
        { turn: 65, label: "Prix Foy", tip: "Goal race." },
        { turn: 67, label: "Arc (Senior)", tip: "Final race." }
      ],
      hook: "larc"
    },
    {
      id: "uaf",
      name: "U.A.F. Ready GO!",
      jpName: "U.A.F. Ready GO! ～アスリートのきらめき～",
      status: "jp",
      jpRelease: "2024-02-24",
      globalRelease: "TBA",
      totalTurns: 78,
      caps: [1700, 1500, 1500, 1500, 1300],
      gainScale: 1.45,
      levelRule: "discipline",
      train: { speed: [12, 0, 1, 0, 0, 6, -15], stamina: [0, 11, 0, 2, 0, 6, -15], power: [0, 2, 11, 0, 0, 6, -15], guts: [1, 0, 1, 12, 0, 6, -15], wit: [2, 0, 0, 0, 11, 6, -15] },
      trainByGenre: {
        sphere: { speed: [12, 0, 1, 0, 0, 6, -15], stamina: [0, 11, 0, 2, 0, 6, -15], power: [0, 2, 11, 0, 0, 6, -15], guts: [1, 0, 1, 12, 0, 6, -15], wit: [2, 0, 0, 0, 11, 6, -15] },
        fight: { speed: [8, 0, 1, 0, 0, 10, -15], stamina: [0, 7, 0, 2, 0, 10, -15], power: [0, 2, 7, 0, 0, 10, -15], guts: [1, 0, 1, 8, 0, 10, -15], wit: [2, 0, 0, 0, 5, 10, -15] },
        free: { speed: [14, 0, 1, 0, 0, 4, -15], stamina: [1, 10, 0, 2, 0, 6, -15], power: [1, 2, 10, 0, 0, 6, -15], guts: [2, 0, 1, 12, 0, 5, -15], wit: [4, 0, 0, 0, 10, 5, -15] }
      },
      trainNote: "Sphere genre values are the default; each training uses its own genre when you set it.",
      finale: { name: "U.A.F. Showdown", turns: [], forced: false, note: "Mark the finale races on the turns your game shows." },
      summary: "The five facilities become sports in three genres (Sphere, Fight, Free), rerolled every turn. Picking a sport whose genre appears more than once is a Link Training: stronger, and every linked sport levels up. Each genre passing a 50-level mark triggers a 2-turn Heat-Up. Every sport costs 15 energy, Wit included.",
      coreLoop: [
        "Link Training: pick a sport whose genre shows up on several facilities this turn. It boosts the training and levels every linked sport, and the genre level rises by all of their gains.",
        "Consult Elfie (3 charges, refilled after the debut and each tournament part; no turn used) to swap a whole genre into another, e.g. turn 3 Sphere + 2 Fight into 5 Sphere for a big link.",
        "Heat-Up at every 50 genre levels lasts 2 training turns: Sphere boosts stats and SP by genre level, Fight boosts main stats by link size, Free adds hints.",
        "Every sport costs 15 energy, including Wit, so plan rests; resting, racing or an outing adds +3 to the next turn's sport level gains.",
        "Before each tournament part, get 12 sports to level 10/20/30/40/50. Wins add permanent Training Bonus per genre (5 wins +3%, 10 +7%, 15 +12%, 20 +17%).",
        "Genres differ: Fight gives fewer stats but more SP, Free gives more Speed.",
        "Junior: build bonds where the most cards gather, and get every non-friend card to orange (80) by the end of Junior.",
        "Early on, raise the sports that aren't lit (lit ones are already tournament favourites) and spread levels across genres. Beginners can use consultations to pull up unlit sports; for big links, turn a 2:2:1 split into 4+ of one colour.",
        "Heat-Up by colour: Blue (Sphere) gains more with sport levels, so trigger it before a race, rest or outing (the next training gets +3 levels). Red (Fight) scales with link size, so aim it at summer camp and add links with consultations. Yellow (Free) guarantees hint events (up to 2), handy early for bonds.",
        "Wit costs energy here too: take a rest or outing 2 turns before a goal race so training and non-training turns alternate. Winning all 15 sports in a tournament adds +15 energy after it."
      ],
      deck: "Five types or more so every genre has support, e.g. 2 Speed, 1 Power, 1 Guts, 1 Wit and 1 Friend (swap a Speed for Stamina for long races). SSR Tsuruki Ryoka (friend) is close to required, even at 0LB: she raises sport levels and her outing restores a lot of energy.",
      keyCards: [],
      inputs: [
        { id: "genre", label: "Genre", scope: "facility", type: "select", options: [["sphere", "Sphere (blue)"], ["fight", "Fight (red)"], ["free", "Free (yellow)"]] },
        { id: "heat", label: "Triggers Heat-Up", scope: "facility", type: "check", help: "This training pushes a genre past the next 50-level mark" },
        { id: "consult", label: "Consultations left", scope: "turn", type: "number", max: 3, default: 3 }
      ],
      events: [
        { turn: 24, label: "U.A.F. Test Stage", tip: "Aim for 12 sports at level 10+. Consultations refill after it." },
        { turn: 36, label: "Trial 1", tip: "12 sports at level 20+." },
        { turn: 48, label: "Trial 2", tip: "12 sports at level 30+." },
        { turn: 60, label: "Trial 3", tip: "12 sports at level 40+." },
        { turn: 72, label: "Showdown", tip: "12 sports at level 50+. Overall victory in all five parts unlocks extra skill evolutions." },
        { turn: 51, label: "Unique skill check", tip: "60,000 fans by now levels up your unique skill (40,000 for dirt-only trainees)." },
        { turn: 55, label: "Unique skill check", tip: "70,000 fans by now (60,000 dirt-only) levels it up; also needs a green (3-bar) bond with chairman Akikawa." },
        { turn: 71, label: "Unique skill check", tip: "120,000 fans by Late December (80,000 dirt-only) levels it up again." }
      ],
      hook: "uaf"
    },
    {
      id: "cooking",
      name: "Great Food Festival",
      jpName: "収穫ッ！満腹ッ！大豊食祭",
      status: "jp",
      jpRelease: "2024-06-26",
      globalRelease: "TBA",
      totalTurns: 78,
      caps: [1750, 1000, 1700, 1700, 1350],
      gainScale: 1.45,
      train: { speed: [11, 0, 2, 0, 0, 5, -19], stamina: [0, 8, 0, 5, 0, 5, -20], power: [0, 4, 9, 0, 0, 5, -20], guts: [2, 0, 2, 10, 0, 5, -20], wit: [2, 0, 0, 0, 8, 5, 5] },
      dishes: [
        { tier: 1, name: "Sandwich", from: 1, pct: 25, stats: ["speed", "power", "wit"], cost: [25, 0, 50, 0, 50] },
        { tier: 1, name: "Vegetable Curry", from: 1, pct: 25, stats: ["speed", "stamina", "guts"], cost: [25, 50, 0, 50, 0] },
        { tier: 2, name: "Carrot and Potato Pot-au-feu", from: 25, pct: 50, stats: ["speed"], cost: [150, 0, 80, 0, 0] },
        { tier: 2, name: "Garlic Ramen", from: 25, pct: 50, stats: ["stamina"], cost: [0, 150, 0, 80, 0] },
        { tier: 2, name: "Potato Garlic Pizza", from: 25, pct: 50, stats: ["power"], cost: [0, 80, 150, 0, 0] },
        { tier: 2, name: "Potato and Carrot Mapo Tofu", from: 25, pct: 50, stats: ["guts"], cost: [40, 0, 40, 150, 0] },
        { tier: 2, name: "Strawberry Ice Cream", from: 25, pct: 50, stats: ["wit"], cost: [80, 0, 0, 0, 150] },
        { tier: 3, name: "Chunky Carrot Pot-au-feu", from: 49, pct: 80, stats: ["speed"], cost: [250, 0, 80, 0, 0] },
        { tier: 3, name: "Whole Garlic Ramen", from: 49, pct: 80, stats: ["stamina"], cost: [0, 250, 0, 80, 0] },
        { tier: 3, name: "Fluffy Potato Garlic Pizza", from: 49, pct: 80, stats: ["power"], cost: [0, 80, 250, 0, 0] },
        { tier: 3, name: "Extra Spicy Mapo Tofu", from: 49, pct: 80, stats: ["guts"], cost: [40, 0, 40, 250, 0] },
        { tier: 3, name: "Double Strawberry Ice Cream", from: 49, pct: 80, stats: ["wit"], cost: [80, 0, 0, 0, 250] },
        { tier: 4, name: "G1 Plate", from: 73, pct: 150, stats: ["speed", "stamina", "power", "guts", "wit"], cost: [100, 100, 100, 100, 100], energy: 25 }
      ],
      finale: { name: "URA Finals", turns: [74, 76, 78], forced: true, note: "During the URA Finals you can cook the G1 Plate: +150% training, +70% race bonus, +25 energy." },
      summary: "Training grows vegetables (carrot, garlic, potato, chili, strawberry), harvested every 4 turns. A dish only lasts for the turn you cook it: +25% to a group of stats at first, +50% to one stat from Classic, +80% plus race bonus from Senior, and the G1 Plate in the URA Finals. Cooking Challenges every six months score your Cooking Points.",
      coreLoop: [
        "Cook on the turn you take a strong training, and pick the dish for that training's stat. Dishes last only that turn.",
        "Junior: Sandwich (+25% Speed/Power/Wit) or Vegetable Curry (+25% Speed/Stamina/Guts, +2 bond to everyone).",
        "From Classic: single-stat +50% dishes; from Senior: +80% plus +30% race bonus (or the linked character's specialty dish).",
        "A Great Success when cooking gives a skill hint and may restore 10 energy or pull another card onto the training.",
        "12,000 Cooking Points before the Great Food Festival (Super Satisfaction) makes the G1 Plate cheaper and stronger.",
        "Upgrade the plots for the vegetables your best dishes need. Stamina caps at 1000 here, so keep it for sprint and mile builds.",
        "Cooking Points give a training bonus for the rest of the run, so cook early: 2 dishes in the first 1-2 turns, then whenever you can through Junior. Targets: 1,500-2,000 Cooking Points by the end of Junior, 6,000-6,500 by the end of Classic, 12,000 by the Festival.",
        "Upgrade a plot as soon as the points come in, starting with the vegetable closest to its storage cap. Rough vegetable levels: all Lv2 in Junior; Carrot, Potato, Chili and Strawberry Lv3 in Classic.",
        "From Classic, cook right before friendship trainings; without friendship, pick commands with the full-power (green) stamp. Spare vegetables can go to energy-restoring dishes.",
        "Stock ingredients before each summer camp: you can cook every camp turn, but plots can't be upgraded during camp.",
        "Senior: cook before goal races when you can spare it. For the URA Finals, enter with about 200 of each vegetable so you can make a G1 Plate on every training turn."
      ],
      deck: "4-5 card types or more so vegetables come in evenly, e.g. 2 Speed, 1 Power, 1 Guts, 1 Wit and 1 Friend for this sprint-to-mile scenario. SSR Akikawa Yayoi (friend) is worth one slot: her outing event gives 40 of every vegetable. Scenario-linked characters (Special Week, Hishi Akebono, Rice Shower, Nishino Flower, Katsuragi Ace, Akikawa Yayoi) raise starting vegetables.",
      keyCards: [],
      inputs: [
        { id: "dish", label: "Best dish you can afford", scope: "turn", type: "select", options: [["0", "None"], ["1", "+25% (Sandwich/Curry)"], ["2", "+50% stat dish"], ["3", "+80% stat dish"], ["4", "G1 Plate"]] }
      ],
      events: [
        { turn: 24, label: "Tasting Party 1", tip: "1,000 Cooking Points for Great Satisfaction. New dishes unlock for Classic." },
        { turn: 36, label: "Tasting Party 2", tip: "2,500 Cooking Points for Great Satisfaction. Stock ingredients for camp: plots can't be upgraded there." },
        { turn: 48, label: "Tasting Party 3", tip: "5,000 Cooking Points for Great Satisfaction. +80% dishes unlock for Senior." },
        { turn: 60, label: "Tasting Party 4", tip: "7,000 Cooking Points for Great Satisfaction." },
        { turn: 72, label: "Great Food Festival", tip: "10,000 Cooking Points is Great Satisfaction; 12,000 is Super Satisfaction: all stats +25, 80 SP, and a G1 Plate that costs 20 fewer of each vegetable. Enter the URA Finals with about 200 of each vegetable." },
        { turn: 51, label: "Unique skill check", tip: "60,000 fans by now levels up your unique skill (40,000 for dirt-only trainees)." },
        { turn: 55, label: "Unique skill check", tip: "70,000 fans by now (60,000 dirt-only) levels it up; also needs a green (3-bar) bond with chairman Akikawa." },
        { turn: 72, label: "Unique skill check", tip: "120,000 fans by now (80,000 dirt-only) levels it up again." }
      ],
      hook: "cooking"
    },
    {
      id: "mecha",
      name: "Run! Mecha Umamusume",
      jpName: "走れ！メカウマ娘 -夢繋ぐ発明-",
      status: "jp",
      jpRelease: "2024-10-29",
      globalRelease: "TBA",
      totalTurns: 78,
      caps: [1750, 1700, 1500, 1300, 1300],
      gainScale: 1.5,
      train: { speed: [11, 0, 2, 0, 0, 5, -19], stamina: [0, 10, 0, 4, 0, 5, -20], power: [0, 4, 10, 0, 0, 5, -20], guts: [2, 0, 2, 9, 0, 5, -20], wit: [2, 0, 0, 0, 8, 5, 5] },
      finale: { name: "URA Finals", turns: [74, 76, 78], forced: true, note: "Qualifier, Semifinal and Final, with a training turn before each." },
      summary: "Training raises Research Levels, which boost training and must pass each Upgrade Exam. Mecha Gears on a facility add research and Overdrive gauge, and a full gauge unlocks Overdrive training turns.",
      coreLoop: [
        "Research gain grows with the number of characters on a facility, Mecha Gears and friendship.",
        "Balance stats enough to pass each Upgrade Exam. A higher exam score gives more Mecha EN for tuning.",
        "Put tuning into chips that boost your main stats and friendship.",
        "Fire Overdrive on stacked friendship trainings or at summer camp. You can hold 2 charges; use them up before the URA Finals, since Super Overdrive there can't use stored charges.",
        "Each core's points unlock effects during Overdrive (every 3 points). Head 12: training energy cost -50%; Head 15: every hint event fires. Chest 15: 2 more of your cards join each training. Legs 12: +15 energy and +1 mood.",
        "Tuning plan (Head/Chest/Legs, game8): start 3/0/3, Junior December 6/6/0, Classic June 15/3/0 (for camp), Classic December 15/3/6, Senior June 0/15/15 (for camp), URA 6/15/15. Points can be moved at every tuning.",
        "Upgrade Exams: aim for an S every time. game8 restarts the run on any A, and strong exam results unlock Super Overdrive (every training in Overdrive) for the URA Finals."
      ],
      deck: "A steady deck: 2 Speed, 2 Stamina, 1 Wit and 1 Friend. Bring Air Shakur or Biwa Hayahide: each scenario link adds +1 Mecha EN at the first tuning (+2 with both), and guides call the run hard without one. SSR Air Shakur (Stamina) is game8's top pick. Symboli Kris S starts you with one Overdrive charge.",
      keyCards: [],
      inputs: [
        { id: "gear", label: "Mecha Gear here", scope: "facility", type: "check" },
        { id: "overdrive", label: "Overdrive ready", scope: "turn", type: "check" }
      ],
      resetChecks: [{ id: "exam", turns: [24, 36, 48, 60] }],
      events: [
        { turn: 24, label: "Upgrade Exam 1", tip: "Research Levels decide the rank. S in every exam unlocks extra skill evolutions. Reset check: game8 restarts on an A. Tune to 6/6/0 (Head/Chest/Legs)." },
        { turn: 36, label: "Upgrade Exam 2", tip: "Reset check: an A here means restart for an ace. Tune Head to 15 for camp Overdrives." },
        { turn: 48, label: "Upgrade Exam 3", tip: "Reset check: aim for S. Tune 15/3/6." },
        { turn: 60, label: "Upgrade Exam 4", tip: "Reset check: aim for S. Tune Chest and Legs to 15 for camp." },
        { turn: 72, label: "Upgrade Exam 5", tip: "S here gives a better skill hint and extra evolutions. Spend any stored Overdrive before the URA Finals." },
        { turn: 51, label: "Unique skill check", tip: "60,000 fans by now levels up your unique skill (40,000 for dirt-only trainees)." },
        { turn: 55, label: "Unique skill check", tip: "70,000 fans by now (60,000 dirt-only) levels it up; also needs a green (3-bar) bond with chairman Akikawa." },
        { turn: 72, label: "Unique skill check", tip: "120,000 fans by now (80,000 dirt-only) levels it up again." }
      ],
      hook: "mecha"
    },
    {
      id: "legends",
      name: "The Twinkle Legends",
      jpName: "The Twinkle Legends",
      aka: "Legends",
      status: "jp",
      jpRelease: "2025-02-24",
      globalRelease: "TBA",
      totalTurns: 78,
      caps: [1850, 1600, 1600, 1500, 1450],
      gainScale: 1.55,
      train: { speed: [11, 0, 2, 0, 0, 7, -20], stamina: [0, 8, 0, 6, 0, 7, -21], power: [0, 4, 10, 0, 0, 7, -21], guts: [2, 0, 2, 10, 0, 7, -21], wit: [3, 0, 0, 0, 7, 5, 5] },
      finale: { name: "Legends finale", turns: [], forced: false, note: "Mark the finale races on the turns your game shows." },
      summary: "Three legends guide you. Training with one fills her Guidance gauge (+1 normal, +3 friendship, 8 slots). Every 6 turns you pick a Heart Knowledge, and a full gauge unlocks that legend's guidance buff.",
      coreLoop: [
        "Saint Lite: three motivation boosts start a 3-turn Super Great Condition worth +20% to +55% stats, and it can be extended. Fire it right before a run of strong turns such as summer camp.",
        "Speed Symboli: 4 successful trainings in a row start the Challenge Zone, where trainings can't fail and pay more. Keep failure low so the streak doesn't break.",
        "Haiseiko: recruits extra training partners with a Best Friend gauge; full gauges give big friendship trainings with many cards.",
        "You get one guidance per run, at Classic Early July: the legend whose Knowledge you hold the most of (3+ is the usual aim; ties are random). Collect that legend's Knowledge from Junior on. Guides disagree on which colour is which legend, so go by the names in game.",
        "Which one: game8 rates Haiseiko best (big multi-card friendship trainings, but watch energy with Wit or outings), Speed Symboli for beginners (no failures in the zone, fewer Knowledge needed), and doesn't recommend Saint Lite (needs rests, outings and mood, and lots of luck).",
        "Junior: take bond-gain and hint-rate Knowledge. From Classic, take the strongest Knowledge whatever its legend, and skip outings and races you don't need. When unsure which stat to train, pick Speed.",
        "You hold up to 10 Knowledge. Late in Senior, swap out the Junior hint and bond ones for stronger ones.",
        "Your unique skill levels up by winning the Dream Fest race at the end of each year, not by fan count.",
        "100,000+ fans plus two strategy skills (or 150,000 fans) unlock this scenario's extra skill evolutions."
      ],
      deck: "Speed, Wit and the group card (Legend Embodiment) are fixed; fill the other 2-3 slots with Stamina, Power or Guts for your distance.",
      keyCards: [],
      inputs: [
        { id: "legend", label: "Legend here", scope: "facility", type: "check" },
        { id: "follow", label: "Legend you follow", scope: "turn", type: "select", options: [["blue", "Saint Lite"], ["pink", "Speed Symboli"], ["green", "Haiseiko"]] },
        { id: "buff", label: "Guidance buff ready", scope: "turn", type: "check" }
      ],
      events: [
        { turn: 24, label: "Dream Fest (Junior)", tip: "Year-end race. Winning it levels up your unique skill." },
        { turn: 37, label: "Guidance", tip: "You get the guidance of the legend whose Knowledge you hold the most of. From here, take the strongest Knowledge whatever its legend." },
        { turn: 67, label: "My Race event", tip: "If the option's character is your trainee or in your deck you get the gold skill hint, otherwise a lower one. game8 picks the Legends option (Lv+1 hint) for the fewest restrictions." },
        { turn: 48, label: "Dream Fest (Classic)", tip: "Winning it levels up your unique skill." },
        { turn: 72, label: "Dream Fest Legend", tip: "Winning it levels up your unique skill (with Almond Eye racing, a loss can still count)." }
      ],
      hook: "legends"
    },
    {
      id: "island",
      akikawa: [[55, 60]],
      name: "Welcome to the Island",
      jpName: "無人島へようこそ -DESIGN YOUR ISLAND-",
      aka: "Island",
      status: "jp",
      jpRelease: "2025-06-27",
      globalRelease: "TBA",
      totalTurns: 78,
      caps: [1850, 1700, 1700, 1600, 1300],
      gainScale: 1.6,
      train: { speed: [12, 0, 1, 0, 0, 6, -20], stamina: [0, 9, 0, 5, 0, 6, -20], power: [0, 3, 11, 0, 0, 6, -20], guts: [2, 0, 2, 10, 0, 6, -20], wit: [2, 0, 0, 0, 8, 5, 5] },
      finale: { name: "Island finale", turns: [], forced: false, note: "Mark the finale races on the turns your game shows." },
      summary: "You build training facilities on an island. Development points earn Island Training tickets. Island Training costs no energy, can't fail and trains every facility at once, but it can't be used during camp, the finale or goal-race turns.",
      coreLoop: [
        "Junior: build bonds first. Island Training pays off once friendships are active.",
        "Use Island Training when 3 or more facilities show friendship (the beach house bonus scales with that).",
        "A new building plan follows each evaluation. Usual target: two Instinct (本能全開) facilities at Lv5 and two Technique (熟練技巧) at Lv4, mostly Speed and Stamina, ordered by the highest stat caps.",
        "Build the beach house in the first or second plan and leave it at Lv1.",
        "Until Senior Early September you can hold only 1 Island Training ticket and extras are lost, so use it on a good turn. Classic: use it before summer camp. Senior September brings 2 more: keep 1 through Senior camp and you enter the last half year with 3.",
        "Great success at every Island Assembly (and the last one) unlocks this scenario's extra skill evolutions."
      ],
      deck: "Highlander deck (one of each type) for Champions Meeting and LoH; 5 Speed cards is the easy score deck. SSR Tucker Bryne at 3LB+ is close to required (it raises the construction cap). Build Speed and Stamina first: Wit caps at 1300.",
      keyCards: ["Tucker Bryne (SSR, 3LB+)"],
      inputs: [
        { id: "tickets", label: "Island tickets", scope: "turn", type: "number", max: 3, help: "You can hold only 1 until Senior Early September (2 more come then)" }
      ],
      events: [
        { turn: 3, label: "First building plan", tip: "Plan facilities, highest stat caps first." },
        { turn: 12, label: "Evaluation", tip: "A new building plan follows." },
        { turn: 24, label: "Evaluation", tip: "A new building plan follows." },
        { turn: 36, label: "Evaluation", tip: "A new building plan follows." },
        { turn: 48, label: "Evaluation", tip: "A new building plan follows." },
        { turn: 60, label: "Evaluation", tip: "Keep your 1 ticket through camp: 2 more arrive in Senior September, for 3 in the final half year." },
        { turn: 51, label: "Unique skill check", tip: "60,000 fans by now levels up your unique skill (40,000 for dirt-only trainees)." },
        { turn: 55, label: "Unique skill check", tip: "70,000 fans by now (60,000 dirt-only) levels it up; also needs a green (3-bar) bond with chairman Akikawa." },
        { turn: 72, label: "Unique skill check", tip: "120,000 fans by now (80,000 dirt-only) levels it up again." }
      ],
      hook: "island"
    },
    {
      id: "onsen",
      name: "Yukoma Hot Springs",
      jpName: "ごくらく♪ゆこま温泉郷",
      aka: "Onsen",
      status: "jp",
      jpRelease: "2025-10-29",
      globalRelease: "TBA",
      totalTurns: 78,
      caps: [1900, 1800, 1700, 1700, 1400],
      gainScale: 1.65,
      train: { speed: [12, 0, 1, 0, 0, 6, -20], stamina: [0, 9, 0, 5, 0, 6, -20], power: [0, 3, 11, 0, 0, 6, -20], guts: [2, 0, 2, 10, 0, 6, -20], wit: [2, 0, 0, 0, 8, 5, 5] },
      trainApprox: true,
      finale: { name: "URA Finals", turns: [74, 76, 78], forced: true, note: "Qualifier, Semifinal and Final, with a training turn before each." },
      levelBonus: (state) => (state.turn > 24) + (state.turn > 48),
      summary: "Training digs hot springs, and each spring adds energy recovery and friendship bonuses. A bath ticket (max 3) takes no turn and restores energy, gives skill points and boosts training for 2 turns. Bathing parties at the end of Junior and Classic raise every training level by 1.",
      coreLoop: [
        "Dig order (game8): Junior Shikku (疾駆) → Meiseki (明晰) → Kennin (堅忍); Classic Tensho (天翔) → Gokyaku (剛脚); Senior Yukoma (ゆこま) → Shunsen (駿閃) → Densetsu (伝説). If you'll only manage 7, dig Densetsu before Shunsen. 7-8 springs is a good run; don't chase all 9.",
        "First 2 turns: train Speed or Wit to upgrade the sand Hole Digger you need for Shikku (skip it if another training is crowded). If Shikku isn't dug by the 3rd pre-debut turn, give up on it.",
        "Reset check: fewer than 2 springs dug by Junior November is a bad start; game8 says you can reset.",
        "Friendship trainings carry this scenario, so bonds and digging come first in Junior, and every card should be bonded by Classic summer camp. Upgrade every digging tool evenly so none lags.",
        "Stay in a bath almost all the time. A bath doesn't use a turn, so bathe whenever the 2-turn buff has run out.",
        "Never sit on 3 tickets. They cap at 3, so extra tickets are lost.",
        "PR activity is an extra command that always succeeds and gives 1 ticket, but it costs as much energy as a training for small stats. It's a last resort when you have no tickets and nothing else is worth a turn.",
        "Kenko Hoshina's outings: reach stage 3-4 by Classic summer camp and finish them in Senior January to April.",
        "Yukoma Spring appears in Senior January. Dig it right away. Avoid extra races.",
        "A bath lasts 2 turns, so once Meiseki and Tensho are dug, bathe the turn before a goal race or on the goal turn itself. In the URA Finals bathe every 2 turns (race-result events don't get the bonus). In Junior and Classic, use tickets freely when energy is low."
      ],
      deck: "SSR Kenko Hoshina (friend) is required even at 0LB: without her you get 20+ fewer bath tickets (about 10 fewer with the R card). For score, 2 Speed cards and no Wit card (Wit caps at 1400).",
      keyCards: ["Kenko Hoshina (SSR Friend)"],
      inputs: [
        { id: "baths", label: "Bath tickets", scope: "turn", type: "number", max: 3 },
        { id: "bathOn", label: "Bath buff active", scope: "turn", type: "check" },
        { id: "pr", label: "PR activity open", scope: "turn", type: "check" }
      ],
      resetChecks: [{ id: "springs", from: 18, at: 21, to: 24 }],
      events: [
        { turn: 3, label: "Pick a spring", tip: "Choose what to dig. Give up on Shikku if it isn't dug by now. You can switch when a spring is finished or after a bathing party." },
        { turn: 21, label: "Reset check", tip: "Fewer than 2 springs dug by now (game8 says Early or Late November) is a bad start: reset if you're building an ace." },
        { turn: 24, label: "Bathing party 1", tip: "Success raises every training level by 1." },
        { turn: 48, label: "Bathing party 2", tip: "Success raises every training level by 1." },
        { turn: 49, label: "Yukoma Spring", tip: "Strongest spring. Dig it right away." },
        { turn: 72, label: "Bathing party 3", tip: "Last party before the URA Finals." },
        { turn: 51, label: "Unique skill check", tip: "60,000 fans by now levels up your unique skill (40,000 for dirt-only trainees)." },
        { turn: 55, label: "Unique skill check", tip: "70,000 fans by now (60,000 dirt-only) levels it up." },
        { turn: 71, label: "Unique skill check", tip: "120,000 fans by Late December (80,000 dirt-only) levels it up again." }
      ],
      hook: "onsen"
    },
    {
      id: "dreams",
      name: "Beyond Dreams",
      jpName: "Beyond Dreams 共に前へ、共に光を",
      status: "jp",
      jpRelease: "2026-02-24",
      globalRelease: "TBA",
      totalTurns: 78,
      caps: [2100, 1700, 1700, 1700, 1800],
      gainScale: 1.8,
      train: { speed: [12, 0, 1, 0, 0, 6, -20], stamina: [0, 9, 0, 5, 0, 6, -20], power: [0, 3, 11, 0, 0, 6, -20], guts: [2, 0, 2, 10, 0, 6, -20], wit: [2, 0, 0, 0, 8, 5, 5] },
      trainApprox: true,
      finale: { name: "Breeders' Cup goal", turns: [], forced: false, note: "You pick the final Breeders' Cup race; the top-sorted choice is usually best. Mark it as a goal race on the turn your game shows." },
      summary: "You lead a team of three. Training with a member fills her Dream gauge (about 3 trainings), and training with her at full gauge ranks her up. Team rank equals your lowest member's rank. DREAMS training puts the members plus up to 5 cards on every facility.",
      coreLoop: [
        "Take trainings that give 2 or more Dream gauge points.",
        "Raise all three members evenly. The lowest rank sets the team rank.",
        "Rank members up by training with them while their gauge is full.",
        "Save DREAMS training for high-value turns such as summer camp, when energy is high.",
        "Use strategy meetings and reviews to steer the team toward your main stats.",
        "Aim for 2+ Dream gauge points a turn. On a 1-point turn use a DREAMS training or a friend outing instead; skip 0-point turns (except from Senior July).",
        "Keep members within 2 ranks of each other. If 2+ members are at 3 gauge, rank up the lower one first. If one falls far behind, don't chase her.",
        "DREAMS training: early on, use it when all 3 members' gauges are full. From Classic summer camp, avoid it on turns when members rank up (the gains hit the cap). After Senior June's meeting you get 4 instead of 2; use the last ones for final stat fixes.",
        "Strategy meeting levels (Physical/Technique/Mental, game8): start 3/1/1 (or 1/1/3), after the debut 3/1/3, Junior December 4-5/1/5, Classic June 4-5/5/5, Classic December 4-5/5/8. Then Senior June 7-8/5/8 for score, or 4-5/7-8/8 for skills (Champions Meeting). Technique 5 raises hint events; Mental 8 drives DREAMS gains."
      ],
      deck: "SSR Casino Drive (friend) is required (any LB). Use 2 Speed and at least 5 types, since 5 types unlock meeting effects. Mid-long: Speed, Speed, Stamina, Power, Forever Young and Casino Drive; sprint-mile: Speed, Speed, Power, Guts, Forever Young and Casino Drive.",
      keyCards: ["Casino Drive (SSR Friend)"],
      inputs: [
        { id: "members", label: "Team members", scope: "facility", type: "number", max: 3 },
        { id: "fullgauge", label: "Rank-ups ready", scope: "facility", type: "number", max: 3, help: "Members here with a full Dream gauge" },
        { id: "dreamsLeft", label: "DREAMS trainings left", scope: "turn", type: "number", max: 4, default: 2, help: "You get 2 per half year, and 4 after Senior June's meeting" },
        { id: "allFull", label: "All 3 gauges full", scope: "turn", type: "check", help: "Every team member's Dream gauge is full (early on, the best DREAMS turn)" }
      ],
      events: [
        { turn: 12, label: "Review", tip: "Half-year review: team results are scored. Unused DREAMS trainings don't carry over." },
        { turn: 24, label: "Review", tip: "Half-year review." },
        { turn: 36, label: "Review", tip: "Half-year review." },
        { turn: 48, label: "Review", tip: "Half-year review." },
        { turn: 60, label: "Final review", tip: "After this turn's meeting, DREAMS training refills to 4 for the last half year." }
      ],
      hook: "dreams"
    },
    {
      id: "ramen",
      name: "Rasshai! Trecen-ken!",
      jpName: "らっしゃい！トレセン軒！ ～恩返し、始めました～",
      aka: "Ramen",
      status: "jp-current",
      jpRelease: "2026-06-29",
      globalRelease: "TBA",
      totalTurns: 78,
      caps: [2150, 1800, 1700, 1700, 1800],
      gainScale: 1.85,
      train: { speed: [12, 0, 1, 0, 0, 6, -20], stamina: [0, 9, 0, 5, 0, 6, -20], power: [0, 3, 11, 0, 0, 6, -20], guts: [2, 0, 2, 10, 0, 6, -20], wit: [2, 0, 0, 0, 8, 5, 5] },
      trainApprox: true,
      finaleEnergy: 20,
      finale: { name: "URA Finals (special ramen)", turns: [74, 76, 78], forced: true, note: "The special ramen gives +20 energy per turn, +1 mood and +150% friendship bonus, so take friendship training every turn." },
      summary: "Training fills noodle, soup and topping gauges that earn ramen tips (max 10). A tasting session spends a region's tips for a buff, and the Ramen Jamboree (RMJ) checks your progress. It has the highest stat caps so far.",
      coreLoop: [
        "Pick regions so base gauge gains are spread out, for example 2 noodle / 3 soup / 5 topping.",
        "A tasting session uses no turn (max one per turn). Hold it right before a friendship training; the buff makes that training much stronger, and it earns hype points for the RMJ.",
        "More regions (stronger ramen) unlock each year.",
        "Tips cap at 10. Spend them before they overflow.",
        "During the URA Finals the Ultimate ramen gives +150% friendship and +20 energy every turn, so take friendship training every turn. Use the last 3 turns to push Speed, then Stamina, then Wit to their caps.",
        "Energy is the hard part: there are few ways to restore it. In Junior skip outings and recover with rests and Wit training; Wit trainings with friendship plus a tasting session give stats and tips together.",
        "Junior: make ramen for its +10 bond, and take the trainings that fill the most gauge (Tazuna's). If every training is weak, race instead.",
        "Stat order (game8): Classic Wit, then Stamina, then Speed (Speed gains little then; aim for 1,200+ Wit by the end of Classic). Senior Stamina, then Speed, then Wit.",
        "Tips reset after each Late December, so use them all before then (1-2 turns earlier if goal races get in the way). Secret Seasoning is a wild-card tip: hold up to 4, use 2 per tasting, and it doesn't reset; keep 3 or fewer before summer camp.",
        "Outings: Classic 2 before camp and 1 after; Senior 1 before and 1 after."
      ],
      deck: "The new SSR Tazuna Hayakawa is required (any LB: her link effect doesn't change). 3 Speed cards is game8's pick; 2 Speed and 2 Stamina for long. One-of-each decks aren't recommended. The high caps make this the best scenario for Champions Meeting and LoH builds.",
      keyCards: [],
      inputs: [
        { id: "tips", label: "Ramen tips", scope: "turn", type: "number", max: 10 },
        { id: "tasting", label: "Tasting available", scope: "turn", type: "check" }
      ],
      events: [
        { turn: 23, label: "Use your tips", tip: "Tips reset after Late December: hold tastings now. Secret Seasoning carries over." },
        { turn: 47, label: "Use your tips", tip: "Tips reset after Late December: hold tastings now." },
        { turn: 72, label: "Ultimate Tracen Ramen", tip: "From Senior Late December a buff fires automatically every turn: +150% friendship and +20 energy." },
        { turn: 73, label: "Super RMJ", tip: "Pick one of three ramen for a huge 3-turn buff, then take friendship training every turn." },
        { turn: 51, label: "Unique skill check", tip: "60,000 fans by now levels up your unique skill (40,000 for dirt-only trainees)." },
        { turn: 55, label: "Unique skill check", tip: "70,000 fans by now (60,000 dirt-only) levels it up." },
        { turn: 71, label: "Unique skill check", tip: "120,000 fans by Late December (80,000 dirt-only) levels it up again." }
      ],
      hook: "ramen"
    },
    {
      id: "festival",
      name: "Tomo, Fumitoki: Goshiki Shuntaisai",
      jpName: "朋、史解き ―午式駿大祭―",
      status: "announced",
      jpRelease: "Late Oct 2026 (announced)",
      globalRelease: "TBA",
      totalTurns: 78,
      caps: [2150, 1800, 1700, 1700, 1800],
      gainScale: 1.85,
      train: { speed: [12, 0, 1, 0, 0, 6, -20], stamina: [0, 9, 0, 5, 0, 6, -20], power: [0, 3, 11, 0, 0, 6, -20], guts: [2, 0, 2, 10, 0, 6, -20], wit: [2, 0, 0, 0, 8, 5, 5] },
      trainApprox: true,
      finale: { name: "Festival finale", turns: [], forced: false, note: "Mechanics haven't been revealed yet." },
      summary: "Announced for late October 2026 in JP. It's set at a festival held once every twelve years, with Umamusume appointed as sacred horses (神駒). Mechanics haven't been revealed, so the coach uses general training logic and assumes Trecen-ken's stat caps.",
      coreLoop: [
        "Mechanics haven't been revealed. The coach uses the general rules: bonds in Junior, friendship from Classic, energy planned around the summer camps.",
        "Set your stat caps in Stats once you know them."
      ],
      deck: "Unknown until release.",
      keyCards: [],
      inputs: [],
      events: [],
      hook: "ura"
    }
  ];

  const STATUS_LABELS = {
    "global": "On Global",
    "global-soon": "Global next",
    "jp": "JP only",
    "jp-current": "JP latest",
    "announced": "Announced"
  };

  const api = { SCENARIOS, STATUS_LABELS };
  // Chairman Akikawa: a check on each training she's on, and her bond, where her bond matters.
  SCENARIOS.forEach((s) => {
    if (!s.akikawa) return;
    s.inputs = s.inputs.concat([
      { id: "aki", label: "Akikawa here", scope: "facility", type: "check", help: "Chairman Akikawa is on this training. Training with her raises her bond (about +7)." },
      { id: "akiBond", label: "Akikawa bond", scope: "turn", type: "number", max: 100, help: "Her bond gauge (green is 60+). The coach adds 7 each time you train with her." }
    ]);
  });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UmaScenarios = api;
})(typeof window !== "undefined" ? window : globalThis);
