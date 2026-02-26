import { NgFor, NgIf } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

type MechanicSection = {
  title: string;
  summary: string;
  bullets: string[];
  tags?: string[];
};

@Component({
  selector: 'app-encyclopedia-mechanics',
  imports: [NgFor, NgIf, RouterLink],
  templateUrl: './encyclopedia-mechanics.component.html'
})
export class EncyclopediaMechanicsComponent {
  readonly mechanics: MechanicSection[] = [
    {
      title: 'Turn Flow',
      summary: 'The game is turn-based. Each turn resolves production, queues, and movement in a fixed order.',
      bullets: [
        'Every action is committed to a queue and resolved on turn advance.',
        'Production and research apply per turn, not in real time.',
        'Fleet movement and combat outcomes are resolved during the turn tick.'
      ],
      tags: ['Turn-based', 'Queues']
    },
    {
      title: 'Resources & Storage',
      summary: 'Metal, crystal, and deuterium are the core resources. Energy gates production and facilities.',
      bullets: [
        'Mines and plants generate resources each turn.',
        'Storage buildings increase resource caps for each planet.',
        'Power shortfalls reduce efficiency instead of hard-blocking every action.'
      ],
      tags: ['Economy', 'Energy']
    },
    {
      title: 'Planet Modifiers',
      summary: 'Planets have randomized parameters that alter production, science, and industry output.',
      bullets: [
        'Each planet type has its own modifier ranges.',
        'Anomalies and hyperspace parameters add extra variance.',
        'Colonization difficulty scales with planet type.'
      ],
      tags: ['Planets', 'RNG']
    },
    {
      title: 'Buildings',
      summary: 'Buildings are leveled upgrades that unlock infrastructure, output, and special capabilities.',
      bullets: [
        'Higher levels scale costs and output in defined curves.',
        'Some structures unlock ships, research, or storage upgrades.',
        'Building requirements gate advanced facilities.'
      ],
      tags: ['Infrastructure']
    },
    {
      title: 'Technology',
      summary: 'Research applies account-wide and unlocks global bonuses and advanced equipment.',
      bullets: [
        'Research is queued and progresses per turn.',
        'Tech requirements gate higher-tier ships and buildings.',
        'Bonuses generally stack with planet modifiers.'
      ],
      tags: ['Research']
    },
    {
      title: 'Fleets & Ships',
      summary: 'Ships have hull, shields, weapons, and cargo profiles that define their combat roles.',
      bullets: [
        'Fleet composition matters more than raw numbers.',
        'Jump-capable ships can reposition faster at an energy cost.',
        'Hangar and cargo capacities affect logistics.'
      ],
      tags: ['Combat', 'Logistics']
    },
    {
      title: 'Combat Resolution',
      summary: 'Battles resolve in discrete rounds using ship stats, weapons, and RNG.',
      bullets: [
        'Damage, evasion, and defenses are evaluated per round.',
        'Weapons with multiple shots can spike damage variance.',
        'Exact formulas are intentionally simple and subject to tuning.'
      ],
      tags: ['Combat', 'RNG']
    },
    {
      title: 'Galaxy & Exploration',
      summary: 'Galaxies are generated with voids and a dense center to encourage exploration.',
      bullets: [
        'Void chance increases on galaxy edges.',
        'The galaxy center produces denser, richer systems.',
        'Coordinates and void status are visible in previews.'
      ],
      tags: ['Galaxy']
    },
    {
      title: 'Reports & Intel',
      summary: 'Scouting and reports capture snapshots of planets for strategic planning.',
      bullets: [
        'Reports store resource, building, and tech level summaries.',
        'Data becomes stale as turns advance.',
        'Visibility depends on exploration and discovery.'
      ],
      tags: ['Intel']
    },
    {
      title: 'Game Types',
      summary: 'PvE is the primary mode, with optional PvP and mixed settings.',
      bullets: [
        'PvE focuses on AI opponents and exploration.',
        'PvP enables direct conflict with other players.',
        'PvPvE combines both in the same galaxy.'
      ],
      tags: ['Modes']
    }
  ];
}
