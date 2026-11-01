// Ranks hairstyle templates for a person's detected profile, climate and lifestyle.
// Every score comes with human-readable reasons so the UI can explain itself.
import { STYLES, LENGTH_CM, DETECTED_LENGTH_CM, HAIR_TYPE_LEVEL, TEXTURE_LEVEL } from './styles.js';

const GROWTH_CM_PER_MONTH = 1.25;

/**
 * @param profile   output of pipeline.analyze()
 * @param climate   output of local.climate(), optional
 * @param prefs     { set: 'female'|'male'|'any', upkeep: 1-3 (max acceptable), active: bool, limit }
 */
export function recommend(profile, climate, prefs = {}) {
  const set = prefs.set || (profile.gender === 'male' ? 'male' : profile.gender === 'female' ? 'female' : 'any');
  const maxUpkeep = prefs.upkeep ?? 3;
  const hairLevel = HAIR_TYPE_LEVEL[profile.hairType?.mapping];
  const currentCm = DETECTED_LENGTH_CM[profile.hairLength];
  const lowDensity = /low/i.test(profile.hairDensity || '');
  const frizzy = (profile.frizziness?.mapping ?? 0) >= 2;
  const humid = climate?.frizzRisk;

  const ranked = STYLES.filter((st) => set === 'any' || st.id.startsWith(`${set}_`)).map((st) => {
    let score = 0;
    const pros = [];
    const cons = [];
    let upkeep = st.upkeep;

    if (profile.faceShape && profile.faceShape !== 'Unknown') {
      if (st.flatters.includes(profile.faceShape)) {
        score += 2;
        pros.push(`Balances a ${faceName(profile.faceShape)} face`);
      } else {
        score -= 1;
        cons.push(`Not the most flattering shape for a ${faceName(profile.faceShape)} face`);
      }
    }

    // Texture: working against your natural texture means daily heat styling or chemicals.
    const styleLevel = TEXTURE_LEVEL[st.texture];
    if (hairLevel !== undefined && styleLevel !== undefined) {
      const gap = styleLevel - hairLevel;
      if (gap === 0) {
        score += 2;
        pros.push('Works with your natural texture');
      } else if (Math.abs(gap) === 1) {
        upkeep += 1;
        cons.push(gap > 0 ? 'Needs daily curling or a wave perm' : 'Needs daily straightening or blow-drying');
      } else {
        score -= 2;
        upkeep += 1;
        cons.push(gap > 0 ? 'Needs a perm to hold this curl' : 'Needs relaxing or daily flat-ironing');
      }
    }

    if (humid === 'high' || (humid === 'medium' && frizzy)) {
      if (st.humid === 'poor') {
        score -= 2;
        cons.push(`Likely to frizz or drop in ${climate.city.split(',')[0]}'s humidity (dew point ${climate.dewPoint}°C)`);
      } else if (st.humid === 'good') {
        score += 1;
        pros.push('Holds up in humid weather');
      }
    }

    if (lowDensity) {
      if (st.length === 'long' && st.texture === 'straight') {
        score -= 1;
        cons.push('Long straight lengths show low density');
      } else if (st.length === 'short') {
        score += 1;
        pros.push('Shorter cuts make fine hair look fuller');
      }
    }

    if (prefs.active) {
      if (st.length === 'short' || ['braids', 'updo'].includes(st.texture) || st.length === 'long') {
        score += 0.5;
        pros.push(st.length === 'short' ? 'Low-fuss for workouts' : 'Easy to tie up for sports');
      } else {
        cons.push('Awkward length to tie back for sports');
      }
    }

    upkeep = Math.min(upkeep, 3);
    if (upkeep > maxUpkeep) {
      score -= 1.5 * (upkeep - maxUpkeep);
      cons.push('More upkeep than you want');
    }

    // How hard is this to undo? Months to grow back what gets cut off.
    let regrowMonths = 0;
    if (currentCm !== undefined) {
      const cut = currentCm - LENGTH_CM[st.length];
      if (cut > 0) regrowMonths = Math.round(cut / GROWTH_CM_PER_MONTH);
      if (regrowMonths >= 12) cons.push(`Big chop: about ${regrowMonths} months to grow back`);
      if (LENGTH_CM[st.length] > currentCm + 8) {
        score -= 1;
        cons.push('Longer than your hair now: needs extensions or a wig');
      }
    }

    return { templateId: st.id, length: st.length, texture: st.texture, upkeep, humid: st.humid, regrowMonths, score, pros, cons };
  });

  ranked.sort((a, b) => b.score - a.score || a.regrowMonths - b.regrowMonths);
  return { set, styles: ranked.slice(0, prefs.limit ?? 6) };
}

/**
 * Which YouCam effects simulate "your hair on a typical day here". Humidity mostly
 * shows up as extra volume and frizz; wavy and curly hair also tighten their curl.
 */
export function humidityEffects(profile, climate) {
  const risk = climate?.frizzRisk;
  if (!risk || risk === 'low') return [];
  const male = profile.gender === 'male';
  const effects = [{ feature: 'hair-vol', templateId: risk === 'high' ? 'female_high' : 'female_subtle' }];
  if (risk === 'high' && (HAIR_TYPE_LEVEL[profile.hairType?.mapping] ?? 0) >= 1) {
    effects.push({ feature: 'hair-curl', templateId: male ? 'male_classic_wavy' : 'female_defined_waves_' });
  }
  return effects;
}

/** Hair-extension templates, in order, as stand-ins for successive grow-out stages. */
export const GROW_OUT_STAGES = ['all_length_1', 'all_length_2_', 'all_length_3'];

function faceName(shape) {
  return { InvTriangle: 'inverted-triangle', Oblong: 'long' }[shape] || shape.toLowerCase();
}
