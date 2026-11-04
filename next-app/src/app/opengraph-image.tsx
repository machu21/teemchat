import { ImageResponse } from 'next/og';
import { SITE_NAME, SITE_DESCRIPTION } from '@/lib/constants/site';

export const runtime = 'nodejs';
export const alt = 'TeemChat - 16-Bit Proximity Virtual Space';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
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
        }}
      >
        {/* Top Header */}
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
            <div
              style={{
                width: '60px',
                height: '60px',
                backgroundColor: '#7c3aed',
                border: '3px solid #000000',
                boxShadow: '4px 4px 0px #000000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '32px',
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
                  fontSize: '36px',
                  fontWeight: 900,
                  color: '#ffffff',
                  letterSpacing: '-1px',
                }}
              >
                {SITE_NAME}
              </span>
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#a78bfa',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                }}
              >
                16-Bit Proximity Virtual Space
              </span>
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#f59e0b',
              color: '#451a03',
              border: '3px solid #000000',
              boxShadow: '4px 4px 0px #000000',
              padding: '10px 22px',
              borderRadius: '999px',
              fontWeight: 800,
              fontSize: '18px',
            }}
          >
            ⚡ Web + iOS + Android
          </div>
        </div>

        {/* Hero Pitch */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            maxWidth: '1000px',
          }}
        >
          <div
            style={{
              fontSize: '64px',
              fontWeight: 900,
              color: '#ffffff',
              letterSpacing: '-2px',
              lineHeight: 1.1,
            }}
          >
            Connect, Collaborate & Hangout in Retro 2D Spaces.
          </div>
          <div
            style={{
              fontSize: '24px',
              color: '#94a3b8',
              lineHeight: 1.4,
            }}
          >
            {SITE_DESCRIPTION}
          </div>
        </div>

        {/* Feature Highlights Footer */}
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
              }}
            >
              🎙️ Proximity Audio
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
              }}
            >
              🎮 HTML5 Canvas 2D
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
              }}
            >
              🤖 AI Companion
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#10b981',
              color: '#022c22',
              border: '3px solid #000000',
              boxShadow: '4px 4px 0px #000000',
              padding: '12px 24px',
              borderRadius: '8px',
              fontWeight: 900,
              fontSize: '18px',
            }}
          >
            Free to Join • No Download Needed
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}

