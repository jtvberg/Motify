import { spotifyAPI } from './spotify';
import { webPlaybackService } from './webPlayback';
import { tokenManager } from './tokenManager';
import { libraryService } from './libraryService';
import { targetPlaylistService } from './targetPlaylistService';
import { isAuthenticated, user, playlists, selectedPlaylist, targetPlaylist, playlistSelections } from './stores';
import type { SpotifyPlaylist } from './spotify';

class InitializationService {
    private isInitialized = false;
    private isInitializing = false;
    private initializationPromise: Promise<boolean> | null = null;

    async initialize(): Promise<boolean> {
        if (this.isInitialized) {
            console.log('App already initialized');
            return true;
        }

        if (this.isInitializing && this.initializationPromise) {
            console.log('App initialization already in progress, waiting...');
            return this.initializationPromise;
        }

        this.isInitializing = true;
        this.initializationPromise = this.performInitialization();
        
        try {
            const result = await this.initializationPromise;
            this.isInitialized = result;
            return result;
        } finally {
            this.isInitializing = false;
        }
    }

    private async performInitialization(): Promise<boolean> {
        console.log('Starting app initialization...');

        try {
            tokenManager.initialize();

            const token = await spotifyAPI.ensureValidToken();
            if (!token) {
                console.log('No valid token available, user needs to authenticate');
                isAuthenticated.set(false);
                return false;
            }

            console.log('User is authenticated with valid token');
            isAuthenticated.set(true);

            try {
                console.log('Loading user data and playlists...');
                await this.loadUserDataAndPlaylists();
                console.log('User data and playlists loaded successfully');
            } catch (error) {
                console.error('Failed to load user data:', error);
            }

            try {
                console.log('Initializing Web Playback SDK...');
                await webPlaybackService.initialize();
                console.log('Web Playback SDK ready');
                return true;
            } catch (error) {
                console.error('Failed to initialize Web Playback SDK:', error);
                return true;
            }

        } catch (error) {
            console.error('Error during app initialization:', error);
            isAuthenticated.set(false);
            return false;
        }
    }

    private async loadUserDataAndPlaylists(): Promise<void> {
        try {
            const userInfo = await spotifyAPI.getCurrentUser();
            user.set(userInfo);

            const playlistsData = await spotifyAPI.getUserPlaylists();
            playlists.set(playlistsData);

            await this.restorePlaylistSelections(playlistsData);

            libraryService.loadUserLibrary().catch(error => {
                console.error('Failed to load user library in background:', error);
            });
        } catch (error) {
            console.error('Error loading user data and playlists:', error);
            throw error;
        }
    }

    private async restorePlaylistSelections(playlistsData: SpotifyPlaylist[]): Promise<void> {
        try {
            let selections: any;
            playlistSelections.subscribe(value => { selections = value; })();

            if (selections.source) {
                const sourcePlaylist = playlistsData.find(p => 
                    selections.source.includes(p.id) || 
                    `https://open.spotify.com/playlist/${p.id}` === selections.source ||
                    selections.source.includes(`playlist/${p.id}`)
                );
                if (sourcePlaylist) {
                    console.log('Restored source playlist:', sourcePlaylist.name);
                    selectedPlaylist.set(sourcePlaylist);
                }
            }

            if (selections.target) {
                const targetPlaylistData = playlistsData.find(p => 
                    selections.target.includes(p.id) || 
                    `https://open.spotify.com/playlist/${p.id}` === selections.target ||
                    selections.target.includes(`playlist/${p.id}`)
                );
                if (targetPlaylistData) {
                    console.log('Restored target playlist:', targetPlaylistData.name);
                    targetPlaylist.set(targetPlaylistData);
                    targetPlaylistService.loadTargetPlaylistTracks(targetPlaylistData.id).catch(error => {
                        console.error('Failed to load target playlist tracks in background:', error);
                    });
                }
            }
        } catch (error) {
            console.error('Error restoring playlist selections:', error);
        }
    }

    async handleAuthentication(accessToken: string): Promise<void> {
        console.log('Handling authentication with new token');
        
        spotifyAPI.setAccessToken(accessToken);
        isAuthenticated.set(true);

        try {
            console.log('Loading user data and playlists after authentication...');
            await this.loadUserDataAndPlaylists();
            console.log('User data and playlists loaded after authentication');
        } catch (error) {
            console.error('Failed to load user data after authentication:', error);
        }

        if (!this.isWebPlaybackReady()) {
            try {
                console.log('Initializing Web Playback SDK after authentication');
                await webPlaybackService.initialize();
                console.log('Web Playback SDK initialized after authentication');
            } catch (error) {
                console.error('Failed to initialize Web Playback SDK after authentication:', error);
            }
        }

        this.isInitialized = true;
    }

    isWebPlaybackReady(): boolean {
        return !!webPlaybackService.getDeviceId();
    }

    isAppInitialized(): boolean {
        return this.isInitialized;
    }

    reset(): void {
        this.isInitialized = false;
        this.isInitializing = false;
        this.initializationPromise = null;
        
        isAuthenticated.set(false);
        user.set(null);
        playlists.set([]);
        selectedPlaylist.set(null);
        targetPlaylist.set(null);
        libraryService.clearLibrary();
        targetPlaylistService.clearTargetPlaylist();
        
        console.log('Initialization service reset');
    }

    destroy(): void {
        this.reset();
        tokenManager.destroy();
        webPlaybackService.disconnect();
    }
}

export const initializationService = new InitializationService();