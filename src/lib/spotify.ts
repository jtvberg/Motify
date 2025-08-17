// Spotify Web API utilities
import { env } from '$env/dynamic/public';

const CLIENT_ID = env.PUBLIC_SPOTIFY_CLIENT_ID || '';
const REDIRECT_URI = env.PUBLIC_SPOTIFY_REDIRECT_URI || '';
const SCOPES = [
	'streaming',
	'user-read-email',
	'user-read-private',
	'user-read-playback-state',
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
		// Try to get token from localStorage if available
		if (typeof window !== 'undefined') {
			this.accessToken = localStorage.getItem('spotify_access_token');
		}
	}

	// Generate code verifier for PKCE
	private generateCodeVerifier(): string {
		const array = new Uint8Array(32);
		crypto.getRandomValues(array);
		return btoa(String.fromCharCode.apply(null, Array.from(array)))
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');
	}

	// Generate code challenge from verifier
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
		
		// Store code verifier for later use
		if (typeof window !== 'undefined') {
			localStorage.setItem('spotify_code_verifier', this.codeVerifier);
		}

		const params = new URLSearchParams({
			client_id: CLIENT_ID,
			response_type: 'code',
			redirect_uri: REDIRECT_URI,
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
				redirect_uri: REDIRECT_URI,
				client_id: CLIENT_ID,
				code_verifier: storedVerifier
			})
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Token exchange failed: ${error}`);
		}

		const data = await response.json();
		localStorage.removeItem('spotify_code_verifier'); // Clean up
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

	logout(): void {
		this.accessToken = null;
		if (typeof window !== 'undefined') {
			localStorage.removeItem('spotify_access_token');
		}
	}

	private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
		if (!this.accessToken) {
			throw new Error('No access token available');
		}

		const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
			...options,
			headers: {
				Authorization: `Bearer ${this.accessToken}`,
				'Content-Type': 'application/json',
				...options.headers
			}
		});

		if (!response.ok) {
			if (response.status === 401) {
				this.logout();
				throw new Error('Token expired');
			}
			throw new Error(`Spotify API error: ${response.status}`);
		}

		return response.json();
	}

	async getCurrentUser(): Promise<SpotifyUser> {
		return this.makeRequest('/me');
	}

	async getUserPlaylists(): Promise<SpotifyPlaylist[]> {
		const response = await this.makeRequest('/me/playlists?limit=50');
		return response.items;
	}

	async getPlaylistTracks(playlistId: string): Promise<SpotifyTrack[]> {
		const response = await this.makeRequest(`/playlists/${playlistId}/tracks`);
		return response.items.map((item: any) => item.track);
	}

	async addTrackToPlaylist(playlistId: string, trackUri: string): Promise<void> {
		await this.makeRequest(`/playlists/${playlistId}/tracks`, {
			method: 'POST',
			body: JSON.stringify({
				uris: [trackUri]
			})
		});
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
		const body: any = {
			uris: [trackUri]
		};

		if (deviceId) {
			body.device_id = deviceId;
		}

		await this.makeRequest('/me/player/play', {
			method: 'PUT',
			body: JSON.stringify(body)
		});
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
