import { spotifyAPI } from './spotify';
import { userLibrary, isLibraryLoading } from './stores';
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
			isLibraryLoading.set(true);
			console.log('Loading user library...');
			const trackIds = await spotifyAPI.getUserSavedTracks();
			userLibrary.set(new Set(trackIds));
			console.log(`User library loaded with ${trackIds.length} tracks`);
		} catch (error) {
			console.error('Failed to load user library:', error);
			userLibrary.set(new Set());
		} finally {
			isLibraryLoading.set(false);
			this.loadingPromise = null;
		}
	}

	isTrackInLibrary(trackId: string, linkedFromId?: string): boolean {
		const library = get(userLibrary);
		return library.has(trackId) || (linkedFromId ? library.has(linkedFromId) : false);
	}

	async addTrackToLibrary(trackId: string): Promise<void> {
		userLibrary.update(lib => {
			const newLib = new Set(lib);
			newLib.add(trackId);
			return newLib;
		});

		try {
			await spotifyAPI.saveTracksForUser([trackId]);
			console.log(`Track ${trackId} added to library`);
		} catch (error) {
			console.error('Failed to add track to library:', error);
			userLibrary.update(lib => {
				const newLib = new Set(lib);
				newLib.delete(trackId);
				return newLib;
			});
			throw error;
		}
	}

	async removeTrackFromLibrary(trackId: string): Promise<void> {
		userLibrary.update(lib => {
			const newLib = new Set(lib);
			newLib.delete(trackId);
			return newLib;
		});

		try {
			await spotifyAPI.removeUserSavedTracks([trackId]);
			console.log(`Track ${trackId} removed from library`);
		} catch (error) {
			console.error('Failed to remove track from library:', error);
			userLibrary.update(lib => {
				const newLib = new Set(lib);
				newLib.add(trackId);
				return newLib;
			});
			throw error;
		}
	}

	async toggleTrackInLibrary(trackId: string, linkedFromId?: string): Promise<boolean> {
		const library = get(userLibrary);
		const isInLibrary = this.isTrackInLibrary(trackId, linkedFromId);
		
		if (isInLibrary) {
			const idToRemove = library.has(trackId) ? trackId : linkedFromId!;
			await this.removeTrackFromLibrary(idToRemove);
			return false;
		} else {
			const idToAdd = linkedFromId || trackId;
			await this.addTrackToLibrary(idToAdd);
			return true;
		}
	}

	clearLibrary(): void {
		userLibrary.set(new Set());
		isLibraryLoading.set(false);
	}
}

export const libraryService = new LibraryService();
