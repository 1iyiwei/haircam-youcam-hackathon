// Stylist knowledge about the YouCam hairstyle templates we recommend from.
// Novelty-dyed and bald templates are left out of recommendations but still try-on-able.
//
// length:  short | medium | long        (rough cm used for regrowth estimates below)
// texture: straight | wavy | curly | coily | braids | updo
// upkeep:  1 wash-and-go … 3 daily styling / frequent salon visits
// humid:   how well the look survives humidity: good | ok | poor
// flatters: YouCam faceshape values (Triangle Diamond Heart InvTriangle Oblong Oval Round Square)

export const LENGTH_CM = { short: 8, medium: 22, long: 40 };

const ROUNDING = ['Round', 'Square', 'Oval', 'Heart', 'InvTriangle', 'Diamond']; // long layers lengthen
const BOB = ['Oval', 'Oblong', 'Heart', 'InvTriangle', 'Diamond'];
const PIXIE = ['Oval', 'Heart', 'InvTriangle', 'Diamond', 'Oblong'];
const FRINGE = ['Oblong', 'Square', 'Heart', 'InvTriangle', 'Round', 'Oval'];
const CURLS = ['Oblong', 'Oval', 'Diamond', 'Heart', 'InvTriangle', 'Square'];
const TOP_VOLUME = ['Round', 'Triangle', 'Oval', 'Square'];
const UPDO = ['Oval', 'Heart', 'Diamond', 'InvTriangle', 'Oblong'];

const s = (id, length, texture, upkeep, humid, flatters) => ({ id, length, texture, upkeep, humid, flatters });

export const STYLES = [
  // female templates
  s('female_long_straight', 'long', 'straight', 2, 'poor', ['Oval', 'Round', 'Heart', 'InvTriangle']),
  s('female_side_part_straight', 'long', 'straight', 2, 'poor', ['Round', 'Square', 'Oval', 'Heart']),
  s('female_medium_straight', 'medium', 'straight', 2, 'poor', ['Oval', 'Round', 'Heart', 'InvTriangle', 'Diamond']),
  s('female_long_wavy', 'long', 'wavy', 2, 'ok', ROUNDING),
  s('female_romantic_waves', 'long', 'wavy', 3, 'ok', ROUNDING),
  s('female_gentle_waves', 'long', 'wavy', 2, 'ok', ROUNDING),
  s('female_loose_waves', 'long', 'wavy', 2, 'ok', ROUNDING),
  s('female_beachy', 'long', 'wavy', 1, 'good', ROUNDING),
  s('female_long_boho_waves', 'long', 'wavy', 1, 'good', ROUNDING),
  s('female_light_brown_wisps', 'medium', 'wavy', 2, 'ok', FRINGE),
  s('female_soft_chestnut_midcut', 'medium', 'straight', 2, 'ok', BOB),
  s('female_modern_mid_part_bob', 'short', 'straight', 2, 'poor', BOB),
  s('female_choppy_bob', 'short', 'straight', 1, 'ok', [...BOB, 'Square']),
  s('female_bobcut_wavy', 'short', 'wavy', 2, 'ok', BOB),
  s('female_bobcut_curly', 'short', 'curly', 2, 'good', CURLS),
  s('female_curly_bob', 'short', 'curly', 2, 'good', CURLS),
  s('female_short_curly', 'short', 'curly', 1, 'good', CURLS),
  s('female_mid_length_curls', 'medium', 'curly', 2, 'good', CURLS),
  s('female_tight_curls', 'medium', 'coily', 2, 'good', CURLS),
  s('female_above_shoulder_coils', 'medium', 'coily', 2, 'good', CURLS),
  s('female_bixie_cut', 'short', 'straight', 2, 'ok', PIXIE),
  s('female_curly_top_pixie', 'short', 'curly', 1, 'good', [...PIXIE, ...TOP_VOLUME]),
  s('female_brown_wavy_undercut', 'medium', 'wavy', 3, 'ok', TOP_VOLUME),
  s('female_messy_bun', 'long', 'updo', 1, 'good', UPDO),
  s('female_top_bun', 'long', 'updo', 1, 'good', [...UPDO, 'Round']),
  s('female_halo_braid', 'long', 'braids', 2, 'good', UPDO),
  s('female_fishtail_braid', 'long', 'braids', 2, 'good', UPDO),
  s('female_long_box_braids', 'long', 'braids', 1, 'good', ROUNDING),
  s('female_short_box_braids', 'medium', 'braids', 1, 'good', BOB),
  // male templates
  s('male_modern_slick_back', 'short', 'straight', 2, 'poor', ['Oval', 'Square', 'Diamond', 'Heart']),
  s('male_center_parted_style', 'medium', 'straight', 2, 'poor', ['Oval', 'Square', 'Diamond']),
  s('male_curtain', 'medium', 'straight', 2, 'ok', FRINGE),
  s('male_soft_bowl', 'short', 'straight', 1, 'ok', ['Oblong', 'Oval', 'Diamond']),
  s('male_textured_flow', 'medium', 'wavy', 2, 'ok', ['Oval', 'Round', 'Square', 'Diamond']),
  s('male_medium_tousled_waves', 'medium', 'wavy', 1, 'good', ['Oval', 'Oblong', 'Square', 'Diamond']),
  s('male_relaxed_waves', 'medium', 'wavy', 1, 'good', ['Oval', 'Oblong', 'Square', 'Diamond']),
  s('male_surfer_waves', 'medium', 'wavy', 1, 'good', ['Oval', 'Oblong', 'Square']),
  s('male_messy_surfer_cut', 'medium', 'wavy', 1, 'good', ['Oval', 'Oblong', 'Square']),
  s('male_wavy_undercut', 'short', 'wavy', 2, 'ok', TOP_VOLUME),
  s('male_defined_curls', 'short', 'curly', 2, 'good', CURLS),
  s('male_layered_curls', 'medium', 'curly', 2, 'good', CURLS),
  s('male_layered_bob', 'medium', 'straight', 2, 'ok', BOB),
  s('male_long_wavy', 'long', 'wavy', 2, 'ok', ['Round', 'Square', 'Oval', 'Diamond']),
  s('male_short_box_braids', 'short', 'braids', 1, 'good', ['Oval', 'Square', 'Oblong', 'Diamond']),
];

// Detected hair length (YouCam hair-length-detection terms) → rough cm from the scalp.
export const DETECTED_LENGTH_CM = {
  'above the ears': 5,
  'ear length': 10,
  'ear length or longer': 12,
  'short hair': 15,
  'short hair or longer': 20,
  'above chest': 30,
  'above chest or longer': 35,
  'long hair': 45,
};

// YouCam hair-type-detection mapping → our texture scale (0 straight … 3 coily).
export const HAIR_TYPE_LEVEL = {
  '1 to 2a': 0,
  '2a to 2b': 1,
  '2b to 2c': 1,
  '2c to 3a': 2,
  '3a to 3b': 2,
  '3b to 3c': 2,
  '3c to 4a': 3,
  '4a to 4b': 3,
  '4b to 4c': 3,
};
export const TEXTURE_LEVEL = { straight: 0, wavy: 1, curly: 2, coily: 3 };
