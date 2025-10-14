import { spotifyAPI } from './spotify';
import { targetPlaylistTracks, isTargetPlaylistLoading, targetPlaylist } from './stores';
import { get } from 'svelte/store';

class TargetPlaylistService {
	private loadingPromise: Promise<void> | null = null;
	private currentPlaylistId: string | null = null;

	async loadTargetPlaylistTracks(playlistId: string): Promise<void> {
		if (this.loadingPromise && this.currentPlaylistId === playlistId) {
			return this.loadingPromise;
		}

		this.currentPlaylistId = playlistId;
		this.loadingPromise = this.performLoad(playlistId);
		return this.loadingPromise;
	}

	private async performLoad(playlistId: string): Promise<void> {
		try {
			isTargetPlaylistLoading.set(true);
			console.log(`Loading target playlist tracks for playlist: ${playlistId}...`);
			const tracks = await spotifyAPI.getPlaylistTracks(playlistId);
			const trackIds = tracks.map(track => track.id);
			targetPlaylistTracks.set(new Set(trackIds));
			console.log(`Target playlist loaded with ${trackIds.length} tracks`);
		} catch (error) {
			console.error('Failed to load target playlist tracks:', error);
			targetPlaylistTracks.set(new Set());
		} finally {
			isTargetPlaylistLoading.set(false);
			this.loadingPromise = null;
		}
	}

	isTrackInTargetPlaylist(trackId: string): boolean {
		const tracks = get(targetPlaylistTracks);
		return tracks.has(trackId);
	}

	addTrackToCache(trackId: string): void {
		targetPlaylistTracks.update(tracks => {
			const newTracks = new Set(tracks);
			newTracks.add(trackId);
			return newTracks;
		});
	}

	removeTrackFromCache(trackId: string): void {
		targetPlaylistTracks.update(tracks => {
			const newTracks = new Set(tracks);
			newTracks.delete(trackId);
			return newTracks;
		});
	}

	clearTargetPlaylist(): void {
		targetPlaylistTracks.set(new Set());
		isTargetPlaylistLoading.set(false);
		this.currentPlaylistId = null;
		this.loadingPromise = null;
	}

	getCurrentPlaylistId(): string | null {
		return this.currentPlaylistId;
	}
}

export const targetPlaylistService = new TargetPlaylistService();
