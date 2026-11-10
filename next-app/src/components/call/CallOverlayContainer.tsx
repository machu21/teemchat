'use client';

import React, { useEffect } from 'react';
import { useCallStore } from '@/stores/call';
import { useSessionStore } from '@/stores/session';
import { CallStageModal } from './CallStageModal';
import { FloatingCallDock } from './FloatingCallDock';
import { IncomingCallModal } from './IncomingCallModal';

/** `voiceOnly`: calls drop camera and screen share (used inside spaces). */
export function CallOverlayContainer({ voiceOnly = false }: { voiceOnly?: boolean }) {
  const { session } = useSessionStore();
  const { initSignaling, cleanupSignaling, setVoiceOnly } = useCallStore();

  useEffect(() => {
    if (session?.id) {
      initSignaling(session.id);
    }

    return () => {
      cleanupSignaling();
    };
  }, [session?.id, initSignaling, cleanupSignaling]);

  useEffect(() => {
    setVoiceOnly(voiceOnly).catch(() => {});
    return () => {
      setVoiceOnly(false).catch(() => {});
    };
  }, [voiceOnly, setVoiceOnly]);

  return (
    <>
      <CallStageModal />
      <FloatingCallDock />
      <IncomingCallModal />
    </>
  );
}
