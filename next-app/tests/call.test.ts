import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockReturnThis(),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((cb) => {
        if (typeof cb === 'function') cb('SUBSCRIBED');
        return { unsubscribe: vi.fn() };
      }),
      send: vi.fn().mockResolvedValue('ok'),
      unsubscribe: vi.fn().mockResolvedValue('ok'),
    })),
    getChannels: vi.fn(() => []),
    removeChannel: vi.fn().mockResolvedValue('ok'),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
  removeRealtimeChannel: vi.fn(),
  cleanupExistingChannel: vi.fn(),
}));

vi.mock('../src/lib/utils/callSounds', () => ({
  playJoinCallSound: vi.fn(),
  playLeaveCallSound: vi.fn(),
  playMuteSound: vi.fn(),
  playUnmuteSound: vi.fn(),
  playScreenShareSound: vi.fn(),
  startCallRing: vi.fn(),
  stopCallRing: vi.fn(),
}));

import { useCallStore } from '../src/stores/call';
import { CallService } from '../src/lib/services/callService';

describe('Group & DM Call Unit Tests', () => {
  beforeEach(() => {
    // Reset store state
    useCallStore.setState({
      currentCall: null,
      status: 'idle',
      incomingCall: null,
      isStageMaximized: false,
      isMinimized: false,
      participants: [],
      isMicMuted: false,
      isCameraActive: false,
      isScreenSharing: false,
      remoteFeeds: [],
      activeSpeakerIds: new Set(),
      callDurationSeconds: 0,
    });
  });

  it('generates consistent deterministic room ID for DM and Group calls', async () => {
    const store = useCallStore.getState();

    // Start DM call
    await store.startCall({
      type: 'dm',
      conversationId: 'conv-xyz-123',
      title: 'Alice',
      isVideo: false,
      user: { id: 'u1', name: 'Bob' },
    });

    const dmCall = useCallStore.getState().currentCall;
    expect(dmCall).toBeDefined();
    expect(dmCall?.roomId).toBe('call-dm-conv-xyz-123');
    expect(dmCall?.type).toBe('dm');
    expect(dmCall?.isVideoCall).toBe(false);

    // Leave DM call
    await store.leaveCall();
    expect(useCallStore.getState().status).toBe('idle');

    // Start Group call
    await store.startCall({
      type: 'group',
      conversationId: 'squad-456',
      title: 'Pixel Explorers',
      isVideo: true,
      user: { id: 'u1', name: 'Bob' },
    });

    const groupCall = useCallStore.getState().currentCall;
    expect(groupCall).toBeDefined();
    expect(groupCall?.roomId).toBe('call-group-squad-456');
    expect(groupCall?.type).toBe('group');
    expect(groupCall?.isVideoCall).toBe(true);
  });

  it('initializes local participant correctly on call start', async () => {
    const store = useCallStore.getState();

    await store.startCall({
      type: 'dm',
      conversationId: 'conv-1',
      title: 'Test Call',
      isVideo: true,
      user: { id: 'user-self', name: 'My User' },
    });

    const state = useCallStore.getState();
    expect(state.status).toBe('connected');
    expect(state.participants.length).toBe(1);

    const localParticipant = state.participants[0];
    expect(localParticipant.id).toBe('user-self');
    expect(localParticipant.isLocal).toBe(true);
    expect(localParticipant.isCameraOn).toBe(true);
    expect(localParticipant.isMuted).toBe(false);
  });

  it('toggles microphone, camera, and screen share state', async () => {
    const store = useCallStore.getState();

    await store.startCall({
      type: 'group',
      conversationId: 'group-1',
      title: 'Squad Call',
      isVideo: false,
      user: { id: 'user-1', name: 'User 1' },
    });

    expect(useCallStore.getState().isMicMuted).toBe(false);

    // Toggle mic
    await store.toggleMic();
    expect(useCallStore.getState().isMicMuted).toBe(true);

    // Toggle camera
    expect(useCallStore.getState().isCameraActive).toBe(false);
    await store.toggleCamera();
    expect(useCallStore.getState().isCameraActive).toBe(true);

    // Toggle screen share
    expect(useCallStore.getState().isScreenSharing).toBe(false);
    await store.toggleScreenShare();
    expect(useCallStore.getState().isScreenSharing).toBe(true);
  });

  it('handles incoming call lifecycle: receive, accept, decline', async () => {
    const store = useCallStore.getState();

    // Initialize signaling
    store.initSignaling('user-receiver');

    // Simulate incoming call
    useCallStore.setState({
      incomingCall: {
        roomId: 'call-dm-conv-test',
        type: 'dm',
        conversationId: 'conv-test',
        callerId: 'user-caller',
        callerName: 'Alice',
        title: 'Alice',
        isVideo: false,
        timestamp: Date.now(),
      },
    });

    expect(useCallStore.getState().incomingCall).toBeDefined();
    expect(useCallStore.getState().incomingCall?.callerName).toBe('Alice');

    // Decline call clears incoming notification
    store.declineIncomingCall();
    expect(useCallStore.getState().incomingCall).toBeNull();

    // Re-simulate incoming call and accept
    useCallStore.setState({
      incomingCall: {
        roomId: 'call-dm-conv-test',
        type: 'dm',
        conversationId: 'conv-test',
        callerId: 'user-caller',
        callerName: 'Alice',
        title: 'Alice',
        isVideo: true,
        timestamp: Date.now(),
      },
    });

    await store.acceptIncomingCall(true, {
      id: 'user-receiver',
      name: 'Bob',
    });

    expect(useCallStore.getState().incomingCall).toBeNull();
    expect(useCallStore.getState().status).toBe('connected');
    expect(useCallStore.getState().currentCall?.roomId).toBe('call-dm-conv-test');
    expect(useCallStore.getState().currentCall?.isVideoCall).toBe(true);
  });

  it('cleans up all state and resets to idle upon leaving call', async () => {
    const store = useCallStore.getState();

    await store.startCall({
      type: 'dm',
      conversationId: 'conv-cleanup',
      title: 'Cleanup Test',
      user: { id: 'u1', name: 'User 1' },
    });

    expect(useCallStore.getState().status).toBe('connected');

    await store.leaveCall();

    const state = useCallStore.getState();
    expect(state.status).toBe('idle');
    expect(state.currentCall).toBeNull();
    expect(state.participants).toEqual([]);
    expect(state.isStageMaximized).toBe(false);
  });
});
