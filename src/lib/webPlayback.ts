import { spotifyAPI } from './spotify';
import { isPlaying, currentTrack, playbackPosition, trackDuration } from './stores';

// Extend Window interface to include Spotify
declare global {
	interface Window {
		onSpotifyWebPlaybackSDKReady: () => void;
		Spotify: {
			Player: new (options: {
				name: string;
				getOAuthToken: (cb: (token: string) => void) => void;
				volume?: number;
			}) => SpotifyPlayer;
		};
	}
}

interface SpotifyPlayer {
	addListener(event: string, callback: (...args: any[]) => void): void;
	removeListener(event: string, callback?: (...args: any[]) => void): void;
	connect(): Promise<boolean>;
	disconnect(): void;
	getCurrentState(): Promise<SpotifyPlaybackState | null>;
	getVolume(): Promise<number>;
	setVolume(volume: number): Promise<void>;
	pause(): Promise<void>;
	resume(): Promise<void>;
	togglePlay(): Promise<void>;
	seek(position_ms: number): Promise<void>;
	previousTrack(): Promise<void>;
	nextTrack(): Promise<void>;
	setName(name: string): Promise<void>;
}

interface SpotifyPlaybackState {
	context: any;
	disallows: any;
	duration: number;
	paused: boolean;
	position: number;
	repeat_mode: number;
	shuffle: boolean;
	track_window: {
		current_track: any;
		previous_tracks: any[];
		next_tracks: any[];
	};
}

class WebPlaybackService {
	private player: SpotifyPlayer | null = null;
	private deviceId: string | null = null;
	private isInitialized = false;

	async initialize(): Promise<void> {
		if (this.isInitialized) return;

		return new Promise((resolve) => {
			if (window.Spotify) {
				this.setupPlayer();
				resolve();
			} else {
				window.onSpotifyWebPlaybackSDKReady = () => {
					this.setupPlayer();
					resolve();
				};
			}
		});
	}

	private setupPlayer(): void {
		const token = spotifyAPI.getAccessToken();
		if (!token) {
			console.error('No access token available for Web Playback SDK');
			return;
		}

		this.player = new window.Spotify.Player({
			name: 'Motify Web Player',
			getOAuthToken: (cb) => {
				const currentToken = spotifyAPI.getAccessToken();
				if (currentToken) {
					cb(currentToken);
				}
			},
			volume: 0.8
		});

		// Error handling
		this.player.addListener('initialization_error', ({ message }) => {
			console.error('Spotify Player initialization error:', message);
		});

		this.player.addListener('authentication_error', ({ message }) => {
			console.error('Spotify Player authentication error:', message);
		});

		this.player.addListener('account_error', ({ message }) => {
			console.error('Spotify Player account error:', message);
		});

		this.player.addListener('playback_error', ({ message }) => {
			console.error('Spotify Player playback error:', message);
		});

		// Playback status updates
		this.player.addListener('player_state_changed', (state) => {
			if (!state) return;

			console.log('Player state changed:', state);
			
			currentTrack.set(state.track_window.current_track);
			isPlaying.set(!state.paused);
			playbackPosition.set(state.position / 1000);
			trackDuration.set(state.duration / 1000);
		});

		// Ready
		this.player.addListener('ready', ({ device_id }) => {
			console.log('Spotify Web Player ready with Device ID:', device_id);
			this.deviceId = device_id;
			this.isInitialized = true;
		});

		// Not Ready
		this.player.addListener('not_ready', ({ device_id }) => {
			console.log('Spotify Web Player has gone offline:', device_id);
		});

		// Connect to the player
		this.player.connect().then((success) => {
			if (success) {
				console.log('Successfully connected to Spotify Web Player');
			} else {
				console.error('Failed to connect to Spotify Web Player');
			}
		});
	}

	getDeviceId(): string | null {
		return this.deviceId;
	}

	async play(uri?: string): Promise<void> {
		if (!this.player || !this.deviceId) {
			throw new Error('Player not ready');
		}

		if (uri) {
			// Play specific track
			await spotifyAPI.playTrack(uri, this.deviceId);
		} else {
			// Resume current playback
			await this.player.resume();
		}
	}

	async pause(): Promise<void> {
		if (!this.player) {
			throw new Error('Player not ready');
		}
		await this.player.pause();
	}

	async togglePlay(): Promise<void> {
		if (!this.player) {
			throw new Error('Player not ready');
		}
		await this.player.togglePlay();
	}

	async seek(positionMs: number): Promise<void> {
		if (!this.player) {
			throw new Error('Player not ready');
		}
		await this.player.seek(positionMs);
	}

	async previousTrack(): Promise<void> {
		if (!this.player) {
			throw new Error('Player not ready');
		}
		await this.player.previousTrack();
	}

	async nextTrack(): Promise<void> {
		if (!this.player) {
			throw new Error('Player not ready');
		}
		await this.player.nextTrack();
	}

	async getCurrentState(): Promise<SpotifyPlaybackState | null> {
		if (!this.player) {
			return null;
		}
		return await this.player.getCurrentState();
	}

	disconnect(): void {
		if (this.player) {
			this.player.disconnect();
			this.player = null;
			this.deviceId = null;
			this.isInitialized = false;
		}
	}
}

export const webPlaybackService = new WebPlaybackService();
