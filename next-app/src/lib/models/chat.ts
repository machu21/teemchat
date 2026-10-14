export interface ChatMessageModel {
  id: string;
  roomId: string;
  spaceId: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string;
  isDirectMessage?: boolean;
}

export interface CompanionModel {
  id: string;
  userId: string;
  name: string;
  persona: string;
  companionType: string;
  avatarStyle: string;
  learnedContext: Record<string, unknown>;
  isActive: boolean;
}

export interface CompanionMemoryModel {
  id: string;
  companionId: string;
  userId: string;
  memoryKey: string;
  memoryValue: string;
  category: string;
  importanceScore: number;
  createdAt: string;
}

export interface CompanionMessageModel {
  id: string;
  companionId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface PlaylistTrack {
  id: string;
  spaceId: string;
  title: string;
  artist: string;
  audioUrl: string;
  durationSeconds: number;
  createdBy?: string | null;
  createdAt?: string | null;
  isDefaultPreset?: boolean;
}

export const defaultPlaylistPresets = (spaceId: string): PlaylistTrack[] => [
  {
    id: `preset-lofi-${spaceId}`,
    spaceId,
    title: 'Pixel Lofi Village Chill',
    artist: 'Teem Beats',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3',
    durationSeconds: 140,
    isDefaultPreset: true,
  },
  {
    id: `preset-ambient-${spaceId}`,
    spaceId,
    title: 'Campfire Night Breeze',
    artist: 'Retro Soundscape',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=chill-abstract-intention-12099.mp3',
    durationSeconds: 125,
    isDefaultPreset: true,
  },
];
