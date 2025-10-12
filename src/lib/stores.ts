import { writable } from 'svelte/store';
import type { SpotifyPlaylist, SpotifyTrack, SpotifyUser } from './spotify';

export const user = writable<SpotifyUser | null>(null);
export const playlists = writable<SpotifyPlaylist[]>([]);
export const selectedPlaylist = writable<SpotifyPlaylist | null>(null);
export const targetPlaylist = writable<SpotifyPlaylist | null>(null);
export const currentTracks = writable<SpotifyTrack[]>([]);
export const currentTrackIndex = writable<number>(-1);
export const isPlaying = writable(false);
export const currentTrack = writable<SpotifyTrack | null>(null);
export const playbackPosition = writable(0);
export const trackDuration = writable(0);
export const isAuthenticated = writable(false);
export const currentPlaylistSnapshot = writable<string | null>(null);
export const isRefreshingPlaylist = writable(false);
export const isPlaylistSelectorOpen = writable(false);
export const userLibrary = writable<Set<string>>(new Set());

export interface ScraperSettings {
	discoverWeeklyUrl: string;
	releaseRadarUrl: string;
}

export interface PlaylistSelections {
	source: string;
	target: string;
}

function createSettingsStore() {
	const storedSettings = typeof localStorage !== 'undefined' 
		? localStorage.getItem('motify-scraper-settings') 
		: null;
	
	const defaultSettings: ScraperSettings = {
		discoverWeeklyUrl: '',
		releaseRadarUrl: ''
	};
	
	const initialSettings = storedSettings 
		? { ...defaultSettings, ...JSON.parse(storedSettings) }
		: defaultSettings;

	const { subscribe, set, update } = writable<ScraperSettings>(initialSettings);

	return {
		subscribe,
		set: (value: ScraperSettings) => {
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem('motify-scraper-settings', JSON.stringify(value));
			}
			set(value);
		},
		update: (fn: (value: ScraperSettings) => ScraperSettings) => {
			update((value) => {
				const newValue = fn(value);
				if (typeof localStorage !== 'undefined') {
					localStorage.setItem('motify-scraper-settings', JSON.stringify(newValue));
				}
				return newValue;
			});
		}
	};
}

function createPlaylistSelectionsStore() {
	const storedSelections = typeof localStorage !== 'undefined' 
		? localStorage.getItem('motify-selected-playlists') 
		: null;
	
	const defaultSelections: PlaylistSelections = {
		source: '',
		target: ''
	};
	
	const initialSelections = storedSelections 
		? { ...defaultSelections, ...JSON.parse(storedSelections) }
		: defaultSelections;

	const { subscribe, set, update } = writable<PlaylistSelections>(initialSelections);

	return {
		subscribe,
		set: (value: PlaylistSelections) => {
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem('motify-selected-playlists', JSON.stringify(value));
			}
			set(value);
		},
		update: (fn: (value: PlaylistSelections) => PlaylistSelections) => {
			update((value) => {
				const newValue = fn(value);
				if (typeof localStorage !== 'undefined') {
					localStorage.setItem('motify-selected-playlists', JSON.stringify(newValue));
				}
				return newValue;
			});
		}
	};
}

export const scraperSettings = createSettingsStore();
export const playlistSelections = createPlaylistSelectionsStore();
