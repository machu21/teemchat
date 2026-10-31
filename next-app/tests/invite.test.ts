import { describe, it, expect } from 'vitest';
import { InviteLinkService } from '../src/lib/services/invite';

describe('InviteLinkService.extractCode', () => {
  it('returns null for base website URLs without room code', () => {
    expect(InviteLinkService.extractCode('http://localhost:3000')).toBeNull();
    expect(InviteLinkService.extractCode('http://localhost:3000/')).toBeNull();
    expect(InviteLinkService.extractCode('https://teemchat.vercel.app')).toBeNull();
    expect(InviteLinkService.extractCode('https://teemchat.vercel.app/')).toBeNull();
  });

  it('extracts code from query params', () => {
    expect(InviteLinkService.extractCode('http://localhost:3000/?space=main-hq')).toBe('main-hq');
    expect(InviteLinkService.extractCode('https://teemchat.vercel.app/?invite=XYZ999')).toBe('XYZ999');
    expect(InviteLinkService.extractCode('http://localhost:3000/?code=cozy-fire')).toBe('cozy-fire');
  });

  it('extracts code from pathname', () => {
    expect(InviteLinkService.extractCode('http://localhost:3000/space/main-hq')).toBe('main-hq');
    expect(InviteLinkService.extractCode('https://teemchat.vercel.app/join/forest-room')).toBe('forest-room');
  });

  it('extracts code from hash fragments', () => {
    expect(InviteLinkService.extractCode('http://localhost:3000/#/?space=my-room')).toBe('my-room');
    expect(InviteLinkService.extractCode('http://localhost:3000/#/space/pixel-plaza')).toBe('pixel-plaza');
  });

  it('accepts raw room codes directly entered by users', () => {
    expect(InviteLinkService.extractCode('main-hq')).toBe('main-hq');
    expect(InviteLinkService.extractCode('ABC123')).toBe('ABC123');
  });

  it('returns null for empty strings', () => {
    expect(InviteLinkService.extractCode('')).toBeNull();
    expect(InviteLinkService.extractCode('   ')).toBeNull();
  });
});

describe('InviteLinkService.generateInviteUrl & extractInviteMetadata', () => {
  it('generates simple url for default theme', () => {
    const url = InviteLinkService.generateInviteUrl('main-hq');
    expect(url).toContain('/space/main-hq');
    expect(url).not.toContain('?theme=');
  });

  it('embeds theme and name when specified', () => {
    const url = InviteLinkService.generateInviteUrl('retro-arcade', {
      theme: 'arcade',
      name: 'Retro Arcade Zone',
    });
    expect(url).toContain('/space/retro-arcade');
    expect(url).toContain('theme=arcade');
    expect(url).toContain('name=Retro+Arcade+Zone');
  });

  it('extracts invite metadata accurately', () => {
    const meta = InviteLinkService.extractInviteMetadata(
      'https://teemchat.vercel.app/space/squad-chill?theme=nightclub&name=Nightclub+Party'
    );
    expect(meta.code).toBe('squad-chill');
    expect(meta.theme).toBe('nightclub');
    expect(meta.name).toBe('Nightclub Party');
  });

  it('handles query param invite URLs with metadata', () => {
    const meta = InviteLinkService.extractInviteMetadata(
      'http://localhost:3000/?space=office-work&theme=office'
    );
    expect(meta.code).toBe('office-work');
    expect(meta.theme).toBe('office');
  });
});
