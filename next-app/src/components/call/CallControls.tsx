'use client';

import React from 'react';
import styles from './CallControls.module.css';
import { useCallStore } from '@/stores/call';
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
  } = useCallStore();

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

      {/* Camera Video Toggle */}
      <button
        type="button"
        className={`${styles.dockBtn} ${isCameraActive ? styles.activeBtn : ''}`}
        onClick={toggleCamera}
        title={isCameraActive ? 'Turn Off Camera' : 'Turn On Camera'}
        aria-label="Toggle Camera"
      >
        {isCameraActive ? <VideoIcon size={20} /> : <VideoOffIcon size={20} />}
      </button>

      {/* Screen Share Toggle */}
      <button
        type="button"
        className={`${styles.dockBtn} ${isScreenSharing ? styles.screenShareActive : ''}`}
        onClick={toggleScreenShare}
        title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
        aria-label="Toggle Screen Share"
      >
        <ScreenShareIcon size={20} />
      </button>

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
