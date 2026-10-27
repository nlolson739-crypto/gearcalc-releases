import { useState, type ReactNode } from 'react';
import { PotionMap } from '@/utils';
import { PrayerMap } from '@/enums/Prayer';
import sunfireArt from '@/public/img/misc/sunfire_rune.webp';
import fireArt from '@/public/img/misc/fragment_fire.png';
import waterArt from '@/public/img/misc/fragment_water.png';
import earthArt from '@/public/img/misc/fragment_earth.png';
import windArt from '@/public/img/misc/fragment_wind.png';
import { Potion, Prayer } from '~/engine';
import { togglePrayer, type Buffs } from '~/state';
import { THRALLS } from '~/rules/wiki';
import { IconToggle, wikiImage } from '~/ui/common';

const img = (x: unknown) => x as string;

const PRAYER_GROUPS: [string, Prayer[]][] = [
  ['Melee', [Prayer.BURST_OF_STRENGTH, Prayer.CLARITY_OF_THOUGHT, Prayer.SUPERHUMAN_STRENGTH, Prayer.IMPROVED_REFLEXES,
    Prayer.ULTIMATE_STRENGTH, Prayer.INCREDIBLE_REFLEXES, Prayer.CHIVALRY, Prayer.PIETY, Prayer.ZEAL]],
  ['Ranged', [Prayer.SHARP_EYE, Prayer.HAWK_EYE, Prayer.EAGLE_EYE, Prayer.DEADEYE, Prayer.RIGOUR]],
  ['Magic', [Prayer.MYSTIC_WILL, Prayer.MYSTIC_LORE, Prayer.MYSTIC_MIGHT, Prayer.MYSTIC_VIGOUR, Prayer.AUGURY]],
];

const POTIONS = (Object.keys(PotionMap).map(Number) as Potion[]).sort((a, b) => PotionMap[a].order - PotionMap[b].order);

// Fractured Archive elemental fragments (wiki "Elemental fragments"): one per element, +2 max hit each.
const FRAGMENTS = [
  { key: 'fragFire', name: 'Fragment of burning fire', element: 'fire', art: fireArt },
  { key: 'fragWater', name: 'Fragment of deep water', element: 'water', art: waterArt },
  { key: 'fragEarth', name: 'Fragment of living earth', element: 'earth', art: earthArt },
  { key: 'fragAir', name: 'Fragment of whispering wind', element: 'air', art: windArt },
] as const;

type Extra = { key: keyof Buffs, name: string, icon: string };
const EXTRAS: Extra[] = [
  { key: 'onSlayerTask', name: 'On Slayer task', icon: wikiImage('Slayer helmet (i).png') },
  { key: 'markOfDarkness', name: 'Mark of Darkness', icon: wikiImage('Mark of Darkness.png') },
  { key: 'charge', name: 'Charge', icon: wikiImage('Charge.png') },
  { key: 'sunfire', name: 'Sunfire runes: fire spell hits deal at least 10% of max hit', icon: sunfireArt },
  ...FRAGMENTS.map((f) => ({ key: f.key, name: `${f.name}: +2 max hit to ${f.element} spells`, icon: f.art })),
];

type Menu = 'prayers' | 'potions' | 'thrall' | 'extras';

function Picker({
  id, label, open, setOpen, icons, children,
}: { id: Menu, label: string, open: Menu | null, setOpen: (m: Menu | null) => void, icons: { src: string, alt: string }[], children: ReactNode }) {
  const isOpen = open === id;
  return (
    <div className="buff-picker" onBlur={(e) => { if (isOpen && !e.currentTarget.contains(e.relatedTarget as Node)) setOpen(null); }}>
      <button type="button" className={`buff-btn${isOpen ? ' open' : ''}`} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : id)}>
        <span className="buff-btn-label">{label}</span>
        <span className="buff-btn-icons">
          {icons.length === 0 && <span className="tiny muted">None</span>}
          {icons.slice(0, 4).map((i) => <img key={i.alt} src={i.src} alt={i.alt} title={i.alt} />)}
          {icons.length > 4 && <span className="tiny muted">+{icons.length - 4}</span>}
        </span>
        <span className="buff-caret" aria-hidden="true">▾</span>
      </button>
      {isOpen && <div className="buff-pop" role="dialog" aria-label={label}>{children}</div>}
    </div>
  );
}

