import { env } from '$env/dynamic/public';
import { browser } from '$app/environment';

const CLIENT_ID = env.PUBLIC_SPOTIFY_CLIENT_ID || '';
const getRedirectUri = (): string => {
	if (browser) {
		return `${window.location.origin}/callback`;
	}
	return env.PUBLIC_SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:8181/callback';
};
const SCOPES = [
	'streaming',
	'user-read-email',
	'user-read-private',
	'user-read-playback-state',
	'user-library-read',
	'user-library-modify',
	'user-modify-playback-state',
	'playlist-read-private',
	'playlist-read-collaborative',
	'playlist-modify-public',
	'playlist-modify-private'
];

export interface SpotifyTrack {
	id: string;
	name: string;
	artists: { name: string }[];
	album: { name: string; images: { url: string }[] };
	duration_ms: number;
	uri: string;
	preview_url?: string;
	is_playable?: boolean;
	restrictions?: {
		reason: string;
	};
	linked_from?: {
		id: string;
		uri: string;
		external_urls: {
			spotify: string;
		};
	};
}

export function getOperationalUri(track: SpotifyTrack): string {
	return track.linked_from?.uri || track.uri;
}

export function isTrackRelinked(track: SpotifyTrack): boolean {
	return !!track.linked_from;
}

export interface SpotifyPlaylist {
	id: string;
	name: string;
	description: string;
	tracks: {
		total: number;
		items: { track: SpotifyTrack }[];
	};
	images: { url: string }[];
	snapshot_id: string;
}

export interface SpotifyUser {
	id: string;
	display_name: string;
	images: { url: string }[];
}

class SpotifyAPI {
	private accessToken: string | null = null;
	private codeVerifier: string | null = null;

	constructor() {
		if (typeof window !== 'undefined') {
			this.accessToken = localStorage.getItem('spotify_access_token');
		}
	}

	private generateCodeVerifier(): string {
		const array = new Uint8Array(32);
		crypto.getRandomValues(array);
		return btoa(String.fromCharCode.apply(null, Array.from(array)))
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');
	}

