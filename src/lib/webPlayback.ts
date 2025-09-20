import { spotifyAPI } from './spotify';
import { isPlaying, currentTrack, playbackPosition, trackDuration } from './stores';
import { get } from 'svelte/store';

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
    private instanceId: string;

    constructor() {
        // Generate a unique instance ID for this browser session
        this.instanceId = this.generateInstanceId();
    }

    private generateInstanceId(): string {
        // Create a unique ID with timestamp and random component
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        return `${timestamp}-${random}`;
    }

    private getDeviceName(): string {
        // Include instance ID in device name to make it unique
        return `Motify Web Player (${this.instanceId})`;
    }

    async initialize(): Promise<void> {
		if (this.isInitialized) return;

		return new Promise((resolve, reject) => {
			// Check if SDK is already loaded
			if (window.Spotify) {
				try {
					this.setupPlayer();
					resolve();
				} catch (error) {
					reject(error);
				}
			} else {
				// Wait for SDK to load - check periodically since we can't override the global callback
				const checkSDK = () => {
					if (window.Spotify) {
						try {
							this.setupPlayer();
							resolve();
						} catch (error) {
							reject(error);
						}
					} else {
						// Check again in 100ms
						setTimeout(checkSDK, 100);
					}
				};
				
				// Start checking
				setTimeout(checkSDK, 100);
				
				// Longer timeout for mobile devices
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
			name: this.getDeviceName(), // Use unique device name
			getOAuthToken: (cb) => {
				// Always get the freshest token and handle errors gracefully
				spotifyAPI.ensureValidToken().then(token => {
					if (token) {
						cb(token);
					} else {
						console.warn('No valid token available for Web Playback SDK');
						// Don't call the callback with null/undefined as it may cause issues
						// Instead, try to get any existing token as fallback
						const fallbackToken = spotifyAPI.getAccessToken();
						if (fallbackToken) {
							cb(fallbackToken);
						}
					}
				}).catch(error => {
					console.error('Error getting token for Web Playback SDK:', error);
					// Fallback to any existing token
					const fallbackToken = spotifyAPI.getAccessToken();
					if (fallbackToken) {
						cb(fallbackToken);
					}
				});
			},
			volume: 0.8
		});

		// Error handling
		this.player.addListener('initialization_error', ({ message }) => {
			console.error('Spotify Player initialization error:', message);
		});

		this.player.addListener('authentication_error', ({ message }) => {
			console.error('Spotify Player authentication error:', message);
			// Handle authentication failure gracefully
			this.handleAuthenticationFailure();
			
			// Try to refresh the token for future attempts
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

		// Playback status updates
		this.player.addListener('player_state_changed', (state) => {
			if (!state) return;

			console.log('Player state changed:', state);
			
			// Only update stores if this is a significant change
			const newTrack = state.track_window.current_track;
			const newPlaying = !state.paused;
			const newPosition = state.position / 1000;
			const newDuration = state.duration / 1000;
			
			// Update current track only if it's actually different
			// This prevents flashing when we've already set the track via navigation
			if (newTrack) {
				const currentStoreTrack = get(currentTrack);
				
				// Only update if the URI is different or if we don't have a current track
				if (!currentStoreTrack || currentStoreTrack.uri !== newTrack.uri) {
					console.log('Updating current track from player state:', newTrack.name);
					currentTrack.set(newTrack);
				}
			}
			
			// Always update playing state and duration
			isPlaying.set(newPlaying);
			trackDuration.set(newDuration);
			
			// Update position, but be smart about it
			playbackPosition.set(newPosition);
		});

		// Ready
		this.player.addListener('ready', async ({ device_id }) => {
			console.log('Spotify Web Player ready with Device ID:', device_id);
			this.deviceId = device_id;

			// Wait for device to appear in /me/player/devices and get the actual device ID
			const actualDeviceId = await this.waitForDeviceRegistration();
			if (actualDeviceId) {
				// Only log if the actual device ID is different from SDK ID
				if (actualDeviceId !== device_id) {
					console.log('Device registered with different ID. SDK ID:', device_id, 'Actual ID:', actualDeviceId);
				}
				this.deviceId = actualDeviceId; // Use the actual device ID from the API
				this.isInitialized = true;
			} else {
				console.warn('Device did not appear in /me/player/devices in time:', device_id);
				// Still mark as initialized but with original device ID as fallback
				this.isInitialized = true;
			}
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


    private async waitForDeviceRegistration(timeoutMs = 5000): Promise<string | null> {
        const start = Date.now();
        const deviceName = this.getDeviceName();
        
        while (Date.now() - start < timeoutMs) {
            const devices = await spotifyAPI.getAvailableDevices();
            
            // Look for our specific device by the unique name
            const ourDevice = devices.devices?.find((d: any) => 
                d.name === deviceName && 
                d.type === 'Computer'
            );
            
            if (ourDevice) {
                return ourDevice.id;
            }
            
            // Also check if the original device ID matches (fallback)
            if (devices.devices?.some((d: any) => d.id === this.deviceId)) {
                return this.deviceId;
            }
            
            // Reduced logging frequency - only log every second instead of every 200ms
            if ((Date.now() - start) % 1000 < 200) {
                console.log('Waiting for device registration...');
            }
            await new Promise(res => setTimeout(res, 200));
        }
        return null;
    }

    // Add method to get instance info for debugging
    getInstanceInfo(): { instanceId: string; deviceName: string; deviceId: string | null } {
        return {
            instanceId: this.instanceId,
            deviceName: this.getDeviceName(),
            deviceId: this.deviceId
        };
    }

	async activateDevice(): Promise<void> {
		if (!this.deviceId) return;
		
		try {
			console.log('Activating Web Player device:', this.deviceId);
			
			// First check what devices are available
			const devicesResponse = await spotifyAPI.getAvailableDevices();
			console.log('Available devices:', devicesResponse.devices);
			
			// Check for competing devices on mobile
			const mobileDevices = devicesResponse.devices?.filter((d: any) => 
				d.type === 'Smartphone' && d.is_active
			);
			
			if (mobileDevices?.length > 0) {
				console.warn('Active mobile devices detected:', mobileDevices);
				// This might cause conflicts, but we'll proceed
			}
			
			// Find our device in the list
			const ourDevice = devicesResponse.devices?.find((d: any) => d.id === this.deviceId);
			
			if (!ourDevice) {
				console.warn('Our device not found in available devices list');
			} else if (ourDevice.is_active) {
				console.log('Device is already active');
				return;
			}
			
			// Transfer playback to our device
			await spotifyAPI.transferPlayback(this.deviceId);
			console.log('Device activation request sent');
			
			// Wait a bit longer for mobile devices
			await new Promise(resolve => setTimeout(resolve, 800));
			
			// Verify the device is now active
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
				// First ensure the device is active by transferring playback to it
				await this.activateDevice();
				// Longer delay to ensure transfer completes on mobile
				await new Promise(resolve => setTimeout(resolve, 500));
				
				// Clear any pending state first
				const currentState = await this.player.getCurrentState();
				if (currentState && !currentState.paused) {
					console.log('Pausing current playback before starting new track');
					await this.player.pause();
					await new Promise(resolve => setTimeout(resolve, 200));
				}
				
				// Now try to play the track
				await spotifyAPI.playTrack(uri, this.deviceId);
				
				// Verify playback started and wait for state to update
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
				// If API call fails but the player is ready, try using the player directly
				console.warn('API play failed, trying Web Player SDK directly:', error);
				
				// Use the Web Player SDK to start playback
				try {
					// First check if something is already playing and pause it
					const state = await this.player.getCurrentState();
					if (state && !state.paused) {
						await this.player.pause();
						await new Promise(resolve => setTimeout(resolve, 200));
					}
					
					// Use Web API to queue the track, then resume with player
					await spotifyAPI.playTrack(uri);
					await new Promise(resolve => setTimeout(resolve, 300));
					await this.player.resume();
				} catch (fallbackError) {
					console.error('Both API and SDK methods failed:', fallbackError);
					throw error; // Throw the original error
				}
			}
		} else {
			console.log('Resuming current playback via Web Player');
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

	// Method to handle authentication failures gracefully
	handleAuthenticationFailure(): void {
		console.warn('Handling authentication failure - disconnecting player');
		this.disconnect();
		// Reset stores to prevent stale state
		isPlaying.set(false);
		currentTrack.set(null);
		playbackPosition.set(0);
		trackDuration.set(0);
	}

	// Method to reconnect after token refresh
	async reconnect(): Promise<void> {
		if (this.isInitialized) {
			console.log('Player already connected');
			return;
		}
		
		console.log('Attempting to reconnect Web Player...');
		this.disconnect(); // Ensure clean state
		await this.initialize();
	}
}

export const webPlaybackService = new WebPlaybackService();
