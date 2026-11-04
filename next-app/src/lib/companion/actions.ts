import { COMPANION_ACTION_TYPES, CompanionAction, CompanionActionType } from './types';

export interface ZoneTarget {
  id: string;
  name: string;
  x: number;
  y: number;
}

/**
 * Handlers the host page provides. Anything missing is simply unavailable in
 * that context (e.g. navigate_to_zone on the dashboard).
 */
export type CompanionActionHandlers = Partial<{
  navigate_to_zone: (zone: ZoneTarget) => void;
  open_dms: (friendName?: string) => void;
  open_friends: () => void;
  open_map: () => void;
  start_tour: () => void;
  set_reminder: (text: string, minutes: number) => void;
}>;

/** Match a zone by id, exact name, or partial name (case-insensitive). */
export function resolveZone(target: string | undefined, zones: ZoneTarget[]): ZoneTarget | null {
  if (!target) return null;
  const t = target.toLowerCase().trim();
  return (
    zones.find((z) => z.id.toLowerCase() === t) ??
    zones.find((z) => z.name.toLowerCase() === t) ??
    zones.find((z) => z.name.toLowerCase().includes(t) || t.includes(z.name.toLowerCase())) ??
    null
  );
}

export interface ActionResult {
  type: CompanionActionType;
  ran: boolean;
  /** Short label for a chat chip, e.g. "Leading you to Crystal Bay Beach" */
  label?: string;
}

/**
 * Runs whitelisted companion actions. Unknown types, missing handlers and
 * unresolvable targets are skipped. Nothing here sends messages or changes
 * data on the owner's behalf: actions only open UI or move the pet.
 */
export function runCompanionActions(
  actions: CompanionAction[],
  handlers: CompanionActionHandlers,
  zones: ZoneTarget[] = []
): ActionResult[] {
  const results: ActionResult[] = [];
  for (const action of actions) {
    if (!(COMPANION_ACTION_TYPES as readonly string[]).includes(action?.type)) continue;
    const type = action.type;
    switch (type) {
      case 'navigate_to_zone': {
        const zone = resolveZone(action.target, zones);
        if (zone && handlers.navigate_to_zone) {
          handlers.navigate_to_zone(zone);
          results.push({ type, ran: true, label: `Leading you to ${zone.name}` });
        } else {
          results.push({ type, ran: false });
        }
        break;
      }
      case 'open_dms':
        if (handlers.open_dms) {
          handlers.open_dms(action.target);
          results.push({ type, ran: true, label: 'Opened messages' });
        } else results.push({ type, ran: false });
        break;
      case 'open_friends':
        if (handlers.open_friends) {
          handlers.open_friends();
          results.push({ type, ran: true, label: 'Opened friends' });
        } else results.push({ type, ran: false });
        break;
      case 'open_map':
        if (handlers.open_map) {
          handlers.open_map();
          results.push({ type, ran: true, label: 'Opened the map' });
        } else results.push({ type, ran: false });
        break;
      case 'start_tour':
        if (handlers.start_tour) {
          handlers.start_tour();
          results.push({ type, ran: true, label: 'Tour started' });
        } else results.push({ type, ran: false });
        break;
      case 'set_reminder': {
        const minutes = action.minutes ?? 0;
        if (handlers.set_reminder && action.target && minutes > 0) {
          handlers.set_reminder(action.target, minutes);
          results.push({ type, ran: true, label: `Reminder in ${formatMinutes(minutes)}` });
        } else results.push({ type, ran: false });
        break;
      }
    }
  }
  return results;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'}`;
}
