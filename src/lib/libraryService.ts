import { spotifyAPI } from './spotify';
import { userLibrary } from './stores';
import { get } from 'svelte/store';

class LibraryService {
	private loadingPromise: Promise<void> | null = null;

	async loadUserLibrary(): Promise<void> {
		if (this.loadingPromise) {
			return this.loadingPromise;
		}

		this.loadingPromise = this.performLoad();
		return this.loadingPromise;
	}

	private async performLoad(): Promise<void> {
		try {
			console.log('Loading user library...');
			const trackIds = await spotifyAPI.getUserSavedTracks();
			userLibrary.set(new Set(trackIds));
			console.log(`User library loaded with ${trackIds.length} tracks`);
		} catch (error) {
			console.error('Failed to load user library:', error);
			userLibrary.set(new Set());
		} finally {
			this.loadingPromise = null;
		}
	}

	isTrackInLibrary(trackId: string): boolean {
		const library = get(userLibrary);
		return library.has(trackId);
	}

	async addTrackToLibrary(trackId: string): Promise<void> {
		try {
			await spotifyAPI.saveTracksForUser([trackId]);
			userLibrary.update(lib => {
				const newLib = new Set(lib);
				newLib.add(trackId);
				return newLib;
			});
			console.log(`Track ${trackId} added to library`);
		} catch (error) {
			console.error('Failed to add track to library:', error);
			throw error;
		}
	}

	async removeTrackFromLibrary(trackId: string): Promise<void> {
		try {
			await spotifyAPI.removeUserSavedTracks([trackId]);
			userLibrary.update(lib => {
				const newLib = new Set(lib);
				newLib.delete(trackId);
				return newLib;
			});
			console.log(`Track ${trackId} removed from library`);
		} catch (error) {
			console.error('Failed to remove track from library:', error);
			throw error;
		}
	}

	async toggleTrackInLibrary(trackId: string): Promise<boolean> {
		const isInLibrary = this.isTrackInLibrary(trackId);
		
		if (isInLibrary) {
			await this.removeTrackFromLibrary(trackId);
			return false;
		} else {
			await this.addTrackToLibrary(trackId);
			return true;
		}
	}

	clearLibrary(): void {
		userLibrary.set(new Set());
	}
}

export const libraryService = new LibraryService();
