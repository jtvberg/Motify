export function formatDuration(durationMs: number): string {
	const minutes = Math.floor(durationMs / 60000);
	const seconds = Math.floor((durationMs % 60000) / 1000);
	return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatTime(seconds: number): string {
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.floor(seconds % 60);
	return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function extractPlaylistIdFromUrl(url: string): string {
	if (!url) return '';

	const match = url.match(/spotify\.com\/playlist\/([a-zA-Z0-9]{22})/);
	return match ? match[1] : '';
}

export function isValidSpotifyPlaylistId(id: string): boolean {
	return /^[a-zA-Z0-9]{22}$/.test(id);
}

export async function scrapeEveryNoiseTrackIds(playlistId: string): Promise<string[]> {
	try {
		const response = await fetch(`/api/scrape-everynoise?id=${encodeURIComponent(playlistId)}`);
		
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		
		const data = await response.json();
		
		if (data.error) {
			throw new Error(data.error);
		}
		
		console.log('Scraped track IDs:', data.trackIds);
		console.log('HTML sample:', data.sampleHtml);
		
		return data.trackIds || [];
		
	} catch (error) {
		console.error('Error scraping everynoise data:', error);
		
		const url = `https://everynoise.com/playlistprofile.cgi?id=${playlistId}`;
		console.log('Due to scraping limitations, you may need to run this manually in the browser console:');
		console.log(`1. Go to: ${url}`);
		console.log('2. Wait a couple of seconds for the page to load');
		console.log('3. Run this in the console:');
		console.log(`
let trackList = [];
document.querySelectorAll('.trackrow').forEach(t => trackList.push(t.id));
console.log('Track IDs:', trackList);
		`);
		
		throw error;
	}
}

export async function scrapeEveryNoiseTrackIdsWithProxy(playlistId: string): Promise<string[]> {
	const url = `https://everynoise.com/playlistprofile.cgi?id=${playlistId}`;
	const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
	
	try {
		const response = await fetch(proxyUrl);
		
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		
		const html = await response.text();
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		const trackList: string[] = [];
		const trackRows = doc.querySelectorAll('.trackrow');
		
		trackRows.forEach(t => {
			if (t.id) {
				trackList.push(t.id);
			}
		});
		
		console.log('Scraped track IDs via proxy:', trackList);
		return trackList;
		
	} catch (error) {
		console.error('Error scraping everynoise data via proxy:', error);
		throw error;
	}
}

const trackPlayabilityCache = new Map<string, boolean>();

export function isTrackPlayable(track: any): boolean {
	if (!track || !track.id || !track.name) {
		return false;
	}

	const cacheKey = track.id;
	if (trackPlayabilityCache.has(cacheKey)) {
		return trackPlayabilityCache.get(cacheKey)!;
	}
	
	let isPlayable = true;

	if (track.is_playable === false) {
		isPlayable = false;
	} else if (track.restrictions?.reason) {
		isPlayable = false;
	} else if (!track.uri || track.uri === '') {
		isPlayable = false;
	}
	
	trackPlayabilityCache.set(cacheKey, isPlayable);
	
	if (!isPlayable) {
		console.log('Unavailable track detected:', {
			name: track.name,
			is_playable: track.is_playable,
			restrictions: track.restrictions,
			uri: track.uri
		});
	}
	
	return isPlayable;
}

export function clearTrackPlayabilityCache(): void {
	trackPlayabilityCache.clear();
}

export function findNextPlayableTrack(tracks: any[], startIndex: number, direction: 1 | -1 = 1): number {
	if (tracks.length === 0) return -1;
	
	let currentIndex = startIndex;
	let attempts = 0;
	const maxAttempts = tracks.length;
	
	while (attempts < maxAttempts) {
		if (direction === 1) {
			currentIndex = currentIndex < tracks.length - 1 ? currentIndex + 1 : 0;
		} else {
			currentIndex = currentIndex > 0 ? currentIndex - 1 : tracks.length - 1;
		}
		
		if (isTrackPlayable(tracks[currentIndex])) {
			return currentIndex;
		}
		
		attempts++;

		if (currentIndex === startIndex) {
			break;
		}
	}
	
	return -1;
}

import type { Writable } from 'svelte/store';
import type { SpotifyTrack } from './spotify';

interface PlaybackStores {
	isPlaying: Writable<boolean>;
	currentTrack: Writable<SpotifyTrack | null>;
	currentTracks: Writable<SpotifyTrack[]>;
	currentTrackIndex: Writable<number>;
	playbackPosition: Writable<number>;
	trackDuration: Writable<number>;
	selectedPlaylist: Writable<any>;
	targetPlaylist: Writable<any>;
}

interface PlaybackServices {
	spotifyAPI: any;
	webPlaybackService: any;
	toastStore?: any;
}

export async function playTrack(
	track: SpotifyTrack, 
	tracks: SpotifyTrack[],
	stores: PlaybackStores,
	services: PlaybackServices
): Promise<boolean> {
	console.log('Playing track:', track.name);

	if (!isTrackPlayable(track)) {
		console.log('Track is not playable, skipping:', track.name);
		alert(`This track is not available for playback: ${track.name}`);
		return false;
	}
	
	const deviceId = services.webPlaybackService.getDeviceId();
	const trackIndex = tracks.findIndex(t => t.id === track.id);

	if (!deviceId) {
		stores.currentTrack.set(track);
	}
	stores.currentTrackIndex.set(trackIndex);
	stores.playbackPosition.set(0);
	stores.isPlaying.set(true);
	
	let playSuccessful = false;
	let lastError: any = null;
	
	try {
		if (deviceId) {
			console.log('Using web player with device ID:', deviceId);
			await services.webPlaybackService.play(track.uri);
			playSuccessful = true;
			console.log('✅ Track started successfully via web player');
		} else {
			console.log('Web player not ready, using fallback');
			await services.spotifyAPI.playTrack(track.uri);
			stores.currentTrack.set(track);
			playSuccessful = true;
			console.log('✅ Track started successfully via fallback');
		}
	} catch (error) {
		lastError = error;
		console.error('❌ Play request failed:', error);

		stores.isPlaying.set(false);

		console.log('Checking if playback started despite error...');
		await new Promise(resolve => setTimeout(resolve, 1000));
		
		try {
			if (deviceId) {
				const state = await services.webPlaybackService.getCurrentState();
				if (state && !state.paused && state.track_window?.current_track?.uri === track.uri) {
					console.log('✅ Playback actually started despite API error');
					playSuccessful = true;
					stores.isPlaying.set(true);
				}
			} else {
				const state = await services.spotifyAPI.getPlaybackState();
				if (state && state.is_playing && state.item?.uri === track.uri) {
					console.log('✅ Playback actually started despite API error');
					playSuccessful = true;
					stores.isPlaying.set(true);
				}
			}
		} catch (stateError) {
			console.log('Could not check playback state:', stateError);
		}
	}

	if (!playSuccessful && lastError) {
		stores.currentTrack.set(null);
		stores.currentTrackIndex.set(-1);
		stores.isPlaying.set(false);
		stores.playbackPosition.set(0);
		
		const errorMessage = typeof lastError === 'object' && lastError !== null && 'message' in lastError
			? (lastError as { message: string }).message
			: String(lastError);
		
		console.error('Showing error to user:', errorMessage);

		if (errorMessage.includes('Premium') || errorMessage.includes('403')) {
			alert('Spotify Premium is required for track playback. Please upgrade your Spotify account to Premium to use this feature.');
		} else if (errorMessage.includes('Device not found') || errorMessage.includes('404')) {
			alert('Playback device not found. Please make sure Spotify is open and try again.');
		} else {
			alert(`Failed to play track: ${errorMessage}. Make sure you have Spotify Premium and try again.`);
		}
	}

	return playSuccessful;
}

export async function togglePlayPause(
	track: SpotifyTrack,
	tracks: SpotifyTrack[],
	stores: PlaybackStores,
	services: PlaybackServices
): Promise<void> {
	if (!isTrackPlayable(track)) {
		console.log('Track is not playable, cannot toggle:', track.name);
		return;
	}
	
	let isCurrentTrack = false;
	let isCurrentlyPlaying = false;
	let currentTrackValue: SpotifyTrack | null = null;

	const currentTrackUnsub = stores.currentTrack.subscribe((value: SpotifyTrack | null) => { currentTrackValue = value; });
	const isPlayingUnsub = stores.isPlaying.subscribe((value: boolean) => { isCurrentlyPlaying = value; });
	
	currentTrackUnsub();
	isPlayingUnsub();
	
	isCurrentTrack = (currentTrackValue as unknown as SpotifyTrack)?.id === track.id;
	
	if (isCurrentTrack && isCurrentlyPlaying) {
		try {
			const deviceId = services.webPlaybackService.getDeviceId();
			if (deviceId) {
				await services.webPlaybackService.pause();
			} else {
				await services.spotifyAPI.pausePlayback();
			}
			stores.isPlaying.set(false);
		} catch (error) {
			console.error('Failed to pause track:', error);
		}
	} else if (isCurrentTrack && !isCurrentlyPlaying) {
		try {
			const deviceId = services.webPlaybackService.getDeviceId();
			if (deviceId) {
				await services.webPlaybackService.play();
			} else {
				await services.spotifyAPI.resumePlayback();
			}
			stores.isPlaying.set(true);
		} catch (error) {
			console.error('Failed to resume track:', error);
		}
	} else {
		await playTrack(track, tracks, stores, services);
	}
}

export async function togglePlayback(
	stores: PlaybackStores,
	services: PlaybackServices,
	isPlayerReady: boolean
): Promise<void> {
	try {
		if (isPlayerReady) {
			await services.webPlaybackService.togglePlay();
		} else {
			let isCurrentlyPlaying = false;
			stores.isPlaying.subscribe(value => { isCurrentlyPlaying = value; })();
			
			if (isCurrentlyPlaying) {
				await services.spotifyAPI.pausePlayback();
				stores.isPlaying.set(false);
			} else {
				await services.spotifyAPI.resumePlayback();
				stores.isPlaying.set(true);
			}
		}
	} catch (error) {
		console.error('Failed to toggle playback:', error);
	}
}

export async function playPreviousTrack(
	stores: PlaybackStores,
	services: PlaybackServices,
	isPlayerReady: boolean,
	stopPositionUpdates: () => void,
	startPositionUpdates: () => void,
	updatePlaybackState: () => void
): Promise<void> {
	try {
		let tracks: SpotifyTrack[] = [];
		let currentIndex = -1;
		let isCurrentlyPlaying = false;
		
		stores.currentTracks.subscribe(value => { tracks = value; })();
		stores.currentTrackIndex.subscribe(value => { currentIndex = value; })();
		stores.isPlaying.subscribe(value => { isCurrentlyPlaying = value; })();
		
		if (tracks.length === 0 || currentIndex < 0) {
			console.log('No playlist context for previous track');
			return;
		}

		stopPositionUpdates();

		const previousIndex = findNextPlayableTrack(tracks, currentIndex, -1);
		
		if (previousIndex === -1) {
			console.log('No playable previous track found');
			return;
		}
		
		const previousTrack = tracks[previousIndex];
		
		console.log(`Playing previous track: ${previousTrack.name} (index ${previousIndex})`);

		stores.playbackPosition.set(0);
		stores.currentTrackIndex.set(previousIndex);

		if (isPlayerReady) {
			await services.webPlaybackService.play(previousTrack.uri);
		} else {
			await services.spotifyAPI.playTrack(previousTrack.uri);
			stores.currentTrack.set(previousTrack);
			setTimeout(updatePlaybackState, 500);
		}

		if (isCurrentlyPlaying && isPlayerReady) {
			startPositionUpdates();
		}
	} catch (error) {
		console.error('Failed to go to previous track:', error);
	}
}

export async function playNextTrack(
	stores: PlaybackStores,
	services: PlaybackServices,
	isPlayerReady: boolean,
	stopPositionUpdates: () => void,
	startPositionUpdates: () => void,
	updatePlaybackState: () => void
): Promise<void> {
	try {
		let tracks: SpotifyTrack[] = [];
		let currentIndex = -1;
		let isCurrentlyPlaying = false;
		
		stores.currentTracks.subscribe(value => { tracks = value; })();
		stores.currentTrackIndex.subscribe(value => { currentIndex = value; })();
		stores.isPlaying.subscribe(value => { isCurrentlyPlaying = value; })();
		
		if (tracks.length === 0 || currentIndex < 0) {
			console.log('No playlist context for next track');
			return;
		}

		stopPositionUpdates();

		const nextIndex = findNextPlayableTrack(tracks, currentIndex, 1);
		
		if (nextIndex === -1) {
			console.log('No playable next track found');
			return;
		}
		
		const nextTrack = tracks[nextIndex];
		
		console.log(`Playing next track: ${nextTrack.name} (index ${nextIndex})`);

		stores.playbackPosition.set(0);
		stores.currentTrackIndex.set(nextIndex);

		if (isPlayerReady) {
			await services.webPlaybackService.play(nextTrack.uri);
		} else {
			await services.spotifyAPI.playTrack(nextTrack.uri);
			stores.currentTrack.set(nextTrack);
			setTimeout(updatePlaybackState, 500);
		}

		if (isCurrentlyPlaying && isPlayerReady) {
			startPositionUpdates();
		}
	} catch (error) {
		console.error('Failed to go to next track:', error);
	}
}

async function removeTrackFromPlaylist(
	track: SpotifyTrack,
	playlistId: string,
	services: PlaybackServices
): Promise<void> {
	const { getOperationalUri, isTrackRelinked } = await import('./spotify');
	
	const operationalUri = getOperationalUri(track);
	const isRelinked = isTrackRelinked(track);
	console.log(`Removing track "${track.name}" from playlist - Relinked: ${isRelinked}, Using URI: ${operationalUri}${isRelinked ? ` (original: ${track.uri})` : ''}`);
	
	await services.spotifyAPI.removeTrackFromPlaylist(playlistId, operationalUri);
}

async function addTrackToPlaylist(
	track: SpotifyTrack,
	playlistId: string,
	services: PlaybackServices,
	handleAPIError: <T>(apiCall: () => Promise<T>) => Promise<T | null>
): Promise<boolean> {
	const { getOperationalUri, isTrackRelinked } = await import('./spotify');
	
	const operationalUri = getOperationalUri(track);
	const isRelinked = isTrackRelinked(track);
	console.log(`Adding track "${track.name}" to playlist - Relinked: ${isRelinked}, Using URI: ${operationalUri}${isRelinked ? ` (original: ${track.uri})` : ''}`);

	const targetTracks = await handleAPIError(() => services.spotifyAPI.getPlaylistTracks(playlistId));
	const trackAlreadyExists = targetTracks && Array.isArray(targetTracks) && targetTracks.some((t: SpotifyTrack) => t.id === track.id);
	
	if (!trackAlreadyExists) {
		await services.spotifyAPI.addTrackToPlaylist(playlistId, operationalUri);
		return true;
	}
	
	return false;
}

export async function removeTrack(
	track: SpotifyTrack,
	tracks: SpotifyTrack[],
	stores: PlaybackStores,
	services: PlaybackServices,
	handleAPIError: <T>(apiCall: () => Promise<T>) => Promise<T | null>
): Promise<SpotifyTrack[]> {
	let selectedPlaylist: any = null;
	let currentTrack: SpotifyTrack | null = null;
	
	const selectedPlaylistUnsub = stores.selectedPlaylist.subscribe((value: any) => { selectedPlaylist = value; });
	const currentTrackUnsub = stores.currentTrack.subscribe((value: SpotifyTrack | null) => { currentTrack = value; });
	
	selectedPlaylistUnsub();
	currentTrackUnsub();
	
	if (!selectedPlaylist) {
		console.error('No selected playlist');
		return tracks;
	}
	
	const isCurrentlyPlaying = (currentTrack as unknown as SpotifyTrack)?.id === track.id;
	const currentIndex = tracks.findIndex(t => t.id === track.id);
	
	try {
		await removeTrackFromPlaylist(track, selectedPlaylist.id, services);

		const updatedTracks = tracks.filter(t => t.id !== track.id);
		stores.currentTracks.set(updatedTracks);

		if (services.toastStore) {
			services.toastStore.add({
				message: `Removed "${track.name}" from ${selectedPlaylist.name}`,
				type: 'success'
			});
		}

		if (isCurrentlyPlaying && updatedTracks.length > 0) {
			const startSearchIndex = Math.min(currentIndex, updatedTracks.length - 1);

			if (startSearchIndex >= 0 && isTrackPlayable(updatedTracks[startSearchIndex])) {
				const nextTrack = updatedTracks[startSearchIndex];
				console.log(`Auto-playing track that moved into removed position: ${nextTrack.name}`);
				await playTrack(nextTrack, updatedTracks, stores, services);
			} else {
				const nextPlayableIndex = findNextPlayableTrack(updatedTracks, startSearchIndex, 1);
				
				if (nextPlayableIndex !== -1) {
					const nextTrack = updatedTracks[nextPlayableIndex];
					console.log(`Auto-playing next playable track after removal: ${nextTrack.name}`);
					await playTrack(nextTrack, updatedTracks, stores, services);
				} else {
					console.log('No playable tracks remaining after removal');
					stores.currentTrack.set(null);
					stores.currentTrackIndex.set(-1);
					stores.isPlaying.set(false);
				}
			}
		}
		
		return updatedTracks;
	} catch (error) {
		console.error('Failed to remove track:', error);

		if (services.toastStore) {
			services.toastStore.add({
				message: `Failed to remove "${track.name}": ${error instanceof Error ? error.message : 'Unknown error'}`,
				type: 'error'
			});
		}
		
		return tracks;
	}
}

export async function moveTrack(
	track: SpotifyTrack,
	tracks: SpotifyTrack[],
	stores: PlaybackStores,
	services: PlaybackServices,
	handleAPIError: <T>(apiCall: () => Promise<T>) => Promise<T | null>
): Promise<SpotifyTrack[]> {
	let selectedPlaylist: any = null;
	let targetPlaylist: any = null;
	let currentTrack: SpotifyTrack | null = null;
	
	const selectedPlaylistUnsub = stores.selectedPlaylist.subscribe((value: any) => { selectedPlaylist = value; });
	const targetPlaylistUnsub = stores.targetPlaylist.subscribe((value: any) => { targetPlaylist = value; });
	const currentTrackUnsub = stores.currentTrack.subscribe((value: SpotifyTrack | null) => { currentTrack = value; });
	
	selectedPlaylistUnsub();
	targetPlaylistUnsub();
	currentTrackUnsub();
	
	if (!targetPlaylist || !selectedPlaylist) {
		console.error('No target or selected playlist');
		return tracks;
	}
	
	const isCurrentlyPlaying = (currentTrack as unknown as SpotifyTrack)?.id === track.id;
	const currentIndex = tracks.findIndex(t => t.id === track.id);
	
	try {
		const trackWasAdded = await addTrackToPlaylist(track, targetPlaylist.id, services, handleAPIError);

		await removeTrackFromPlaylist(track, selectedPlaylist.id, services);

		const updatedTracks = tracks.filter(t => t.id !== track.id);
		stores.currentTracks.set(updatedTracks);

		try {
			const updatedTargetPlaylist = await handleAPIError(() => services.spotifyAPI.getPlaylist(targetPlaylist.id));
			if (updatedTargetPlaylist) {
				stores.targetPlaylist.set(updatedTargetPlaylist);
				console.log(`Updated target playlist "${targetPlaylist.name}" with latest data from API`);
			}
		} catch (error) {
			console.warn('Failed to refresh target playlist data:', error);
		}

		if (services.toastStore) {
			if (!trackWasAdded) {
				services.toastStore.add({
					message: `"${track.name}" was already in ${targetPlaylist.name}, removed from ${selectedPlaylist.name}`,
					type: 'info'
				});
			} else {
				services.toastStore.add({
					message: `Moved "${track.name}" from ${selectedPlaylist.name} to ${targetPlaylist.name}`,
					type: 'success'
				});
			}
		}

		if (isCurrentlyPlaying && updatedTracks.length > 0) {
			const startSearchIndex = Math.min(currentIndex, updatedTracks.length - 1);

			if (startSearchIndex >= 0 && isTrackPlayable(updatedTracks[startSearchIndex])) {
				const nextTrack = updatedTracks[startSearchIndex];
				console.log(`Auto-playing track that moved into moved position: ${nextTrack.name}`);
				await playTrack(nextTrack, updatedTracks, stores, services);
			} else {
				const nextPlayableIndex = findNextPlayableTrack(updatedTracks, startSearchIndex, 1);
				
				if (nextPlayableIndex !== -1) {
					const nextTrack = updatedTracks[nextPlayableIndex];
					console.log(`Auto-playing next playable track after move: ${nextTrack.name}`);
					await playTrack(nextTrack, updatedTracks, stores, services);
				} else {
					console.log('No playable tracks remaining after move');
					stores.currentTrack.set(null);
					stores.currentTrackIndex.set(-1);
					stores.isPlaying.set(false);
				}
			}
		}
		
		return updatedTracks;
	} catch (error) {
		console.error('Failed to move track:', error);

		if (services.toastStore) {
			services.toastStore.add({
				message: `Failed to move "${track.name}": ${error instanceof Error ? error.message : 'Unknown error'}`,
				type: 'error'
			});
		}
		
		return tracks;
	}
}

export async function copyTrack(
	track: SpotifyTrack,
	tracks: SpotifyTrack[],
	stores: PlaybackStores,
	services: PlaybackServices,
	handleAPIError: <T>(apiCall: () => Promise<T>) => Promise<T | null>
): Promise<SpotifyTrack[]> {
	let targetPlaylist: any = null;
	
	const targetPlaylistUnsub = stores.targetPlaylist.subscribe((value: any) => { targetPlaylist = value; });
	
	targetPlaylistUnsub();
	
	if (!targetPlaylist) {
		console.error('No target playlist');
		return tracks;
	}
	
	try {
		const trackWasAdded = await addTrackToPlaylist(track, targetPlaylist.id, services, handleAPIError);

		try {
			const updatedTargetPlaylist = await handleAPIError(() => services.spotifyAPI.getPlaylist(targetPlaylist.id));
			if (updatedTargetPlaylist) {
				stores.targetPlaylist.set(updatedTargetPlaylist);
				console.log(`Updated target playlist "${targetPlaylist.name}" with latest data from API`);
			}
		} catch (error) {
			console.warn('Failed to refresh target playlist data:', error);
		}

		if (services.toastStore) {
			if (!trackWasAdded) {
				services.toastStore.add({
					message: `"${track.name}" was already in ${targetPlaylist.name}`,
					type: 'info'
				});
			} else {
				services.toastStore.add({
					message: `Copied "${track.name}" to ${targetPlaylist.name}`,
					type: 'success'
				});
			}
		}

		return tracks;
	} catch (error) {
		console.error('Failed to copy track:', error);

		if (services.toastStore) {
			services.toastStore.add({
				message: `Failed to copy "${track.name}": ${error instanceof Error ? error.message : 'Unknown error'}`,
				type: 'error'
			});
		}
		
		return tracks;
	}
}