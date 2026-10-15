'use client';

import React, { useEffect } from 'react';
import { useCallStore } from '@/stores/call';
import { useSessionStore } from '@/stores/session';
import { CallStageModal } from './CallStageModal';
import { FloatingCallDock } from './FloatingCallDock';
import { IncomingCallModal } from './IncomingCallModal';

export function CallOverlayContainer() {
  const { session } = useSessionStore();
  const { initSignaling, cleanupSignaling } = useCallStore();

  useEffect(() => {
    if (session?.id) {
      initSignaling(session.id);
    }

    return () => {
      cleanupSignaling();
    };
  }, [session?.id, initSignaling, cleanupSignaling]);

  return (
    <>
      <CallStageModal />
      <FloatingCallDock />
      <IncomingCallModal />
    </>
  );
}
