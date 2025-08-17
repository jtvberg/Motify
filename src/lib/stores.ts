import { writable } from 'svelte/store';
import type { SpotifyPlaylist, SpotifyTrack, SpotifyUser } from './spotify';

export const user = writable<SpotifyUser | null>(null);
export const playlists = writable<SpotifyPlaylist[]>([]);
export const selectedPlaylist = writable<SpotifyPlaylist | null>(null);
export const targetPlaylist = writable<SpotifyPlaylist | null>(null);
export const currentTracks = writable<SpotifyTrack[]>([]);
export const isPlaying = writable(false);
export const currentTrack = writable<SpotifyTrack | null>(null);
export const playbackPosition = writable(0);
export const trackDuration = writable(0);
export const isAuthenticated = writable(false);
