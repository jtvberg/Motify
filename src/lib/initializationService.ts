import { spotifyAPI } from './spotify';
import { webPlaybackService } from './webPlayback';
import { tokenManager } from './tokenManager';
import { isAuthenticated } from './stores';

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

    async handleAuthentication(accessToken: string): Promise<void> {
        console.log('Handling authentication with new token');
        
        spotifyAPI.setAccessToken(accessToken);
        isAuthenticated.set(true);

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
        console.log('Initialization service reset');
    }

    destroy(): void {
        this.reset();
        tokenManager.destroy();
        webPlaybackService.disconnect();
    }
}

export const initializationService = new InitializationService();