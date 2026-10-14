export type SpaceTierType = 'free' | 'pro' | 'studio';

export interface SpaceTierInfo {
  id: SpaceTierType;
  displayName: string;
  badgeText: string;
  badgeColor: string;
  defaultCapacity: number;
  allowsCloudMapPersistence: boolean;
  allowsCustomUploads: boolean;
}

export const spaceTiers: Record<SpaceTierType, SpaceTierInfo> = {
  free: {
    id: 'free',
    displayName: 'Starter',
    badgeText: 'FREE FOREVER',
    badgeColor: '#10B981',
    defaultCapacity: 15,
    allowsCloudMapPersistence: false,
    allowsCustomUploads: false,
  },
  pro: {
    id: 'pro',
    displayName: 'Pro Builder',
    badgeText: 'PRO BUILDER',
    badgeColor: '#FBBF24',
    defaultCapacity: 75,
    allowsCloudMapPersistence: true,
    allowsCustomUploads: false,
  },
  studio: {
    id: 'studio',
    displayName: 'Studio',
    badgeText: 'STUDIO',
    badgeColor: '#38BDF8',
    defaultCapacity: 250,
    allowsCloudMapPersistence: true,
    allowsCustomUploads: true,
  },
};

export interface SpaceModel {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  category: string;
  visibility: string;
  tier: SpaceTierType;
  mapTheme: string;
  joinCode?: string | null;
  ownerId?: string | null;
  maxCapacity: number;
  memberCount: number;
  paletteIndex: number;
  isActive: boolean;
  isTemporary: boolean;
  createdAt?: string | null;
}

export function defaultHQ(): SpaceModel {
  return {
    id: 'b6941fa2-8305-4e00-833c-ca3cd5f08c9b',
    name: 'Main Headquarters',
    slug: 'main-hq',
    description: 'Persistent virtual realm with Village, Woods, Campfire & Coastal Bay',
    category: 'Gaming',
    visibility: 'public',
    tier: 'free',
    mapTheme: 'village',
    maxCapacity: 15,
    memberCount: 1,
    paletteIndex: 0,
    isActive: true,
    isTemporary: false,
    createdAt: null,
  };
}

export interface WorldObjectModel {
  id: string;
  spaceId: string;
  objectType: string;
  x: number;
  y: number;
  rotation: number;
  properties: Record<string, unknown>;
  placedBy?: string | null;
}
