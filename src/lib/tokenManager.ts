import { spotifyAPI } from './spotify';
import { webPlaybackService } from './webPlayback';

class TokenManager {
	private checkInterval: number | null = null;
	private isVisible = true;

	initialize(): void {
		// Listen for visibility changes
		document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
		
		// Check token validity periodically when tab is visible
		this.startTokenCheck();
	}

	private handleVisibilityChange(): void {
		this.isVisible = !document.hidden;
		
		if (this.isVisible) {
			console.log('Tab became visible, checking token validity...');
			this.checkTokenAndReconnect();
			this.startTokenCheck();
		} else {
			console.log('Tab hidden, stopping token checks');
			this.stopTokenCheck();
		}
	}

	private startTokenCheck(): void {
		this.stopTokenCheck(); // Ensure no duplicate intervals
		
		// Check token every 5 minutes when tab is visible
		this.checkInterval = window.setInterval(() => {
			if (this.isVisible) {
				this.checkTokenAndReconnect();
			}
		}, 5 * 60 * 1000); // 5 minutes
	}

	private stopTokenCheck(): void {
		if (this.checkInterval) {
			clearInterval(this.checkInterval);
			this.checkInterval = null;
		}
	}

	private async checkTokenAndReconnect(): Promise<void> {
		try {
			const token = await spotifyAPI.ensureValidToken();
			if (!token) {
				console.warn('No valid token available - user may need to re-login');
				webPlaybackService.handleAuthenticationFailure();
				return;
			}

			// If we have a valid token but the player is disconnected, try to reconnect
			const deviceId = webPlaybackService.getDeviceId();
			if (!deviceId) {
				console.log('Player disconnected but token is valid, attempting reconnect...');
				try {
					await webPlaybackService.reconnect();
				} catch (error) {
					console.error('Failed to reconnect player:', error);
				}
			}
		} catch (error) {
			console.error('Token check failed:', error);
		}
	}

	// Manual check for when user performs an action
	async checkAndRefreshToken(): Promise<boolean> {
		try {
			const token = await spotifyAPI.ensureValidToken();
			return !!token;
		} catch (error) {
			console.error('Manual token check failed:', error);
			return false;
		}
	}

	destroy(): void {
		this.stopTokenCheck();
		document.removeEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
	}
}

export const tokenManager = new TokenManager();
