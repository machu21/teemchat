'use client';

import React from 'react';
import styles from './CallControls.module.css';
import { useCallStore } from '@/stores/call';
import { useSessionStore } from '@/stores/session';
import { canUseCallVideo } from '@/lib/membership';
import { useIsNativeApp } from '@/lib/platform/nativeApp';
import {
  MicIcon,
  MicOffIcon,
  VideoIcon,
  VideoOffIcon,
  ScreenShareIcon,
  ChatBubbleIcon,
  MaximizeIcon,
  MinimizeIcon,
  PhoneOffIcon,
} from '@/components/icons/DockIcons';

interface CallControlsProps {
  onToggleChat?: () => void;
  showChatToggle?: boolean;
  isChatOpen?: boolean;
  onToggleStage?: () => void;
  isStageMaximized?: boolean;
}

export function CallControls({
  onToggleChat,
  showChatToggle = false,
  isChatOpen = false,
  onToggleStage,
  isStageMaximized = false,
}: CallControlsProps) {
  const {
    isMicMuted,
    isCameraActive,
    isScreenSharing,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    leaveCall,
    voiceOnly,
  } = useCallStore();
  const session = useSessionStore((s) => s.session);
  const allowCallVideo = canUseCallVideo(session);
  // Plans can't be bought inside the apps, so the hint there doesn't point to an upgrade
  const isNativeApp = useIsNativeApp();

  return (
    <div className={styles.controlsDock}>
      {/* Microphone Mute / Unmute */}
      <button
        type="button"
        className={`${styles.dockBtn} ${isMicMuted ? styles.mutedBtn : styles.activeBtn}`}
        onClick={toggleMic}
        title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
        aria-label="Toggle Microphone"
      >
        {isMicMuted ? <MicOffIcon size={20} /> : <MicIcon size={20} />}
      </button>

      {/* Camera + screen share (hidden in voice-only calls; locked on Free/Guest) */}
      {!voiceOnly && (
      <>
      <button
        type="button"
        className={`${styles.dockBtn} ${isCameraActive ? styles.activeBtn : ''} ${!allowCallVideo ? styles.lockedBtn : ''}`}
        onClick={allowCallVideo ? toggleCamera : undefined}
        disabled={!allowCallVideo}
        aria-disabled={!allowCallVideo}
        title={
          !allowCallVideo
            ? isNativeApp
              ? "Camera in calls isn't included in your plan"
              : 'Upgrade to Plus to use camera in calls'
            : isCameraActive
              ? 'Turn Off Camera'
              : 'Turn On Camera'
        }
        aria-label={allowCallVideo ? 'Toggle Camera' : 'Camera requires Plus'}
      >
        {isCameraActive ? <VideoIcon size={20} /> : <VideoOffIcon size={20} />}
        {!allowCallVideo && <span className={styles.plusLockTag}>Plus</span>}
      </button>

      {/* Screen Share Toggle */}
      <button
        type="button"
        className={`${styles.dockBtn} ${isScreenSharing ? styles.screenShareActive : ''} ${!allowCallVideo ? styles.lockedBtn : ''}`}
        onClick={allowCallVideo ? toggleScreenShare : undefined}
        disabled={!allowCallVideo}
        aria-disabled={!allowCallVideo}
        title={
          !allowCallVideo
            ? isNativeApp
              ? "Screen sharing isn't included in your plan"
              : 'Upgrade to Plus to share your screen'
            : isScreenSharing
              ? 'Stop Screen Share'
              : 'Share Screen'
        }
        aria-label={allowCallVideo ? 'Toggle Screen Share' : 'Screen Share requires Plus'}
      >
        <ScreenShareIcon size={20} />
        {!allowCallVideo && <span className={styles.plusLockTag}>Plus</span>}
      </button>
      </>
      )}

      {/* Chat Sidebar Toggle */}
      {showChatToggle && onToggleChat && (
        <button
          type="button"
          className={`${styles.dockBtn} ${isChatOpen ? styles.activeBtn : ''}`}
          onClick={onToggleChat}
          title={isChatOpen ? 'Hide Chat' : 'Show Chat'}
          aria-label="Toggle In-Call Chat"
        >
          <ChatBubbleIcon size={20} />
        </button>
      )}

      {/* Maximize / Stage Toggle */}
      {onToggleStage && (
        <button
          type="button"
          className={styles.dockBtn}
          onClick={onToggleStage}
          title={isStageMaximized ? 'Minimize Stage' : 'Expand to Stage'}
          aria-label="Toggle Stage Size"
        >
          {isStageMaximized ? <MinimizeIcon size={20} /> : <MaximizeIcon size={20} />}
        </button>
      )}

      <div className={styles.divider} />

      {/* Disconnect / Hang Up */}
      <button
        type="button"
        className={`${styles.dockBtn} ${styles.dangerBtn}`}
        onClick={leaveCall}
        title="Leave Call"
        aria-label="Leave Call"
      >
        <PhoneOffIcon size={20} />
      </button>
    </div>
  );
}
