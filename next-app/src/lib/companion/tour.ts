/**
 * Guided first-time tour, narrated by the companion inside a space.
 * Each step completes when the host page reports the matching event.
 */
export type TourEvent = 'moved' | 'zone_changed' | 'chat_opened' | 'map_opened' | 'player_tapped' | 'music_opened';

export interface TourStep {
  id: string;
  /** What the companion says when the step starts */
  say: string;
  /** Event that completes the step */
  doneOn: TourEvent;
  /** Optional zone id the companion leads to during this step */
  leadTo?: string;
}

export const TOUR_STEPS: TourStep[] = [
  { id: 'move', say: 'First things first: walk with WASD, the arrow keys, or the joystick. Follow me!', doneOn: 'moved' },
  { id: 'explore', say: 'Let\'s visit somewhere new. I\'ll lead the way to the woods!', doneOn: 'zone_changed', leadTo: 'woods' },
  { id: 'chat', say: 'Open the chat to talk with the room, or with me.', doneOn: 'chat_opened' },
  { id: 'map', say: 'In a hurry? The map button lets you teleport anywhere.', doneOn: 'map_opened' },
  { id: 'people', say: 'Tap another player\'s avatar to see their profile and add them as a friend.', doneOn: 'player_tapped' },
  { id: 'music', say: 'Last one: the music button opens the space\'s shared playlist.', doneOn: 'music_opened' },
];

export const TOUR_DONE_LINE = 'That\'s the tour! You\'re a TeemChat local now. Ask me anything, anytime.';

export class TourController {
  private index: number;

  constructor(completedIds: Record<string, boolean> = {}) {
    const firstOpen = TOUR_STEPS.findIndex((s) => !completedIds[s.id]);
    this.index = firstOpen === -1 ? TOUR_STEPS.length : firstOpen;
  }

  get current(): TourStep | null {
    return TOUR_STEPS[this.index] ?? null;
  }

  get finished(): boolean {
    return this.index >= TOUR_STEPS.length;
  }

  get stepNumber(): number {
    return Math.min(this.index + 1, TOUR_STEPS.length);
  }

  restart() {
    this.index = 0;
  }

  /** Returns the newly started step (or null when the tour just finished / event didn't match). */
  handle(event: TourEvent): { completed: TourStep; next: TourStep | null } | null {
    const step = this.current;
    if (!step || step.doneOn !== event) return null;
    this.index++;
    return { completed: step, next: this.current };
  }

  progress(): Record<string, boolean> {
    return Object.fromEntries(TOUR_STEPS.slice(0, this.index).map((s) => [s.id, true]));
  }
}