export default function BuffBar({ buffs, setBuffs }: { buffs: Buffs, setBuffs: (f: (b: Buffs) => Buffs) => void }) {
  const [open, setOpen] = useState<Menu | null>(null);
  const prayers = buffs.prayers ?? [];
  const thrall = THRALLS.find((t) => t.tier === buffs.thrall);

  return (
    <div className="buff-bar">
      <Picker id="prayers" label="Prayers" open={open} setOpen={setOpen} icons={prayers.map((p) => ({ src: img(PrayerMap[p].image), alt: PrayerMap[p].name }))}>
        {PRAYER_GROUPS.map(([group, list]) => (
          <div key={group} className="buff-group">
            <span>{group}</span>
            <div>
              {list.map((p) => (
                <IconToggle key={p} label={PrayerMap[p].name} icon={img(PrayerMap[p].image)} on={prayers.includes(p)} onClick={() => setBuffs((b) => ({ ...b, prayers: togglePrayer(b.prayers ?? [], p) }))} />
              ))}
            </div>
          </div>
        ))}
        <div className="tiny muted">Pick one per style; each setup uses the prayer for its own style. Ultimate Strength and Incredible Reflexes (and the lower pairs) stack, like in game.</div>
      </Picker>

      <Picker id="potions" label="Potions" open={open} setOpen={setOpen} icons={buffs.potions.map((p) => ({ src: img(PotionMap[p].image), alt: PotionMap[p].name }))}>
        <div className="buff-grid">
          {POTIONS.map((p) => (
            <IconToggle key={p} label={PotionMap[p].name} icon={img(PotionMap[p].image)} on={buffs.potions.includes(p)} onClick={() => setBuffs((b) => ({ ...b, potions: b.potions.includes(p) ? b.potions.filter((x) => x !== p) : [...b.potions, p] }))} />
          ))}
        </div>
        <div className="tiny muted">For each skill the strongest chosen potion counts.</div>
      </Picker>

      <Picker id="thrall" label="Thrall" open={open} setOpen={setOpen} icons={thrall ? [{ src: wikiImage(thrall.icon), alt: `${thrall.name} thrall` }] : []}>
        <div className="buff-grid">
          {THRALLS.map((t) => (
            <IconToggle key={t.tier} label={`${t.name} thrall (0–${t.maxHit}, ${t.dps} DPS)`} icon={wikiImage(t.icon)} on={buffs.thrall === t.tier} onClick={() => setBuffs((b) => ({ ...b, thrall: b.thrall === t.tier ? 0 : t.tier }))} />
          ))}
        </div>
        <div className="tiny muted">Thralls always hit (wiki). Greater: 0–3 every 2.4 s, +0.625 DPS.</div>
      </Picker>

      <Picker id="extras" label="Extras" open={open} setOpen={setOpen} icons={EXTRAS.filter((x) => buffs[x.key]).map((x) => ({ src: x.icon, alt: x.name }))}>
        <div className="buff-grid">
          {EXTRAS.map((x) => (
            <IconToggle key={x.key} label={x.name} icon={x.icon} on={!!buffs[x.key]} onClick={() => setBuffs((b) => ({ ...b, [x.key]: !b[x.key] }))} />
          ))}
        </div>
        <div className="tiny muted">Slayer task, Mark of Darkness, Charge, Sunfire runes and the four Fractured Archive elemental fragments.</div>
      </Picker>
    </div>
  );
}
