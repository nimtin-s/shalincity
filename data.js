// Constants only. No logic.
export const N = 128;

// terrain
export const LAND = 0, WATER = 1, TREES = 2;
// surf
export const EMPTY = 0, ROAD = 1, RAIL = 2, HWY = 3, WIRE = 4,
  ZR = 5, ZC = 6, ZI = 7, ZRD = 8, ZCD = 9, ZID = 10, BLD = 11, RUBBLE = 12, XING = 13, HXING = 14; // XING = road+rail crossing, HXING = highway+rail
// under bits
export const PIPE = 1, SUBWAY = 2, WIREX = 4; // WIREX = power line strung over a road/rail tile
// flags bits
export const POW = 1, WAT = 2, FIRE = 4, FLOOD = 8;

// building ids
export const COAL = 1, NUCLEAR = 2, WIND = 3, PUMP = 4, TOWER = 5, POLICE = 6, FIRESTN = 7,
  SCHOOL = 8, HOSPITAL = 9, PARK = 10, SUBSTN = 11, RAILSTN = 12;

// id: [name, w, h, cost, upkeep, kind, param, height, color]
// param: power/water = capacity, services = coverage radius
export const CAT = [null,
  ['Coal Plant',    4, 4,  4000,  50, 'power',   3000, 3, '#6b6b6b'],
  ['Nuclear Plant', 4, 4, 15000, 100, 'power',  12000, 4, '#9fd'],
  ['Wind Turbine',  1, 1,   300,  10, 'power',    100, 4, '#ddd'],
  ['Water Pump',    1, 1,   200,  20, 'water',    600, 1, '#48f'],
  ['Water Tower',   2, 2,   800,  40, 'water',    400, 3, '#7ad'],
  ['Police',        3, 3,  1000,  80, 'police',    14, 2, '#36f'],
  ['Fire Station',  3, 3,  1000,  80, 'fire',      14, 2, '#e33'],
  ['School',        3, 3,   800,  60, 'edu',       18, 1, '#fc6'],
  ['Hospital',      3, 3,  1500, 120, 'health',    18, 2, '#eee'],
  ['Park',          1, 1,    50,   5, 'park',       4, 0, '#4a4'],
  ['Subway Stn',    1, 1,   500,  30, 'station',   6, 1, '#999'],
  ['Rail Stn',      2, 2,   600,  30, 'station',   6, 1, '#a98'],
];

export const TOOLS = {
  pan:      { label: 'Pan',      icon: '✋' },
  bulldoze: { label: 'Bulldoze', icon: '🚜', cost: 1,  line: 1 },
  road:     { label: 'Road',     icon: '🛣️', cost: 10, line: 1, surf: ROAD },
  rail:     { label: 'Rail',     icon: '🛤️', cost: 20, line: 1, surf: RAIL },
  hwy:      { label: 'Highway',  icon: '🚗', cost: 40, line: 1, surf: HWY },
  wire:     { label: 'Power',    icon: '⚡', cost: 5,  line: 1, surf: WIRE },
  pipe:     { label: 'Pipe',     icon: '🚰', cost: 5,  line: 1, under: PIPE },
  subway:   { label: 'Subway',   icon: '🚇', cost: 60, line: 1, under: SUBWAY },
  zr:       { label: 'Res',      icon: '🏠', cost: 20, rect: 1, surf: ZR },
  zc:       { label: 'Com',      icon: '🏬', cost: 20, rect: 1, surf: ZC },
  zi:       { label: 'Ind',      icon: '🏭', cost: 20, rect: 1, surf: ZI },
  zrd:      { label: 'Res+',     icon: '🏢', cost: 40, rect: 1, surf: ZRD },
  zcd:      { label: 'Com+',     icon: '🏙️', cost: 40, rect: 1, surf: ZCD },
  zid:      { label: 'Ind+',     icon: '🏗️', cost: 40, rect: 1, surf: ZID },
  coal:     { label: 'Coal',     icon: '🔥', bld: COAL },
  nuclear:  { label: 'Nuclear',  icon: '☢️', bld: NUCLEAR },
  wind:     { label: 'Wind',     icon: '🌬️', bld: WIND },
  pump:     { label: 'Pump',     icon: '💧', bld: PUMP },
  tower:    { label: 'Tower',    icon: '🗼', bld: TOWER },
  police:   { label: 'Police',   icon: '🚓', bld: POLICE },
  fire:     { label: 'Fire',     icon: '🚒', bld: FIRESTN },
  school:   { label: 'School',   icon: '🏫', bld: SCHOOL },
  hospital: { label: 'Hospital', icon: '🏥', bld: HOSPITAL },
  park:     { label: 'Park',     icon: '🌳', bld: PARK },
  substn:   { label: 'Sub Stn',  icon: 'Ⓜ️', bld: SUBSTN },
  railstn:  { label: 'Rail Stn', icon: '🚉', bld: RAILSTN },
};
export const TOOL_GROUPS = [
  ['pan', 'bulldoze'], ['road', 'rail', 'hwy'], ['wire', 'pipe', 'subway'],
  ['zr', 'zc', 'zi', 'zrd', 'zcd', 'zid'], ['coal', 'nuclear', 'wind', 'pump', 'tower'],
  ['police', 'fire', 'school', 'hospital', 'park', 'substn', 'railstn'],
];

// Every tunable lives here.
export const K = {
  TICK_MS: 250, TICKS_PER_MONTH: 16,
  START_MONEY: 20000,
  GROW_T: .1, DECAY_T: -.15, P_GROW: .5, P_DECAY: .2,
  POP_PER_LVL: [0, 4, 8, 16, 32, 48, 64, 96, 128],
  PW: [1, 2, 3],           // power use per lvl, r/c/i
  WT: [1, 2, 3],           // water use per lvl
  TAXBASE: [3, 4, 3],      // $/pop-unit/month at 1%
  ROAD_MAINT: 1,           // $/network tile/month
  WORK: .5, CSHARE: .4, ISHARE: .6, EXT: .25, RBIAS: .2,
  W: [  // score weights per kind
    { dem: 1, val: .4, pol: .6, crime: .5, traf: .3, svc: .3 },
    { dem: 1, val: .3, pol: .2, crime: .4, traf: -.1, svc: .1 },
    { dem: 1, val: 0,  pol: 0,  crime: .1, traf: .2, svc: 0 },
  ],
  DISASTER_P: .02,
};