	private async generateCodeChallenge(verifier: string): Promise<string> {
		const encoder = new TextEncoder();
		const data = encoder.encode(verifier);
		const digest = await crypto.subtle.digest('SHA-256', data);
		return btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(digest))))
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');
	}

	async getAuthUrl(): Promise<string> {
		this.codeVerifier = this.generateCodeVerifier();
		const codeChallenge = await this.generateCodeChallenge(this.codeVerifier);

		if (typeof window !== 'undefined') {
			localStorage.setItem('spotify_code_verifier', this.codeVerifier);
		}

		const params = new URLSearchParams({
			client_id: CLIENT_ID,
			response_type: 'code',
			redirect_uri: getRedirectUri(),
			scope: SCOPES.join(' '),
			code_challenge_method: 'S256',
			code_challenge: codeChallenge,
			show_dialog: 'true'
		});

		return `https://accounts.spotify.com/authorize?${params.toString()}`;
	}

	async exchangeCodeForToken(code: string): Promise<string> {
		const storedVerifier = localStorage.getItem('spotify_code_verifier');
		if (!storedVerifier) {
			throw new Error('Code verifier not found');
		}

		const response = await fetch('https://accounts.spotify.com/api/token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code: code,
				redirect_uri: getRedirectUri(),
				client_id: CLIENT_ID,
				code_verifier: storedVerifier
			})
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Token exchange failed: ${error}`);
		}

		const data = await response.json();

		this.setAccessToken(data.access_token);
		if (data.refresh_token) {
			localStorage.setItem('spotify_refresh_token', data.refresh_token);
		}

		const expiresAt = Date.now() + (data.expires_in * 1000);
		localStorage.setItem('spotify_token_expires_at', expiresAt.toString());
		
		localStorage.removeItem('spotify_code_verifier');
		return data.access_token;
	}

	setAccessToken(token: string): void {
		this.accessToken = token;
		if (typeof window !== 'undefined') {
			localStorage.setItem('spotify_access_token', token);
		}
	}

	getAccessToken(): string | null {
		return this.accessToken;
	}

	isTokenExpired(): boolean {
		const expiresAt = localStorage.getItem('spotify_token_expires_at');
		if (!expiresAt) return true;
		
		return Date.now() >= parseInt(expiresAt);
	}

	async refreshAccessToken(): Promise<string> {
		const refreshToken = localStorage.getItem('spotify_refresh_token');
		if (!refreshToken) {
			throw new Error('No refresh token available');
		}

		const response = await fetch('https://accounts.spotify.com/api/token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				refresh_token: refreshToken,
				client_id: CLIENT_ID
			})
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Token refresh failed: ${error}`);
		}

		const data = await response.json();

		this.setAccessToken(data.access_token);

		if (data.refresh_token) {
			localStorage.setItem('spotify_refresh_token', data.refresh_token);
		}

		const expiresAt = Date.now() + (data.expires_in * 1000);
		localStorage.setItem('spotify_token_expires_at', expiresAt.toString());
		
		return data.access_token;
	}

	async ensureValidToken(): Promise<string | null> {
		let token = this.getAccessToken();

		if (!token && typeof window !== 'undefined') {
			token = localStorage.getItem('spotify_access_token');
			if (token) {
				this.accessToken = token;
			}
		}

		if (token && this.isTokenExpired()) {
			try {
				console.log('Token expired, refreshing...');
				token = await this.refreshAccessToken();
				console.log('Token refreshed successfully');
			} catch (error) {
				console.error('Failed to refresh token:', error);
				this.logout();
				return null;
			}
		}
		
		return token;
	}

	logout(): void {
		this.accessToken = null;
		if (typeof window !== 'undefined') {
			localStorage.removeItem('spotify_access_token');
			localStorage.removeItem('spotify_refresh_token');
			localStorage.removeItem('spotify_token_expires_at');
			localStorage.removeItem('spotify_code_verifier');
		}
	}

	private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
		const token = await this.ensureValidToken();
		if (!token) {
			throw new Error('No access token available');
		}

		const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
			...options,
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
				...options.headers
			}
		});

		if (!response.ok) {
			if (response.status === 401) {
				try {
					const refreshedToken = await this.refreshAccessToken();
					const retryResponse = await fetch(`https://api.spotify.com/v1${endpoint}`, {
						...options,
						headers: {
							Authorization: `Bearer ${refreshedToken}`,
							'Content-Type': 'application/json',
							...options.headers
						}
					});
					
					if (retryResponse.ok) {
						const text = await retryResponse.text();
						return text ? JSON.parse(text) : {};
					}
				} catch (refreshError) {
					console.error('Token refresh failed:', refreshError);
				}

				this.logout();
				throw new Error('Authentication failed');
			}
			throw new Error(`Spotify API error: ${response.status}`);
		}

		const text = await response.text();
		return text ? JSON.parse(text) : {};
	}

	async getCurrentUser(): Promise<SpotifyUser> {
		return this.makeRequest('/me');
	}

	async getUserPlaylists(): Promise<SpotifyPlaylist[]> {
		let allPlaylists: SpotifyPlaylist[] = [];
		let url: string | null = '/me/playlists?limit=50';
		let pageCount = 0;
		
		console.log('Fetching user playlists...');
		
		try {
			while (url) {
				pageCount++;
				
				const response = await this.makeRequest(url);
				
				if (!response || !response.items) {
					console.error('Invalid playlists response format:', response);
					throw new Error('Invalid response format from Spotify API');
				}
				
				allPlaylists = allPlaylists.concat(response.items);

				if (response.next) {
					try {
						const nextUrl = new URL(response.next);
						let path = nextUrl.pathname;
						url = path + nextUrl.search;
					} catch (urlError) {
						console.error('Failed to parse next playlist URL:', response.next, urlError);
						break;
					}
				} else {
					url = null;
				}
				
				if (pageCount > 20) {
					console.warn('Too many playlist pages, stopping pagination');
					break;
				}
			}
		} catch (error) {
			console.error('Error during playlists pagination:', error);
			throw error;
		}
		
		console.log(`Finished fetching all ${allPlaylists.length} playlists`);
		return allPlaylists;
	}

	async getPlaylist(playlistId: string): Promise<SpotifyPlaylist> {
		console.log(`Fetching playlist details for ${playlistId}...`);
		return this.makeRequest(`/playlists/${playlistId}`);
	}

	async getPlaylistTracks(playlistId: string): Promise<SpotifyTrack[]> {
		let allTracks: SpotifyTrack[] = [];
		let url: string | null = `/playlists/${playlistId}/tracks?limit=100&fields=items(track(id,name,artists(name),album(name,images),duration_ms,uri,preview_url,is_playable,restrictions,available_markets,linked_from(id,uri,external_urls))),next&market=from_token`;
		let pageCount = 0;
		
		console.log(`Fetching tracks for playlist ${playlistId}...`);
		
		try {
			while (url) {
				pageCount++;
				
				const response = await this.makeRequest(url);
				
				if (!response || !response.items) {
					console.error('Invalid response format:', response);
					throw new Error('Invalid response format from Spotify API');
				}
				
				const tracks = response.items
					.map((item: any) => item.track)
					.filter((track: any) => track !== null && track !== undefined);
				
				allTracks = allTracks.concat(tracks);

				if (response.next) {
					try {
						const nextUrl = new URL(response.next);
						let path = nextUrl.pathname;
						if (path.startsWith('/v1')) {
							path = path.substring(3);
						}
						url = path + nextUrl.search;
					} catch (urlError) {
						console.error('Failed to parse next URL:', response.next, urlError);
						break;
					}
				} else {
					url = null;
				}

				if (pageCount > 50) {
					console.warn('Too many pages, stopping pagination');
					break;
				}
			}
		} catch (error) {
			console.error('Error during playlist tracks pagination:', error);
			throw error;
		}
		
		console.log(`Finished fetching all ${allTracks.length} tracks for playlist ${playlistId}`);
		return allTracks;
	}

	async addTrackToPlaylist(playlistId: string, trackUri: string): Promise<void> {
		await this.makeRequest(`/playlists/${playlistId}/tracks`, {
			method: 'POST',
			body: JSON.stringify({
				uris: [trackUri]
			})
		});
	}

	async addTracksToPlaylist(playlistId: string, trackUris: string[]): Promise<void> {
		const batchSize = 100;
		for (let i = 0; i < trackUris.length; i += batchSize) {
			const batch = trackUris.slice(i, i + batchSize);
			await this.makeRequest(`/playlists/${playlistId}/tracks`, {
				method: 'POST',
				body: JSON.stringify({
					uris: batch
				})
			});
		}
	}

	async removeTrackFromPlaylist(playlistId: string, trackUri: string): Promise<void> {
		await this.makeRequest(`/playlists/${playlistId}/tracks`, {
			method: 'DELETE',
			body: JSON.stringify({
				tracks: [{ uri: trackUri }]
			})
		});
	}

	async playTrack(trackUri: string, deviceId?: string): Promise<void> {
		console.log('SpotifyAPI.playTrack called with:', { trackUri, deviceId });
		
		const body = {
			uris: [trackUri]
		};

		let url = '/me/player/play';
		if (deviceId) {
			url += `?device_id=${deviceId}`;
		}

		console.log('Sending play request to:', url);
		console.log('Request body:', body);

		try {
			await this.makeRequest(url, {
				method: 'PUT',
				body: JSON.stringify(body)
			});
			console.log('Play request successful');
		} catch (error: any) {
			console.error('Play request failed:', error);

			if (error.status === 403 && error.message?.includes('Premium')) {
				throw new Error('Spotify Premium is required for playback. Please upgrade your account to use this feature.');
			}

			if (error.status === 404 && deviceId) {
				console.warn('Device not found, attempting to activate device first');
				try {
					await this.transferPlayback(deviceId);
					await new Promise(resolve => setTimeout(resolve, 500));
					await this.makeRequest(url, {
						method: 'PUT',
						body: JSON.stringify(body)
					});
					console.log('Play request successful after device activation');
					return;
				} catch (retryError) {
					console.error('Retry after device activation failed:', retryError);
				}
			}
			
			throw error;
		}
	}

	async transferPlayback(deviceId: string): Promise<void> {
		console.log('Transferring playback to device:', deviceId);
		await this.makeRequest('/me/player', {
			method: 'PUT',
			body: JSON.stringify({
				device_ids: [deviceId],
				play: false
			})
		});
	}

	async getAvailableDevices(): Promise<any> {
		return this.makeRequest('/me/player/devices');
	}

	async pausePlayback(): Promise<void> {
		await this.makeRequest('/me/player/pause', {
			method: 'PUT'
		});
	}

	async resumePlayback(): Promise<void> {
		await this.makeRequest('/me/player/play', {
			method: 'PUT'
		});
	}

	async getPlaybackState(): Promise<any> {
		return this.makeRequest('/me/player');
	}

	async seekToPosition(positionMs: number): Promise<void> {
		await this.makeRequest(`/me/player/seek?position_ms=${positionMs}`, {
			method: 'PUT'
		});
	}

	async nextTrack(): Promise<void> {
		await this.makeRequest('/me/player/next', {
			method: 'POST'
		});
	}

	async previousTrack(): Promise<void> {
		await this.makeRequest('/me/player/previous', {
			method: 'POST'
		});
	}
}

export const spotifyAPI = new SpotifyAPI();
