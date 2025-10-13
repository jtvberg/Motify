import { spotifyAPI } from './spotify';
import { isPlaying, currentTrack, playbackPosition, trackDuration } from './stores';
import { get } from 'svelte/store';

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

    constructor() {
    }

    private getDeviceName(): string {
        return 'Motify';
    }

    async initialize(): Promise<void> {
		if (this.isInitialized) return;

		return new Promise((resolve, reject) => {
			if (window.Spotify) {
				try {
					this.setupPlayer();
					resolve();
				} catch (error) {
					reject(error);
				}
			} else {
				const checkSDK = () => {
					if (window.Spotify) {
						try {
							this.setupPlayer();
							resolve();
						} catch (error) {
							reject(error);
						}
					} else {
						setTimeout(checkSDK, 100);
					}
				};
				
				setTimeout(checkSDK, 100);

				const timeoutMs = /Mobile|Android|iPhone|iPad/.test(navigator.userAgent) ? 15000 : 10000;
				setTimeout(() => {
					if (!this.isInitialized) {
						reject(new Error('Spotify Web Playback SDK failed to load'));
					}
				}, timeoutMs);
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
			name: this.getDeviceName(),
			getOAuthToken: (cb) => {
				spotifyAPI.ensureValidToken().then(token => {
					if (token) {
						cb(token);
					} else {
						console.warn('No valid token available for Web Playback SDK');
						const fallbackToken = spotifyAPI.getAccessToken();
						if (fallbackToken) {
							cb(fallbackToken);
						}
					}
				}).catch(error => {
					console.error('Error getting token for Web Playback SDK:', error);
					const fallbackToken = spotifyAPI.getAccessToken();
					if (fallbackToken) {
						cb(fallbackToken);
					}
				});
			},
			volume: 0.8
		});

		this.player.addListener('initialization_error', ({ message }) => {
			console.error('Spotify Player initialization error:', message);
		});

		this.player.addListener('authentication_error', ({ message }) => {
			console.error('Spotify Player authentication error:', message);
			this.handleAuthenticationFailure();

			spotifyAPI.ensureValidToken().then(token => {
				if (!token) {
					console.warn('Authentication failed and no valid token available - user may need to re-login');
				}
			}).catch(error => {
				console.error('Failed to refresh token after authentication error:', error);
			});
		});

		this.player.addListener('account_error', ({ message }) => {
			console.error('Spotify Player account error:', message);
		});

		this.player.addListener('playback_error', ({ message }) => {
			console.error('Spotify Player playback error:', message);
		});

		this.player.addListener('player_state_changed', (state) => {
			if (!state) return;

			const newTrack = state.track_window.current_track;
			const newPlaying = !state.paused;
			const newPosition = state.position / 1000;
			const newDuration = state.duration / 1000;

			if (newTrack) {
				const currentStoreTrack = get(currentTrack);

				if (!currentStoreTrack || currentStoreTrack.uri !== newTrack.uri) {
					console.log('Updating current track from player state:', newTrack.name);
					currentTrack.set(newTrack);
				}
			}
			
			isPlaying.set(newPlaying);
			trackDuration.set(newDuration);
			playbackPosition.set(newPosition);
		});

		this.player.addListener('ready', async ({ device_id }) => {
			console.log('Spotify Web Player ready with Device ID:', device_id);
			this.deviceId = device_id;
		});

		this.player.addListener('not_ready', ({ device_id }) => {
			console.log('Spotify Web Player has gone offline:', device_id);
		});

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

	async activateDevice(): Promise<void> {
		if (!this.deviceId) return;
		
		try {
			console.log('Activating Web Player device:', this.deviceId);

			const devicesResponse = await spotifyAPI.getAvailableDevices();
			console.log('Available devices:', devicesResponse.devices);

			const mobileDevices = devicesResponse.devices?.filter((d: any) => 
				d.type === 'Smartphone' && d.is_active
			);
			
			if (mobileDevices?.length > 0) {
				console.warn('Active mobile devices detected:', mobileDevices);
			}
			
			const ourDevice = devicesResponse.devices?.find((d: any) => d.id === this.deviceId);
			
			if (!ourDevice) {
				console.warn('Our device not found in available devices list');
			} else if (ourDevice.is_active) {
				console.log('Device is already active');
				return;
			}
			
			await spotifyAPI.transferPlayback(this.deviceId);
			console.log('Device activation request sent');

			await new Promise(resolve => setTimeout(resolve, 800));
			
			const updatedDevicesResponse = await spotifyAPI.getAvailableDevices();
			const updatedDevice = updatedDevicesResponse.devices?.find((d: any) => d.id === this.deviceId);
			
			if (updatedDevice?.is_active) {
				console.log('Device activated successfully');
			} else {
				console.warn('Device may not have activated properly, but continuing');
			}
		} catch (error) {
			console.warn('Failed to activate device, but continuing:', error);
		}
	}

	async playFromContext(contextUri: string, offset: number): Promise<void> {
		console.log('WebPlayback.playFromContext called with:', { contextUri, offset, playerReady: !!this.player, deviceId: this.deviceId });
		
		if (!this.player || !this.deviceId) {
			const error = `Player not ready - player: ${!!this.player}, deviceId: ${this.deviceId}`;
			console.error(error);
			throw new Error(error);
		}

		console.log('Playing from context via Spotify API with device:', this.deviceId);
		
		try {
			await this.activateDevice();
			await new Promise(resolve => setTimeout(resolve, 500));
			
			const currentState = await this.player.getCurrentState();
			if (currentState && !currentState.paused) {
				console.log('Pausing current playback before starting new track');
				await this.player.pause();
				await new Promise(resolve => setTimeout(resolve, 200));
			}
			
			await spotifyAPI.playFromContext(contextUri, offset, this.deviceId);
			console.log('✅ Context playback started');
		} catch (error) {
			console.error('Context play failed:', error);
			throw error;
		}
	}

	async play(uri?: string): Promise<void> {
		console.log('WebPlayback.play called with:', { uri, playerReady: !!this.player, deviceId: this.deviceId });
		
		if (!this.player || !this.deviceId) {
			const error = `Player not ready - player: ${!!this.player}, deviceId: ${this.deviceId}`;
			console.error(error);
			throw new Error(error);
		}

		if (uri) {
			console.log('Playing specific track via Spotify API with device:', this.deviceId);
			
			try {
				await this.activateDevice();
				await new Promise(resolve => setTimeout(resolve, 500));
				
				const currentState = await this.player.getCurrentState();
				if (currentState && !currentState.paused) {
					console.log('Pausing current playback before starting new track');
					await this.player.pause();
					await new Promise(resolve => setTimeout(resolve, 200));
				}
				
				await spotifyAPI.playTrack(uri, this.deviceId);

				let retries = 0;
				const maxRetries = 10;
				
				while (retries < maxRetries) {
					await new Promise(resolve => setTimeout(resolve, 300));
					const state = await this.player.getCurrentState();
					
					if (state && state.track_window.current_track?.uri === uri) {
						console.log('✅ Playback confirmed for track:', uri);
						break;
					}
					
					retries++;
					console.log(`Waiting for playback to start... (${retries}/${maxRetries})`);
				}
				
			} catch (error) {
				console.warn('API play failed, trying Web Player SDK directly:', error);

				try {
					const state = await this.player.getCurrentState();
					if (state && !state.paused) {
						await this.player.pause();
						await new Promise(resolve => setTimeout(resolve, 200));
					}

					await spotifyAPI.playTrack(uri);
					await new Promise(resolve => setTimeout(resolve, 300));
					await this.player.resume();
				} catch (fallbackError) {
					console.error('Both API and SDK methods failed:', fallbackError);
					throw error;
				}
			}
		} else {
			console.log('Resuming current playback via Web Player');
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
		try {
			return await this.player.getCurrentState();
		} catch (error) {
			console.error('Failed to get player state:', error);
			return null;
		}
	}

	disconnect(): void {
		if (this.player) {
			console.log('Disconnecting Web Player...');
			this.player.disconnect();
			this.player = null;
			this.deviceId = null;
			this.isInitialized = false;
		}
	}

	handleAuthenticationFailure(): void {
		console.warn('Handling authentication failure - disconnecting player');
		this.disconnect();
		isPlaying.set(false);
		currentTrack.set(null);
		playbackPosition.set(0);
		trackDuration.set(0);
	}

	async reconnect(): Promise<void> {
		if (this.isInitialized) {
			console.log('Player already connected');
			return;
		}
		
		console.log('Attempting to reconnect Web Player...');
		this.disconnect();
		await this.initialize();
	}
}

export const webPlaybackService = new WebPlaybackService();
