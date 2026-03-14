import { TutorialEntry, TutorialViewKey } from './tutorial-types';

const secretaryImageA = 'images/instructors/secretary_1_waifu.png';
const secretaryImageB = 'images/instructors/secretary_2_waifu.png';

export const TUTORIAL_CONTENT: Partial<Record<TutorialViewKey, TutorialEntry>> = {
  planetView: {
    key: 'planetView',
    title: 'Planet View Tutorial',
    steps: [
      {
        heading: 'Welcome to Planet View',
        bodyHtml: `
          <p>This screen is the main control room for one planet.</p>
          <p>You can monitor resources, energy, queues, buildings, ships, and the local situation without leaving this page.</p>
        `,
        characterImages: [secretaryImageA],
        characterSide: 'right',
        bubblePosition: 'top',
        mirrorCharacter: false
      },
      {
        heading: 'Top Summary and Warnings',
        bodyHtml: `
          <p>The top bar shows your planet resources, income, energy, and production powers.</p>
          <p>The <strong>Needs Attention</strong> box warns about issues like <strong>Energy insufficient</strong>, <strong>Energy reduction</strong>, empty queues, and inactive research.</p>
        `,
        characterImages: [secretaryImageB],
        characterSide: 'left',
        bubblePosition: 'top',
        mirrorCharacter: true
      },
      {
        heading: 'Planet Navigation',
        bodyHtml: `
          <p>The buttons near the planet image move to the previous or next owned planet.</p>
          <p>The dots in the top resource bar show where this planet sits in your ordered planet list. Their color reflects warning severity.</p>
        `,
        characterImages: [secretaryImageA],
        characterSide: 'right',
        bubblePosition: 'bottom',
        mirrorCharacter: false
      },
      {
        heading: 'Tabs and Production Control',
        bodyHtml: `
          <p>Use the tabs to switch between resource buildings, facilities, ships, defences, operations, and queues.</p>
          <p>On this screen you can also change building power usage, queue construction, and review progress for active production.</p>
        `,
        characterImages: [secretaryImageB],
        characterSide: 'left',
        bubblePosition: 'bottom',
        mirrorCharacter: true
      }
    ]
  }
};
