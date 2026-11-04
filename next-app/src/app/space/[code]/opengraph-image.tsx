import { ImageResponse } from 'next/og';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const alt = 'TeemChat Room Invite Preview';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const decodedCode = decodeURIComponent(code || '');

  let spaceName = decodedCode === 'main-hq' ? 'TeemChat HQ' : `Space #${decodedCode}`;
  let mapTheme = 'village';
  let memberCount = 1;

  try {
    const { data: space } = await supabase
      .from('spaces')
      .select('name, map_theme, member_count')
      .or(`slug.eq.${decodedCode},join_code.eq.${decodedCode}`)
      .maybeSingle();

    if (space) {
      if (space.name) spaceName = space.name;
      if (space.map_theme) mapTheme = space.map_theme;
      if (typeof space.member_count === 'number') memberCount = space.member_count;
    }
  } catch {
    // Fall back to defaults
  }

  const themeDisplay =
    mapTheme.charAt(0).toUpperCase() + mapTheme.slice(1).replace('_', ' ');

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px',
          backgroundColor: '#0a0d14',
          backgroundImage:
            'radial-gradient(circle at 25px 25px, #1e293b 2%, transparent 0%)',
          backgroundSize: '36px 36px',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* Top Header Row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            }}
          >
            {/* Retro Logo Box */}
            <div
              style={{
                width: '56px',
                height: '56px',
                backgroundColor: '#7c3aed',
                border: '3px solid #000000',
                boxShadow: '4px 4px 0px #000000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
              }}
            >
              👾
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <span
                style={{
                  fontSize: '32px',
                  fontWeight: 900,
                  color: '#ffffff',
                  letterSpacing: '-1px',
                }}
              >
                TeemChat
              </span>
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                }}
              >
                16-Bit Proximity Space
              </span>
            </div>
          </div>

          {/* Theme Pill */}
          <div
            style={{
              backgroundColor: '#10b981',
              color: '#022c22',
              border: '3px solid #000000',
              boxShadow: '4px 4px 0px #000000',
              padding: '8px 20px',
              borderRadius: '999px',
              fontWeight: 800,
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            🗺️ {themeDisplay} Theme
          </div>
        </div>

        {/* Central Space Card */}
        <div
          style={{
            backgroundColor: '#151c2c',
            border: '4px solid #3b82f6',
            boxShadow: '8px 8px 0px #000000',
            borderRadius: '16px',
            padding: '40px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div
            style={{
              fontSize: '18px',
              fontWeight: 800,
              color: '#60a5fa',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
            }}
          >
            ⚡ You are invited to join
          </div>
          <div
            style={{
              fontSize: '56px',
              fontWeight: 900,
              color: '#ffffff',
              letterSpacing: '-1.5px',
              lineHeight: 1.1,
            }}
          >
            {spaceName}
          </div>
          <div
            style={{
              fontSize: '22px',
              color: '#cbd5e1',
              marginTop: '4px',
            }}
          >
            Join with friends, wander the 2D world, and talk using spatial proximity voice.
          </div>
        </div>

        {/* Bottom Feature Badges */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: '16px',
            }}
          >
            <div
              style={{
                backgroundColor: '#1e293b',
                color: '#f8fafc',
                border: '2px solid #475569',
                padding: '10px 18px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              🎙️ Spatial Voice Chat
            </div>
            <div
              style={{
                backgroundColor: '#1e293b',
                color: '#f8fafc',
                border: '2px solid #475569',
                padding: '10px 18px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              🤖 AI Companion
            </div>
            <div
              style={{
                backgroundColor: '#1e293b',
                color: '#f8fafc',
                border: '2px solid #475569',
                padding: '10px 18px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              👥 {memberCount > 1 ? `${memberCount} Members` : 'Live Multiplayer'}
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#e11d48',
              color: '#ffffff',
              border: '3px solid #000000',
              boxShadow: '4px 4px 0px #000000',
              padding: '12px 24px',
              borderRadius: '8px',
              fontWeight: 900,
              fontSize: '18px',
            }}
          >
            Join Instantly →
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}

